// S/X, the player's death, captured from the original - and H/D's out-of-energy screen on
// the way there.
//
// Two programs run it: H/D line 4, when line 2 finds the energy at 0, and STARSHIP
// SIMULATOR line 3350 when the hull reaches 0. The first is easy to arrange - set a
// destination, empty the tank, press H.
//
// S/X is EX's burst with the colour inverted. Lines 7-30 are the same sixteen steps of
// fifteen segments from (140,60), but line 5 sets `HCOLOR= 0`, so it wipes the flight view
// outwards instead of painting over it, and then line 40 prints the message.
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
const HD = textOf('H/D');
const SX = textOf('S/X');

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
await a2.frames(200);

console.log('setting a destination and emptying the tank, then pressing H');
await a2.ev(`(() => { window.M.wr(38163, 5); window.M.wr(38199, 0); return 'w'; })()`);
await a2.frames(20);
await a2.key('H');
if (!await waitFor(HD, 400)) { await a2.close(); throw new Error('H/D never started'); }
console.log('H/D is running - line 2 should send it to line 3, not line 5');

// H/D line 3: HTAB 15: VTAB 15 twice, OUT OF ENERGY then ORBIT DECAYING over the top.
let hd = null;
for (let i = 0; i < 300; i++) {
  await a2.frames(4);
  const on = decodeHgr(await a2.readRange(0x2000, 0x4000));
  const g = pointsOf(on);
  if (!hd || g.lit > hd.g.lit) hd = { g, on };
  if ((await loaded()) === SX) break;
  if ((await loaded()) !== HD) break;
}
fs.mkdirSync('captured/sx', { recursive: true });
fs.writeFileSync('captured/sx/outofenergy.png', toPng(hd.on));
console.log(`  H/D's screen: ${hd.g.lit} lit, x ${hd.g.bounds.minX}-${hd.g.bounds.maxX}, ` +
  `y ${hd.g.bounds.minY}-${hd.g.bounds.maxY}`);

if (!await waitFor(SX, 400)) { await a2.close(); throw new Error('S/X never started'); }
console.log('S/X is running\n');

// The burst erases, so the page gets darker: keep the fewest-lit sample, and the last one
// for the message.
let fewest = null;
let last = null;
for (let i = 0; i < 500; i++) {
  await a2.frames(4);
  const on = decodeHgr(await a2.readRange(0x2000, 0x4000));
  const g = pointsOf(on);
  last = { g, on };
  if (!fewest || g.lit < fewest.g.lit) fewest = { g, on };
  if ((await loaded()) !== SX) { console.log(`  S/X left after ~${i * 4} frames`); break; }
}
console.log(`fewest lit while S/X ran: ${fewest.g.lit}`);
console.log(`last sample: ${last.g.lit} lit, x ${last.g.bounds.minX}-${last.g.bounds.maxX}, ` +
  `y ${last.g.bounds.minY}-${last.g.bounds.maxY}`);

const win = {};
for (const a of [0x20, 0x21, 973, 974, 0xe4]) win[a] = await a2.read(a);
console.log(`window left ${win[0x20]} width ${win[0x21]}, $3CD ${win[973]}, $3CE ${win[974]}, ` +
  `HCOLOR byte ${win[0xe4]}`);

fs.writeFileSync('captured/sx/sx.png', toPng(last.on));
fs.writeFileSync('captured/sx/golden.json', JSON.stringify({
  source: 'the original S/X, reached through H/D with the energy at 0',
  window: win,
  outOfEnergy: hd.g,
  fewestLit: fewest.g.lit,
  screen: last.g,
}) + String.fromCharCode(10));
console.log('\nwrote captured/sx/golden.json, outofenergy.png and sx.png');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
