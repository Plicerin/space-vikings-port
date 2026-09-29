// The whole world-to-screen chain, trapped object by object during one live render.
//
// Everything downstream of the display list, in the order the renderer does it:
//
//   $6631  the matrix is built; $600E-$6013 hold this object's three scale factors
//   $672A  the scale has been applied - row 0 by $600E, row 1 by $6010, row 2 by $6012
//   $67D3  a vertex: $AB/$AD/$AF is the model point minus $90-$95, $60-$65 the camera space
//   $68A1  camera space in, two screen bytes out, with the operands at $68BA/$68C0/$68DD/$68E3
//
// The scale is what the port's fitted focal lengths actually are: $68A1 divides x by z and
// multiplies by 69, so the effective focal length is 69 * (factor0 / factor2), doubled by
// $6DD5 - which is where 230.9 came from.
import { openOracle } from './a2.mjs';
import fs from 'fs';

const TRAP = 0x0300;
const meta = JSON.parse(fs.readFileSync('captured/snapshot/flight.json', 'utf8'));
const b64 = fs.readFileSync('captured/snapshot/flight.bin').toString('base64');
const s16 = (v) => (v > 32767 ? v - 65536 : v);

// A camera z on the command line re-renders the same scene from somewhere else, which is how
// oracle/probe_shipgolden.mjs makes its states: it writes $731F/$7320 and nothing else.
const CAMZ = process.argv[2] === undefined ? null : Number(process.argv[2]);
const OUT = CAMZ === null ? 'captured/pipeline/golden.json' : `captured/pipeline/golden-z${CAMZ}.json`;

const a2 = await openOracle();
await a2.ev(`(() => { window.M.a2.reset(); return 'reset'; })()`);
await a2.frames(10);

const r = JSON.parse(await a2.ev(`(() => {
  const cpu = window.M.cpu;
  const s = atob(${JSON.stringify(b64)});
  for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
  ${CAMZ === null ? '' : `cpu.write(0x731F, ${CAMZ & 0xff}); cpu.write(0x7320, ${(CAMZ >> 8) & 0xff});`}
  cpu.read(0xC050); cpu.read(0xC052); cpu.read(0xC054); cpu.read(0xC057);
  const st = cpu.getState();
  st.sp = 0xF0; st.pc = 0x6000;
  cpu.setState(st);
  cpu.write(0x01F1, 0xFF); cpu.write(0x01F2, 0x02);
  cpu.write(${TRAP}, 0x4C); cpu.write(${TRAP + 1}, ${TRAP & 0xff}); cpu.write(${TRAP + 2}, ${TRAP >> 8});

  const w = (a) => cpu.read(a) | (cpu.read(a + 1) << 8);
  const mat = () => [w(0x7E), w(0x84), w(0x8A), w(0x80), w(0x86), w(0x8C), w(0x82), w(0x88), w(0x8E)];

  const objects = [];
  let cur = null;
  let d = null, cam = null, inProj = null;
  let steps = 0;
  while (cpu.getPC() !== ${TRAP} && steps < 8000000) {
    const pc = cpu.getPC();
    if (pc === 0x6631) {
      cur = {
        angles: [cpu.read(0x96), cpu.read(0x97), cpu.read(0x98)],
        origin: [w(0x90), w(0x92), w(0x94)],
        scale: [w(0x600E), w(0x6010), w(0x6012)],
        ops: { xLimit: cpu.read(0x68BA), xOffset: cpu.read(0x68C0),
               yLimit: cpu.read(0x68DD), yOffset: cpu.read(0x68E3) },
        unscaled: mat(), scaled: null, points: [], transformed: [],
      };
      objects.push(cur);
    } else if (pc === 0x672A && cur && !cur.scaled) {
      cur.scaled = mat();
    } else if (pc === 0x67D3) {
      // $67D3 is the RTS of the three-axis block. Both the translated vector and the result
      // are live here, so read them together: reading them at two traps mispairs them
      // whenever the renderer transforms a vertex it then does not project.
      //
      // The result does not always land at $60. $672B takes the destination from the caller
      // in Y and stores it at $B2, and $67D4 walks it forward two bytes per axis, so after
      // three axes $B2 points six past the base - which is where this vertex actually went.
      const base = (cpu.read(0xB2) - 6) & 0xff;
      d = [w(0xAB), w(0xAD), w(0xAF)];
      cam = [w(base), w(base + 2), w(base + 4)];
      // Every vertex the renderer transforms, whether or not it goes on to project it: a run
      // of connected points reuses the previous projection ($6265), so the projected set is
      // smaller than the transformed one.
      if (cur && cur.transformed.length < 400) cur.transformed.push({ d, cam, slot: base });
    } else if (pc === 0x68A1 && cam) {
      const y = cpu.getState().y, x = cpu.getState().x;
      inProj = { out: x, pt: [w(y), w(y + 2), w(y + 4)] };
    } else if (pc === 0x68E9 && inProj) {
      if (cur && cur.points.length < 400) {
        cur.points.push({ d, cam, pt: inProj.pt, sx: cpu.read(inProj.out), sy: cpu.read(inProj.out + 1) });
      }
      d = null; cam = null; inProj = null;
    }
    cpu.stepCycles(1);
    steps++;
  }
  return JSON.stringify({ steps, objects });
})()`));
await a2.close();

const objects = r.objects.map((o) => ({
  angles: o.angles,
  origin: o.origin.map(s16),
  scale: o.scale.map(s16),
  ops: o.ops,
  unscaled: o.unscaled.map(s16),
  scaled: o.scaled ? o.scaled.map(s16) : null,
  transformed: o.transformed.map((t) => ({ d: t.d.map(s16), cam: t.cam.map(s16), slot: t.slot })),
  points: o.points.map((p) => ({
    d: p.d.map(s16), cam: p.cam.map(s16), pt: p.pt.map(s16),
    sx: p.sx > 127 ? p.sx - 256 : p.sx, sy: p.sy > 127 ? p.sy - 256 : p.sy,
  })),
}));

console.log(`${objects.length} objects in ${r.steps.toLocaleString()} instructions, ` +
  `${objects.reduce((n, o) => n + o.points.length, 0)} points captured`);
console.log('');
for (const [i, o] of objects.entries()) {
  if (i >= 6) { console.log(`  ...and ${objects.length - 6} more`); break; }
  const f = o.scale;
  const fx = f[0] / 32768, fy = f[1] / 32768, fz = f[2] / 32768;
  console.log(`  object ${i}: angles ${o.angles.join(',')}  origin ${o.origin.join(',')}  ` +
    `${o.points.length} points`);
  console.log(`     scale ${f.join(', ')}  (${fx.toFixed(4)}, ${fy.toFixed(4)}, ${fz.toFixed(4)})` +
    `   operands x ${o.ops.xLimit}/${o.ops.xOffset}  y ${o.ops.yLimit}/${o.ops.yOffset}`);
  console.log(`     so the effective focal lengths are ` +
    `${(2 * o.ops.xLimit * fx / fz).toFixed(2)} across and ${(o.ops.yLimit * fy / fz).toFixed(2)} down`);
}

fs.mkdirSync('captured/pipeline', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  source: 'one render from the flight snapshot, trapped at $6631, $672A, $675B, $67D3 and $68A1',
  objects,
}) + String.fromCharCode(10));
console.log('');
console.log(`wrote ${OUT}`);
