// RECALL, captured from the original.
//
// GROUND FORCES option 2 chains here (its line 2000 is `PRINT "RUN RECALL"`). RECALL is
// twelve lines: it redraws the same box COM does and prints one of five messages depending
// on where the troops are.
//
// It never clears and never sets the window. GROUND FORCES line 65 has already run
// `R = 5: GOSUB 12: VTAB 2`, which blanks rows 1-12 and leaves the cursor on row 1, so
// RECALL's leading `PRINT` at line 2000 drops to row 2 and the message starts there.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import { decodeHgr, toPng, HGR_W, HGR_H } from './hgr.mjs';
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
const RECALL = textOf('RECALL');

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
const settle = async () => {
  let last = '';
  for (let i = 0; i < 120; i++) {
    await a2.frames(20);
    const h = await a2.ev(`window.M.hash(0x2000, 0x6000)`);
    if (h === last) return;
    last = h;
  }
};
const pointsOf = (on) => {
  const pts = [];
  let minX = HGR_W, maxX = -1, minY = HGR_H, maxY = -1;
  for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) {
    if (!on[y * HGR_W + x]) continue;
    pts.push([x, y]);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { lit: pts.length, bounds: { minX, maxX, minY, maxY }, points: pts };
};

console.log('waiting for STARSHIP SIMULATOR...');
if (!await waitFor(SIM)) { await a2.close(); throw new Error('no simulator'); }
await a2.key('C');
if (!await waitFor(COM)) { await a2.close(); throw new Error('no COM'); }
await settle();
await a2.key('2');
if (!await waitFor(GF)) { await a2.close(); throw new Error('no GROUND FORCES'); }
await a2.frames(600);
await settle();

const before = {};
for (const a of [38209, 38158, 38166, 0x20, 0x21, 973, 974, 0xe4]) before[a] = await a2.read(a);
console.log(`\n38209 planet ${before[38209]}, 38158 troops on planet ${before[38158]}, ` +
  `38166 troop location ${before[38166]}`);
console.log(`window left ${before[0x20]} width ${before[0x21]}, $3CD ${before[973]}, ` +
  `$3CE ${before[974]}, HCOLOR byte ${before[0xe4]}`);
const branch = before[38209] !== before[38158] && before[38166] > 0 && before[38166] < 3 ? 2000
  : (before[38166] === 1 || before[38166] === 2) ? 2010
  : before[38166] === 3 ? 2020 : 2030;
console.log(`so line ${branch} should be the one that prints`);

console.log('\n2 for RECALL TROOPS');
await a2.key('2');
if (!await waitFor(RECALL, 400)) { await a2.close(); throw new Error('RECALL never started'); }
console.log('RECALL is running');

let best = null;
for (let i = 0; i < 300; i++) {
  await a2.frames(4);
  const on = decodeHgr(await a2.readRange(0x2000, 0x4000));
  const g = pointsOf(on);
  if (!best || g.lit > best.g.lit) best = { g, on };
  if ((await loaded()) !== RECALL) { console.log(`  RECALL left after ~${i * 4} frames`); break; }
}
console.log(`busiest page: ${best.g.lit} lit, x ${best.g.bounds.minX}-${best.g.bounds.maxX}, ` +
  `y ${best.g.bounds.minY}-${best.g.bounds.maxY}`);
const after = { 38166: await a2.read(38166) };
console.log(`38166 after: ${after[38166]}`);

fs.mkdirSync('captured/recall', { recursive: true });
fs.writeFileSync('captured/recall/recall.png', toPng(best.on));
fs.writeFileSync('captured/recall/golden.json', JSON.stringify({
  source: 'the original RECALL, reached from GROUND FORCES by 2',
  before, after, branch, screen: best.g,
}) + String.fromCharCode(10));
console.log('wrote captured/recall/golden.json and recall.png');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
