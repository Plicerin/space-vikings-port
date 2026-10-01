// How long a pass of the main loop takes, in the states the game is actually played in.
//
// Two measurements disagreed: `probe_flightspeed.mjs` got 2.5 to 2.6 s from the position
// steps, which is where `BASIC_SIMULATOR_TICK_SECONDS = 2.55` came from, and
// `probe_framerate.mjs` got 2.94 s from the page flip - and timing both in one run showed they
// are the same event, so the two runs must have been in different states.
//
// A pass is one position step and one new picture, so the honest way to time it is to watch
// 147's `POKE 29461,84 + OO` - the page the machine is showing - and do it in each state the
// ship can be in. What changes between them is what `CALL CA` has to walk and what line 192
// adds on top.
import { openOracle, VAR_READER } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import fs from 'fs';

const FRAME_MS = 17030 / 1020500 * 1000;
const SOFT_SWITCH = 29461;
const ATMOS = 38210, SURRENDERED = 38208, BATTERIES = 38207, SHIP_KIND = 38205;

const disk = openDisk(DISK);
const simText = (() => {
  const r = disk.read(disk.files.find((f) => f.name === 'STARSHIP SIMULATOR'));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => l.num + ' ' + l.text).join('\n');
})();

const a2 = await openOracle();
await a2.boot();
await a2.key('N');
await a2.ev(VAR_READER);
const inSim = async () => {
  const b = await a2.readRange(0x800, 0x2000);
  const m = {};
  for (let k = 0; k < b.length; k++) m[0x800 + k] = b[k];
  try { return listProgram(m, 0x801, 0x2000).map((l) => l.num + ' ' + l.text).join('\n') === simText; }
  catch { return false; }
};
const wr = (a, v) => a2.ev('(() => { window.M.wr(' + a + ', ' + (v & 255) + '); return 1; })()');
const mflpBytes = (v) => {
  if (v === 0) return [0, 0, 0, 0, 0];
  const neg = v < 0; const a = Math.abs(v);
  const e = Math.floor(Math.log2(a)) + 1;
  let m = Math.round((a / Math.pow(2, e)) * 4294967296);
  if (m > 4294967295) m = 4294967295;
  const b = [(m >>> 24) & 255, (m >>> 16) & 255, (m >>> 8) & 255, m & 255];
  return [e + 128, (b[0] & 127) | (neg ? 128 : 0), b[1], b[2], b[3]];
};
const setVar = async (name, value) => {
  const vt = JSON.parse(await a2.ev('JSON.stringify(window.M.vars())'));
  const v = vt.vars.find((x) => x.name === name);
  if (!v) throw new Error('no variable ' + name);
  const b = mflpBytes(value);
  for (let i = 0; i < 5; i++) await wr(v.at + 2 + i, b[i]);
};
console.log('waiting for STARSHIP SIMULATOR...');
let ok = false;
for (let i = 0; i < 900; i++) { await a2.frames(20); if (await inSim()) { ok = true; break; } }
if (!ok) { await a2.close(); throw new Error('the simulator never started'); }
await a2.frames(300);

/**
 * Time six page flips and report the intervals.
 *
 * Everything here steps with `frames()`. Stepping the CPU raw with `stepCycles` - which is
 * what `runTo` does - skips the IO and MMU ticks that `frames()` makes, and a first version of
 * this that used it to line the machine up read the opening at 52 frames a pass against
 * `probe_framerate.mjs`'s 176, and left the variable table unreadable. The clock is frames.
 */
const timePasses = async (label, setUp) => {
  await setUp();
  // Let the state settle into a couple of whole passes before timing anything.
  await a2.frames(400);

  const at = [];
  let last = (await a2.readRange(SOFT_SWITCH, SOFT_SWITCH + 1))[0];
  for (let f = 0; f < 1600 && at.length < 6; f++) {
    await a2.frames(1);
    const page = (await a2.readRange(SOFT_SWITCH, SOFT_SWITCH + 1))[0];
    if (page !== last) { at.push(f); last = page; }
  }
  const gaps = at.slice(1).map((x, i) => x - at[i]);
  const ms = gaps.map((g) => g * FRAME_MS);
  const mean = ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null;
  console.log(`  ${label.padEnd(34)} ${gaps.join(', ').padEnd(26)} = `
    + (mean === null ? 'no samples' : `${(mean / 1000).toFixed(2)} s`));
  return { label, gaps, ms, mean };
};

console.log('');
console.log('a pass, timed by the page the machine is showing:');
const runs = [];

runs.push(await timePasses('the opening, enemy ahead', async () => { /* as it starts */ }));

runs.push(await timePasses('far out, nothing else in view', async () => {
  await setVar('X', 12000); await setVar('Y', 12000); await setVar('Z', 12000);
}));

runs.push(await timePasses('in the atmosphere, ground below', async () => {
  await wr(ATMOS, 1);
  await setVar('X', 400); await setVar('Y', 600); await setVar('Z', -3000);
}));

runs.push(await timePasses('in the box, taking return fire', async () => {
  await wr(ATMOS, 0);
  await wr(SURRENDERED, 0);        // 192 only runs the tick on a planet that has not given up
  await wr(BATTERIES, 3);
  await setVar('X', 400); await setVar('Y', -100); await setVar('Z', -3000);
}));

const kind = (await a2.readRange(SHIP_KIND, SHIP_KIND + 1))[0];
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();

const all = runs.flatMap((r) => r.ms);
const sorted = [...all].sort((a, b) => a - b);
const mean = all.reduce((a, b) => a + b, 0) / all.length;
console.log('');
console.log(`  ${all.length} passes over ${runs.length} states: `
  + `${(sorted[0] / 1000).toFixed(2)} to ${(sorted[sorted.length - 1] / 1000).toFixed(2)} s, `
  + `mean ${(mean / 1000).toFixed(2)}, median ${(sorted[sorted.length >> 1] / 1000).toFixed(2)}`);
console.log(`  (the port uses 2.55; ship kind on this planet was ${kind})`);

fs.mkdirSync('captured/passtime', { recursive: true });
fs.writeFileSync('captured/passtime/golden.json', JSON.stringify({
  source: 'the page flip timed in four states of flight',
  frameMs: +FRAME_MS.toFixed(4),
  shipKind: kind, runs,
  meanMs: +mean.toFixed(1),
  minMs: +sorted[0].toFixed(1),
  maxMs: +sorted[sorted.length - 1].toFixed(1),
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/passtime/golden.json');
