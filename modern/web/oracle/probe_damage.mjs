// The damage model, watched on the disk.
//
// Lines 3000-3381 are RND-driven, so a tick cannot be replayed. What can be checked is what
// each tick is allowed to do, and every one of these fails if the formulas are read wrongly:
//
//   1. Shields lose at most 1.1 in one tick (3205), the six systems at most 5 - except the
//      hull, at most 4 (3230-3350).
//   2. **Exactly six things take damage**: radar 38195, engines 38198 and 38197, computer
//      38196, laser 38186 and hull 38193. Energy 38199, env. control 38194, hyperdrive 38190,
//      missiles 38187 and nav. comp. 38184 are never touched by this routine, and watching
//      the whole block at once is what makes that a result rather than an assumption.
//   3. Nothing ever goes below zero (3380) and nothing ever goes up.
//   4. With the shields up and above 10, a tick takes shields only - 3205 returns before
//      3230. Below that, or with them down, the rest follows in the same tick.
//
// Reaching it: line 192 calls 3000 every pass while the planet has not surrendered and the
// ship is inside a box near it, so poking 38208 to 0 and 38205 to something non-zero is
// enough - the opening game is already flying there.
import { openOracle } from './a2.mjs';
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

// Everything SHORE LEAVE 2500's DATA names, so the ones that are not damaged are watched too.
const SYSTEMS = [
  ['shields', 38200], ['shieldsOn', 38201], ['energy', 38199],
  ['engine1', 38198], ['engine2', 38197], ['computer', 38196], ['radar', 38195],
  ['envControl', 38194], ['hull', 38193], ['hyperdrive', 38190],
  ['missiles', 38187], ['laser', 38186], ['navComp', 38184],
];
/** 3230-3350, and the most one tick may take off. */
const BOUND = { shields: 1.1, radar: 5, engine1: 5, engine2: 5, computer: 5, laser: 5, hull: 4 };

// Two of the thirteen move for reasons that have nothing to do with damage, and finding that
// out is half the point of watching the whole block instead of only the six.
//
//   38194, which SHORE LEAVE 2500 calls ENV. CONTROL and COM 15140 shows as ST(5), is
//   MEM TRANSFER A's loop counter. $9400 is `LDX #$00 / STX $9532 ... CPX #$80 / BEQ`, and
//   lines 150 and 153 CALL 37936 and 37888 every single pass of the main loop - so the byte
//   is being counted from 0 to 128 under the readout continuously. Trapping every write to
//   $9532 during flight finds them all at $9402, $9417, $942A, $9447 and $945A, and nowhere
//   else. Env. control is not a system in flight; it is a counter.
//
//   38187 is the missile count. Line 1090 is `J = PEEK(38187) - 2: GOSUB 3380: POKE 38187,J`,
//   which is firing one, not taking damage.
const OTHER_WRITERS = {
  envControl: "MEM TRANSFER A's loop counter at $9532, called every pass by lines 150/153",
  missiles: 'line 1090 takes 2 off when a missile is fired',
  shieldsOn: 'the flag itself, not a system',
};

const a2 = await openOracle();
await a2.boot();
await a2.key('N');

const loaded = async () => {
  const bytes = await a2.readRange(0x800, 0x2000);
  const mem = {};
  for (let k = 0; k < bytes.length; k++) mem[0x800 + k] = bytes[k];
  try { return listProgram(mem, 0x801, 0x2000).map((l) => `${l.num} ${l.text}`).join('\n'); }
  catch { return ''; }
};
console.log('waiting for STARSHIP SIMULATOR...');
for (let i = 0; i < 600; i++) { await a2.frames(20); if ((await loaded()) === SIM) break; }
if ((await loaded()) !== SIM) { await a2.close(); throw new Error('no simulator'); }
await a2.frames(200);

const read = async () => {
  const b = await a2.readRange(0x9500, 0x9600);
  const o = {};
  for (const [n, a] of SYSTEMS) o[n] = b[a - 0x9500];
  return o;
};

const runs = [];
for (const phase of [
  { name: 'shields down', shieldsOn: 0, shields: 100 },
  { name: 'shields up and full', shieldsOn: 1, shields: 100 },
  { name: 'shields up but at 8', shieldsOn: 1, shields: 8 },
]) {
  // An enemy present, the planet not taken, everything at full, and the ship kept alive.
  await a2.ev(`(() => {
    const w = window.M.wr;
    w(38208, 0); w(38205, 3); w(38207, 4); w(38393, 1);
    w(38200, ${phase.shields}); w(38201, ${phase.shieldsOn});
    for (const a of [38199, 38198, 38197, 38196, 38195, 38194, 38193, 38190, 38187, 38186, 38184]) w(a, 200);
    return 'w';
  })()`);
  await a2.frames(4);

  const seq = [];
  let prev = await read();
  seq.push(prev);
  for (let i = 0; i < 700; i++) {
    await a2.frames(2);
    const now = await read();
    if (SYSTEMS.some(([n]) => now[n] !== prev[n])) { seq.push(now); prev = now; }
    if (now.hull < 40 || (await loaded()) !== SIM) break;
    // keep it alive and keep the enemy there, without disturbing what is being measured
    await a2.ev(`(() => { window.M.wr(38208, 0); window.M.wr(38205, 3); return 'w'; })()`);
  }
  runs.push({ ...phase, seq });
  console.log(`  ${phase.name.padEnd(22)} ${seq.length} distinct states`);
}
await a2.close();

// ---- what actually changed ---------------------------------------------------------------
const changed = new Map();
const rises = [];
const overBound = [];
let shieldOnlyTicks = 0;
let fullTicks = 0;
for (const run of runs) {
  for (let i = 1; i < run.seq.length; i++) {
    const a = run.seq[i - 1];
    const b = run.seq[i];
    const moved = SYSTEMS.map(([n]) => n).filter((n) => a[n] !== b[n]);
    for (const n of moved) {
      changed.set(n, (changed.get(n) ?? 0) + 1);
      if (OTHER_WRITERS[n]) continue;                 // not this routine's doing
      const d = a[n] - b[n];
      if (d < 0) rises.push(`${run.name}: ${n} ${a[n]} -> ${b[n]}`);
      else if (BOUND[n] !== undefined && d > Math.ceil(BOUND[n])) {
        overBound.push(`${run.name}: ${n} fell ${d}, over ${BOUND[n]}`);
      }
    }
    const others = moved.filter((n) => n !== 'shields' && !OTHER_WRITERS[n]);
    if (moved.includes('shields') && others.length === 0) shieldOnlyTicks++;
    else if (others.length) fullTicks++;
  }
}

console.log('');
console.log('what a damage tick moved, over all three runs:');
let unexpected = 0;
for (const [n, a] of SYSTEMS) {
  const c = changed.get(n) ?? 0;
  const expected = BOUND[n] !== undefined;
  const other = OTHER_WRITERS[n];
  const ok = expected ? c > 0 : (other ? true : c === 0);
  if (!ok) unexpected++;
  const note = expected ? 'damaged by 3230-3350'
    : other ? other : 'never touched by anything';
  console.log(`  ${n.padEnd(11)} ${String(a).padStart(6)}  changed ${String(c).padStart(4)} times   ` +
    `${note}${ok ? '' : '   <-- UNEXPECTED'}`);
}
console.log('');
console.log(`  ${rises.length} rises` + (rises.length ? `: ${rises.slice(0, 3).join('; ')}` : ' - nothing ever went up'));
console.log(`  ${overBound.length} changes over the per-tick bound` +
  (overBound.length ? `: ${overBound.slice(0, 3).join('; ')}` : ' - every one inside 3230-3350'));
console.log(`  ${shieldOnlyTicks} ticks took shields alone, ${fullTicks} took the rest as well`);
console.log('');
console.log(unexpected === 0
  ? 'every one of the thirteen behaved as 3230-3350 and the two other writers predict'
  : `${unexpected} system(s) did something unaccounted for`);

fs.mkdirSync('captured/damage', { recursive: true });
fs.writeFileSync('captured/damage/golden.json', JSON.stringify({
  source: 'STARSHIP SIMULATOR line 192 calling 3000, watched on the disk with all thirteen systems read together',
  bounds: BOUND, runs,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/damage/golden.json');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
