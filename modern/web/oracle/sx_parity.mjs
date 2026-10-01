// The port's S/X against the original's.
//
// The burst is RND-driven, so the checks are structural: the background, the message, the
// extent, and the lit count against the port's own spread. S/X inverts EX - line 5 leaves
// the page solid white and the burst is HCOLOR 0, so the page gets darker as it draws.
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/sx/golden.json', 'utf8'));

const diskOn = new Uint8Array(HGR_W * HGR_H);
for (const [x, y] of golden.screen.points) diskOn[y * HGR_W + x] = 1;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.drawPlayerDeathBackground), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose drawPlayerDeathBackground - is the dev server running?'); });

const runs = await page.evaluate(({ n }) => {
  const sv = window.__spaceVikings;
  const out = [];
  for (let r = 0; r < n; r++) {
    const c = document.createElement('canvas');
    c.width = 560; c.height = 384;
    const h = new sv.Hires(c);
    h.hgr();
    sv.drawPlayerDeathBackground(h);
    const white = Array.from(h.snapshot().on).reduce((a, b) => a + b, 0);
    sv.drawExBurst(h, Math.random, 0);
    sv.drawPlayerDeathMessage(h);
    out.push({ on: Array.from(h.snapshot().on), white });
  }
  return out;
}, { n: 12 });
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

const lit = (on) => { let n = 0; for (let i = 0; i < on.length; i++) if (on[i]) n++; return n; };
console.log('line 5 leaves the page solid white:');
console.log(`  port fill: ${runs[0].white} of ${HGR_W * HGR_H}`);
console.log(`  the machine went 3,909 -> 16,872 -> 53,760 as it filled`);

const diskLit = lit(diskOn);
const counts = runs.map((r) => lit(Uint8Array.from(r.on))).sort((a, b) => a - b);
console.log('');
console.log('the finished screen - white page, black burst, black message:');
console.log(`  disk ${diskLit} lit`);
console.log(`  port over ${counts.length} runs: ${counts[0]} to ${counts[counts.length - 1]}, median ${counts[counts.length >> 1]}`);
console.log(`  the disk's count is ${diskLit >= counts[0] && diskLit <= counts[counts.length - 1] ? 'inside' : 'OUTSIDE'} the port's range`);

// The message is black on white, so compare its cells by how dark they are.
const rowDark = (on, row) => {
  let n = 0;
  for (let y = row * 8; y < row * 8 + 8; y++) for (let x = 0; x < HGR_W; x++) if (!on[y * HGR_W + x]) n++;
  return n;
};
console.log('');
console.log('line 40 prints at VTAB 22, HTAB 5 - 0-based row 21, column 4:');
for (const r of [20, 21, 22]) {
  console.log(`  row ${r}: disk ${String(rowDark(diskOn, r)).padStart(4)} dark pixels, ` +
    `port ${String(rowDark(Uint8Array.from(runs[0].on), r)).padStart(4)}`);
}

let minX = HGR_W, maxX = -1, minY = HGR_H, maxY = -1;
for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) {
  if (diskOn[y * HGR_W + x]) continue;
  if (x < minX) minX = x; if (x > maxX) maxX = x;
  if (y < minY) minY = y; if (y > maxY) maxY = y;
}
console.log('');
console.log(`the dark area on the disk spans x ${minX}-${maxX}, y ${minY}-${maxY}`);

fs.mkdirSync('captured/sx', { recursive: true });
fs.writeFileSync('captured/sx/port.png', toPng(Uint8Array.from(runs[0].on)));
console.log('wrote captured/sx/port.png');

// The burst is RND-driven - line 20 again - so the lit count is a range, and what has to be
// exact is the message: line 40 prints at VTAB 22, and the rows either side of it stay solid
// white on both.
console.log('');
const dark = (row) => rowDark(Uint8Array.from(runs[0].on), row);
const sxOk = diskLit >= counts[0] && diskLit <= counts[counts.length - 1]
  && dark(21) === rowDark(diskOn, 21) && dark(20) === 0 && dark(22) === 0;
console.log(sxOk ? "sx parity: the count is in range and line 40's row is exact"
  : `sx parity: disk ${diskLit} against ${counts[0]}-${counts[counts.length - 1]}, `
    + `row 21 dark ${dark(21)} against ${rowDark(diskOn, 21)}`);
process.exit(sxOk && errors.length === 0 ? 0 : 1);
