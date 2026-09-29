// The port's SUPPLY against the original's, both pages.
//
// SUPPLY fills its own background, so unlike COM's chain there is nothing to replay except
// the instrument panel, which it never touches.
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/supply/golden.json', 'utf8'));
const tableJson = JSON.parse(fs.readFileSync('../public/data/shapes/shape-table.json', 'utf8'));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.drawSupplyPage1), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose drawSupplyPage1 - is the dev server running at ' + PORT_URL + '?'); });

const shots = await page.evaluate(({ cargo, credits, tj }) => {
  const sv = window.__spaceVikings;
  const shapes = sv.decodeShapeTableJson(tj);
  const base = (fn) => {
    const c = document.createElement('canvas');
    c.width = 560; c.height = 384;
    const h = new sv.Hires(c);
    h.hgr();
    // The panel is still standing underneath - SUPPLY fills only rows 0-123.
    sv.drawInstruments(h);
    sv.drawPanelNeedles(h, shapes, { bank: 0, pitch: 0, speed: 120, energy: 63 });
    sv.eraseComNeedleTracks(h, shapes);
    fn(h);
    return Array.from(h.snapshot().on);
  };
  return {
    page1: base((h) => sv.drawSupplyPage1(h, cargo)),
    page2: base((h) => sv.drawSupplyPage2(h, cargo, credits)),
  };
}, { cargo: golden.cargo, credits: golden.misc.CR, tj: tableJson });
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

for (const name of ['page1', 'page2']) {
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
  fs.mkdirSync('captured/supply', { recursive: true });
  fs.writeFileSync(`captured/supply/${name}-port.png`, toPng(portOn));
  const d = new Uint8Array(diskOn.length);
  for (let k = 0; k < d.length; k++) d[k] = diskOn[k] === portOn[k] ? 0 : 1;
  fs.writeFileSync(`captured/supply/${name}-diff.png`, toPng(d, { colour: [255, 0, 0] }));
}
console.log('wrote captured/supply/*-port.png and *-diff.png');
