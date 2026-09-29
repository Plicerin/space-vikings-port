// The port's COLLECT against the original's.
//
// COLLECT writes only the band GROUND FORCES' line 170 clears - rows 11-14, columns 0-38 -
// and inherits $3CD = 255 from there, so it is inverse. Everything else on the captured page
// is the battle screen underneath, whose numbers are RND-driven, so the comparison is scoped
// to the band.
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/collect/golden.json', 'utf8'));

const BAND_TOP = 88;    // row 11
const BAND_BOTTOM = 119; // row 14

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.drawCollectMessage), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose drawCollectMessage - is the dev server running at ' + PORT_URL + '?'); });

const shot = await page.evaluate(({ tech }) => {
  const sv = window.__spaceVikings;
  const c = document.createElement('canvas');
  c.width = 560; c.height = 384;
  const h = new sv.Hires(c);
  h.hgr();
  sv.drawCollectMessage(h, tech);
  return Array.from(h.snapshot().on);
}, { tech: golden.tech });
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

const diskOn = new Uint8Array(HGR_W * HGR_H);
for (const [x, y] of golden.screen.points) diskOn[y * HGR_W + x] = 1;
const portOn = Uint8Array.from(shot);

let both = 0, onlyDisk = 0, onlyPort = 0, diskLit = 0, portLit = 0;
const perRow = new Uint16Array(HGR_H);
for (let y = BAND_TOP; y <= BAND_BOTTOM; y++) for (let x = 0; x < HGR_W; x++) {
  const k = y * HGR_W + x;
  if (diskOn[k]) diskLit++;
  if (portOn[k]) portLit++;
  if (diskOn[k] && portOn[k]) both++;
  else if (diskOn[k]) { onlyDisk++; perRow[y]++; }
  else if (portOn[k]) { onlyPort++; perRow[y]++; }
}
const px = (BAND_BOTTOM - BAND_TOP + 1) * HGR_W;
console.log(`COLLECT's band, rows ${BAND_TOP}-${BAND_BOTTOM} (text rows 11-14), tech ${golden.tech}:`);
console.log(`  disk ${diskLit} lit, port ${portLit} lit, ${both} in both`);
console.log(`  ${onlyDisk + onlyPort} of ${px} differ  (${(100 * (1 - (onlyDisk + onlyPort) / px)).toFixed(2)}% agree)`);
console.log(`    ${onlyDisk} disk only, ${onlyPort} port only`);
const rows = [...perRow.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
if (rows.length) console.log(`  ${rows.length} rows differ; worst: ` + rows.slice(0, 8).map(([y, n]) => `${y}(${n})`).join(' '));

// The two bugs, against what the machine did.
console.log('');
console.log('the loot, as the machine awarded it:');
const NAMES = {
  38171: 'ART WORKS', 38172: 'WINE/LIQUOR', 38173: 'LUXURY FOODS', 38174: 'FIGHTER PARTS',
  38175: 'WEAPONS', 38176: 'ELECTRONIC PARTS', 38177: 'FISSIONABLES', 38178: 'STEEL',
  38179: 'COLLAPSIUM', 38180: 'TITANIUM', 38181: 'PLATINUM', 38182: 'SILVER', 38183: 'GOLD',
};
const j1 = golden.tech === 2 ? 0 : golden.tech === 3 ? 10 : 15;
const j2 = golden.tech === 2 ? 10 : golden.tech === 3 ? 7 : 15;
console.log(`  tech ${golden.tech} gives J1 = ${j1}, J2 = ${j2}`);
let ok = true;
for (const a of Object.keys(NAMES).map(Number)) {
  const gained = golden.after[a] - golden.before[a];
  const limit = a === 38173 ? 20 : [38179, 38176, 38175, 38171].includes(a) ? j1 : j2;
  const within = a === 38180 ? gained === 0 : gained >= 0 && gained <= limit;
  if (!within) ok = false;
  console.log(`  ${NAMES[a].padEnd(17)} +${String(gained).padStart(3)}  against a cap of ` +
    `${a === 38180 ? 'nothing - line 960 misses it' : limit}${within ? '' : '   OUT OF RANGE'}`);
}
console.log(`  every gain within its rate: ${ok}`);
console.log('');
console.log(`  titanium ${golden.before[38180]} -> ${golden.after[38180]}, and 31180 ` +
  `${golden.modelBefore} -> ${golden.modelAfter}: line 960's typo, confirmed`);
console.log(`  the line 880 silver bug is a tech 1 path and was not exercised here (tech ${golden.tech})`);

fs.mkdirSync('captured/collect', { recursive: true });
fs.writeFileSync('captured/collect/port.png', toPng(portOn));
console.log('');
console.log('wrote captured/collect/port.png');
