// SUPPLY's two pages with something in the hold.
//
// `supply_parity.mjs` has both pages exact - but against a fresh ship, where every one of the
// thirteen counters is zero. Zero times ten is zero, so that capture says nothing at all about
// the multipliers 1410-1490 apply when they print: platinum and gold by 10, silver by 20, wine
// by 100, art works by 10, and the other eight by nothing. It says nothing about the column
// either, because `= 0` is the same width whatever HTAB 19 does with it.
//
// So this pokes the thirteen bytes to a spread of one-, two- and three-digit values, walks to
// the report the way a player does - C, 1, 5 - and compares both pages against the port drawing
// the same numbers.
import { openOracle, VAR_READER } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import { decodeHgr, toPng, HGR_W, HGR_H } from './hgr.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const OUT = 'captured/supplyvalues';
const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';

// One value per counter, chosen so each column has to cope with a different width - and 255 on
// titanium, which is the cap COLLECT's line 915 clamps to.
const POKES = {
  38181: 7,     // platinum, x10 -> 70
  38183: 25,    // gold, x10 -> 250
  38182: 13,    // silver, x20 -> 260
  38180: 255,   // titanium, x1
  38179: 0,     // collapsium, x1 - one of them should still be zero
  38178: 9,     // steel, x1
  38177: 100,   // fissionables, x1
  38176: 3,     // electronic parts, x1
  38175: 41,    // weapons, x1
  38174: 128,   // fighter parts, x1
  38173: 7,     // luxury foods, x1
  38172: 2,     // wine/liquor, x100 -> 200
  38171: 19,    // art works, x10 -> 190
};

const disk = openDisk(DISK);
const textOf = (name) => {
  const r = disk.read(disk.files.find((f) => f.name === name));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => `${l.num} ${l.text}`).join('\n');
};
const PROGRAMS = ['STARSHIP SIMULATOR', 'COM', 'SUPPLY'];
const TEXTS = Object.fromEntries(PROGRAMS.map((n) => [n, textOf(n)]));

const a2 = await openOracle();
await a2.boot();
await a2.key('N');
await a2.ev(VAR_READER);

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
    if ((await which()) === want) { if (++stable >= 20) return true; } else stable = 0;
  }
  return false;
};
/** Hash the page, do not count anything about it: SUPPLY prints inverse over a flood. */
const settlePage = async () => {
  let prev = '', still = 0;
  for (let i = 0; i < 300; i++) {
    await a2.frames(10);
    const h = await a2.ev(`window.M.hash(0x2000, 0x4000)`);
    if (h === prev) { if (++still >= 12) break; } else still = 0;
    prev = h;
  }
  return decodeHgr(await a2.readRange(0x2000, 0x4000));
};

console.log('waiting for STARSHIP SIMULATOR...');
for (let i = 0; i < 900; i++) { await a2.frames(20); if ((await which()) === 'STARSHIP SIMULATOR') break; }
await a2.frames(300);
await a2.key('C', { holdFrames: 40, afterFrames: 20 });
if (!await settleOn('COM')) { await a2.close(); throw new Error('COM never started'); }
await a2.key('1', { holdFrames: 40, afterFrames: 20 });
for (let i = 0; i < 40; i++) await a2.frames(10);

// The counters live in the $9400-$96FF block, well above HIMEM 8192, so loading SUPPLY cannot
// disturb them. They go in while COM is sitting on its GET.
await a2.ev(`(() => { ${Object.entries(POKES).map(([a, v]) => `window.M.wr(${a}, ${v});`).join(' ')} return 'poked'; })()`);
await a2.key('5', { holdFrames: 40, afterFrames: 20 });
if (!await settleOn('SUPPLY')) { await a2.close(); throw new Error('SUPPLY never started'); }
const page1 = await settlePage();

// CR is not a byte - line 5000 INPUTs it from MISC FILE - so take it off the variable table.
const vt = JSON.parse(await a2.ev(`JSON.stringify(window.M.vars())`));
const credits = (vt.vars.find((v) => v.name === 'CR') || {}).value;
console.log(`  MISC FILE: CR=${credits}`);

await a2.key(' ', { holdFrames: 40, afterFrames: 20 });
const page2 = await settlePage();
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.drawSupplyPage1),
  null, { timeout: 30000 });
const drawn = await page.evaluate(({ cargo, cr }) => {
  const sv = window.__spaceVikings;
  const shot = (fn) => {
    const c = document.createElement('canvas');
    c.width = 560; c.height = 384;
    const h = new sv.Hires(c);
    h.hgr();
    fn(h);
    return Array.from(h.snapshot().on);
  };
  return {
    one: shot((h) => sv.drawSupplyPage1(h, cargo)),
    two: shot((h) => sv.drawSupplyPage2(h, cargo, cr)),
  };
}, { cargo: POKES, cr: credits });
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

fs.mkdirSync(OUT, { recursive: true });
let bad = 0;
console.log('');
// SUPPLY owns rows 0-123 and leaves the panel below to flight, which the port is not drawing
// here, so only the report itself is compared.
for (const [name, want, got] of [['page1', page1, drawn.one], ['page2', page2, drawn.two]]) {
  const on = Uint8Array.from(got);
  let diff = 0, wantLit = 0, gotLit = 0;
  const rows = [];
  for (let y = 0; y <= 123; y++) {
    let n = 0;
    for (let x = 0; x < HGR_W; x++) {
      const k = y * HGR_W + x;
      if (want[k]) wantLit++;
      if (on[k]) gotLit++;
      if ((want[k] ? 1 : 0) !== (on[k] ? 1 : 0)) { diff++; n++; }
    }
    if (n) rows.push(`${y}(${n})`);
  }
  console.log(`  ${name}: disk ${wantLit} lit, port ${gotLit} lit, ${diff} differing in rows 0-123` +
    (diff === 0 ? '   exact' : '   DIFFERS'));
  if (rows.length) console.log(`     rows: ${rows.slice(0, 14).join(' ')}`);
  if (diff) bad++;
  fs.writeFileSync(`${OUT}/${name}-disk.png`, toPng(want));
  fs.writeFileSync(`${OUT}/${name}-port.png`, toPng(on));
  const mask = new Uint8Array(HGR_W * HGR_H);
  for (let k = 0; k < mask.length; k++) mask[k] = (want[k] ? 1 : 0) !== (on[k] ? 1 : 0) ? 1 : 0;
  fs.writeFileSync(`${OUT}/${name}-diff.png`, toPng(mask));
}
fs.writeFileSync(`${OUT}/golden.json`, JSON.stringify({
  source: 'SUPPLY on the machine with the thirteen cargo bytes poked to mixed widths, both pages, rows 0-123',
  pokes: POKES, credits,
}) + String.fromCharCode(10));
console.log('');
console.log(bad === 0 ? 'supply value parity: clean' : `supply value parity: ${bad} page(s) differ`);
process.exit(bad === 0 ? 0 : 1);
