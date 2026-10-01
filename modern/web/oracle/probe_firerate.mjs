// How fast the disk lets you fire, with the button held down.
//
// `185 IF PEEK(-16287) > 127 THEN GOSUB 1500` is tested **once a pass** of the main loop, so
// holding the button does not give a stream of shots - it gives one shot per pass, and a pass
// is long. The port has a `FIRE_COOLDOWN_SECONDS` of 0.45 standing in for that, which is
// nobody's measurement.
//
// This holds the paddle button down and watches the two cells a shot moves: 38187, the missile
// count 1090 takes two from, and 38160, the planet vitality 1535 adds to. The interval between
// changes is the rate, in video frames of 17,030 cycles - 16.688 ms each.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import fs from 'fs';

const FRAME_MS = 17030 / 1020500 * 1000;
const MISSILES = 38187, PLANET_VIT = 38160, WEAPON = 38202, LASER = 38186;

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
const wr = (a, v) => a2.ev('(() => { window.M.wr(' + a + ', ' + (v & 255) + '); return 1; })()');
const rd = async (a) => (await a2.readRange(a, a + 1))[0];

console.log('waiting for STARSHIP SIMULATOR...');
let ok = false;
for (let i = 0; i < 900; i++) { await a2.frames(20); if (await inSim()) { ok = true; break; } }
if (!ok) { await a2.close(); throw new Error('the simulator never started'); }
await a2.frames(200);

/**
 * Hold the button and record the frame on which `cell` changes, until `want` changes have been
 * seen or the budget runs out.
 */
const holdAndWatch = async (cell, want, budgetFrames) => {
  await a2.ev('(() => { window.M.a2.getIO().buttonDown(0); return 1; })()');
  const at = [];
  let prev = await rd(cell);
  for (let f = 0; f < budgetFrames && at.length < want; f++) {
    await a2.frames(1);
    const now = await rd(cell);
    if (now !== prev) { at.push({ frame: f, from: prev, to: now }); prev = now; }
  }
  await a2.ev('(() => { window.M.a2.getIO().buttonUp(0); return 1; })()');
  return at;
};

const report = (label, at) => {
  console.log(label);
  if (at.length < 2) {
    console.log('  only ' + at.length + ' change(s) seen - nothing to measure');
    return null;
  }
  const gaps = [];
  for (let i = 1; i < at.length; i++) gaps.push(at[i].frame - at[i - 1].frame);
  for (const a of at) console.log(`  frame ${String(a.frame).padStart(4)}  ${a.from} -> ${a.to}`);
  const ms = gaps.map((g) => g * FRAME_MS);
  const mean = ms.reduce((x, y) => x + y, 0) / ms.length;
  console.log(`  ${gaps.length} intervals: ${gaps.join(', ')} frames  = `
    + ms.map((m) => m.toFixed(0)).join(', ') + ' ms');
  console.log(`  mean ${mean.toFixed(0)} ms`);
  return { gaps, ms, mean };
};

// --- the missile, 1090's `J = PEEK(38187) - 2` ------------------------------------------
await wr(WEAPON, 1);
await wr(MISSILES, 200);
const missileAt = await holdAndWatch(MISSILES, 6, 3000);
const missile = report('missiles, with the button held:', missileAt);

// --- the laser, 1535's `POKE 38160,VP` ----------------------------------------------------
await wr(WEAPON, 0);
await wr(LASER, 100);
await wr(PLANET_VIT, 0);
const laserAt = await holdAndWatch(PLANET_VIT, 6, 3000);
const laser = report('', laserAt);
if (laser) console.log('(that one is the laser, 38160)');

if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();

const all = [...(missile ? missile.ms : []), ...(laser ? laser.ms : [])];
const mean = all.length ? all.reduce((a, b) => a + b, 0) / all.length : null;
console.log('');
if (mean) {
  console.log(`a shot every ${mean.toFixed(0)} ms with the button held, over ${all.length} intervals`);
  console.log(`(the port's BASIC_SIMULATOR_TICK_SECONDS is 2.55 s = 2550 ms)`);
}

fs.mkdirSync('captured/firerate', { recursive: true });
fs.writeFileSync('captured/firerate/golden.json', JSON.stringify({
  source: 'the paddle button held down on the machine, timing the cells a shot moves',
  frameMs: +FRAME_MS.toFixed(4),
  missile: missileAt, laser: laserAt,
  meanMs: mean === null ? null : +mean.toFixed(1),
}) + String.fromCharCode(10));
console.log('wrote captured/firerate/golden.json');
