// END, the save/quit menu, captured from the original.
//
// COM line 132 chains here: `IF COM = 4 THEN PRINT "RUNEND"`.
//
// Line 30 is worth watching: `POKE 33,40` sets the window width to 40 but leaves WNDLFT at
// COM's 1, so the window runs from column 1 to column 40 - one past the screen. Then it
// prints sixteen rows of forty spaces into it and calls HOME.
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
const END = textOf('END');

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
  for (let i = 0; i < 150; i++) {
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
console.log('4 for END');
await a2.key('4');
if (!await waitFor(END, 400)) { await a2.close(); throw new Error('END never started'); }
await a2.frames(600);
await settle();
console.log('END is holding at line 70\n');

const win = {};
for (const a of [0x20, 0x21, 0x22, 0x23, 973, 974, 0xe4]) win[a] = await a2.read(a);
console.log(`window left ${win[0x20]} width ${win[0x21]} top ${win[0x22]} bottom ${win[0x23]}`);
console.log(`$3CD ${win[973]}, $3CE ${win[974]}, HCOLOR byte ${win[0xe4]}`);

const p1 = decodeHgr(await a2.readRange(0x2000, 0x4000));
const p2 = decodeHgr(await a2.readRange(0x4000, 0x6000));
const g1 = pointsOf(p1), g2 = pointsOf(p2);
const which = g1.lit >= g2.lit ? 'page1' : 'page2';
const menu = which === 'page1' ? g1 : g2;
console.log(`\npage1 ${g1.lit} lit, page2 ${g2.lit} lit -> ${which}`);
console.log(`the menu: ${menu.lit} lit, x ${menu.bounds.minX}-${menu.bounds.maxX}, ` +
  `y ${menu.bounds.minY}-${menu.bounds.maxY}`);

// Which text rows carry anything, and how far right line 30's clear reached.
const on = which === 'page1' ? p1 : p2;
console.log('\nrows with content:');
for (let r = 0; r < 24; r++) {
  let n = 0;
  for (let y = r * 8; y < r * 8 + 8; y++) for (let x = 0; x < HGR_W; x++) if (on[y * HGR_W + x]) n++;
  if (n) console.log(`  row ${String(r).padStart(2)}: ${n} lit`);
}
const col39 = (() => {
  let n = 0;
  for (let y = 0; y < 128; y++) for (let x = 39 * 7; x < 280; x++) if (on[y * HGR_W + x]) n++;
  return n;
})();
console.log(`column 39 (x 273-279), rows 0-15: ${col39} lit - line 30's clear is 40 wide at left 1`);

fs.mkdirSync('captured/end', { recursive: true });
fs.writeFileSync('captured/end/menu.png', toPng(on));
fs.writeFileSync('captured/end/golden.json', JSON.stringify({
  source: 'the original END, reached from flight by C then 4',
  drawnOn: which, window: win, menu,
}) + String.fromCharCode(10));
console.log('\nwrote captured/end/golden.json and menu.png');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
