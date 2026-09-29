// COLLECT, the loot award after a won ground assault, captured from the original.
//
// GROUND FORCES line 800-805 chains here once the planet surrenders. That is RND-driven, so
// the probe presses 1 for ATTACK PLANET and waits the battle out.
//
// Two things in the listing look like bugs and the capture can settle both:
//
//   870 F = PEEK(38182) + (RND(1) * 5): IF J > 255 THEN J = 255
//   880 POKE 38182,J
//
// computes F and then pokes J, which is still gold's value from 850 - so at tech 1 silver
// comes out equal to gold. And:
//
//   960 J = PEEK(38180) + (RND(1) * J2): GOSUB 915: POKE 31180,J
//
// pokes 31180 rather than 38180, so titanium never moves and something at $79CC - inside the
// ship model BLOADed to $7879 - is written instead.
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
const COLLECT = textOf('COLLECT');

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
const which = async () => {
  const now = await loaded();
  for (const f of disk.files) {
    try { if (textOf(f.name) === now) return f.name; } catch { /* not BASIC */ }
  }
  return null;
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

// The thirteen loot counters SUPPLY prints, plus the two addresses the bugs involve.
const LOOT = [38171, 38172, 38173, 38174, 38175, 38176, 38177, 38178, 38179, 38180, 38181, 38182, 38183];
const readLoot = async () => {
  const o = {};
  for (const a of LOOT) o[a] = await a2.read(a);
  return o;
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

const planet = await a2.read(38209);
const tech = await a2.read(38282 + planet);
console.log(`\nplanet ${planet}, tech ${tech} - line 805's ON TECH + 1 GOSUB picks ` +
  `${[820, 840, 910, 1070, 1090][tech] ?? '?'}`);
console.log(`38207 = ${await a2.read(38207)}, 38208 = ${await a2.read(38208)} ` +
  '(line 172 returns to COM when both are 1)');
const before = await readLoot();
const modelBefore = await a2.read(31180);
console.log(`loot before: ${LOOT.map((a) => `${a}=${before[a]}`).join(' ')}`);
console.log(`$79CC (31180) before = ${modelBefore}`);

console.log('\n1 for ATTACK PLANET, then waiting the battle out');
await a2.key('1');
let reached = false;
let seen = null;
for (let i = 0; i < 900 && !reached; i++) {
  await a2.frames(20);
  const w = await which();
  if (w !== seen) { seen = w; console.log(`  now running: ${w}`); }
  reached = (await loaded()) === COLLECT;
}
if (!reached) {
  console.log('  COLLECT was not reached');
  await a2.close();
  throw new Error('COLLECT never started');
}
console.log('COLLECT is running\n');

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

// The messages print into the inverse band line 170 clears at rows 11-14, and an inverse
// blank is solid white - so the page is at its brightest with no text on it. Pick on the
// fewest lit pixels in the band instead: that is the sample carrying the most glyphs.
const bandLit = (on) => {
  let n = 0;
  for (let y = 88; y <= 119; y++) for (let x = 0; x < HGR_W; x++) if (on[y * HGR_W + x]) n++;
  return n;
};
let best = null;
let last = null;
for (let i = 0; i < 400; i++) {
  await a2.frames(4);
  const on = decodeHgr(await a2.readRange(0x2000, 0x4000));
  const b = bandLit(on);
  last = on;
  if (b > 0 && (!best || b < best.band)) best = { band: b, on, g: pointsOf(on) };
  if ((await loaded()) !== COLLECT) { console.log(`  COLLECT left after ~${i * 4} frames`); break; }
}
if (!best) best = { band: bandLit(last), on: last, g: pointsOf(last) };
console.log(`most text in the band: ${best.band} lit there, ${best.g.lit} on the page`);
fs.mkdirSync('captured/collect', { recursive: true });
fs.writeFileSync('captured/collect/final.png', toPng(last));

const after = await readLoot();
const modelAfter = await a2.read(31180);
console.log('');
console.log('  addr    before  after   what');
const NAMES = {
  38171: 'ART WORKS', 38172: 'WINE/LIQUOR', 38173: 'LUXURY FOODS', 38174: 'FIGHTER PARTS',
  38175: 'WEAPONS', 38176: 'ELECTRONIC PARTS', 38177: 'FISSIONABLES', 38178: 'STEEL',
  38179: 'COLLAPSIUM', 38180: 'TITANIUM', 38181: 'PLATINUM', 38182: 'SILVER', 38183: 'GOLD',
};
for (const a of LOOT) {
  console.log(`  ${a}  ${String(before[a]).padStart(6)}  ${String(after[a]).padStart(5)}   ${NAMES[a]}` +
    (before[a] === after[a] ? '  (unchanged)' : ''));
}
console.log(`  31180  ${String(modelBefore).padStart(6)}  ${String(modelAfter).padStart(5)}   $79CC, inside the ship model` +
  (modelBefore === modelAfter ? '  (unchanged)' : '  <- line 960 wrote here'));
console.log('');
// The 870/880 mix-up only runs at tech 1 - at tech 2 and above line 920's block takes over
// and line 940 pokes 38182 correctly. So equal silver and gold here proves nothing.
if (tech === 1) {
  console.log(`silver ${after[38182]} vs gold ${after[38183]}: ` +
    (after[38182] === after[38183] ? 'equal - line 880 pokes J, not F' : 'different, so 880 is not the bug it looks like'));
} else {
  console.log(`tech ${tech} takes line 920's block, not 870/880, so the silver mix-up is not ` +
    `exercised here (silver ${after[38182]}, gold ${after[38183]} - independent draws).`);
}
console.log(`titanium ${before[38180]} -> ${after[38180]}: ` +
  (before[38180] === after[38180] ? 'unchanged' : 'changed') +
  `, and 31180 ${modelBefore} -> ${modelAfter}: ` +
  (modelBefore !== modelAfter ? 'line 960 wrote into the ship model' : 'untouched'));

fs.writeFileSync('captured/collect/collect.png', toPng(best.on));
fs.writeFileSync('captured/collect/golden.json', JSON.stringify({
  source: 'the original COLLECT, reached by winning a ground assault',
  planet, tech, before, after, modelBefore, modelAfter, screen: best.g,
}) + String.fromCharCode(10));
console.log('\nwrote captured/collect/golden.json and collect.png');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
