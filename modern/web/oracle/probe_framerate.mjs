// How often the flight view is actually redrawn.
//
// `BASIC_SIMULATOR_TICK_SECONDS` is 2.55, measured by `probe_flightspeed.mjs` from the steps
// the ship takes - that is the **simulation** rate. This is the other half of the question:
// how often a new picture appears, which is what a frame rate is.
//
// One pass of 15-210 draws one frame. 150 is `CALL CA`, the display list; 147 pokes the page
// to show with `POKE 29461,84 + OO`, so the machine is double-buffered and OO alternates. What
// is timed here is the interval between successive arrivals at 150, and the interval between
// the displayed page actually changing.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import fs from 'fs';

const FRAME_MS = 17030 / 1020500 * 1000;
const SOFT_SWITCH = 29461;   // 147: POKE 29461, 84 + OO
const ZI = 29471;            // line 140 stores Z here once a pass

const disk = openDisk(DISK);
const simText = (() => {
  const r = disk.read(disk.files.find((f) => f.name === 'STARSHIP SIMULATOR'));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => l.num + ' ' + l.text).join('\n');
})();

const a2 = await openOracle();
await a2.boot();
await a2.key('N');
const inSim = async () => {
  const b = await a2.readRange(0x800, 0x2000);
  const m = {};
  for (let k = 0; k < b.length; k++) m[0x800 + k] = b[k];
  try { return listProgram(m, 0x801, 0x2000).map((l) => l.num + ' ' + l.text).join('\n') === simText; }
  catch { return false; }
};
const curlin = async () => {
  const b = await a2.readRange(0x75, 0x77);
  return b[0] | (b[1] << 8);
};

console.log('waiting for STARSHIP SIMULATOR...');
let ok = false;
for (let i = 0; i < 900; i++) { await a2.frames(20); if (await inSim()) { ok = true; break; } }
if (!ok) { await a2.close(); throw new Error('the simulator never started'); }
await a2.frames(300);

// Every frame, note whether BASIC is at 150 and what 147 last wrote to the page register.
// Both halves of the question in the same run, so they cannot be comparing different states:
// how often the page being shown changes, and how often 140 stores a new Z. A pass does both
// exactly once, so if the two disagree something else is going on.
const drawAt = [];
const flipAt = [];
const stepAt = [];
let wasAt150 = false;
let lastPage = (await a2.readRange(SOFT_SWITCH, SOFT_SWITCH + 1))[0];
let lastZ = (await a2.readRange(ZI, ZI + 2)).join(',');
for (let f = 0; f < 1400 && flipAt.length < 6; f++) {
  await a2.frames(1);
  const at150 = (await curlin()) === 150;
  if (at150 && !wasAt150) drawAt.push(f);
  wasAt150 = at150;
  const page = (await a2.readRange(SOFT_SWITCH, SOFT_SWITCH + 1))[0];
  if (page !== lastPage) { flipAt.push({ frame: f, to: page }); lastPage = page; }
  const z = (await a2.readRange(ZI, ZI + 2)).join(',');
  if (z !== lastZ) { stepAt.push(f); lastZ = z; }
}
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();

const gaps = (at) => at.slice(1).map((f, i) => f - at[i]);
const show = (label, at) => {
  const g = gaps(at);
  if (!g.length) { console.log(`${label}: not enough samples`); return null; }
  const ms = g.map((x) => x * FRAME_MS);
  const mean = ms.reduce((a, b) => a + b, 0) / ms.length;
  console.log(`${label}: ${g.join(', ')} frames  = ${ms.map((m) => m.toFixed(0)).join(', ')} ms`);
  console.log(`  mean ${mean.toFixed(0)} ms  -  ${(1000 / mean).toFixed(2)} frames a second`);
  return mean;
};

console.log('');
const drawMean = show('150, CALL CA - a new picture', drawAt);
show('29461, the page being shown', flipAt.map((x) => x.frame));
show('29471, a new Z from line 140 ', stepAt);

fs.mkdirSync('captured/framerate', { recursive: true });
fs.writeFileSync('captured/framerate/golden.json', JSON.stringify({
  source: 'the flight loop on the machine, timing how often it draws',
  frameMs: +FRAME_MS.toFixed(4),
  drawAt, flipAt, stepAt,
  drawIntervalMs: drawMean === null ? null : +drawMean.toFixed(1),
  fps: drawMean === null ? null : +(1000 / drawMean).toFixed(3),
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/framerate/golden.json');
