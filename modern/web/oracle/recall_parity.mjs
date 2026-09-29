// The port's RECALL against the original's.
//
// RECALL draws over COM's screen by way of GROUND FORCES, which has already blanked rows
// 1-12, so the comparison replays that chain: panel, lamps, needles, COM with its line 8
// erase, then GROUND FORCES' line 12 clear, then RECALL's box and message.
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/recall/golden.json', 'utf8'));
const comGolden = JSON.parse(fs.readFileSync('captured/com/readouts.json', 'utf8'));
const tableJson = JSON.parse(fs.readFileSync('../public/data/shapes/shape-table.json', 'utf8'));
const comBytes = comGolden.healthy.bytes;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.drawRecall), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose drawRecall - is the dev server running at ' + PORT_URL + '?'); });

const shot = await page.evaluate(({ tj, bytes, inputs }) => {
  const sv = window.__spaceVikings;
  const shapes = sv.decodeShapeTableJson(tj);
  const c = document.createElement('canvas');
  c.width = 560; c.height = 384;
  const h = new sv.Hires(c);
  h.hgr();
  sv.drawInstruments(h);
  sv.drawPanelNeedles(h, shapes, { bank: 0, pitch: 0, speed: 120, energy: bytes['38199'] });
  sv.drawComMainScreen(h, bytes, shapes);
  // GROUND FORCES line 12, run from line 65 on the way out: rows 1-12, columns 1-18.
  h.hcolor(1);
  for (let r = 2; r <= 13; r++) h.text(' '.repeat(18), 2, r);
  sv.drawRecall(h, sv.recallMessage(inputs).lines);
  return Array.from(h.snapshot().on);
}, {
  tj: tableJson, bytes: comBytes,
  inputs: {
    planet: golden.before['38209'], troopPlanet: golden.before['38158'],
    troops: 2000, location: golden.before['38166'],
  },
});
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

const diskOn = new Uint8Array(HGR_W * HGR_H);
for (const [x, y] of golden.screen.points) diskOn[y * HGR_W + x] = 1;
const portOn = Uint8Array.from(shot);

let diff = 0, diskLit = 0, portLit = 0, onlyDisk = 0, onlyPort = 0;
const perRow = new Uint16Array(HGR_H);
for (let k = 0; k < diskOn.length; k++) {
  if (diskOn[k]) diskLit++;
  if (portOn[k]) portLit++;
  if (diskOn[k] !== portOn[k]) { diff++; perRow[(k / HGR_W) | 0]++; if (diskOn[k]) onlyDisk++; else onlyPort++; }
}
console.log(`RECALL, line ${golden.branch}:`);
console.log(`  disk ${diskLit} lit, port ${portLit} lit`);
console.log(`  ${diff} of ${diskOn.length} differ  (${(100 * (1 - diff / diskOn.length)).toFixed(3)}% agree)`);
console.log(`    ${onlyDisk} disk only, ${onlyPort} port only`);
const rows = [...perRow.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
if (rows.length) console.log(`  ${rows.length} rows differ; worst: ` + rows.slice(0, 8).map(([y, n]) => `${y}(${n})`).join(' '));

fs.mkdirSync('captured/recall', { recursive: true });
fs.writeFileSync('captured/recall/port.png', toPng(portOn));
const d = new Uint8Array(diskOn.length);
for (let k = 0; k < d.length; k++) d[k] = diskOn[k] === portOn[k] ? 0 : 1;
fs.writeFileSync('captured/recall/diff.png', toPng(d, { colour: [255, 0, 0] }));
console.log('wrote captured/recall/port.png and diff.png');
