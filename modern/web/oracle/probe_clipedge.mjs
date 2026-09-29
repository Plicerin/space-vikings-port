// $6979, the clip step, called directly.
//
// $61B7 pulls an end of a segment onto whichever frustum plane its outcode names. The four
// intersections are $6B0D (x = -z), $6A92 (x = z), $6A0D (y = -z) and the inline case at
// $6992 (y = z), dispatched in that order by $6979.
//
// Set both slots - A at $60-$65, B at $68-$6D - run $67EF and $6848 so the outcodes are live,
// then call $6979 and read back what B became. That exercises the dispatch and all four
// routines, including their $6468 divide and their $635C multiplies.
import { openOracle } from './a2.mjs';
import fs from 'fs';

const meta = JSON.parse(fs.readFileSync('captured/snapshot/flight.json', 'utf8'));
const b64 = fs.readFileSync('captured/snapshot/flight.bin').toString('base64');
const s16 = (v) => (v > 32767 ? v - 65536 : v);

// A inside the frustum, B outside it in every direction, at a range of depths - plus pairs
// taken off a real render, where the numbers are the ones the renderer actually sees.
const cases = [];
for (const az of [200, 800, 3000, 12000]) {
  const a = [0, 0, az];
  for (const [bx, by, bz] of [
    [5000, 0, 800], [-5000, 0, 800], [0, 5000, 800], [0, -5000, 800],
    [5000, 5000, 800], [-5000, -5000, 800], [5000, -5000, 800], [-5000, 5000, 800],
    [900, 0, 800], [-900, 0, 800], [0, 900, 800], [0, -900, 800],
    [801, 0, 800], [-801, 0, 800], [0, 801, 800], [0, -801, 800],
    [100, 100, -500], [20000, 300, 1000], [-20000, -300, 1000],
    [300, 20000, 1000], [300, -20000, 1000], [1, 1, 0],
  ]) cases.push([a, [bx, by, bz]]);
}
let seed = 8675309;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const r = (n) => Math.round((rnd() * 2 - 1) * n);
for (let i = 0; i < 400; i++) {
  const az = 100 + Math.floor(rnd() * 8000);
  cases.push([[r(az), r(az), az], [r(20000), r(20000), r(20000)]]);
}

const a2 = await openOracle();
await a2.ev(`(() => { window.M.a2.reset(); return 'reset'; })()`);
await a2.frames(10);
const got = JSON.parse(await a2.ev(`(() => {
  const cpu = window.M.cpu;
  const s = atob(${JSON.stringify(b64)});
  for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
  cpu.write(0x7C, 0);
  cpu.write(0x0300, 0x4C); cpu.write(0x0301, 0x00); cpu.write(0x0302, 0x03);
  const wr = (a, v) => { cpu.write(a, v & 0xff); cpu.write(a + 1, (v >> 8) & 0xff); };
  const rd = (a) => cpu.read(a) | (cpu.read(a + 1) << 8);
  const call = (pc) => {
    const st = cpu.getState();
    st.sp = 0xF0; st.pc = pc;
    cpu.setState(st);
    cpu.write(0x01F1, 0xFF); cpu.write(0x01F2, 0x02);
    let n = 0;
    while (cpu.getPC() !== 0x0300 && n < 300000) { cpu.stepCycles(1); n++; }
    return n < 300000;
  };
  const out = [];
  for (const [a, b] of ${JSON.stringify(cases)}) {
    wr(0x60, a[0]); wr(0x62, a[1]); wr(0x64, a[2]);
    wr(0x68, b[0]); wr(0x6A, b[1]); wr(0x6C, b[2]);
    call(0x67EF);                                  // A's outcode -> $66
    call(0x6848);                                  // B's outcode -> $6E
    const oa = cpu.read(0x66), ob = cpu.read(0x6E);
    let clipped = null;
    if (ob) { if (call(0x6979)) clipped = [rd(0x68), rd(0x6A), rd(0x6C), cpu.read(0x6E)]; }
    out.push({ oa, ob, clipped });
  }
  return JSON.stringify(out);
})()`));
await a2.close();

fs.mkdirSync('captured/clip', { recursive: true });
fs.writeFileSync('captured/clip/edges.json', JSON.stringify({
  source: '$6979 called directly from the flight snapshot, with $67EF and $6848 run first',
  cases: cases.map(([a, b], i) => ({
    a, b, outcodeA: got[i].oa, outcodeB: got[i].ob,
    clipped: got[i].clipped ? got[i].clipped.slice(0, 3).map(s16) : null,
    outcodeAfter: got[i].clipped ? got[i].clipped[3] : null,
  })),
}) + String.fromCharCode(10));

const n = got.filter((g) => g.clipped).length;
console.log(`${cases.length} pairs, ${n} of them needed clipping`);
console.log('');
console.log('   A                  B                       -> B clipped            outcode after');
for (let i = 0; i < cases.length && i < 10; i++) {
  const g = got[i];
  if (!g.clipped) continue;
  console.log(`   ${JSON.stringify(cases[i][0]).padEnd(18)} ${JSON.stringify(cases[i][1]).padEnd(22)} ` +
    `${JSON.stringify(g.clipped.slice(0, 3).map(s16)).padEnd(22)} $${g.clipped[3].toString(16)}`);
}
console.log('');
console.log('wrote captured/clip/edges.json');
