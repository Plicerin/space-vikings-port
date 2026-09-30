// The damage tick, replayed rather than sampled.
//
// With `$EFAE` transcribed the RND-driven routines stop needing predicates: given the seed at
// `$00C9` and the fill byte at `$A4`, the exact values the machine drew can be recomputed, so
// the formulas can be checked on the numbers themselves.
//
// This records, at **every** entry to `$EFAE` while the game is taking damage, the five seed
// bytes before the call and the seven system bytes 3230-3350 write. Consecutive entries then
// bracket each draw: whatever changed between call n and call n+1 is what that one value did.
//
// The seed is read before the call rather than after because `$EFAE` overwrites it in place:
// `$EFE3 LDX #$C9 / LDY #$00 / JMP $EB2B` stores the new seed over the old one and returns it.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import fs from 'fs';

const disk = openDisk(DISK);
const SIM = (() => {
  const r = disk.read(disk.files.find((f) => f.name === 'STARSHIP SIMULATOR'));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => `${l.num} ${l.text}`).join('\n');
})();

/** 3205 and 3230-3350, in the order the lines write them. */
const SYSTEMS = [
  ['shields', 38200], ['radar', 38195], ['engine1', 38198], ['engine2', 38197],
  ['computer', 38196], ['laser', 38186], ['hull', 38193],
];

const a2 = await openOracle();
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
for (let i = 0; i < 600; i++) { await a2.frames(20); if ((await loaded()) === SIM) break; }
if ((await loaded()) !== SIM) { await a2.close(); throw new Error('no simulator'); }
await a2.frames(200);

// An enemy present, the planet not taken, the shields down so 3205 never absorbs, and
// everything high enough that the run does not bottom out.
console.log('setting the ship up so the tick gets past 3205 every time');
await a2.ev(`(() => {
  const w = window.M.wr;
  w(38208, 0); w(38205, 3); w(38207, 4); w(38393, 1);
  w(38200, 250); w(38201, 0);
  for (const a of [38199, 38198, 38197, 38196, 38195, 38194, 38193, 38190, 38187, 38186, 38184]) w(a, 250);
  return 'w';
})()`);
await a2.frames(10);

const r = JSON.parse(await a2.ev(`(() => {
  const cpu = window.M.cpu;
  const sys = ${JSON.stringify(SYSTEMS.map((s) => s[1]))};
  const out = [];
  let n = 0;
  while (n < 40000000 && out.length < 500) {
    if (cpu.getPC() === 0xEFAE) {
      out.push({
        seed: [cpu.read(0xC9), cpu.read(0xCA), cpu.read(0xCB), cpu.read(0xCC), cpu.read(0xCD)],
        a4: cpu.read(0xA4),
        sys: sys.map((a) => cpu.read(a)),
      });
    }
    cpu.stepCycles(1);
    n++;
  }
  return JSON.stringify({ steps: n, calls: out });
})()`));
await a2.close();

const calls = r.calls;
console.log(`  ${calls.length} calls to $EFAE in ${r.steps.toLocaleString()} instructions`);
const a4s = [...new Set(calls.map((c) => c.a4))];
console.log(`  $A4 over the whole run: ${a4s.map((v) => '$' + v.toString(16)).join(', ')}`);

// A tick that got past 3205 writes all seven in order, so find runs where every one of the
// seven changed between two calls that are eight apart - shields, then six more.
const changedBetween = (i, j) => SYSTEMS
  .map(([n], k) => (calls[i].sys[k] !== calls[j].sys[k] ? n : null)).filter(Boolean);
let ticks = 0;
for (let i = 0; i + 7 < calls.length; i++) {
  if (changedBetween(i, i + 7).length === 7) ticks++;
}
console.log(`  ${ticks} windows of seven calls over which all seven systems changed`);

fs.mkdirSync('captured/replay', { recursive: true });
fs.writeFileSync('captured/replay/damage.json', JSON.stringify({
  source: 'every entry to $EFAE during a damaging flight, with the seed before the call and the seven systems 3205-3350 write',
  systems: SYSTEMS, calls,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/replay/damage.json');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
