// Is $635C the signed multiply?
//
// It takes two 16-bit values in zero page ($78/$79 and $7A/$7B), derives a sign from
// $79 EOR $7B, takes the absolute value of each, and returns a 16-bit result - low byte in
// A, high in X, which is how its caller $633D stores it. That reads like a multiply, and a
// 3D renderer needs one. This calls it with numbers I choose and checks.
//
// No BASIC is involved: the subroutine is entered by setting PC directly, with a return
// address pushed that points at a JMP-to-self, so stepping stops exactly when it returns.
import { openOracle } from './a2.mjs';
import { openDisk, DISK } from './dsk.mjs';

const BASE = 0x6000, MUL = 0x635c, TRAP = 0x0300;

const disk = openDisk(DISK);
const mod = disk.read(disk.files.find((f) => f.name === 'LO-HI A2-3D1'));

const a2 = await openOracle();
await a2.ev(`(() => {
  window.M.a2.reset();
  const st = window.M.cpu.getState(); st.pc = 0xE000; window.M.cpu.setState(st);
  return 'cold start';
})()`);
for (let i = 0; i < 40 && !(await a2.screen()).some((l) => l.trim().endsWith(']')); i++) await a2.frames(30);

await a2.ev(`(() => {
  const b = [${[...mod.data].join(',')}];
  for (let i = 0; i < b.length; i++) window.M.wr(${BASE} + i, b[i]);
  window.M.wr(${TRAP}, 0x4C); window.M.wr(${TRAP + 1}, ${TRAP & 0xff}); window.M.wr(${TRAP + 2}, ${TRAP >> 8});
  return 'ready';
})()`);

/** Call the subroutine with the two 16-bit operands, and read the 16-bit result. */
async function call(p, q) {
  const r = JSON.parse(await a2.ev(`(() => {
    const M = window.M, cpu = M.cpu;
    const w = M.wr;
    w(0x78, ${p & 0xff}); w(0x79, ${(p >> 8) & 0xff});
    w(0x7A, ${q & 0xff}); w(0x7B, ${(q >> 8) & 0xff});
    const st = cpu.getState();
    // push the return address (RTS adds one), then enter the routine
    const ret = ${TRAP - 1};
    w(0x0100 + st.sp, (ret >> 8) & 0xff);
    w(0x0100 + ((st.sp - 1) & 0xff), ret & 0xff);
    st.sp = (st.sp - 2) & 0xff;
    st.pc = ${MUL};
    cpu.setState(st);
    let steps = 0;
    while (cpu.getPC() !== ${TRAP} && steps < 200000) { cpu.stepCycles(1); steps++; }
    const out = cpu.getState();
    return JSON.stringify({ a: out.a, x: out.x, steps,
      returned: cpu.getPC() === ${TRAP},
      zp: [M.rd(0x78), M.rd(0x79), M.rd(0x7A), M.rd(0x7B)] });
  })()`));
  return r;
}

const S = (v) => (v > 32767 ? v - 65536 : v);
console.log('        p        q      result   p*q      p*q/256   p*q/32768');
const cases = [[2, 3], [100, 100], [1000, 32], [256, 256], [16384, 2], [32767, 32767],
  [-100, 100], [-1000, -1000], [12539, 12539], [32767, 16384]];
const rows = [];
for (const [p, q] of cases) {
  const r = await call(p & 0xffff, q & 0xffff);
  const res = S(r.a | (r.x << 8));
  rows.push({ p, q, res });
  console.log(`  ${String(p).padStart(7)}  ${String(q).padStart(7)}  ${String(res).padStart(8)}  ` +
    `${String(p * q).padStart(12)}  ${String(Math.round(p * q / 256)).padStart(9)}  ${String((p * q / 32768).toFixed(2)).padStart(10)}` +
    (r.returned ? '' : '   (did not return)'));
}

// Which scaling fits?
console.log('');
for (const [name, f] of [
  ['p*q/256', (p, q) => p * q / 256],
  ['p*q/32768', (p, q) => p * q / 32768],
  ['p*q/65536', (p, q) => p * q / 65536],
]) {
  const errs = rows.map((r) => Math.abs(r.res - f(r.p, r.q)));
  const worst = Math.max(...errs);
  console.log(`  ${name.padEnd(12)} worst |error| ${worst.toFixed(1)}`);
}
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
