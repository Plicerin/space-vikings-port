// What is on screen when COM comes back from the GALAXY MAP.
//
// Playing the port, leaving the map left its bottom band - "GALAXY MAP" and
// "--PRESS SPACE TO RETURN--" and the dotted rule above them - sitting under COM's menu. COM
// line 20 floods only rows 0-123, so nothing it draws would cover rows 152-191, and the
// residue looked as though it might be what the disk does too.
//
// The disk does not go straight there. GALAXY MAP 3125 is
//
//   IF PEEK(-16384) > 127 THEN POKE -16368,0: POKE 38391,77: POKE 38388,7: RUN INSTRUMENTS
//
// so a key press runs **INSTRUMENTS**, which repaints the panel; INSTRUMENTS 210 finds 38391 at
// 77 and so does not run the simulator, falling through to 220's `RUN GALAXY MAP`; and GALAXY
// MAP line 1 finds 38391 = 77 with 38388 = 7 and runs COM. Three programs to get there, and the
// middle one draws the whole bottom of the screen.
//
// This captures the page in the map and again in COM and compares the rows the band occupies.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import { decodeHgr, toPng, HGR_W } from './hgr.mjs';
import fs from 'fs';

const disk = openDisk(DISK);
const textOf = (name) => {
  const r = disk.read(disk.files.find((f) => f.name === name));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => `${l.num} ${l.text}`).join('\n');
};
const SIM = textOf('STARSHIP SIMULATOR');
const COM = textOf('COM');
const GMAP = textOf('GALAXY MAP');
const INST = textOf('INSTRUMENTS');

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
const which = async () => {
  const t = await loaded();
  if (t === SIM) return 'STARSHIP SIMULATOR';
  if (t === COM) return 'COM';
  if (t === GMAP) return 'GALAXY MAP';
  if (t === INST) return 'INSTRUMENTS';
  return '(other)';
};
const waitFor = async (want, label, tries = 700) => {
  for (let i = 0; i < tries; i++) { await a2.frames(20); if ((await which()) === want) return true; }
  console.log('  ' + label + ' never started');
  return false;
};
/** Rows 152-191, where the map puts its caption. */
const band = (on) => {
  let n = 0;
  for (let y = 152; y < 192; y++) for (let x = 0; x < HGR_W; x++) if (on[y * HGR_W + x]) n++;
  return n;
};

console.log('waiting for STARSHIP SIMULATOR...');
if (!await waitFor('STARSHIP SIMULATOR', 'STARSHIP SIMULATOR')) { await a2.close(); throw new Error('no sim'); }
await a2.frames(300);
await a2.key('C');
if (!await waitFor('COM', 'COM')) { await a2.close(); throw new Error('no COM'); }
for (let i = 0; i < 30; i++) await a2.frames(20);
await a2.key('1');
for (let i = 0; i < 30; i++) await a2.frames(20);
await a2.key('3');
if (!await waitFor('GALAXY MAP', 'GALAXY MAP')) { await a2.close(); throw new Error('no map'); }
for (let i = 0; i < 40; i++) await a2.frames(20);

const onMap = decodeHgr(await a2.readRange(0x2000, 0x4000));
console.log('');
console.log(`  on the map: ${band(onMap)} pixels lit in rows 152-191`);

// Any key leaves. Watch which programs it goes through on the way.
await a2.key(' ');
const seen = [];
for (let i = 0; i < 700; i++) {
  await a2.frames(10);
  const w = await which();
  if (seen[seen.length - 1] !== w) seen.push(w);
  if (w === 'COM' && seen.length > 1) break;
}
for (let i = 0; i < 40; i++) await a2.frames(20);
const onCom = decodeHgr(await a2.readRange(0x2000, 0x4000));
console.log(`  programs on the way: ${seen.join(' -> ')}`);
console.log(`  in COM:     ${band(onCom)} pixels lit in rows 152-191`);

let same = 0;
for (let y = 152; y < 192; y++) for (let x = 0; x < HGR_W; x++) {
  const i = y * HGR_W + x;
  if (onMap[i] && onCom[i]) same++;
}
console.log('');
console.log(`  of the map's band, ${same} pixel(s) are still lit in COM`);
console.log(band(onCom) === 0
  ? '  the band is gone: something repainted the bottom of the screen'
  : (same === band(onMap)
    ? '  the band is untouched: COM really does leave it there'
    : '  the bottom has been redrawn, and what is there now is not the map\'s band'));

await a2.close();
fs.mkdirSync('captured/comband', { recursive: true });
fs.writeFileSync('captured/comband/map.png', toPng(onMap));
fs.writeFileSync('captured/comband/com.png', toPng(onCom));
fs.writeFileSync('captured/comband/golden.json', JSON.stringify({
  source: 'the hi-res page in GALAXY MAP and again in COM after leaving it, rows 152-191',
  programs: seen, bandOnMap: band(onMap), bandInCom: band(onCom), shared: same,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/comband/golden.json, map.png and com.png');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
