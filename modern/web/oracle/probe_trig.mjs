// CSN and SN: the cosine and sine the whole flight model runs on.
//
// STARSHIP SIMULATOR states the contract plainly - POKE M1 with a byte angle, CALL CSN or
// SN, then read a 16-bit result back out of M1/M2:
//
//   21 POKE M1,B: IF B > 127 THEN 74
//   73 CALL CSN: BH = (PEEK(M2) * HH) + PEEK(M1): GOTO 112
//   74 CALL CSN: A1 = PEEK(M1): A2 = PEEK(M2): A2 = A2 - HH: BH = (A2 * HH) + A1
//
// with HH = 256 and the results later divided by DI = 32768. So this sweeps all 256 input
// bytes through both routines on the real 6502 and compares what comes back against
// 32768 * cos and 32768 * sin. Measuring it settles the angle convention, the fixed-point
// scale and the sign handling in one go, none of which is written down anywhere.
import { openOracle } from './a2.mjs';
import { openDisk, DISK } from './dsk.mjs';
import fs from 'fs';

const BASE = 0x6000, CSN = 0x6006, SN = 0x6009, M1 = 0x600c, M2 = 0x600d;
const FLAG = 6, WHICH = 7;

const disk = openDisk(DISK);
const mod = disk.read(disk.files.find((f) => f.name === 'LO-HI A2-3D1'));
console.log(`LO-HI A2-3D1: ${mod.len} bytes, BLOADed to $${BASE.toString(16)} ` +
  `($${BASE.toString(16)}-$${(BASE + mod.len - 1).toString(16)})\n`);

const a2 = await openOracle();
await a2.ev(`(() => {
  window.M.a2.reset();
  const st = window.M.cpu.getState(); st.pc = 0xE000; window.M.cpu.setState(st);
  return 'cold start';
})()`);
for (let i = 0; i < 40 && !(await a2.screen()).some((l) => l.trim().endsWith(']')); i++) await a2.frames(30);
if (!(await a2.screen()).some((l) => l.trim().endsWith(']'))) { await a2.close(); throw new Error('no ] prompt'); }

await a2.ev(`(() => {
  const b = [${[...mod.data].join(',')}];
  for (let i = 0; i < b.length; i++) window.M.wr(${BASE} + i, b[i]);
  return 'module in place';
})()`);

const type = async (line) => {
  for (const ch of line) await a2.key(ch, { holdFrames: 2, afterFrames: 3 });
  await a2.key(13, { holdFrames: 2, afterFrames: 20 });
};
await type('HIMEM: 24576');
await type(`10 IF PEEK(${FLAG}) = 0 THEN 10`);
await type(`20 IF PEEK(${WHICH}) = 0 THEN CALL ${CSN}`);
await type(`30 IF PEEK(${WHICH}) = 1 THEN CALL ${SN}`);
await type(`40 POKE ${FLAG},0: GOTO 10`);
await type('RUN');
await a2.frames(60);

async function call(which, angle) {
  await a2.ev(`(() => {
    window.M.wr(${M1}, ${angle}); window.M.wr(${M2}, 0);
    window.M.wr(${WHICH}, ${which}); window.M.wr(${FLAG}, 1);
    return 'go';
  })()`);
  for (let i = 0; i < 40; i++) {
    await a2.frames(3);
    if (JSON.parse(await a2.ev(`window.M.rd(${FLAG})`)) === 0) break;
  }
  return JSON.parse(await a2.ev(`JSON.stringify([window.M.rd(${M1}), window.M.rd(${M2})])`));
}

const rows = [];
for (let a = 0; a < 256; a++) {
  const [c1, c2] = await call(0, a);
  const [s1, s2] = await call(1, a);
  rows.push({ a, cos: c1 | (c2 << 8), sin: s1 | (s2 << 8) });
}
await a2.close();

// The BASIC reads the pair as unsigned for inputs <= 127 and subtracts 256 from the high
// byte above that, so reproduce exactly that to get the value the game actually uses.
const asGame = (raw, a) => (a > 127 ? raw - 0x10000 : raw);

console.log(' angle    CSN raw    as game     32768*cos      SN raw    as game     32768*sin');
for (const r of rows.filter((r) => r.a % 16 === 0 || r.a === 255)) {
  const th = (r.a / 256) * 2 * Math.PI;
  console.log(`  ${String(r.a).padStart(3)}    ${String(r.cos).padStart(7)}   ${String(asGame(r.cos, r.a)).padStart(8)}   ` +
    `${String(Math.round(32768 * Math.cos(th))).padStart(9)}    ${String(r.sin).padStart(7)}   ` +
    `${String(asGame(r.sin, r.a)).padStart(8)}   ${String(Math.round(32768 * Math.sin(th))).padStart(9)}`);
}

// How close is it, over the whole sweep, for a few candidate conventions?
const fits = [];
for (const [name, f] of [
  ['32768*cos(2pi*a/256)', (a) => 32768 * Math.cos((a / 256) * 2 * Math.PI)],
  ['32767*cos(2pi*a/256)', (a) => 32767 * Math.cos((a / 256) * 2 * Math.PI)],
  ['32768*cos(a*1.41 deg)', (a) => 32768 * Math.cos(a * 1.41 * Math.PI / 180)],
]) {
  let worst = 0, sum = 0;
  for (const r of rows) {
    const d = Math.abs(asGame(r.cos, r.a) - f(r.a));
    worst = Math.max(worst, d); sum += d;
  }
  fits.push({ name, worst, mean: sum / rows.length });
}
console.log('\nCSN against candidate conventions, over all 256 inputs:');
for (const f of fits) console.log(`  ${f.name.padEnd(24)} worst error ${f.worst.toFixed(1).padStart(8)}, mean ${f.mean.toFixed(1)}`);

fs.writeFileSync('captured/trig.json', JSON.stringify({ base: BASE, csn: CSN, sn: SN, rows }) + '\n');
console.log('\nwrote captured/trig.json');
