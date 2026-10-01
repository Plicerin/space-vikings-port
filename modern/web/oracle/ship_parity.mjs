// The port's ship rendering against the original's, pixel for pixel.
//
// captured/ship/golden.json holds ship-only renders taken from the original renderer, by
// replaying a flight snapshot and differencing each frame against the same frame with an
// empty model at $7879.
//
// The comparison is split in two, because the port is not attempting the same thing as the
// disk and one number would hide that:
//
//   PLACEMENT - where and how big the ship is on screen. The disk projects world
//   coordinates, so range and heading decide this. The port's projectShipBytecode() centres
//   the model on its own bounds and then rescales to a span the caller picks, so it cannot
//   place anything; the caller does. This reports the gap.
//
//   SHAPE - given the disk's own bounding box handed to the port as its desired span and
//   centre, do the pixels agree? That asks whether the model is being drawn correctly,
//   separately from where it is put.
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/ship/golden.json', 'utf8'));
const states = golden.states.filter((s) => s.lit > 0);
const shipBytes = JSON.parse(fs.readFileSync('../public/data/shapes/ship-3-bytecode.json', 'utf8')).bytes;
const CAM = JSON.parse(fs.readFileSync('captured/projection_fit.json', 'utf8')).camera;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.projectShipBytecode), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose projectShipBytecode - is the dev server running at ' + PORT_URL + '?'); });

// Draw each state with the port's world-space path: the camera the golden render used,
// the model's own coordinates, and the projection derived in fit_projection.mjs. Nothing
// is handed to it - no centre, no span. It has to put the ship where the disk did.
const rendered = await page.evaluate(({ bytes, jobs }) => {
  const { Hires, parseShipBytecode, projectShipWorld, drawShipWorld } = window.__spaceVikings;
  const ops = parseShipBytecode(bytes);
  return jobs.map((j) => {
    const c = document.createElement('canvas');
    c.width = 560; c.height = 384;
    const h = new Hires(c);
    h.hgr();
    h.hcolor(3);
    const proj = projectShipWorld(ops, j.camera, j.heading, j.pitch, null);
    drawShipWorld(h, proj);
    return { on: Array.from(h.snapshot().on), segments: proj.segments.length, culled: proj.culled };
  });
}, {
  bytes: shipBytes,
  jobs: states.map((s) => ({
    camera: { x: CAM.x, y: CAM.y, z: s.z },
    heading: s.heading, pitch: s.pitch,
  })),
});
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

fs.mkdirSync('captured/ship/port', { recursive: true });

console.log('PLACEMENT - the port now computes this, so it is a result and not an input');
console.log('  state       disk centre      disk span   disk px');
for (const s of states) {
  const cx = Math.round((s.bounds.minX + s.bounds.maxX) / 2);
  const cy = Math.round((s.bounds.minY + s.bounds.maxY) / 2);
  const span = Math.max(s.bounds.maxX - s.bounds.minX + 1, s.bounds.maxY - s.bounds.minY + 1);
  console.log(`  ${s.label.padEnd(8)}  (${String(cx).padStart(3)}, ${String(cy).padStart(3)})` +
    `${' '.repeat(8)}${String(span).padStart(4)}${String(s.lit).padStart(10)}`);
}
console.log('');
console.log('projectShipWorld() projects every vertex through the camera with the transform');
console.log('derived in fit_projection.mjs, using the machine\'s own sine and cosine. Nothing');
console.log('below is handed to it - not the centre, not the span.');

console.log("SHAPE - and how close the pixels come");
console.log('  state     disk px   port px   overlap   agreement   disk w x h   port w x h  too tall  within 1px');
let sumAgree = 0, n = 0, sumTall = 0, sumNear = 0;
for (let i = 0; i < states.length; i++) {
  const s = states[i];
  const r = rendered[i];
  if (!r.on) { console.log(`  ${s.label.padEnd(8)}  (the port produced no projection)`); continue; }
  const diskOn = new Uint8Array(HGR_W * HGR_H);
  for (const [x, y] of s.points) diskOn[y * HGR_W + x] = 1;
  // The golden is a difference of two renders, so a ship pixel that falls on a star is not in
  // it - the disk draws it, but it is lit with the ship removed too. Mask the port with the
  // same background, or a port that draws those pixels correctly is charged for them: at
  // camera z -6401 that is (120,83), (121,83), (104,84) and (105,84), all of them stars.
  const portOn = Uint8Array.from(r.on);
  for (const [x, y] of s.background ?? []) portOn[y * HGR_W + x] = 0;
  let both = 0, portLit = 0, differ = 0;
  let pminX = HGR_W, pmaxX = -1, pminY = HGR_H, pmaxY = -1;
  for (let k = 0; k < diskOn.length; k++) {
    if (portOn[k]) {
      portLit++;
      const x = k % HGR_W, y = (k / HGR_W) | 0;
      if (x < pminX) pminX = x; if (x > pmaxX) pmaxX = x;
      if (y < pminY) pminY = y; if (y > pmaxY) pmaxY = y;
    }
    if (diskOn[k] && portOn[k]) both++;
    if (diskOn[k] !== portOn[k]) differ++;
  }
  // Jaccard: how much of the union the two agree on. 1.0 is identical.
  const union = s.lit + portLit - both;
  const agree = union ? both / union : 1;
  sumAgree += agree; n++;
  // Exact overlap punishes a one-pixel shift completely, and the fitted projection is only
  // good to about 0.6 px. So also ask the softer question: is there a port pixel touching?
  // If nearly all of them are, the geometry is right and what is left is rasterisation.
  let near = 0;
  for (let k = 0; k < diskOn.length; k++) {
    if (!diskOn[k]) continue;
    const x = k % HGR_W, y = (k / HGR_W) | 0;
    let hit = false;
    for (let dy2 = -1; dy2 <= 1 && !hit; dy2++) for (let dx2 = -1; dx2 <= 1 && !hit; dx2++) {
      const xx = x + dx2, yy = y + dy2;
      if (xx < 0 || xx >= HGR_W || yy < 0 || yy >= HGR_H) continue;
      if (portOn[yy * HGR_W + xx]) hit = true;
    }
    if (hit) near++;
  }
  sumNear += s.lit ? near / s.lit : 1;
  const dw = s.bounds.maxX - s.bounds.minX + 1, dh = s.bounds.maxY - s.bounds.minY + 1;
  const pw = pmaxX - pminX + 1, ph = pmaxY - pminY + 1;
  const tall = dh ? ph / dh : 0;
  sumTall += tall;
  console.log(`  ${s.label.padEnd(8)} ${String(s.lit).padStart(7)} ${String(portLit).padStart(9)} ` +
    `${String(both).padStart(9)} ${(100 * agree).toFixed(1).padStart(10)}%   ` +
    `${String(dw).padStart(3)} x ${String(dh).padStart(3)}   ${String(pw).padStart(4)} x ${String(ph).padStart(3)}` +
    `${tall.toFixed(2).padStart(9)}x  ${(100 * (s.lit ? near / s.lit : 1)).toFixed(0).padStart(4)}%`);
  const img = new Uint8Array(HGR_W * HGR_H);
  for (let k = 0; k < img.length; k++) img[k] = portOn[k] ? 1 : 0;
  fs.writeFileSync(`captured/ship/port/${s.label}.png`, toPng(img));
}
console.log(`\nmean shape agreement over ${n} states: ${(100 * sumAgree / n).toFixed(1)}%`);
console.log(`mean within one pixel: ${(100 * sumNear / n).toFixed(1)}% of the disk's pixels have a port pixel adjacent`);
console.log(`the port's ship is on average ${(sumTall / n).toFixed(2)}x as tall as the disk's, at the same width.`);
console.log('');
console.log("Width is no longer handed over, so a matching width is a result too.");
console.log(`wrote ${n} port render(s) to captured/ship/port/`);

// The ship models at eleven attitudes. Exact, and the height ratio is reported with them
// because it was once the thing that was wrong.
console.log('');
const shipOk = n > 0 && sumAgree / n === 1;
console.log(shipOk ? `ship parity: all ${n} states exact`
  : `ship parity: mean agreement ${(100 * sumAgree / n).toFixed(2)}% over ${n} states`);
process.exit(shipOk && errors.length === 0 ? 0 : 1);
