// EX's 240 debris segments, predicted from one seed.
//
// `probe_exburst.mjs` captured the seed at `$00C9` the moment EX reached line 7, the page as it
// stood then, and the page again after line 30. The port's RND is bit-exact, so the whole burst
// follows from that seed - 480 draws, two per segment, in the order line 20 makes them.
//
// This is the test `ex_parity.mjs` could not make. It checks line 6's flash exactly and lines
// 7-30 only by their extent, and an extent proves very little: the disk's run spanned x 16-259
// and an earlier port run x 19-248, both inside what line 20 allows.
import { chromium } from 'playwright';
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/exburst/golden.json', 'utf8'));

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
  // Put the machine's own page under it: the burst is drawn over the flight view, not on black,
  // and HPLOT in HCOLOR 3 lights pixels that may already be lit.
  h.hcolor(3);
  for (const [x, y] of lit) h.hplot(x, y);
  const rnd = sv.rndSequence(seed);
  const n = sv.drawExBurst(h, rnd, 3);
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
let burstOn = 0;
for (let k = 0; k < after.length; k++) if (!before[k] && port[k]) burstOn++;

console.log(`seed ${golden.seed.map((b) => b.toString(16).padStart(2, '0')).join(' ')}, ` +
  `${drawn.segments} segments drawn`);
console.log(`  the machine's burst turned ${golden.turnedOn} pixels on, the port's ${burstOn}`);
console.log(`  ${diff} of ${HGR_W * HGR_H} differ  (${onlyDisk} disk only, ${onlyPort} port only)`);

fs.mkdirSync('captured/exburst', { recursive: true });
fs.writeFileSync('captured/exburst/port.png', toPng(port));
const mask = new Uint8Array(after.length);
for (let k = 0; k < mask.length; k++) mask[k] = (after[k] ? 1 : 0) !== (port[k] ? 1 : 0) ? 1 : 0;
fs.writeFileSync('captured/exburst/diff.png', toPng(mask));
console.log('');
console.log(diff === 0 ? 'EX burst parity: clean' : `EX burst parity: ${diff} pixels differ`);
process.exit(diff === 0 ? 0 : 1);
