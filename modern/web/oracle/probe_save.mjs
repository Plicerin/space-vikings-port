// Saving a game, on the machine - END 190-220, and what a save actually holds.
//
//   190 IF PEEK(38210) = 1 THEN "YOU MUST BE IN ORBIT TO SAVE GAME" ... RETURN
//   200 POKE 38211,PEEK(29467) ... POKE 38218,PEEK(29474)
//   202 POKE 38219,PEEK(29475)
//   204 POKE 38391,77: POKE 38392,PEEK(38209)
//   210 POKE 38823,PEEK(38209): POKE 38824,1: CALL 38825:
//       BSAVE P/F,A$97E1,L$140: BSAVE PLANET FILE,A$954C,L$AF:
//       BSAVE SHIP'S DATA ,A38150,L54: PRINT "GAME SAVED."
//
// Three blocks and no more: 38150-38203, 38220-38394 and 38881-39200. Everything between
// 38204 and 38219 is in neither of them - which is where 200 and 202 put the ship's position
// and attitude, so the nine cells they copy are never written to disk at all.
//
// 202 also lands on 38219, and `38219 + PEEK(38209)` is the conquered flag GALAXY MAP 3066
// reads and SHORE LEAVE 1550 sets. Planet 0's flag is the heading byte for the rest of the
// session.
import { openOracle, VAR_READER } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import { decodeHgr, toPng, HGR_W, HGR_H } from './hgr.mjs';
import fs from 'fs';

const ATMOS = 38210, HERE = 38209, MARKER = 38391, SAVED_PLANET = 38392;

const disk = openDisk(DISK);
const textOf = (name) => {
  const r = disk.read(disk.files.find((f) => f.name === name));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => l.num + ' ' + l.text).join('\n');
};
const PROGRAMS = ['STARSHIP SIMULATOR', 'COM', 'END'];
const TEXTS = Object.fromEntries(PROGRAMS.map((n) => [n, textOf(n)]));

console.log('what the disk holds for a saved game:');
for (const n of ['MISC FILE', 'PLANET FILE', 'PLANET FILE-M', 'P/F', 'P/F-M',
  "SHIP'S DATA", "SHIP'S DATA-M"]) {
  const f = disk.files.find((x) => x.name === n);
  console.log('  ' + n.padEnd(16) + (f ? 'present, ' + disk.read(f).len + ' bytes' : 'NOT ON THE DISK'));
}
console.log('');

const a2 = await openOracle();
await a2.boot();
await a2.key('N');
await a2.ev(VAR_READER);
const which = async () => {
  const b = await a2.readRange(0x800, 0x2000);
  const m = {};
  for (let k = 0; k < b.length; k++) m[0x800 + k] = b[k];
  let t = '';
  try { t = listProgram(m, 0x801, 0x2000).map((l) => l.num + ' ' + l.text).join('\n'); } catch { /* mid-load */ }
  for (const n of PROGRAMS) if (TEXTS[n] === t) return n;
  return '(other)';
};
const settleOn = async (want, tries = 900) => {
  let stable = 0;
  for (let i = 0; i < tries; i++) {
    await a2.frames(10);
    if ((await which()) === want) { if (++stable >= 12) return true; } else stable = 0;
  }
  return false;
};
const wr = (a, v) => a2.ev('(() => { window.M.wr(' + a + ', ' + (v & 255) + '); return 1; })()');
const runToAny = (lines, budget = 900000) => a2.ev('(() => {'
  + 'const cpu = window.M.cpu; const want = ' + JSON.stringify(lines) + ';'
  + 'for (let i = 0; i < ' + budget + '; i++) {'
  + '  const l = cpu.read(0x75) | (cpu.read(0x76) << 8);'
  + '  if (want.indexOf(l) >= 0) return String(l);'
  + '  cpu.stepCycles(200);'
  + '}'
  + 'return "timeout";'
  + '})()');
const settlePage = async () => {
  await a2.ev(`(() => {
    const cpu = window.M.cpu;
    let prev = -1, still = 0;
    for (let i = 0; i < 120; i++) {
      cpu.stepCycles(50000);
      let h = 0;
      for (let a = 0x2000; a < 0x4000; a += 7) h = (h * 31 + cpu.read(a)) | 0;
      if (h === prev) { if (++still >= 6) break; } else still = 0;
      prev = h;
    }
    return 'settled';
  })()`);
  return decodeHgr(await a2.readRange(0x2000, 0x4000));
};
const pts = (p) => {
  const out = [];
  for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) if (p[y * HGR_W + x]) out.push([x, y]);
  return out;
};

console.log('waiting for STARSHIP SIMULATOR...');
if (!await settleOn('STARSHIP SIMULATOR')) { await a2.close(); throw new Error('no simulator'); }
await a2.frames(200);

const toEnd = async () => {
  await a2.key('C', { holdFrames: 40, afterFrames: 20 });
  if (!await settleOn('COM')) throw new Error('COM never started');
  for (let i = 0; i < 40; i++) await a2.frames(10);
  await a2.key('4', { holdFrames: 40, afterFrames: 20 });
  if (!await settleOn('END')) throw new Error('END never started');
  for (let i = 0; i < 30; i++) await a2.frames(10);
};

// --- 190, with the ship in the atmosphere -------------------------------------------------
await wr(ATMOS, 1);
await toEnd();
await a2.key('1', { holdFrames: 20, afterFrames: 10 });
const refusePage = await settlePage();
const afterRefuse = {
  marker: (await a2.readRange(MARKER, MARKER + 1))[0],
  savedPlanet: (await a2.readRange(SAVED_PLANET, SAVED_PLANET + 1))[0],
};
console.log('in the atmosphere: 38391 is ' + afterRefuse.marker
  + ', 38392 is ' + afterRefuse.savedPlanet + ' (190 returns before 204 touches either)');

// --- the save itself ------------------------------------------------------------------------
await wr(ATMOS, 0);
const posBefore = Array.from(await a2.readRange(29467, 29476));
const gapBefore = Array.from(await a2.readRange(38211, 38220));
await a2.key('1', { holdFrames: 20, afterFrames: 10 });
// 190 runs on the way through whether or not it refuses, so waiting for it proves nothing.
// 210 is the save itself and 220 is the return; 63999 is line 0's ONERR handler, which is
// where a DOS error would land.
const at = await runToAny([220, 63999], 1800000);
const savePage = await settlePage();
const posAfter = Array.from(await a2.readRange(29467, 29476));
const gapAfter = Array.from(await a2.readRange(38211, 38220));
const marker = (await a2.readRange(MARKER, MARKER + 1))[0];
const savedPlanet = (await a2.readRange(SAVED_PLANET, SAVED_PLANET + 1))[0];
const here = (await a2.readRange(HERE, HERE + 1))[0];
// The three BSAVEs do not complete under the oracle - the write stalls and 220 is never
// reached - so what this run establishes is 190's gate and the pokes at 200, 202 and 204.
// Where the blocks start and end is read off the BSAVE arguments and the files' own lengths
// on the image, not from a write.
console.log('out of the atmosphere: END ran to ' + (at === 'timeout'
  ? 'the BSAVEs, which do not complete under the oracle' : 'line ' + at));
console.log('  29467-29475 ' + posBefore.join(','));
console.log('  38211-38219 ' + gapBefore.join(',') + '  ->  ' + gapAfter.join(','));
console.log('  200 and 202 copied the nine cells: '
  + (gapAfter.join(',') === posAfter.join(',') ? 'yes' : 'NO'));
console.log('  38391 is ' + marker + ', 38392 is ' + savedPlanet + ', the planet is ' + here);
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();

// What a BSAVE of those three blocks would and would not carry.
const BLOCKS = [
  { name: "SHIP'S DATA", from: 38150, to: 38203 },
  { name: 'PLANET FILE', from: 38220, to: 38394 },
  { name: 'P/F', from: 38881, to: 39200 },
];
const saved = (a) => BLOCKS.some((b) => a >= b.from && a <= b.to);
const CELLS = [
  [38204, 'what the enemy ship can take'], [38205, 'which enemy ship'],
  [38207, 'ground batteries'], [38208, 'the planet has surrendered'],
  [38210, 'in atmosphere'], [38211, "the save's own copy of X"],
  [38219, "the save's own copy of H, and planet 0's conquered flag"],
  [38209, 'which planet we are at'], [38187, 'missiles'], [38152, 'damage to the enemy'],
];
console.log('');
console.log('what the three blocks cover:');
for (const [a, what] of CELLS) {
  console.log('  ' + String(a) + '  ' + (saved(a) ? 'saved    ' : 'NOT SAVED') + '  ' + what);
}

fs.mkdirSync('captured/save', { recursive: true });
fs.writeFileSync('captured/save/refused.png', toPng(refusePage));
fs.writeFileSync('captured/save/saved.png', toPng(savePage));
fs.writeFileSync('captured/save/golden.json', JSON.stringify({
  source: 'END 190-220 on the machine, once in the atmosphere and once out of it',
  blocks: BLOCKS,
  miscFile: ['SD', 'TR', 'CR'],
  shipsDataOnDisk: !disk.files.some((f) => f.name === "SHIP'S DATA"),
  atmosphereRefusal: afterRefuse,
  save: { reachedLine: at, posBefore, gapBefore, gapAfter, marker, savedPlanet, here },
  refusedPage: { lit: pts(refusePage).length, points: pts(refusePage) },
  savedPage: { lit: pts(savePage).length, points: pts(savePage) },
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/save/golden.json, refused.png and saved.png');
