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
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.drawComMainScreen && window.__spaceVikings.drawPanelNeedles), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose drawComMainScreen/drawPanelNeedles - is the dev server running at ' + PORT_URL + '?'); });

const tableJson = JSON.parse(fs.readFileSync('../public/data/shapes/shape-table.json', 'utf8'));

// The sequence the disk performs, not a shortcut for it. COM is reached from flight, so the
// page already carries INSTRUMENTS' panel (lines 10-200), the lamps line 210's CALL 38402
// draws, and the four needles STARSHIP SIMULATOR line 180 redraws every pass of the main
// loop. COM then wipes two of those needles itself, on line 8, before it draws anything.
//
// The needle state is the flight snapshot's: bank 0, pitch 0, S = PEEK(38157) = 0 and
// E = PEEK(38199) = 63, so TX = 140, VY = 167, SX = 13 and EX = 262.
const snap = await page.evaluate((tj) => {
  const { Hires, drawComMainScreen, drawInstruments, drawPanelNeedles, decodeShapeTableJson } = window.__spaceVikings;
  const shapes = decodeShapeTableJson(tj);
  const c = document.createElement('canvas');
  c.width = 560; c.height = 384;
  const h = new Hires(c);
  h.hgr();
  drawInstruments(h);
  drawPanelNeedles(h, shapes, { bank: 0, pitch: 0, speed: 0, energy: 63 });
  drawComMainScreen(h, undefined, shapes);
  return Array.from(h.snapshot().on);
}, tableJson);
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
console.log(`  both leave the panel standing - lamps, needles and all.`);
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
// Hoisted so the verdict at the end can see it: the broken-ship page is compared inside a block.
let diff2 = 0;
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

// The broken-ship state, which is what tells inverse video apart from a skipped draw.
// captured/com/readouts.json holds COM as the machine drew it with the computer, shields
// and laser zeroed and the energy at 9.
if (fs.existsSync('captured/com/readouts.json')) {
  const ro = JSON.parse(fs.readFileSync('captured/com/readouts.json', 'utf8'));
  const browser2 = await chromium.launch({ headless: true });
  const page2 = await browser2.newPage();
  await page2.goto(PORT_URL, { waitUntil: 'load' });
  await page2.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.drawComMainScreen), null, { timeout: 30000 });
  const brokenShot = await page2.evaluate(({ bytes, tj }) => {
    const sv = window.__spaceVikings;
    const shapes = sv.decodeShapeTableJson(tj);
    const c = document.createElement('canvas');
    c.width = 560; c.height = 384;
    const h = new sv.Hires(c);
    h.hgr();
    sv.drawInstruments(h);
    sv.drawPanelNeedles(h, shapes, { bank: 0, pitch: 0, speed: 0, energy: bytes['38199'] });
    sv.drawComMainScreen(h, bytes, shapes);
    return Array.from(h.snapshot().on);
  }, { bytes: ro.broken.bytes, tj: tableJson });
  await browser2.close();

  const bDisk = new Uint8Array(HGR_W * HGR_H);
  for (const [x, y] of ro.broken.points) bDisk[y * HGR_W + x] = 1;
  const bPort = Uint8Array.from(brokenShot);
  let bd = 0, bp = 0;
  diff2 = 0;
  for (let y = 0; y <= COM_AREA_BOTTOM; y++) for (let x = 0; x < HGR_W; x++) {
    const k = y * HGR_W + x;
    if (bDisk[k]) bd++;
    if (bPort[k]) bp++;
    if (bDisk[k] !== bPort[k]) diff2++;
  }
  const px2 = (COM_AREA_BOTTOM + 1) * HGR_W;
  console.log('');
  console.log('with four systems broken - computer, shields and laser at 0, energy at 9:');
  console.log(`  disk ${bd} lit, port ${bp} lit`);
  console.log(`  ${diff2} of ${px2} differ  (${(100 * (1 - diff2 / px2)).toFixed(2)}% agree)`);
}

// COM's page is drawn from state and nothing in it is RND-driven, so both the fresh ship and
// the broken one have to be exact over the area COM owns.
console.log('');
const comOk = differing === 0 && diff2 === 0;
console.log(comOk ? 'com parity: both pages exact'
  : `com parity: ${differing} differ on the fresh ship, ${diff2} with four systems broken`);
process.exit(comOk && errors.length === 0 ? 0 : 1);
