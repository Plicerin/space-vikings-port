// The port's SHORE LEAVE screens against the original's.
//
// SHORE LEAVE draws over whatever is on the page, the same way GROUND FORCES does, so the
// comparison replays the chain: panel, lamps, needles, COM (with its line 8 erase), then the
// sub-screen. GROUND FORCES' own menu text does not survive - SHORE LEAVE's line 2080 blanks
// the same rows 1-12 - so it does not need to be drawn.
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/shoreleave/golden.json', 'utf8'));
const comGolden = JSON.parse(fs.readFileSync('captured/com/readouts.json', 'utf8'));
const statusGolden = JSON.parse(fs.readFileSync('captured/status/golden.json', 'utf8'));
const tableJson = JSON.parse(fs.readFileSync('../public/data/shapes/shape-table.json', 'utf8'));

const comBytes = comGolden.healthy.bytes;
const needles = { bank: 0, pitch: 0, speed: 120, energy: comBytes['38199'] };
// TR and CR come from the MISC file, the same two STATUS reads.
const pay = { troops: statusGolden.misc.TR, credits: statusGolden.misc.CR };
// The troop location CRYOGENICS saw, before line 4010 poked it to 0.
const troopLocation = golden.bytes['38166'];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.drawShoreLeavePay), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose drawShoreLeavePay - is the dev server running at ' + PORT_URL + '?'); });

const shots = await page.evaluate(({ tj, bytes, n, p, loc }) => {
  const sv = window.__spaceVikings;
  const shapes = sv.decodeShapeTableJson(tj);
  const base = (fn) => {
    const c = document.createElement('canvas');
    c.width = 560; c.height = 384;
    const h = new sv.Hires(c);
    h.hgr();
    sv.drawInstruments(h);
    sv.drawPanelNeedles(h, shapes, n);
    sv.drawComMainScreen(h, bytes, shapes);
    fn(h);
    return Array.from(h.snapshot().on);
  };
  return {
    cryogenics: base((h) => sv.drawShoreLeaveCryogenics(h, loc)),
    pay: base((h) => sv.drawShoreLeavePay(h, p)),
  };
}, { tj: tableJson, bytes: comBytes, n: needles, p: pay, loc: troopLocation });
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

for (const name of ['cryogenics', 'pay']) {
  const diskOn = new Uint8Array(HGR_W * HGR_H);
  for (const [x, y] of golden[name].points) diskOn[y * HGR_W + x] = 1;
  const portOn = Uint8Array.from(shots[name]);
  let diskLit = 0, portLit = 0, both = 0, onlyDisk = 0, onlyPort = 0;
  const perRow = new Uint16Array(HGR_H);
  for (let k = 0; k < diskOn.length; k++) {
    if (diskOn[k]) diskLit++;
    if (portOn[k]) portLit++;
    if (diskOn[k] && portOn[k]) both++;
    else if (diskOn[k]) { onlyDisk++; perRow[(k / HGR_W) | 0]++; }
    else if (portOn[k]) { onlyPort++; perRow[(k / HGR_W) | 0]++; }
  }
  const diff = onlyDisk + onlyPort;
  console.log(`${name}:`);
  console.log(`  disk ${diskLit} lit, port ${portLit} lit, ${both} in both`);
  console.log(`  ${diff} of ${diskOn.length} differ  (${(100 * (1 - diff / diskOn.length)).toFixed(3)}% agree)`);
  console.log(`    ${onlyDisk} disk only, ${onlyPort} port only`);
  const rows = [...perRow.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (rows.length) console.log(`  ${rows.length} rows differ; worst: ` + rows.slice(0, 8).map(([y, n]) => `${y}(${n})`).join(' '));
  console.log('');
  fs.mkdirSync('captured/shoreleave', { recursive: true });
  fs.writeFileSync(`captured/shoreleave/${name}-port.png`, toPng(portOn));
  const d = new Uint8Array(diskOn.length);
  for (let k = 0; k < d.length; k++) d[k] = diskOn[k] === portOn[k] ? 0 : 1;
  fs.writeFileSync(`captured/shoreleave/${name}-diff.png`, toPng(d, { colour: [255, 0, 0] }));
}
console.log('wrote captured/shoreleave/*-port.png and *-diff.png');
