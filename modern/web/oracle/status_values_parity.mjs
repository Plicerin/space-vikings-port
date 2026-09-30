// STATUS again, with the numbers made awkward.
//
// `status_parity.mjs` already reports both pages exact - but against one capture of one state,
// a fresh ship with every system at 100%. A screen full of the same three-digit number says
// very little about the columns. `PRINT "ENERGY  :";EN;"%"; TAB( 22);"CREDITS  :"` puts the
// second field where TAB( 22) lands only while the cursor has not already passed column 21, and
// a zero, a one-digit reading and a three-digit one all print at different widths. The same
// goes for `HTAB 22` in 5100-5120 and for `HTAB 24` on the troop page.
//
// So this pokes the eighteen bytes the report reads to a mixture of widths, enters STATUS from
// COM the way a player does, and compares both pages against the port drawing the same numbers.
// SD, TR and CR are not bytes - line 50 INPUTs them from MISC FILE - so they are read off the
// machine's variable table and handed to the port rather than invented.
//
// Only rows 0-123 are compared. The panel below is COM's, not STATUS's, and `status_parity.mjs`
// is what checks that.
import { openOracle, VAR_READER } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import { decodeHgr, toPng, HGR_W, HGR_H } from './hgr.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const OUT = 'captured/statusvalues';
const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';

// Values picked so that each field is a different width, and so that every branch the route's
// own capture does not take gets taken: condition GREEN rather than RED, morale FAIR rather
// than EXCELLENT!, troops PLANETSIDE rather than in cryogenic sleep.
const POKES = {
  38209: 8,     // line 1235 READs this many names, 1-based; 8 is VARCAR
  38199: 31,    // energy: line 1255 is INT((31 / 62) * 100) = 50
  38200: 7,     // shields, one digit
  38165: 1,     // condition -> GREEN
  38193: 62,    // hull, printed as 100 - it
  38187: 0,     // missiles, a zero
  38196: 83,    // computer
  38190: 5,     // hyperdrive
  38195: 0,     // radar
  38186: 100,   // laser
  38198: 9,     // engine 1
  38197: 74,    // engine 2
  38203: 4,     // morale -> FAIR
  38166: 1,     // troop location -> PLANETSIDE
  38156: 3,     // fighters
  38155: 17,    // transports
  38154: 250,   // tanks
  38153: 6,     // ground missiles
};

const disk = openDisk(DISK);
const textOf = (name) => {
  const r = disk.read(disk.files.find((f) => f.name === name));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => `${l.num} ${l.text}`).join('\n');
};
const PROGRAMS = ['STARSHIP SIMULATOR', 'COM', 'STATUS'];
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

/**
 * Wait for the hi-res page itself to stop changing.
 *
 * Hash it; do not count anything about it. Counting non-zero bytes is blind on exactly this
 * screen - STATUS floods rows 0-123 and then prints in inverse, so nearly every byte is
 * non-zero from the start and the count barely moves while the text goes down. That mistake
 * put a screen reading "CON" of "CONDITION:" into a golden once already.
 */
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

// The pokes go in while COM is sitting on its GET, so STATUS reads them on the way past. They
// are all in the $9400-$96FF block, well above HIMEM 8192, so loading STATUS cannot disturb
// them.
await a2.ev(`(() => { ${Object.entries(POKES).map(([a, v]) => `window.M.wr(${a}, ${v});`).join(' ')} return 'poked'; })()`);
await a2.key('4', { holdFrames: 40, afterFrames: 20 });
if (!await settleOn('STATUS')) { await a2.close(); throw new Error('STATUS never started'); }
const page1 = await settlePage();

const vt = JSON.parse(await a2.ev(`JSON.stringify(window.M.vars())`));
const varOf = (n) => (vt.vars.find((v) => v.name === n) || {}).value;
const misc = { SD: varOf('SD'), TR: varOf('TR'), CR: varOf('CR') };
console.log(`  MISC FILE: SD=${misc.SD} TR=${misc.TR} CR=${misc.CR}`);

await a2.key(' ', { holdFrames: 40, afterFrames: 20 });
const page2 = await settlePage();
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();

const data = {
  planetIndex: POKES[38209] - 1,
  stardate: misc.SD, troops: misc.TR, credits: misc.CR,
  energy: POKES[38199], shields: POKES[38200], condition: POKES[38165],
  hull: POKES[38193], missiles: POKES[38187],
  computer: POKES[38196], hyperdrive: POKES[38190], radar: POKES[38195], laser: POKES[38186],
  engine1: POKES[38198], engine2: POKES[38197],
  morale: POKES[38203], troopLocation: POKES[38166],
  fighters: POKES[38156], transports: POKES[38155],
  tanks: POKES[38154], groundMissiles: POKES[38153],
  troopsAlive: misc.TR,
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.drawStatusReport),
  null, { timeout: 30000 });
const drawn = await page.evaluate((d) => {
  const sv = window.__spaceVikings;
  const shot = (fn) => {
    const c = document.createElement('canvas');
    c.width = 560; c.height = 384;
    const h = new sv.Hires(c);
    h.hgr();
    fn(h, d);
    return Array.from(h.snapshot().on);
  };
  return { one: shot(sv.drawStatusReport), two: shot(sv.drawTroopReport) };
}, data);
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

fs.mkdirSync(OUT, { recursive: true });
let bad = 0;
console.log('');
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
  if (rows.length) console.log(`     rows: ${rows.slice(0, 12).join(' ')}`);
  if (diff) bad++;
  fs.writeFileSync(`${OUT}/${name}-disk.png`, toPng(want));
  fs.writeFileSync(`${OUT}/${name}-port.png`, toPng(on));
  const mask = new Uint8Array(HGR_W * HGR_H);
  for (let k = 0; k < mask.length; k++) mask[k] = (want[k] ? 1 : 0) !== (on[k] ? 1 : 0) ? 1 : 0;
  fs.writeFileSync(`${OUT}/${name}-diff.png`, toPng(mask));
}
fs.writeFileSync(`${OUT}/golden.json`, JSON.stringify({
  source: 'STATUS on the machine with the report bytes poked to mixed widths, both pages, rows 0-123',
  pokes: POKES, misc,
}) + String.fromCharCode(10));
console.log('');
console.log(bad === 0 ? 'status value parity: clean' : `status value parity: ${bad} page(s) differ`);
process.exit(bad === 0 ? 0 : 1);
