// What firing actually does, on the disk.
//
// There is no enemy AI to check. `X9 = 400: Y9 = -100: Z9 = -3500` is set once at line 2 and
// never touched again, so the enemy is a fixed point in the world; the only thing that moves
// is you. What stands in for combat is the weapons model, and that is worth running:
//
//   185   IF PEEK(-16287) > 127 THEN GOSUB 1500
//   1500  IF PEEK(38208) = 1 THEN POKE 38208,0: POKE 38150,100
//   1501  IF PEEK(38202) = 1 THEN 1000          ; 38202 = 1 picks the missile
//   1502  IF PEEK(38186) = 0 THEN RETURN        ; a dead laser cannot fire
//   1505  ...draw the beams, CALL LA...  J1 = 10: J2 = 1
//   1535  VP = PEEK(38160) + (J1 / (TE+1)): IF VP < HL THEN POKE 38160,VP
//   1540  IF PEEK(38210) = 0 THEN DP = PEEK(38152) + (J2 / (TE+1)):
//         IF DP < HL THEN POKE 38152,DP
//   1550  IF VP => PEEK(38150) THEN ...surrender...
//   1560  IF DP > PEEK(38204) AND PEEK(38205) <> 0 THEN "RUNEX"
//
// with `TE = PEEK(38282 + PEEK(38209))` from line 8 and `HL = 255` from line 1.
//
// Four things to settle, each of which the port gets wrong or could:
//
//   1. **The laser does not aim.** 1535 and 1540 have no test for where the ship is pointing
//      or how far away anything is. Firing while facing away should raise 38160 all the same.
//   2. `IF VP < HL THEN POKE` is not a clamp. At 254, adding 10 gives 264, which is not less
//      than 255, so **nothing is stored** and the byte stays 254.
//   3. The enemy only takes damage in space - 1540 is gated on `PEEK(38210) = 0`.
//   4. A missile costs 2 whether it hits or misses (1090), and 5251's `GOTO 1090` means
//      **shooting down a ground battery costs 2 missiles as well**.
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

const rd = async (addrs) => {
  const b = await a2.readRange(0x9500, 0x9600);
  const o = {};
  for (const a of addrs) o[a] = b[a - 0x9500];
  return o;
};
const poke = async (pairs) => {
  await a2.ev(`(() => { ${pairs.map(([a, v]) => `window.M.wr(${a}, ${v});`).join(' ')} return 'w'; })()`);
};
// Line 185 reads $C061 once per pass of the main loop, and a pass takes far longer than a
// frame because the renderer runs inside it. Tapping the button mostly misses; holding it
// down is what a player does anyway, and 185 then fires on every pass.
const holdFire = async (frames) => {
  await a2.ev(`(() => { window.M.a2.getIO().buttonDown(0); return 'b'; })()`);
  await a2.frames(frames);
  await a2.ev(`(() => { window.M.a2.getIO().buttonUp(0); return 'b'; })()`);
  await a2.frames(10);
};

const WATCH = [38160, 38152, 38150, 38204, 38205, 38208, 38186, 38187, 38202, 38207, 38210, 38209];
const out = { runs: [] };
const planet = (await rd([38209]))[38209];
const tech = (await a2.readRange(0x9500, 0x9600))[38282 + Math.max(0, planet) - 0x9500];
console.log(`  planet ${planet}, TE = PEEK(38282 + ${planet}) = ${tech}, so a shot adds ` +
  `${(10 / (tech + 1)).toFixed(4)} to 38160 and ${(1 / (tech + 1)).toFixed(4)} to 38152`);

// ---- 1. the laser does not aim, and 1540 is gated on being in space ------------------------
console.log('');
console.log('firing the laser in space, without pointing at anything');
await poke([[38202, 0], [38186, 100], [38210, 0], [38208, 0], [38150, 200], [38204, 250],
  [38205, 1], [38160, 0], [38152, 0]]);
await a2.frames(10);
const before = await rd(WATCH);
await holdFire(900);
const after = await rd(WATCH);
const dVP = after[38160] - before[38160];
const dDP = after[38152] - before[38152];
console.log(`  38160 (planet vitality) ${before[38160]} -> ${after[38160]}  (+${dVP})`);
console.log(`  38152 (enemy damage)    ${before[38152]} -> ${after[38152]}  (+${dDP})`);
console.log(`  ${dVP > 0 ? 'the laser raised it with no aiming at all, as 1535 says'
  : 'nothing happened - the shot did not register'}`);
out.runs.push({ what: 'laser in space', tech, before, after, dVP, dDP });

// ---- 2. IF VP < HL THEN POKE is not a clamp ----------------------------------------------
console.log('');
// ---- 2. the laser cannot hurt the enemy ship, because POKE truncates -----------------------
// 1540 is `DP = PEEK(38152) + (J2 / (TE+1))` with J2 = 1, and it stores the result into a
// byte. At TE = 3 that is 0.25 a shot, and PEEK reads the byte back each time, so the
// fraction never survives: 0 + 0.25 stored as 0, for ever. The laser can only ever move 38152
// when `1 / (TE + 1) >= 1`, which means TE = 0 - and line 189 refuses to put an enemy on a
// planet below tech 2. So on any planet that has one, the laser cannot destroy it. Only the
// missile can, at J2 = 120.
console.log('');
console.log(`the laser against the enemy ship at TE = ${tech}: 1 / (TE + 1) = ${(1 / (tech + 1)).toFixed(2)} a shot`);
await poke([[38202, 0], [38210, 0], [38152, 0], [38204, 250], [38205, 1], [38150, 255]]);
await a2.frames(10);
await holdFire(900);
const dpHigh = (await rd([38152]))[38152];
console.log(`  38152 is ${dpHigh}  ${dpHigh === 0 ? 'still zero - the fraction is truncated away every shot' : 'it moved'}`);

// TE is read once, at line 8 - `TE = PEEK(38282 + PEEK(38209))` - so poking the tech table
// mid-flight does not change it. The control comes from 38160 instead, which moves.
out.runs.push({ what: 'laser vs the enemy ship', tech, at38152: dpHigh });

// ---- the truncation, and that `IF < HL` is a test rather than a clamp ----------------------
// Two settings of 38160 tell both stories at once. At 250 a shot computes 252.5, which IS
// less than 255, so it stores - and it stores 252, not 253, which is the truncation. At 253 a
// shot computes 255.5, which is not less than 255, so nothing is stored at all.
console.log('');
console.log(`38160 at 250: a shot makes 250 + ${(10 / (tech + 1)).toFixed(1)} = ${(250 + 10 / (tech + 1)).toFixed(1)}, under 255`);
await poke([[38160, 250], [38150, 255], [38202, 0], [38210, 0]]);
await a2.frames(10);
await holdFire(500);
const at250 = (await rd([38160]))[38160];
console.log(`  38160 is ${at250}  ${at250 > 250 ? `it moved, in steps of ${Math.trunc(10 / (tech + 1))} - the fraction is dropped each shot` : 'it did not move'}`);

console.log(`38160 at 253: a shot makes 253 + ${(10 / (tech + 1)).toFixed(1)} = ${(253 + 10 / (tech + 1)).toFixed(1)}, over 255`);
await poke([[38160, 253], [38150, 255]]);
await a2.frames(10);
await holdFire(500);
const at253 = (await rd([38160]))[38160];
console.log(`  38160 is ${at253}  ${at253 === 253 ? 'unchanged while the same button fire moved it from 250, so `IF VP < HL THEN POKE` is a test, not a clamp'
  : at253 === 255 ? 'clamped to 255 - it IS a clamp' : 'something else happened'}`);
out.runs.push({ what: 'truncation and the 255 test', at250, at253, step: Math.trunc(10 / (tech + 1)) });

// ---- 3. in atmosphere the enemy takes nothing ---------------------------------------------
console.log('');
console.log('firing in atmosphere - 1540 is gated on PEEK(38210) = 0');
await poke([[38210, 1], [38160, 0], [38152, 0], [38150, 200], [38208, 0]]);
await a2.frames(10);
const b3 = await rd([38160, 38152]);
await holdFire(900);
const a3 = await rd([38160, 38152]);
console.log(`  38160 ${b3[38160]} -> ${a3[38160]},  38152 ${b3[38152]} -> ${a3[38152]}` +
  `   ${a3[38152] === b3[38152] ? 'the enemy took nothing, as 1540 says' : 'the enemy took damage in air'}`);
out.runs.push({ what: 'laser in atmosphere', before: b3, after: a3 });

// ---- 4. a missile costs two, hit or miss --------------------------------------------------
console.log('');
console.log('firing a missile - 1090 takes 2 off 38187 whatever happens');
await poke([[38210, 0], [38202, 1], [38187, 60], [38160, 0], [38150, 200]]);
await a2.frames(10);
const b4 = (await rd([38187]))[38187];
// The missile flies an animation at 1010 - sixteen XDRAW steps - before 1090 charges for it,
// so it needs both more presses and time to finish.
await holdFire(1200);
await a2.frames(300);
const a4 = (await rd([38187]))[38187];
console.log(`  38187 ${b4} -> ${a4}   ${b4 - a4 === 2 ? 'two, as 1090 says' : `${b4 - a4} taken`}`);
out.runs.push({ what: 'missile cost', before: b4, after: a4 });

await a2.close();
fs.mkdirSync('captured/weapons', { recursive: true });
fs.writeFileSync('captured/weapons/golden.json', JSON.stringify({
  source: 'STARSHIP SIMULATOR 1500-1570 and 1000-1090, fired on the disk',
  planet, tech, ...out,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/weapons/golden.json');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
