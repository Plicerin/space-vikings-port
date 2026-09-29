// Capture COM, the ship's command screen, from the original.
//
// STARSHIP SIMULATOR line 319 runs it, reached by `ON K - 16 GOTO 317,318,319` with K = 19
// - and 19 is 195 - 176, where 195 is 'C' with the high bit set. So pressing C in flight
// goes to COM.
//
// COM is a good parity target for the same reasons the cockpit panel was: line 20 floods
// the view with HCOLOR 6, line 90 draws a box, and the rest is text through the hi-res
// character generator. No RNG, no ship state, and it settles waiting at GET COM$.
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

console.log('waiting for STARSHIP SIMULATOR...');
let ok = false;
for (let i = 0; i < 400 && !ok; i++) { await a2.frames(20); ok = (await loaded()) === SIM; }
if (!ok) { await a2.close(); throw new Error('STARSHIP SIMULATOR never started'); }

console.log('pressing C for COM\n');
await a2.key('C');

let inCom = false;
for (let i = 0; i < 400 && !inCom; i++) { await a2.frames(20); inCom = (await loaded()) === COM; }
if (!inCom) {
  console.log('screen:', (await a2.screen()).filter((l) => l.trim()).join(' / ').slice(0, 70));
  await a2.close();
  throw new Error('COM never started');
}
console.log('COM is running; letting it settle at GET COM$');

// Settle: hold until both hi-res pages stop changing.
let last = '';
for (let i = 0; i < 80; i++) {
  await a2.frames(20);
  const h = await a2.ev(`window.M.hash(0x2000, 0x6000)`);
  if (h === last) break;
  last = h;
}

const stats = (on) => {
  let n = 0, minX = HGR_W, maxX = -1, minY = HGR_H, maxY = -1;
  for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) {
    if (!on[y * HGR_W + x]) continue;
    n++;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { n, minX, maxX, minY, maxY };
};

fs.mkdirSync('captured/com', { recursive: true });
const pages = {};
for (const [name, lo, hi] of [['page1', 0x2000, 0x4000], ['page2', 0x4000, 0x6000]]) {
  const on = decodeHgr(await a2.readRange(lo, hi));
  const s = stats(on);
  pages[name] = { ...s, points: (() => { const p = []; for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) if (on[y * HGR_W + x]) p.push([x, y]); return p; })() };
  console.log(`  ${name}: ${String(s.n).padStart(5)} lit  ` + (s.n ? `x ${s.minX}-${s.maxX}, y ${s.minY}-${s.maxY}` : '(blank)'));
  fs.writeFileSync(`captured/com/${name}.png`, toPng(on));
}

console.log('\nthe text screen, for reference:');
console.log((await a2.screen()).filter((l) => l.trim()).join('\n') || '(nothing - COM draws through the hi-res character generator)');

const which = pages.page1.n >= pages.page2.n ? 'page1' : 'page2';
fs.writeFileSync('captured/com/golden.json', JSON.stringify({
  source: 'the original COM, reached by pressing C in flight, settled at GET COM$',
  drawnOn: which, ...pages[which],
}) + '\n');
console.log(`\nCOM draws on ${which}; wrote captured/com/golden.json and both PNGs`);
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
