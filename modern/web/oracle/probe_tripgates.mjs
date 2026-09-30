// The two "one time per trip" flags, and what actually resets them.
//
// SHORE LEAVE has two:
//
//   2106  IF PEEK(38149) = 1 THEN "ONLY ONE TIME PER TRIP, SIR."     building a base
//   2107  POKE 38149,1
//   2210  IF PEEK(38389) = 1 THEN "ONE TIME PER TRIP."               enlisting troops
//   2220  POKE 38389,1
//   2285  IF TR + EN > 20000 THEN ... POKE 38389,0: GOTO 2200        a refused count is free
//
// and H/D line 105 is `POKE 38206,0: POKE 38389,0: POKE 38149,0` - a hyperdrive jump clears
// both, which is what makes a "trip" a trip.
//
// But 38149 is not only the base flag. Three other lines use the same byte as a message:
//
//   STARSHIP SIMULATOR   9  POKE 38149,7
//                      182  IF PEEK(38149) = 7 THEN POKE 38149,0: GOTO 200
//   GALAXY MAP        3260  POKE 38149,8 ... RUN COM
//   COM               1007  IF PEEK(38149) = 8 THEN POKE 38149,0
//
// Line 9 runs every time STARSHIP SIMULATOR starts and pokes 7 unconditionally, so **returning
// to flight overwrites the base flag** and 182 then clears it to 0. If that is right, "one time
// per trip" for a base is really one time per landing, because flying anywhere at all resets
// it - while enlisting, whose flag nothing else touches, is once per trip as written.
//
// That is a claim about what the machine does, so it is measured here rather than argued.
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
const COM = textOf('COM');
const GF = textOf('GROUND FORCES');

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
const waitFor = async (w, label) => {
  for (let i = 0; i < 700; i++) { await a2.frames(20); if ((await loaded()) === w) return true; }
  console.log('  ' + label + ' never started');
  return false;
};
const flags = async () => ({ base: await a2.read(38149), enlist: await a2.read(38389) });
const setBoth = async () => {
  await a2.ev(`(() => { window.M.wr(38149, 1); window.M.wr(38389, 1); return 'w'; })()`);
  await a2.frames(10);
};

console.log('waiting for STARSHIP SIMULATOR...');
if (!await waitFor(SIM, 'STARSHIP SIMULATOR')) { await a2.close(); throw new Error('no simulator'); }
await a2.frames(200);

const results = {};

// ---- do the flags survive the menus? ------------------------------------------------------
await a2.key('C');
if (!await waitFor(COM, 'COM')) { await a2.close(); throw new Error('no COM'); }
await setBoth();
results.set = await flags();
console.log(`  set in COM:                       38149 = ${results.set.base}, 38389 = ${results.set.enlist}`);

await a2.key('2');
if (!await waitFor(GF, 'GROUND FORCES')) { await a2.close(); throw new Error('no GROUND FORCES'); }
for (let i = 0; i < 20; i++) await a2.frames(20);
results.afterGroundForces = await flags();
console.log(`  after RUN GROUND FORCES:          38149 = ${results.afterGroundForces.base}` +
  `, 38389 = ${results.afterGroundForces.enlist}`);

// ---- and a return to flight? --------------------------------------------------------------
// GROUND FORCES 9 returns to COM, and COM 5 is RETURN, which runs STARSHIP SIMULATOR.
await a2.key('9');
if (!await waitFor(COM, 'COM (back from GROUND FORCES)')) { await a2.close(); throw new Error('no COM'); }
for (let i = 0; i < 10; i++) await a2.frames(20);
results.backInCom = await flags();
console.log(`  back in COM:                      38149 = ${results.backInCom.base}` +
  `, 38389 = ${results.backInCom.enlist}`);

await a2.key('5');
if (!await waitFor(SIM, 'STARSHIP SIMULATOR (flying again)')) {
  await a2.close(); throw new Error('never got back to flight');
}
// line 9 runs at start-up; 182 needs a pass of the main loop to clear the 7.
for (let i = 0; i < 40; i++) await a2.frames(20);
results.afterFlight = await flags();
console.log(`  after returning to flight:        38149 = ${results.afterFlight.base}` +
  `, 38389 = ${results.afterFlight.enlist}`);

await a2.close();

console.log('');
const wiped = results.afterFlight.base !== 1;
const kept = results.afterFlight.enlist === 1;
console.log(wiped
  ? '  the base flag did NOT survive the return to flight - line 9 overwrote it and 182 cleared it'
  : '  the base flag survived the return to flight');
console.log(kept
  ? '  the enlist flag did survive, so it really is once per trip'
  : '  the enlist flag did NOT survive either');
console.log('');
console.log(wiped && kept
  ? '  so a base is once per landing and troops are once per jump, although both lines say "trip"'
  : '  the two flags do not behave as the listing suggests; see the numbers above');

fs.mkdirSync('captured/replay', { recursive: true });
fs.writeFileSync('captured/replay/tripgates.json', JSON.stringify({
  source: '38149 and 38389 read at each step of COM -> GROUND FORCES -> COM -> flight',
  results,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/replay/tripgates.json');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
