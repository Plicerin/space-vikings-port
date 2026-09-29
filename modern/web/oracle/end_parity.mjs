// The port's END against the original's.
//
// END blanks rows 0-15 and draws its menu there; rows 16-23 are the instrument panel it
// never touches, so those come from the chain.
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/end/golden.json', 'utf8'));
const comGolden = JSON.parse(fs.readFileSync('captured/com/readouts.json', 'utf8'));
const tableJson = JSON.parse(fs.readFileSync('../public/data/shapes/shape-table.json', 'utf8'));
const comBytes = comGolden.healthy.bytes;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.drawEndMenu), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose drawEndMenu - is the dev server running?'); });

const shot = await page.evaluate(({ tj, bytes }) => {
  const sv = window.__spaceVikings;
  const shapes = sv.decodeShapeTableJson(tj);
  const c = document.createElement('canvas');
  c.width = 560; c.height = 384;
  const h = new sv.Hires(c);
  h.hgr();
  sv.drawInstruments(h);
  sv.drawPanelNeedles(h, shapes, { bank: 0, pitch: 0, speed: 120, energy: bytes['38199'] });
  sv.drawComMainScreen(h, bytes, shapes);
  sv.drawEndMenu(h);
  return Array.from(h.snapshot().on);
}, { tj: tableJson, bytes: comBytes });
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

const diskOn = new Uint8Array(HGR_W * HGR_H);
for (const [x, y] of golden.menu.points) diskOn[y * HGR_W + x] = 1;
const portOn = Uint8Array.from(shot);

const region = (from, to, label) => {
  let both = 0, onlyDisk = 0, onlyPort = 0, diskLit = 0, portLit = 0;
  for (let y = from; y <= to; y++) for (let x = 0; x < HGR_W; x++) {
    const k = y * HGR_W + x;
    if (diskOn[k]) diskLit++;
    if (portOn[k]) portLit++;
    if (diskOn[k] && portOn[k]) both++;
    else if (diskOn[k]) onlyDisk++;
    else if (portOn[k]) onlyPort++;
  }
  const px = (to - from + 1) * HGR_W;
  console.log(`${label} (rows ${from}-${to}): ${onlyDisk + onlyPort} of ${px} differ  ` +
    `(${(100 * (1 - (onlyDisk + onlyPort) / px)).toFixed(2)}%)  disk ${diskLit} lit, port ${portLit} lit, ` +
    `${onlyDisk} disk only, ${onlyPort} port only`);
};
region(0, 127, "END's own rows 0-15");
region(128, HGR_H - 1, 'the panel below');

let diff = 0;
const perRow = new Uint16Array(HGR_H);
for (let k = 0; k < diskOn.length; k++) if (diskOn[k] !== portOn[k]) { diff++; perRow[(k / HGR_W) | 0]++; }
console.log(`whole page: ${diff} of ${diskOn.length} differ  (${(100 * (1 - diff / diskOn.length)).toFixed(3)}% agree)`);
const rows = [...perRow.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
if (rows.length) console.log(`${rows.length} rows differ; worst: ` + rows.slice(0, 8).map(([y, n]) => `${y}(${n})`).join(' '));

fs.mkdirSync('captured/end', { recursive: true });
fs.writeFileSync('captured/end/port.png', toPng(portOn));
const d = new Uint8Array(diskOn.length);
for (let k = 0; k < d.length; k++) d[k] = diskOn[k] === portOn[k] ? 0 : 1;
fs.writeFileSync('captured/end/diff.png', toPng(d, { colour: [255, 0, 0] }));
console.log('wrote captured/end/port.png and diff.png');
