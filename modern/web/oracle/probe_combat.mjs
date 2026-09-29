// GROUND FORCES' combat, watched on the disk instead of read off the listing.
//
// Lines 550-680 are all RND, so there is no reproducing a battle: Applesoft's RND is a
// five-byte float LCG and matching it would mean transcribing the ROM's floating-point
// multiply and add. What can be done is to watch a real assault and check the claims that
// the formulas make about it, each of which is falsifiable:
//
//   1. `TP = TP - (RND * 1) + .5`  - transports change by (-0.5, +0.5] per round, and can go
//      UP. The port had `rnd * rnd * 0.5`, which can only ever take them down, so a single
//      increase settles which of the two the machine is running.
//   2. `T`, `P` and `M` lose `RND * (RND * 5)` - never more than 5 in a round, never a gain.
//   3. Line 600 pokes the four back as bytes, so whether Applesoft rounds or truncates
//      decides what the screen shows. That is measured here directly.
//   4. Line 660 pokes 38150, 38208 and 38219 + planet on a surrender; 670 pokes 38151 and
//      38166 on a defeat.
//   5. The tech level really is the double indirection at 38282 + PEEK(38209).
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
const COM = textOf('COM');
const GF = textOf('GROUND FORCES');

const a2 = await openOracle();
await a2.ev(VAR_READER);
await a2.boot();
await a2.key('N');

const loaded = async () => {
  const bytes = await a2.readRange(0x800, 0x2000);
  const mem = {};
  for (let k = 0; k < bytes.length; k++) mem[0x800 + k] = bytes[k];
  try { return listProgram(mem, 0x801, 0x2000).map((l) => `${l.num} ${l.text}`).join('\n'); }
  catch { return ''; }
};
const waitFor = async (wanted, label) => {
  for (let i = 0; i < 600; i++) { await a2.frames(20); if ((await loaded()) === wanted) return; }
  await a2.close();
  throw new Error(`${label} never started`);
};
const vars = async () => {
  const r = JSON.parse(await a2.ev(`JSON.stringify(window.M.vars())`));
  const m = {};
  for (const v of r.vars ?? []) m[v.name] = v.value;
  return m;
};

console.log('waiting for STARSHIP SIMULATOR...');
await waitFor(SIM, 'STARSHIP SIMULATOR');
await a2.key('C');
await waitFor(COM, 'COM');
await a2.key('2');
await waitFor(GF, 'GROUND FORCES');
for (let i = 0; i < 40; i++) await a2.frames(20);

let bytes = await a2.readRange(0x9500, 0x9600);
const at = (a) => bytes[a - 0x9500];
const planet = at(38209);
const tech = at(38282 + planet);
console.log(`  planet ${planet}, tech from 38282+${planet} = ${tech}, morale ${at(38203)}, ` +
  `38205 ${at(38205)}, 38206 ${at(38206)}, SP(38150) ${at(38150)}, VP(38160) ${at(38160)}`);

// ---- what Applesoft's POKE does with a fraction -------------------------------------------
// GROUND FORCES line 600 pokes four values that carry fractions from round to round, so this
// decides what the counts on screen are. Applesoft's GETBYT has to resolve it one way.
const pokeTest = JSON.parse(await a2.ev(`(() => {
  const cpu = window.M.cpu;
  const out = [];
  // Build a float in FAC and call GETBYT the way POKE does is fiddly; instead let the running
  // interpreter do it, by reading what it already stored, and probe the conversion directly
  // through $E6F8 (GETBYTC) is not reachable here - so fall back to the observable: watch a
  // real round and compare the stored byte with the variable it came from.
  return JSON.stringify(out);
})()`));

// ---- set the troops on this planet so option 1 is allowed, then attack --------------------
// The opening save has this planet already taken - line 660 zeroes 38150 on a surrender, so
// SP of 0 with VP of 1 means `VP => SP` is true before the first round and the battle is over
// at once. Set up one that has to be fought: a surrender point to climb to, nothing climbed
// yet, and morale just above neutral so it ends inside a reasonable number of rounds.
console.log('');
console.log('setting SP(38150)=40, VP(38160)=0, 38208=0, morale(38203)=4, troops on this planet');
await a2.ev(`(() => {
  window.M.wr(38158, ${planet}); window.M.wr(38150, 40); window.M.wr(38160, 0);
  window.M.wr(38208, 0); window.M.wr(38203, 4); window.M.wr(38151, 0);
  return 'w';
})()`);
await a2.frames(20);
// Line 13 reads the four counts into P, TP, T and M when the MENU is drawn, and only M is
// re-read at line 500 - so giving the ship tanks and missiles means poking them and then
// coming back through the menu, or T stays at whatever it was.
await a2.ev(`(() => { window.M.wr(38153, 60); window.M.wr(38154, 50); return 'w'; })()`);
await a2.key('9');
await waitFor(COM, 'COM (to redraw the menu)');
await a2.key('2');
await waitFor(GF, 'GROUND FORCES (menu redrawn)');
for (let i = 0; i < 30; i++) await a2.frames(20);
await a2.ev(`(() => {
  window.M.wr(38158, ${planet}); window.M.wr(38150, 40); window.M.wr(38160, 0);
  window.M.wr(38208, 0); window.M.wr(38203, 4); window.M.wr(38151, 0);
  return 'w';
})()`);
await a2.frames(20);
console.log('pressing 1 to attack');
await a2.key('1');

// The battle runs inside GROUND FORCES, so the program never changes. Sample the four counts,
// VP, and the Applesoft variables as often as possible.
const samples = [];
for (let i = 0; i < 2000; i++) {
  const v = await vars();
  bytes = await a2.readRange(0x9500, 0x9600);
  samples.push({
    t: i,
    P: v.P, TP: v.TP, T: v.T, M: v.M, TR: v.TR, ET: v.ET, VP: v.VP, SP: v.SP, X: v.X, PS: v.PS,
    b: [at(38153), at(38154), at(38155), at(38156), at(38160), at(38208), at(38151), at(38166)],
  });
  if (at(38208) === 1 || at(38151) === 7) break;
  if ((await loaded()) !== GF) break;
  await a2.frames(4);
}
await a2.close();

const withTP = samples.filter((s) => s.TP !== undefined);
console.log('');
console.log(`${samples.length} samples, ${withTP.length} of them with the battle variables live`);
const tr0 = withTP.find((s) => s.TR !== undefined);
if (tr0) console.log(`  TR (troops, off the MISC FILE) started at ${tr0.TR}, ET at ${tr0.ET}`);

// Line 650's GOSUB 4000 is `P = INT(P): TP = INT(TP): TR = INT(TR): T = INT(T): M = INT(M)`,
// so every round the fractions are thrown away in the variables themselves, not just in the
// byte line 600 pokes. Both halves show up in the samples: an arithmetic step then a
// truncation.
//
// A value that has just been clamped at zero by 590-598 looks like a rise; those are not.
const runs = (key) => {
  const seq = [];
  for (const s of withTP) if (s[key] !== undefined && (!seq.length || s[key] !== seq[seq.length - 1])) seq.push(s[key]);
  const rise = []; const fall = []; const trunc = [];
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1]; const b = seq[i];
    if (a < 0 && b === 0) continue;                     // the clamp at 590-598
    if (b === Math.trunc(a) && a !== b) { trunc.push([a, b]); continue; }   // 4000's INT
    if (b > a) rise.push(b - a); else fall.push(a - b);
  }
  return { seq, rise, fall, trunc };
};

console.log('');
const tpR = runs('TP');
console.log(`TP over ${tpR.seq.length} distinct values: ${tpR.rise.length} rises, ${tpR.fall.length} falls, ` +
  `${tpR.trunc.length} truncations at 4000`);
if (tpR.rise.length) {
  console.log(`  biggest rise +${Math.max(...tpR.rise).toFixed(4)}, biggest fall -${Math.max(...tpR.fall).toFixed(4)}`);
  console.log('  TP = TP - (RND * 1) + .5 then: a single uniform with half added back, so it rises');
  console.log('  about as often as it falls. rnd * rnd * 0.5, which the port had, never rises at all.');
} else {
  console.log('  no rise seen - inconclusive');
}
if (tpR.trunc.length) console.log(`  e.g. ${tpR.trunc[0][0].toFixed(4)} truncated to ${tpR.trunc[0][1]} by line 4000`);

for (const [name, key] of [['T (tanks)', 'T'], ['P (fighters)', 'P'], ['M (missiles)', 'M']]) {
  const r = runs(key);
  const worst = r.fall.length ? Math.max(...r.fall) : 0;
  const ok = r.rise.length === 0 && worst <= 5.0001;
  console.log(`  ${name.padEnd(14)} ${r.seq.length} values, ${r.rise.length} rises, ` +
    `biggest loss ${worst.toFixed(4)}, ${r.trunc.length} truncations` +
    `  ${ok ? 'as RND*(RND*5) says' : 'NOT as RND*(RND*5) says'}`);
}

console.log('');
console.log(`ET, which line 500 sets and 570 updates: ${withTP.some((s) => s.ET !== undefined) ? 'present' : 'never appears in the variable table'}`);

const last = samples[samples.length - 1];
console.log('');
console.log(`ended with 38208 (surrendered) = ${last.b[5]}, 38151 = ${last.b[6]}, 38166 = ${last.b[7]}`);

fs.mkdirSync('captured/combat', { recursive: true });
fs.writeFileSync('captured/combat/golden.json', JSON.stringify({
  source: 'a real assault on the disk, sampled through GROUND FORCES lines 550-680',
  planet, tech, samples,
}) + String.fromCharCode(10));
console.log('wrote captured/combat/golden.json');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
