// diskPipeline.ts against the machine, at every stage of the chain.
//
// probe_pipeline.mjs traps one render from the flight snapshot and records, for each object,
// the scale and operands it was given, the matrix before and after the scale, and for each
// vertex the translated vector, camera space, and the two screen bytes. This runs the port
// over the same inputs and compares at each of those points, so a mismatch says which stage
// it is in rather than only that the picture is wrong.
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
// A capture on the command line checks a different camera position, e.g. golden-z-4500.json,
// where the ship is close enough that |y/z| passes 1 and $691E's clamp starts doing work.
const CAPTURE = process.argv[2] || 'captured/pipeline/golden.json';
const golden = JSON.parse(fs.readFileSync(CAPTURE, 'utf8'));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.viewMatrix), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose viewMatrix - is the dev server running?'); });

const got = await page.evaluate((objects) => {
  const sv = window.__spaceVikings;
  return objects.map((o) => {
    const view = {
      camera: { x: o.origin[0], y: o.origin[1], z: o.origin[2] },
      pitch: o.angles[0], bank: o.angles[1], heading: o.angles[2],
      scale: o.scale, ops: o.ops,
    };
    const unscaled = sv.buildMatrix654E(view.pitch, view.bank, view.heading);
    const scaled = sv.viewMatrix(view);
    return {
      unscaled, scaled,
      points: o.points.map((p) => {
        // The world point, recovered from the translated vector the machine recorded.
        const world = { x: p.d[0] + o.origin[0], y: p.d[1] + o.origin[1], z: p.d[2] + o.origin[2] };
        const cam = sv.toCameraSpaceFixed(world, view.camera, scaled);
        // $68A1 is checked against its own recorded input, not against this vertex: the
        // renderer projects whichever slot $6274 points at, which after a clip is not the
        // vertex that was just transformed.
        const inp = { x: p.pt[0], y: p.pt[1], z: p.pt[2] };
        const bytes = sv.projectCameraSpaceBytes(inp, view.ops);
        const px = sv.projectCameraSpaceFixed(cam, view.ops);
        return { cam: [cam.x, cam.y, cam.z], sx: bytes.sx, sy: bytes.sy, px };
      }),
    };
  });
}, golden.objects);
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

const s8 = (b) => (b > 127 ? b - 256 : b);
let failures = 0;
const tally = { unscaled: [0, 0], scaled: [0, 0], cam: [0, 0], bytes: [0, 0] };
const firsts = {};
const bump = (k, ok, msg) => { tally[k][1]++; if (ok) tally[k][0]++; else firsts[k] ??= msg; };

golden.objects.forEach((o, i) => {
  const g = got[i];
  for (let k = 0; k < 9; k++) {
    bump('unscaled', g.unscaled[k] === o.unscaled[k],
      `object ${i} entry ${k}: machine ${o.unscaled[k]}, port ${g.unscaled[k]}`);
    bump('scaled', g.scaled[k] === o.scaled[k],
      `object ${i} entry ${k}: machine ${o.scaled[k]}, port ${g.scaled[k]}`);
  }
  o.points.forEach((p, j) => {
    const q = g.points[j];
    const camOk = q.cam[0] === p.cam[0] && q.cam[1] === p.cam[1] && q.cam[2] === p.cam[2];
    bump('cam', camOk, `object ${i} point ${j}: machine ${p.cam}, port ${q.cam}`);
    bump('bytes', s8(q.sx) === p.sx && s8(q.sy) === p.sy,
      `object ${i} point ${j}: machine ${p.sx},${p.sy}, port ${s8(q.sx)},${s8(q.sy)}`);
  });
});

const label = {
  unscaled: '$654E matrix, as built',
  scaled: '$6631 matrix, after the scale',
  cam: '$675B camera space',
  bytes: '$68A1 screen bytes',
};
console.log(`${golden.objects.length} object(s), ` +
  `${golden.objects.reduce((n, o) => n + o.points.length, 0)} vertices from a live render`);
console.log('');
for (const k of ['unscaled', 'scaled', 'cam', 'bytes']) {
  const [ok, n] = tally[k];
  if (ok !== n) failures++;
  console.log(`  ${label[k].padEnd(30)} ${ok} of ${n} exact`);
  if (firsts[k]) console.log(`      first: ${firsts[k]}`);
}

// And what the generated float path makes of the same points, for the record.
const floatOut = await (async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();
  await p.goto(PORT_URL, { waitUntil: 'load' });
  await p.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.projectWorldPointFloat), null, { timeout: 10000 })
    .catch(() => null);
  const r = await p.evaluate((objects) => {
    const sv = window.__spaceVikings;
    if (!sv.projectWorldPointFloat) return null;
    return objects.map((o) => o.points.map((pt) => sv.projectWorldPointFloat(
      { x: pt.d[0] + o.origin[0], y: pt.d[1] + o.origin[1], z: pt.d[2] + o.origin[2] },
      { x: o.origin[0], y: o.origin[1], z: o.origin[2] }, o.angles[2], o.angles[0],
    )));
  }, golden.objects);
  await b.close();
  return r;
})();
if (floatOut) {
  let worst = 0, sum = 0, n = 0;
  golden.objects.forEach((o, i) => o.points.forEach((p, j) => {
    const f = floatOut[i][j];
    const want = got[i].points[j].px;
    if (!f || !want) return;
    const e = Math.hypot(f.x - want.x, f.y - want.y);
    worst = Math.max(worst, e); sum += e; n++;
  }));
  if (n) {
    console.log('');
    console.log(`the generated float path lands ${(sum / n).toFixed(2)} px from the fixed one on ` +
      `average over ${n} vertices, worst ${worst.toFixed(2)} px`);
  }
}

console.log('');
console.log(failures === 0 ? 'pipeline parity: clean' : `pipeline parity: ${failures} stage(s) failed`);
process.exit(failures === 0 ? 0 : 1);
