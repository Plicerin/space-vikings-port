// When does the instrument panel change, and who changes it?
//
// The disk puts two different panels on screen along one route. Entering COM from flight, the
// gauge boxes' left edge at x 6 is lit and their right edge at x 17 is not; coming back through
// INSTRUMENTS it is the other way round, and the same swap happens at x 71/82 and x 261/272.
// Both versions have the lamp bytes $9602 writes, so on one path the lamps went down over the
// boxes and on the other the boxes went down over the lamps.
//
// INSTRUMENTS draws the boxes at lines 90-160 and calls $9602 at 210 - but 210 is
// `IF PEEK(38391) <> 77 THEN POKE 38189,10: CALL 38402: ...`, and the return from the galaxy
// map arrives with 38391 = 77, so on that path it never calls it at all. Which leaves the
// question of where the second panel's lamps come from.
//
// So watch it: sample byte column 0, 1 and 2 of row 153 every few frames along the whole
// route, and print a line whenever they change, with the program that is loaded and whether
// HGR has just blanked the page.
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
const PROGRAMS = ['STARSHIP SIMULATOR', 'COM', 'GALAXY MAP', 'INSTRUMENTS', 'RADAR', 'STATUS'];
const TEXTS = Object.fromEntries(PROGRAMS.map((n) => [n, textOf(n)]));

const rowBase = (r) => 0x2000 + 0x400 * (r & 7) + 0x80 * ((r >> 3) & 7) + 0x28 * (r >> 6);
const R153 = rowBase(153);
const R177 = rowBase(177);

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

const hex = (n) => '$' + n.toString(16).padStart(2, '0');
const samples = [];
let last = '';
/** One sample: the three bytes, the loaded program, and the line Applesoft is on. */
const look = async (tag) => {
  const s = JSON.parse(await a2.ev(`JSON.stringify([
    window.M.rd(${R153}), window.M.rd(${R153 + 1}), window.M.rd(${R153 + 2}),
    window.M.rd(0x75) | (window.M.rd(0x76) << 8), window.M.rd(${R177}),
    window.M.rd(0x20), window.M.rd(0x21), window.M.rd(0x22), window.M.rd(0x23), window.M.rd(0x25)
  ])`));
  const key = [s[0], s[1], s[2], s[4]].join(',');
  if (key === last) return;
  last = key;
  const prog = await which();
  const line = `  ${tag.padEnd(16)} ${prog.padEnd(20)} line ${String(s[3]).padStart(5)}   ` +
    `c0=${hex(s[0])} c1=${hex(s[1])} c2=${hex(s[2])}   row 177 c0=${hex(s[4])}   wnd L${s[5]} W${s[6]} T${s[7]} B${s[8]} CV${s[9]}`;
  console.log(line);
  samples.push({ tag, program: prog, curlin: s[3], bytes: [s[0], s[1], s[2]], row177: s[4],
    wndLeft: s[5], wndWidth: s[6], wndTop: s[7], wndBottom: s[8], cv: s[9] });
};

console.log('waiting for STARSHIP SIMULATOR...');
for (let i = 0; i < 700; i++) { await a2.frames(20); if ((await which()) === 'STARSHIP SIMULATOR') break; }
await a2.frames(200);

// A key press only lands if the program that should read it is running and settled - the same
// lesson probe_transitions.mjs learned. Wait for the program, then hold the key past one pass.
const settleOn = async (want, tries = 600) => {
  let stable = 0;
  for (let i = 0; i < tries; i++) {
    await a2.frames(10);
    if ((await which()) === want) { if (++stable >= 20) return true; } else stable = 0;
  }
  console.log(`  never settled on ${want}`);
  return false;
};

console.log('');
console.log('  where            program              CURLIN       row 153, byte columns 0-2');
const watch = async (tag, frames, every = 4) => {
  for (let i = 0; i < frames; i++) { await a2.frames(every); await look(tag); }
};
await watch('in flight', 40);
await a2.key('C', { holdFrames: 40, afterFrames: 20 });
await watch('-> COM', 120);
await a2.key('1', { holdFrames: 40, afterFrames: 20 });
await watch('-> computer', 60);
await a2.key('3', { holdFrames: 40, afterFrames: 20 });
await watch('-> galaxy map', 160);
await a2.key(' ', { holdFrames: 40, afterFrames: 20 });
// The leg that matters, one frame at a time: INSTRUMENTS draws the boxes with x 6 lit, GALAXY
// MAP's GOSUB 5000 fills them, and by the time COM is running x 6 is dark. Somewhere in
// between something takes it out.
await watch('-> back to COM', 1200, 1);

fs.mkdirSync('captured/panelpath', { recursive: true });
fs.writeFileSync('captured/panelpath/golden.json', JSON.stringify({
  source: 'hi-res page 1 row 153 byte columns 0-2 sampled along flight -> COM -> galaxy map -> COM',
  samples,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/panelpath/golden.json');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
