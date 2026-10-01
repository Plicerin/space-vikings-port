// The morale penalty for jumping with the crew grounded - H/D lines 12 and 13, and the flag
// at 38170 that decides it.
//
// 38170 was one of seven cells left over from shipdata_parity as "zero in a new game on both
// sides, so nothing here can tell". Six of the seven turned out to be dead. This one is a
// mechanic, and the port does not have it:
//
//   GROUND FORCES 14  IF PEEK(29469) = 20 AND PEEK(29470) = 0 AND PEEK(38170) = 0
//                     THEN POKE 38170,17
//   SHORE LEAVE 2087  POKE 38170,70
//   H/D 12            ... IF PEEK(38170) = 17 THEN PL = PEEK(38203):LP = 7:
//                     PL = PL - 1: IF PL < 0 THEN PL = 0
//   H/D 13            IF LP = 7 THEN POKE 38203,PL: POKE 38170,0
//
// Land the troops and then jump without taking shore leave, and the crew loses a point of
// morale. Take shore leave first - paid or not, 2087 is before the Y/N branch - and 38170 is
// 70 rather than 17, so the jump costs nothing.
//
// Three things here are worth measuring rather than reading off the listing: that the penalty
// really fires, that the floor is 0 and not 1 (every other morale change floors at 1), and
// what STATUS prints for a morale of 0, which it has no case for.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import fs from 'fs';

const MORALE = 38203, FLAG = 38170, DEST = 38163, PLANET = 38209;

const disk = openDisk(DISK);
const textOf = (name) => {
  const r = disk.read(disk.files.find((f) => f.name === name));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => `${l.num} ${l.text}`).join('\n');
};
const SIM = textOf('STARSHIP SIMULATOR');
const HD = textOf('H/D');
const GF = textOf('GROUND FORCES');

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
const waitFor = async (wanted, tries = 600) => {
  for (let i = 0; i < tries; i++) { await a2.frames(20); if ((await loaded()) === wanted) return true; }
  return false;
};
const waitForSim = (tries = 700) => waitFor(SIM, tries);

if (!await waitForSim()) { await a2.close(); throw new Error('no simulator'); }
await a2.frames(200);
console.log('in flight.');

const wr = async (addr, v) => a2.ev(`(() => { window.M.wr(${addr}, ${v}); return 'w'; })()`);

/**
 * One jump: set the flag and the morale, poke a destination the way COM 880 does, press H,
 * wait for the simulator to come back, and read both bytes.
 */
async function jump(flagBefore, moraleBefore, to) {
  // H/D line 1 is `IF PEEK(38209) = PEEK(38163) OR PEEK(38163) = 0 THEN RUN STARSHIP
  // SIMULATOR` - asking to jump to the planet you are already at returns at once and runs
  // none of this. The first version of this probe sent every jump to the same planet and read
  // four no-ops as if they were measurements.
  await wr(FLAG, flagBefore);
  await wr(MORALE, moraleBefore);
  await wr(DEST, to);
  await a2.frames(20);
  await a2.key('H');
  if (!await waitFor(HD, 400)) throw new Error('H/D never started');
  // Let the jump run all the way back into flight, so 13 has certainly executed.
  if (!await waitForSim(900)) throw new Error('never came back to flight');
  await a2.frames(120);
  return {
    flagBefore, moraleBefore,
    morale: await a2.read(MORALE),
    flag: await a2.read(FLAG),
    planet: await a2.read(PLANET),
  };
}

console.log('');
console.log('jumping, with the flag set each way:');
console.log('  38170 in   38203 in   38203 out   38170 out');
const jumps = [];
const WHERE = [5, 7, 5, 7, 5];
let n = 0;
for (const [f, m] of [[17, 4], [70, 4], [0, 4], [17, 1], [17, 0]]) {
  const r = await jump(f, m, WHERE[n++]);
  if (r.planet !== WHERE[n - 1]) throw new Error(`jump ${n} did not move: at ${r.planet}`);
  jumps.push(r);
  console.log(`      ${String(f).padStart(3)}        ${String(m).padStart(2)}          ${String(r.morale).padStart(2)}`
    + `          ${String(r.flag).padStart(3)}`);
}

// GROUND FORCES 14 wants the ship landed: 29469 is Y's low byte and 29470 its high, so Y = 20
// exactly. Reached by poking the pair rather than flying down, which this is not about.
console.log('');
console.log('GROUND FORCES line 14, landed at Y = 20 with the flag clear:');
await wr(FLAG, 0);
await wr(29469, 20);                     // Y low
await wr(29470, 0);                      // Y high - so Y is 20 exactly, which is landed
await a2.frames(20);
const COM = textOf('COM');
await a2.key('C');
let gfFlag = null;
if (await waitFor(COM, 400)) {
  await a2.frames(60);
  await a2.key('2');                     // COM 127: 2 is GROUND FORCES
  if (await waitFor(GF, 600)) {
    await a2.frames(150);
    gfFlag = await a2.read(FLAG);
  }
}
console.log(gfFlag === null
  ? '  could not reach GROUND FORCES; 38170 unread'
  : `  38170 = ${gfFlag}${gfFlag === 17 ? '   (line 14 set it)' : ''}`);

if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();

fs.mkdirSync('captured/morale', { recursive: true });
fs.writeFileSync('captured/morale/golden.json', JSON.stringify({
  source: "H/D 12 and 13 on the machine, driven by poking 38170 and 38203 and pressing H",
  addresses: { morale: MORALE, groundedFlag: FLAG, destination: DEST },
  jumps,
  groundForcesSetsFlag: gfFlag,
}, null, 1) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/morale/golden.json');
