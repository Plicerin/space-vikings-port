// $67EF, the camera-space outcode, called directly.
//
// $61A9 transforms a vertex into $60-$65 and calls $67EF, which leaves four bits in $66.
// $61B7 then rejects a segment when both ends share a bit, and pulls an end onto the failing
// plane otherwise - so this is the test that keeps the disk from ever handing $68A1 a point
// whose x/z or y/z exceeds 1, which is where its divide wraps.
//
// Read rather than fitted, then checked here: the bits should be x < -z, x > z, y < -z, y > z.
import { openOracle } from './a2.mjs';
import fs from 'fs';

const meta = JSON.parse(fs.readFileSync('captured/snapshot/flight.json', 'utf8'));
const b64 = fs.readFileSync('captured/snapshot/flight.bin').toString('base64');

// Points either side of every plane, on the planes exactly, behind the camera, and at the
// extremes of sixteen bits where the adds overflow - which is what the BVC/BVS pairs are for.
const pts = [];
for (const z of [-30000, -1000, -1, 0, 1, 500, 30000]) {
  for (const v of [-32768, -30000, -501, -500, -499, 0, 499, 500, 501, 30000, 32767]) {
    pts.push([v, 0, z], [0, v, z], [v, v, z]);
  }
}
let seed = 1357;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
for (let i = 0; i < 400; i++) {
  pts.push([Math.round((rnd() * 2 - 1) * 32767), Math.round((rnd() * 2 - 1) * 32767),
    Math.round((rnd() * 2 - 1) * 32767)]);
}

const a2 = await openOracle();
await a2.ev(`(() => { window.M.a2.reset(); return 'reset'; })()`);
await a2.frames(10);
const got = JSON.parse(await a2.ev(`(() => {
  const cpu = window.M.cpu;
  const s = atob(${JSON.stringify(b64)});
  for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
  cpu.write(0x0300, 0x4C); cpu.write(0x0301, 0x00); cpu.write(0x0302, 0x03);
  const wr = (a, v) => { cpu.write(a, v & 0xff); cpu.write(a + 1, (v >> 8) & 0xff); };
  const out = [];
  for (const [x, y, z] of ${JSON.stringify(pts)}) {
    wr(0x60, x & 0xffff); wr(0x62, y & 0xffff); wr(0x64, z & 0xffff);
    const st = cpu.getState();
    st.sp = 0xF0; st.pc = 0x67EF;
    cpu.setState(st);
    cpu.write(0x01F1, 0xFF); cpu.write(0x01F2, 0x02);
    let n = 0;
    while (cpu.getPC() !== 0x0300 && n < 100000) { cpu.stepCycles(1); n++; }
    out.push(cpu.read(0x66));
  }
  return JSON.stringify(out);
})()`));
await a2.close();

const predict = (x, y, z) => (x + z < 0 ? 0x40 : 0) | (z - x < 0 ? 0x20 : 0)
  | (y + z < 0 ? 0x10 : 0) | (z - y < 0 ? 0x08 : 0);
let bad = 0;
const firsts = [];
pts.forEach(([x, y, z], i) => {
  const want = predict(x, y, z);
  if (got[i] !== want) { bad++; if (firsts.length < 6) firsts.push(`(${x},${y},${z}) machine $${got[i].toString(16)}, |x|<=z and |y|<=z says $${want.toString(16)}`); }
});
console.log(`$67EF over ${pts.length} points: ${pts.length - bad} match "x < -z, x > z, y < -z, y > z"`);
for (const f of firsts) console.log(`  MISMATCH ${f}`);

fs.mkdirSync('captured/clip', { recursive: true });
fs.writeFileSync('captured/clip/outcode.json', JSON.stringify({
  source: '$67EF called directly from the flight snapshot',
  samples: pts.map((p, i) => ({ x: p[0], y: p[1], z: p[2], outcode: got[i] })),
}) + String.fromCharCode(10));
console.log('wrote captured/clip/outcode.json');
