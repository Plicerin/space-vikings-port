// The port's COM command screen against the original's.
//
// captured/com/golden.json is the original, reached by pressing C in flight and settled at
// GET COM$. The port's drawComMainScreen() is pure, so it can be called on a throwaway
// Hires and diffed the same way the cockpit panel was.
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/com/golden.json', 'utf8'));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.drawComMainScreen), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose drawComMainScreen - is the dev server running at ' + PORT_URL + '?'); });

const snap = await page.evaluate(() => {
  const { Hires, drawComMainScreen, drawInstruments } = window.__spaceVikings;
  const c = document.createElement('canvas');
  c.width = 560; c.height = 384;
  const h = new Hires(c);
  h.hgr();
  // COM is reached from flight, so the instrument panel is already on the page. COM does
  // not clear it, and the original's capture still has it.
  drawInstruments(h);
  drawComMainScreen(h);
  return Array.from(h.snapshot().on);
});
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

const diskOn = new Uint8Array(HGR_W * HGR_H);
for (const [x, y] of golden.points) diskOn[y * HGR_W + x] = 1;
const portOn = Uint8Array.from(snap);

// COM only fills rows 0-123; the instrument panel below that is left over on the page from
// before COM ran, and the port's hgr() clears the whole buffer. Comparing the two regions
// separately keeps that from being confused with COM's own drawing.
const COM_AREA_BOTTOM = 123;
const region = (from, to) => {
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
  return { diskLit, portLit, both, onlyDisk, onlyPort, px, agree: 1 - (onlyDisk + onlyPort) / px };
};
const com = region(0, COM_AREA_BOTTOM);
const panel = region(COM_AREA_BOTTOM + 1, HGR_H - 1);
console.log(`COM's own area, rows 0-${COM_AREA_BOTTOM}:`);
console.log(`  disk ${com.diskLit} lit, port ${com.portLit} lit, ${com.both} in both`);
console.log(`  ${com.onlyDisk + com.onlyPort} of ${com.px} differ  (${(100 * com.agree).toFixed(2)}% agree)`);
console.log(`    ${com.onlyDisk} disk only, ${com.onlyPort} port only`);
console.log('');
console.log(`below it, rows ${COM_AREA_BOTTOM + 1}-${HGR_H - 1} - the panel COM does not touch:`);
console.log(`  disk ${panel.diskLit} lit, port ${panel.portLit} lit`);
console.log(`  ${panel.onlyDisk + panel.onlyPort} of ${panel.px} differ  (${(100 * panel.agree).toFixed(2)}% agree)`);
console.log(`  both leave the panel standing; what is left is the gauge fill CALL 38402 draws.`);
console.log('');

let both = 0, onlyDisk = 0, onlyPort = 0, diskLit = 0, portLit = 0;
const perRow = new Uint16Array(HGR_H);
for (let k = 0; k < diskOn.length; k++) {
  if (diskOn[k]) diskLit++;
  if (portOn[k]) portLit++;
  if (diskOn[k] && portOn[k]) both++;
  else if (diskOn[k]) { onlyDisk++; perRow[(k / HGR_W) | 0]++; }
  else if (portOn[k]) { onlyPort++; perRow[(k / HGR_W) | 0]++; }
}
const differing = onlyDisk + onlyPort;
console.log('whole page:');
console.log(`disk: ${diskLit} lit pixels, drawn on ${golden.drawnOn}, x ${golden.minX}-${golden.maxX}, y ${golden.minY}-${golden.maxY}`);
console.log(`port: ${portLit} lit pixels`);
console.log(`differing: ${differing} of ${diskOn.length}  (${(100 * (1 - differing / diskOn.length)).toFixed(3)}% agree)`);
console.log(`  ${onlyDisk} on the disk only, ${onlyPort} in the port only`);

const rows = [...perRow.entries()].filter(([, n]) => n > 0);
console.log(`\n${rows.length} of ${HGR_H} rows differ; worst:`);
for (const [y, n] of rows.sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  const strip = (arr) => Array.from(arr.slice(y * HGR_W + 1, y * HGR_W + 49)).join('');
  console.log(`  row ${String(y).padStart(3)}  ${String(n).padStart(3)} px`);
  console.log(`       disk x1-48 ${strip(diskOn)}`);
  console.log(`       port x1-48 ${strip(portOn)}`);
}

fs.mkdirSync('captured/com', { recursive: true });
fs.writeFileSync('captured/com/port.png', toPng(portOn));
const diff = new Uint8Array(diskOn.length);
for (let k = 0; k < diff.length; k++) diff[k] = diskOn[k] === portOn[k] ? 0 : 1;
fs.writeFileSync('captured/com/diff.png', toPng(diff, { colour: [255, 0, 0] }));
console.log('\nwrote captured/com/port.png and diff.png');
