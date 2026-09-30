// S/X's 240 debris segments, predicted from one seed.
//
// The same replay as `ex_burst_parity.mjs`, on the other side of the mirror: S/X line 5 leaves
// the page solid white and lines 7-30 draw the identical loop in `HCOLOR= 0`, so the burst takes
// pixels away instead of adding them.
//
// This is the test `sx_parity.mjs` could not make. It has line 5's fill and line 40's message
// exact - 433 dark pixels on row 21 either side - but of the burst it could only say that the
// disk's 45,481 lit pixels fell inside the 44,970 to 45,913 the port produced over twelve
// random runs.
import { chromium } from 'playwright';
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/sxburst/golden.json', 'utf8'));

const before = new Uint8Array(HGR_W * HGR_H);
for (const [x, y] of golden.before) before[y * HGR_W + x] = 1;
const after = new Uint8Array(HGR_W * HGR_H);
for (const [x, y] of golden.after) after[y * HGR_W + x] = 1;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.drawExBurst),
  null, { timeout: 30000 });

const drawn = await page.evaluate(({ seed, lit }) => {
  const sv = window.__spaceVikings;
  const c = document.createElement('canvas');
  c.width = 560; c.height = 384;
  const h = new sv.Hires(c);
  h.hgr();
  // Put the machine's own page under it - here that is line 5's solid white page, so every
  // segment can only subtract from it.
  h.hcolor(3);
  for (const [x, y] of lit) h.hplot(x, y);
  const rnd = sv.rndSequence(seed);
  const n = sv.drawExBurst(h, rnd, 0);   // line 5's HCOLOR= 0
  return { on: Array.from(h.snapshot().on), segments: n };
}, { seed: golden.seed, lit: golden.before });
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

const port = Uint8Array.from(drawn.on);
let diff = 0, onlyDisk = 0, onlyPort = 0;
for (let k = 0; k < after.length; k++) {
  if (after[k] && !port[k]) { onlyDisk++; diff++; }
  else if (!after[k] && port[k]) { onlyPort++; diff++; }
}
let burstOff = 0;
for (let k = 0; k < after.length; k++) if (before[k] && !port[k]) burstOff++;

console.log(`seed ${golden.seed.map((b) => b.toString(16).padStart(2, '0')).join(' ')}, ` +
  `${drawn.segments} segments drawn`);
console.log(`  the machine's burst turned ${golden.turnedOff} pixels off, the port's ${burstOff}`);
console.log(`  ${diff} of ${HGR_W * HGR_H} differ  (${onlyDisk} disk only, ${onlyPort} port only)`);

fs.mkdirSync('captured/sxburst', { recursive: true });
fs.writeFileSync('captured/sxburst/port.png', toPng(port));
const mask = new Uint8Array(after.length);
for (let k = 0; k < mask.length; k++) mask[k] = (after[k] ? 1 : 0) !== (port[k] ? 1 : 0) ? 1 : 0;
fs.writeFileSync('captured/sxburst/diff.png', toPng(mask));
console.log('');
console.log(diff === 0 ? 'S/X burst parity: clean' : `S/X burst parity: ${diff} pixels differ`);
process.exit(diff === 0 ? 0 : 1);
