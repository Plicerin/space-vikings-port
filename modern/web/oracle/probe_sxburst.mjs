// S/X's debris burst, replayed rather than sampled.
//
// S/X is EX turned inside out: line 5 is `HCOLOR= 0: Y1 = 20: POKE 973,255: PRINT "^L"`, which
// leaves the page solid white, and then lines 7 to 30 are the **same loop**, drawing the same
// 240 segments in black. `sx_parity.mjs` has the fill and line 40's message exact - 433 dark
// pixels on row 21 either side - but could only say of the burst that the disk's 45,481 lit
// pixels fell inside the 44,970 to 45,913 the port produced over twelve random runs.
//
// The same treatment as EX settles it. STARSHIP SIMULATOR 3350 runs S/X when the hull reaches
// zero: `POKE 38193,J: DMG = 0: IF J = 0 THEN PRINT "^DRUNS/X"`. Getting there means letting the
// damage tick at 3000 run and reduce 38193 to nothing - so 38208 has to be 0 for lines 190 and
// 192 to call it at all, and the hull is held at 1 so the first hit finishes the job.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import { decodeHgr, toPng, HGR_W, HGR_H } from './hgr.mjs';
import fs from 'fs';

const SEED = 0x00c9;
const HULL = 38193;         // 3350 tests this one for zero
const SURRENDERED = 38208;  // 190 and 192 only run the tick while this is 0
const disk = openDisk(DISK);
const textOf = (name) => {
  const r = disk.read(disk.files.find((f) => f.name === name));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => `${l.num} ${l.text}`).join('\n');
};
const SIM = textOf('STARSHIP SIMULATOR');
const SX = textOf('S/X');

const a2 = await openOracle();
await a2.boot();
await a2.key('N');

const loaded = async () => {
  const b = await a2.readRange(0x800, 0x2000);
  const m = {};
  for (let k = 0; k < b.length; k++) m[0x800 + k] = b[k];
  let t = '';
  try { t = listProgram(m, 0x801, 0x2000).map((l) => `${l.num} ${l.text}`).join('\n'); } catch { /* mid-load */ }
  if (t === SIM) return 'STARSHIP SIMULATOR';
  if (t === SX) return 'S/X';
  return '(other)';
};
const curlin = async () => JSON.parse(await a2.ev('window.M.rd(0x75) | (window.M.rd(0x76) << 8)'));

console.log('waiting for STARSHIP SIMULATOR...');
let ok = false;
for (let i = 0; i < 900; i++) { await a2.frames(20); if ((await loaded()) === 'STARSHIP SIMULATOR') { ok = true; break; } }
if (!ok) { await a2.close(); throw new Error('the simulator never started'); }
await a2.frames(300);

// Hold the hull at 1 and the planet unsurrendered, and wait for a tick to land.
let inSx = false;
for (let i = 0; i < 4000; i++) {
  await a2.ev(`(() => { window.M.wr(${HULL}, 1); window.M.wr(${SURRENDERED}, 0); return 0; })()`);
  await a2.frames(5);
  if ((await loaded()) === 'S/X') { inSx = true; break; }
}
if (!inSx) { await a2.close(); throw new Error('S/X never ran - the hull never reached zero'); }
console.log('  S/X is running');

// Step until line 7 is the current line, then take the seed and the page.
let before = null, seed = null;
for (let i = 0; i < 4000; i++) {
  const l = await curlin();
  if (l === 7) {
    seed = await a2.readRange(SEED, SEED + 5);
    before = decodeHgr(await a2.readRange(0x2000, 0x4000));
    break;
  }
  await a2.frames(1);
}
if (!before) { await a2.close(); throw new Error('S/X never reached line 7'); }
console.log(`  at line 7 the seed is ${[...seed].map((b) => b.toString(16).padStart(2, '0')).join(' ')}`);

// And on until the burst is finished.
//
// Frame-stepping is too coarse to stop here. Line 30 is the outer `NEXT` and comes round sixteen
// times, so it is no use as a marker; line 40 is the first thing past the loops - but in S/X
// line 40 **prints**, at `SPEED= 127`, and a single 60Hz frame is long enough for the first
// character of "YOUR SHIP HAS BEEN DESTROYED!!" to reach the page. The first run of this caught
// the Y of YOUR and reported it as twelve pixels the port had failed to draw.
//
// So step in thousand-cycle pieces inside one call and stop the instant CURLIN reads 40.
const stopped = await a2.ev(`(() => {
  const cpu = window.M.cpu;
  for (let i = 0; i < 60000; i++) {
    if (((cpu.read(0x75) | (cpu.read(0x76) << 8))) === 40) return 'at 40';
    cpu.stepCycles(1000);
  }
  return 'timeout';
})()`);
if (stopped !== 'at 40') { await a2.close(); throw new Error('S/X never got past the burst'); }
const after = decodeHgr(await a2.readRange(0x2000, 0x4000));

let on = 0, off = 0;
for (let k = 0; k < before.length; k++) {
  if (!before[k] && after[k]) on++;
  if (before[k] && !after[k]) off++;
}
console.log(`  the burst turned ${on} pixels on and ${off} off`);
console.log('  (HCOLOR 0 on a white page, so the burst takes pixels away)');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();

const points = (p) => {
  const out = [];
  for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) if (p[y * HGR_W + x]) out.push([x, y]);
  return out;
};
fs.mkdirSync('captured/sxburst', { recursive: true });
fs.writeFileSync('captured/sxburst/before.png', toPng(before));
fs.writeFileSync('captured/sxburst/after.png', toPng(after));
fs.writeFileSync('captured/sxburst/golden.json', JSON.stringify({
  source: "S/X lines 7-30 on the machine, the same loop as EX in HCOLOR 0: the seed at $00C9 on entry, and the page either side",
  seed: [...seed], turnedOn: on, turnedOff: off,
  before: points(before), after: points(after),
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/sxburst/golden.json, before.png and after.png');
