// The port's four SHIP # n I.D. screens against the original's.
//
// They blank rows 0-15 and draw everything themselves, so only the instrument panel below
// comes from the chain. Fully deterministic - the wireframes are DATA, not RND - so these
// should be exact.
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/shipid/golden.json', 'utf8'));
const tableJson = JSON.parse(fs.readFileSync('../public/data/shapes/shape-table.json', 'utf8'));
const KINDS = [0, 1, 3, 4];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.drawShipId), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose drawShipId - is the dev server running?'); });

const shots = await page.evaluate(({ kinds, tj }) => {
  const sv = window.__spaceVikings;
  const shapes = sv.decodeShapeTableJson(tj);
  const out = {};
  for (const k of kinds) {
    const c = document.createElement('canvas');
    c.width = 560; c.height = 384;
    const h = new sv.Hires(c);
    h.hgr();
    sv.drawInstruments(h);
    sv.drawPanelNeedles(h, shapes, { bank: 0, pitch: 0, speed: 120, energy: 63 });
    sv.eraseComNeedleTracks(h, shapes);
    sv.drawShipId(h, k);
    out[k] = Array.from(h.snapshot().on);
  }
  return out;
}, { kinds: KINDS, tj: tableJson });
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

let allExact = true;
for (const k of KINDS) {
  const g = golden.screens[k];
  if (!g) { console.log(`SHIP # ${k}: not captured`); continue; }
  const diskOn = new Uint8Array(HGR_W * HGR_H);
  for (const [x, y] of g.points) diskOn[y * HGR_W + x] = 1;
  const portOn = Uint8Array.from(shots[k]);

  const region = (from, to) => {
    let d = 0, dl = 0, pl = 0, od = 0, op = 0;
    for (let y = from; y <= to; y++) for (let x = 0; x < HGR_W; x++) {
      const i = y * HGR_W + x;
      if (diskOn[i]) dl++;
      if (portOn[i]) pl++;
      if (diskOn[i] !== portOn[i]) { d++; if (diskOn[i]) od++; else op++; }
    }
    return { d, dl, pl, od, op, px: (to - from + 1) * HGR_W };
  };
  const own = region(0, 127);
  const panel = region(128, HGR_H - 1);
  if (own.d) allExact = false;
  console.log(`SHIP # ${k} I.D.:`);
  console.log(`  rows 0-15: ${own.d} of ${own.px} differ  (${(100 * (1 - own.d / own.px)).toFixed(2)}%)  ` +
    `disk ${own.dl} lit, port ${own.pl} lit, ${own.od} disk only, ${own.op} port only`);
  console.log(`  panel below: ${panel.d} of ${panel.px} differ`);
  if (own.d) {
    const perRow = new Uint16Array(HGR_H);
    for (let y = 0; y <= 127; y++) for (let x = 0; x < HGR_W; x++) {
      if (diskOn[y * HGR_W + x] !== portOn[y * HGR_W + x]) perRow[y]++;
    }
    const rows = [...perRow.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    console.log(`    worst rows: ` + rows.slice(0, 6).map(([y, n]) => `${y}(${n})`).join(' '));
  }
  fs.writeFileSync(`captured/shipid/ship${k}-port.png`, toPng(portOn));
  const d = new Uint8Array(diskOn.length);
  for (let i = 0; i < d.length; i++) d[i] = diskOn[i] === portOn[i] ? 0 : 1;
  fs.writeFileSync(`captured/shipid/ship${k}-diff.png`, toPng(d, { colour: [255, 0, 0] }));
}
console.log('');
console.log(allExact ? 'all four exact' : 'not all exact');
console.log('wrote captured/shipid/*-port.png and *-diff.png');

// The four identification screens blank rows 0-15 and draw everything themselves, so those
// rows are exact. The panel below is the flight page they inherit, and whether its needles are
// on it depends on the hi-res page the flight loop had flipped to - reported, not required.
console.log('');
console.log(allExact ? 'shipid parity: all four exact over rows 0-15'
  : 'shipid parity: not all four are exact');
process.exit(allExact && errors.length === 0 ? 0 : 1);
