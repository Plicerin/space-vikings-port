// SUPPLY, the cargo manifest, captured from the original.
//
// Reached from flight by C for COM, 1 for CENTRAL COMPUTER, 5 for SUPPLIES REPORT - COM line
// 270's `ON C GOTO 800,900,30,1200,20000` landing on 20000's RUN SUPPLY.
//
// Two pages of the same screen. Line 1450 holds the first at a GET; line 1460 sets R1 and
// calls 1400 again, which clears, prints the title and returns early, and the second page is
// drawn over it. Line 1510 takes 1 back to the first page.
//
// Like STATUS it is inverse video throughout - line 1400 pokes 973,255 and only line 1515
// puts it back - and unlike COM's chain it fills its own background, HCOLOR 1 across rows
// 0 to 123.
import { openOracle, VAR_READER } from './a2.mjs';
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
const SUPPLY = textOf('SUPPLY');

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
const waitFor = async (wanted, label) => {
  for (let i = 0; i < 600; i++) { await a2.frames(20); if ((await loaded()) === wanted) return; }
  let which = null;
  for (const f of disk.files) {
    try { if (textOf(f.name) === (await loaded())) { which = f.name; break; } } catch { /* not BASIC */ }
  }
  console.log('  loaded program is:', which || 'unrecognised');
  await a2.close();
  throw new Error(`${label} never started`);
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
const grab = async (label, minFrames) => {
  if (minFrames) await a2.frames(minFrames);
  await settle();
  const p1 = decodeHgr(await a2.readRange(0x2000, 0x4000));
  const p2 = decodeHgr(await a2.readRange(0x4000, 0x6000));
  const g1 = pointsOf(p1), g2 = pointsOf(p2);
  const which = g1.lit >= g2.lit ? 'page1' : 'page2';
  const g = which === 'page1' ? g1 : g2;
  fs.mkdirSync('captured/supply', { recursive: true });
  fs.writeFileSync(`captured/supply/${label}.png`, toPng(which === 'page1' ? p1 : p2));
  console.log(`  ${label}: ${which}, ${g.lit} lit, x ${g.bounds.minX}-${g.bounds.maxX}, y ${g.bounds.minY}-${g.bounds.maxY}`);
  return { drawnOn: which, ...g };
};

console.log('waiting for STARSHIP SIMULATOR...');
await waitFor(SIM, 'STARSHIP SIMULATOR');
await a2.key('C');
await waitFor(COM, 'COM');
await settle();
console.log('1 for CENTRAL COMPUTER, 5 for SUPPLIES REPORT');
await a2.key('1');
await a2.frames(150);
await settle();
await a2.key('5');
await waitFor(SUPPLY, 'SUPPLY');
console.log('SUPPLY is running\n');

// The thirteen cargo counters, named by the line that prints each one, with the multiplier
// the original applies before printing.
const CARGO = [
  [38181, 'PLATINUM', 10, 'POUNDS', 1410],
  [38183, 'GOLD', 10, 'POUNDS', 1410],
  [38182, 'SILVER', 20, 'POUNDS', 1420],
  [38180, 'TITANIUM', 1, 'THOUSAND POUNDS', 1420],
  [38179, 'COLLAPSIUM', 1, 'TONS', 1430],
  [38178, 'STEEL', 1, 'TONS', 1430],
  [38177, 'FISSIONABLES', 1, 'POUNDS', 1440],
  [38176, 'ELECTRONIC PARTS', 1, 'CRATES', 1470],
  [38175, 'WEAPONS', 1, 'CRATES', 1470],
  [38174, 'FIGHTER PARTS', 1, 'CRATES', 1480],
  [38173, 'LUXURY FOODS', 1, 'CASES', 1480],
  [38172, 'WINE/LIQUOR', 100, 'CASES', 1485],
  [38171, 'ART WORKS', 10, 'UNITS', 1490],
];
const cargo = {};
console.log('the cargo counters:');
for (const [addr, name, mul, unit, line] of CARGO) {
  cargo[addr] = await a2.read(addr);
  console.log(`  ${addr}  ${String(cargo[addr]).padStart(3)} x ${String(mul).padStart(3)} = ` +
    `${String(cargo[addr] * mul).padStart(5)} ${unit.padEnd(16)} ${name} (line ${line})`);
}

const page1 = await grab('page1', 600);

await a2.ev(VAR_READER);
const vars = JSON.parse(await a2.ev(`JSON.stringify(window.M.vars())`));
const pick = (n) => { const v = vars.vars.find((x) => x.name === n); return v ? v.value : null; };
const misc = { SD: pick('SD'), TR: pick('TR'), CR: pick('CR') };
console.log('');
console.log(`from the MISC file: SD = ${misc.SD}  TR = ${misc.TR}  CR = ${misc.CR}`);
const win = {};
for (const a of [0x20, 0x21, 0x22, 0x23, 973, 974, 0xe4]) win[a] = await a2.read(a);
console.log(`window left ${win[0x20]} width ${win[0x21]} top ${win[0x22]} bottom ${win[0x23]}, ` +
  `$3CD ${win[973]}, $3CE ${win[974]}, HCOLOR byte ${win[0xe4]}`);

console.log('');
console.log('space for the second page');
await a2.key(' ');
const page2 = await grab('page2', 400);

fs.writeFileSync('captured/supply/golden.json', JSON.stringify({
  source: 'the original SUPPLY, reached from flight by C, 1, 5',
  cargo, misc, window: win, page1, page2,
}) + String.fromCharCode(10));
console.log('\nwrote captured/supply/golden.json and both pages');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
