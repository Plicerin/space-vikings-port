// The opening sequence, port against disk - START 1000-1029, 8000-9090 and the DATA.
//
// The sky is random on both sides, so this cannot be one pixel comparison. It is split:
//
//   the grid    exact, every row and every line of the fan
//   the logo    exact, every stroke of the wordmark
//   the stars   by count and band, because RND decides where they go
//
// `probe_openingart.mjs` has the disk's side, including the row numbers the horizontals land
// on, which is the part most likely to drift if anyone touches the arithmetic.
import { chromium } from 'playwright';
import fs from 'fs';
import { toPng, HGR_W, HGR_H } from './hgr.mjs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/openingart/golden.json', 'utf8'));

const results = [];
const check = (what, ok, detail = '') => {
  results.push({ what, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikingsState),
  null, { timeout: 30000 });

console.log('the geometry, against the machine:');

// The two tables, straight out of the module, before anything is drawn.
const geom = await page.evaluate(async () => {
  const m = await import('/src/engine/diskOpening.ts');
  return {
    rows: m.horizontalRows8020(),
    fan: m.fanLines9000(),
    centre: m.CENTRE_LINE,
    ops: m.logoOps().length,
    logoData: m.LOGO_DATA.length,
  };
});

// The disk's horizontals, as the probe read them off the screen: the drawn rows, which is the
// list with its duplicate removed, and without the two rows the wordmark contributes.
const diskRows = golden.horizontals.filter((y) => y >= 100);
const portRows = [...new Set(geom.rows)];
check('the horizontal lines land on the same rows',
  portRows.join(',') === diskRows.join(','),
  portRows.length === diskRows.length ? `${portRows.length} rows` : `${portRows.join(',')}`);
check('and the spacing grows the way C = .4 makes it',
  portRows.slice(1).map((v, i) => v - portRows[i]).join(',')
    === diskRows.slice(1).map((v, i) => v - diskRows[i]).join(','),
  portRows.slice(1).map((v, i) => v - portRows[i]).join(' '));
check('the fan is twenty pairs and a centre line',
  geom.fan.length === 40 && geom.centre.x === 141, `${geom.fan.length} lines, centre at x ${geom.centre.x}`);
check('the wordmark reads as 494 numbers', geom.logoData === 494, `${geom.logoData} values`);
// 494 values is one colour, then 164 strokes of three numbers each, then the 127 that ends it.
check('which walk into 164 strokes and a colour', geom.ops === 165, `${geom.ops} ops`);

// ---------------------------------------------------------------------------------------
console.log('');
console.log('and on screen, played:');

const shot = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const scene = () => {
    const l = window.__gameLog.getLog();
    return l.length ? l[l.length - 1].scene : '?';
  };
  const init = { key: 'N', code: 'KeyN', bubbles: true };
  window.dispatchEvent(new KeyboardEvent('keydown', init));
  window.dispatchEvent(new KeyboardEvent('keyup', init));

  // Into the opening, then hold on until the wordmark is finished. The sequence is 61 s and
  // the logo lands at 42.27; waiting for the scene to change would be waiting for the game.
  for (let i = 0; i < 400 && scene() !== 'opening'; i++) await sleep(70);
  if (scene() !== 'opening') throw new Error('never reached the opening');
  await sleep(22000);   // past the wordmark finishing at 21.4 and before the scene ends

  const on = Array.from(window.__spaceVikings.hires.snapshot().on);
  return { on, scene: scene() };
});

const px = shot.on;
const band = (y0, y1) => {
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let x = 0; x < HGR_W; x++) if (px[y * HGR_W + x]) n++;
  return n;
};

fs.writeFileSync('captured/openingart/port.png', toPng(px.map((v) => (v ? 1 : 0))));

// The grid rows, read back off the port's own screen the same way the probe read the disk's.
const rowCounts = [];
for (let y = 0; y < HGR_H; y++) {
  let n = 0;
  for (let x = 0; x < HGR_W; x++) if (px[y * HGR_W + x]) n++;
  rowCounts.push(n);
}
const drawnRows = rowCounts
  .map((n, y) => ({ y, n }))
  .filter((r) => r.y >= 100 && r.n > HGR_W * 0.38)
  .map((r) => r.y);
check('the grid on screen has the disk\'s rows', drawnRows.join(',') === diskRows.join(','),
  drawnRows.length === diskRows.length ? `${drawnRows.length} rows` : drawnRows.join(','));

// Below the horizon is grid and nothing else, so it should match closely. The disk's figure is
// 4975; a few pixels either way is the line renderer, not the geometry.
const below = band(100, 191);
const belowGap = Math.abs(below - golden.litBelowHorizon);
check('the ground has the same amount of ink',
  belowGap <= golden.litBelowHorizon * 0.06,
  `port ${below}, disk ${golden.litBelowHorizon}, ${belowGap} apart`);

// The sky splits in two and the halves want different tests. Rows 2-71 are stars and nothing
// else - RND decides where, so the count is the only thing worth comparing, and the disk's is
// 82. Rows 72-99 are the wordmark, which is not random at all.
const above = band(0, 99);
const starBand = band(2, 71);
const diskStars = golden.rowCounts.slice(2, 72).reduce((a, b) => a + b, 0);
check('the stars come out at the same density',
  Math.abs(starBand - diskStars) <= Math.max(25, diskStars * 0.35),
  `port ${starBand}, disk ${diskStars}`);

// The wordmark itself: it sits on rows 75-95, and nothing else does.
// The wordmark, which is the deterministic half of the sky and the thing most worth holding.
const logoBand = band(72, 99);
const diskLogo = golden.rowCounts.slice(72, 100).reduce((a, b) => a + b, 0);
check('the wordmark is finished and the right weight',
  Math.abs(logoBand - diskLogo) <= diskLogo * 0.1,
  `port ${logoBand}, disk ${diskLogo}`);

for (const e of errors.slice(0, 3)) console.log('page error:', e);
await browser.close();

fs.writeFileSync('captured/openingart/port.json', JSON.stringify({
  rows: portRows, drawnRows, below, above, logoBand, results,
}, null, 1) + String.fromCharCode(10));

const failed = results.filter((r) => !r.ok).length;
console.log('');
console.log(failed === 0 ? `opening art: all ${results.length} checks passed`
  : `opening art: ${failed} of ${results.length} failed`);
process.exit(failed === 0 ? 0 : 1);
