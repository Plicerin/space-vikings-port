// What END's menu actually does with a key, and where "CONTINUE PRESENT GAME" goes.
//
// `end_parity.mjs` has END's screen exact at 0 of 53,760 pixels. What it cannot show is the
// behaviour, and two lines of it are worth pinning down:
//
//   70  PRINT "ENTER CHOICE.  ";: GET C: IF C < 1 OR C > 3 THEN 30
//   120 POKE 38391,77: PRINT "^DRUNGALAXY MAP"
//
// **`GET C` is a numeric GET.** Applesoft puts the keystroke through its number parser, and what
// a letter does there is not obvious from the listing - line 0's `ONERR GOTO 63999` is sitting
// underneath it, and 63999 is `PRINT "^DINT"`, which drops the machine back to BASIC.
//
// And 120 does not go to the galaxy map's display. 38391 is the saved-game sentinel, so GALAXY
// MAP line 2 - `IF PEEK(38391) = 77 THEN POKE 38391,0: GOSUB 5000: POKE -16300,0: RUN STARSHIP
// SIMULATOR` - fires before line 5 ever draws anything. Whether that is what happens is a
// question for the machine, not for me.
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
const PROGRAMS = ['STARSHIP SIMULATOR', 'COM', 'END', 'GALAXY MAP', 'INSTRUMENTS'];
const TEXTS = Object.fromEntries(PROGRAMS.map((n) => [n, textOf(n)]));

const a2 = await openOracle();
await a2.boot();
await a2.key('N');
const which = async () => {
  const b = await a2.readRange(0x800, 0x2000);
  const m = {};
  for (let k = 0; k < b.length; k++) m[0x800 + k] = b[k];
  let t = '';
  try { t = listProgram(m, 0x801, 0x2000).map((l) => `${l.num} ${l.text}`).join('\n'); } catch { /* mid-load */ }
  for (const n of PROGRAMS) if (TEXTS[n] === t) return n;
  return '(other)';
};
const settleOn = async (want, tries = 900) => {
  let stable = 0;
  for (let i = 0; i < tries; i++) {
    await a2.frames(10);
    if ((await which()) === want) { if (++stable >= 15) return true; } else stable = 0;
  }
  return false;
};
const curlin = async () => JSON.parse(await a2.ev('window.M.rd(0x75) | (window.M.rd(0x76) << 8)'));
const peek = async (a) => (await a2.readRange(a, a + 1))[0];

console.log('waiting for STARSHIP SIMULATOR...');
for (let i = 0; i < 900; i++) { await a2.frames(20); if ((await which()) === 'STARSHIP SIMULATOR') break; }
await a2.frames(300);
await a2.key('C', { holdFrames: 40, afterFrames: 20 });
if (!await settleOn('COM')) { await a2.close(); throw new Error('COM never started'); }
await a2.key('4', { holdFrames: 40, afterFrames: 20 });
if (!await settleOn('END')) { await a2.close(); throw new Error('END never started'); }
console.log('  END is running');

const out = {};

// The two tests cannot share a machine: the letter one ends the program, so anything pressed
// afterwards goes to the BASIC prompt rather than to line 70's GET. The first run of this did
// exactly that and reported CONTINUE as going nowhere. MODE picks one.
const MODE = process.env.MODE || 'letter';

if (MODE === 'letter') {
// 1. a letter at line 70's numeric GET
await a2.key('A', { holdFrames: 40, afterFrames: 20 });
const seen = [];
for (let i = 0; i < 120; i++) {
  await a2.frames(5);
  const w = await which();
  const l = await curlin();
  const tag = `${w}:${l}`;
  if (seen[seen.length - 1] !== tag) seen.push(tag);
}
out.afterLetter = seen;
console.log(`  after pressing A: ${seen.join(' -> ')}`);
out.curlinAfterLetter = await curlin();
console.log(`  CURLIN is ${out.curlinAfterLetter} - 63999 is line 0's ONERR handler`);
}

// 2. option 2, CONTINUE PRESENT GAME
if (MODE === 'continue') {
  console.log(`  38391 before: ${await peek(38391)}, 38388: ${await peek(38388)}`);
  await a2.key('2', { holdFrames: 40, afterFrames: 20 });
  const chain = [];
  for (let i = 0; i < 700; i++) {
    await a2.frames(10);
    const w = await which();
    if (chain[chain.length - 1] !== w) chain.push(w);
    if (w === 'STARSHIP SIMULATOR' && chain.length > 1) break;
    if (w === 'GALAXY MAP' && chain.length > 2) break;
  }
  out.afterTwo = chain;
  out.sentinelAfter = await peek(38391);
  console.log(`  after 2: ${chain.join(' -> ')}`);
  console.log(`  38391 after: ${out.sentinelAfter}`);
}

if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();

fs.mkdirSync('captured/endmenu', { recursive: true });
fs.writeFileSync('captured/endmenu/golden.json', JSON.stringify({
  source: "END's line 70 given a letter, and where line 120's CONTINUE goes",
  ...out,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/endmenu/golden.json');
