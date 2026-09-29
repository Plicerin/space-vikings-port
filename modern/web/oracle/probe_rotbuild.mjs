// $654E, the matrix construction, called directly for a sweep of pitch, bank and heading.
//
// $654E reads three angle bytes from $96/$97/$98 and writes nine Q15 entries to $7E-$8F. It
// then falls through at $6631 into a per-object scale - `$6631 LDX $600F / CPX #$7F / BNE` -
// which multiplies the entries by the three factors at $600E-$6013 unless they are $7FFF. So
// trap at $6631: that is the matrix as built, before any object scaling.
import { openOracle } from './a2.mjs';
import fs from 'fs';

const BUILD = 0x654e;
const AFTER = 0x6631;
const TRAP = 0x0300;

const meta = JSON.parse(fs.readFileSync('captured/snapshot/flight.json', 'utf8'));
const b64 = fs.readFileSync('captured/snapshot/flight.bin').toString('base64');
const s16 = (v) => (v > 32767 ? v - 65536 : v);

// Every angle that lands on a table boundary, plus a spread over the circle.
const angles = [0, 1, 2, 31, 32, 33, 63, 64, 65, 96, 127, 128, 129, 160, 191, 192, 224, 254, 255];
const triples = [];
for (const p of angles) triples.push([p, 0, 0], [0, p, 0], [0, 0, p]);
let seed = 24680;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
for (let i = 0; i < 300; i++) {
  triples.push([Math.floor(rnd() * 256), Math.floor(rnd() * 256), Math.floor(rnd() * 256)]);
}

const a2 = await openOracle();
await a2.ev(`(() => { window.M.a2.reset(); return 'reset'; })()`);
await a2.frames(10);

const rows = JSON.parse(await a2.ev(`(() => {
  const cpu = window.M.cpu;
  const s = atob(${JSON.stringify(b64)});
  for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
  cpu.write(${TRAP}, 0x4C); cpu.write(${TRAP + 1}, ${TRAP & 0xff}); cpu.write(${TRAP + 2}, ${TRAP >> 8});
  const w = (a) => cpu.read(a) | (cpu.read(a + 1) << 8);
  const out = [];
  for (const [p, b, h] of ${JSON.stringify(triples)}) {
    cpu.write(0x96, p); cpu.write(0x97, b); cpu.write(0x98, h);
    const st = cpu.getState();
    st.sp = 0xF0; st.pc = ${BUILD};
    cpu.setState(st);
    cpu.write(0x01F1, ${(TRAP - 1) & 0xff}); cpu.write(0x01F2, ${(TRAP - 1) >> 8});
    let n = 0;
    while (cpu.getPC() !== ${AFTER} && cpu.getPC() !== ${TRAP} && n < 200000) { cpu.stepCycles(1); n++; }
    out.push({
      p, b, h, reached: cpu.getPC() === ${AFTER},
      m: [w(0x7E), w(0x84), w(0x8A), w(0x80), w(0x86), w(0x8C), w(0x82), w(0x88), w(0x8E)],
    });
  }
  return JSON.stringify(out);
})()`));
await a2.close();

const missed = rows.filter((r) => !r.reached).length;
console.log(`${rows.length} matrices built, ${missed} did not reach $6631`);
console.log('');
console.log('  pitch bank head      m00    m01    m02    m10    m11    m12    m20    m21    m22');
for (const r of rows.slice(0, 12)) {
  console.log(`  ${String(r.p).padStart(5)} ${String(r.b).padStart(4)} ${String(r.h).padStart(4)}   ` +
    r.m.map((v) => String(s16(v)).padStart(6)).join(' '));
}

fs.mkdirSync('captured/rot', { recursive: true });
fs.writeFileSync('captured/rot/build.json', JSON.stringify({
  source: '$654E called directly from the flight snapshot, read at $6631 before the object scale',
  rows: rows.map((r) => ({ p: r.p, b: r.b, h: r.h, m: r.m.map(s16) })),
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/rot/build.json');
