// Line 5000's ground fire, recorded so it can be replayed.
//
// A battery on the surface throws a bolt up at the ship. 5000 sets it up with three draws:
//
//   5000  X1 = (RND(5) * 260) + 10        where it starts across the screen
//         Y1 = RND(1)                     which edge it comes from
//         IF Y1 >= .4 THEN Y1 = 10: Y2 = RND(5) * 7        from the top, moving down
//   5045  IF Y1 < .4 THEN Y1 = 120: Y2 = RND(5) * 7: Y2 = Y2 - (Y2 * 2)   from the bottom, up
//
// Both branches draw exactly once for Y2, so a bolt costs three draws however it starts. Then
// 5050-5080 pick the horizontal step and the shape from X1 alone - no draws - and the bolt
// flies:
//
//   5090  XDRAW M AT X1,Y1: IF RND(1) < .3 THEN GOSUB 5098: GOSUB 5200
//   5095  XDRAW M AT X1,Y1: X1 = X1 + X2: Y1 = Y1 + Y2: IF <off the box> THEN RETURN
//   5096  GOTO 5090
//
// Both GOSUBs sit inside 5090's THEN, so **5200 only runs on a hit**, not every step.
//
// A hit is 5098, and 5098 is the interesting part: `L = 7: GOSUB 3205`. It enters the damage
// routine one line in, past 3200's `IF DMG = 0`, and 3205 is followed by
// `3207 IF L = 7 THEN RETURN`. So ground fire takes the shields draw and nothing else, whatever
// the shields are - it cannot reach the radar, the engines, the computer, the laser or the hull.
//
// Reaching it: line 190 runs the tick and then `IF RND(1) < .5 AND PEEK(38207) > 0 THEN
// GOSUB 5000` while the planet has not surrendered and the ship is in atmosphere.
import { openOracle, VAR_READER } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import fs from 'fs';

const disk = openDisk(DISK);
const textOf = (name) => {
  const r = disk.read(disk.files.find((f) => f.name === name));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => `${l.num} ${l.text}`).join('\n');
};
const SIM = textOf('STARSHIP SIMULATOR');

const a2 = await openOracle();
await a2.ev(VAR_READER);
await a2.boot();
await a2.key('N');
const loaded = async () => {
  const b = await a2.readRange(0x800, 0x2000);
  const m = {};
  for (let k = 0; k < b.length; k++) m[0x800 + k] = b[k];
  try { return listProgram(m, 0x801, 0x2000).map((l) => `${l.num} ${l.text}`).join('\n'); }
  catch { return ''; }
};
console.log('waiting for STARSHIP SIMULATOR...');
let ok = false;
for (let i = 0; i < 600; i++) { await a2.frames(20); if ((await loaded()) === SIM) { ok = true; break; } }
if (!ok) { await a2.close(); throw new Error('no simulator'); }
await a2.frames(400);

// Applesoft keeps the line it is executing at $75/$76 (CURLIN), so every draw can be attributed
// to the line that made it instead of being inferred from which variable moved. X1 was the
// obvious tell and it is the wrong one - 5095 advances X1 at every step of the bolt, not just at
// 5000's setup.
//
// 190's route: in atmosphere, planet not surrendered, batteries left. Shields high and up, so
// 3205's own `IF PEEK(38200) > 10 AND PEEK(38201) = 1 THEN RETURN` is the exit a tick takes -
// and 3207 is the one ground fire takes, which is what distinguishes them.
const planet = await a2.read(38209);
await a2.ev(`(() => {
  const w = window.M.wr;
  w(38208, 0); w(38210, 1); w(38205, 3); w(38207, 12); w(38393, 1);
  w(38282 + ${planet}, 3);
  w(38200, 200); w(38201, 1);
  for (const a of [38199, 38198, 38197, 38196, 38195, 38194, 38193, 38190, 38187, 38186, 38184]) w(a, 200);
  return 'w';
})()`);
await a2.frames(20);

const r = JSON.parse(await a2.ev(`(() => {
  const cpu = window.M.cpu;
  const watch = [38200, 38195, 38198, 38197, 38196, 38186, 38193, 38207, 38165, 38201];
  const out = [];
  let n = 0;
  while (n < 120000000 && out.length < 1400) {
    if (cpu.getPC() === 0xEFAE) {
      const v = window.M.vars();
      const g = (nm) => {
        const x = (v.vars || []).find((y) => y.name === nm && y.type === 'real');
        return x ? x.value : null;
      };
      out.push({
        seed: [cpu.read(0xC9), cpu.read(0xCA), cpu.read(0xCB), cpu.read(0xCC), cpu.read(0xCD)],
        a4: cpu.read(0xA4),
        line: cpu.read(0x75) | (cpu.read(0x76) << 8),
        cyc: cpu.getCycles(),
        bytes: watch.map((a) => cpu.read(a)),
        vars: { X1: g('X1'), Y1: g('Y1'), Y2: g('Y2'), X2: g('X2'), M: g('M'), L: g('L'), DMG: g('DMG') },
      });
    }
    cpu.stepCycles(1);
    n++;
  }
  return JSON.stringify({ steps: n, calls: out, watch });
})()`));
await a2.close();

const calls = r.calls;
console.log(`  ${calls.length} calls to $EFAE in ${r.steps.toLocaleString()} instructions`);

// With the line number recorded, a bolt is simply the draws whose line is 5000.
const starts = calls.map((c, i) => (c.line === 5000 ? i : -1)).filter((i) => i >= 0);
const byLine = {};
for (const c of calls) byLine[c.line] = (byLine[c.line] || 0) + 1;
console.log('  draws by the line that made them:');
for (const k of Object.keys(byLine).sort((a, b) => a - b)) {
  console.log(`    ${String(k).padStart(5)}  ${String(byLine[k]).padStart(4)}`);
}
console.log(`  ${starts.length} draws from 5000, and 5000 draws twice per bolt (X1 and Y1)`);
const Ls = [...new Set(calls.map((c) => c.vars.L))];
console.log(`  L took the value(s): ${Ls.join(', ')}`);
const f165 = [...new Set(calls.map((c) => c.bytes[8]))];
console.log(`  38165, which 5200 tests against 3: ${f165.join(', ')}`);
// How fast the bolt loop actually runs, from the cycle counter at consecutive 5090 draws.
const gaps = [];
for (let i = 0; i + 1 < calls.length; i++) {
  if (calls[i].line === 5090 && calls[i + 1].line === 5090) gaps.push(calls[i + 1].cyc - calls[i].cyc);
}
gaps.sort((a, b) => a - b);
if (gaps.length) {
  const med = gaps[gaps.length >> 1];
  console.log(`  a step of the bolt with no hit takes ${med.toLocaleString()} cycles, ` +
    `${(med / 1020484).toFixed(3)} s at 1.0205 MHz - ${(1020484 / med).toFixed(1)} steps a second`);
}
// And a whole bolt, 5000 to the last 5090 before the next one.
const bolt = [];
for (let k = 0; k + 1 < starts.length; k++) bolt.push(calls[starts[k + 1]].cyc - calls[starts[k]].cyc);
if (bolt.length) {
  bolt.sort((a, b) => a - b);
  console.log(`  median gap between bolts: ${(bolt[bolt.length >> 1] / 1020484).toFixed(2)} s`);
}
const notShields = r.watch.slice(1, 7);
console.log(`  batteries 38207: ${[...new Set(calls.map((c) => c.bytes[7]))].join(', ')}`);

fs.mkdirSync('captured/replay', { recursive: true });
fs.writeFileSync('captured/replay/ground.json', JSON.stringify({
  source: 'every entry to $EFAE during an atmospheric flight over a firing planet, with the seed before the call, the damage bytes and the live Applesoft variables',
  planet, watch: r.watch, starts, calls,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/replay/ground.json');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
