// The port's RADAR against the original's.
//
// RADAR is two things on one page and they have to be scored separately. The reticle is
// plain HPLOT line work from lines 2005-2042 and should be exact. Behind it is whatever
// CALL 24576 drew from the borrowed camera - the flight renderer, which the port
// reimplements in floating point and which star_parity puts at 38.9% exact and 91.7% within
// a pixel. Averaging the two would hide both.
//
// So: the reticle is compared on its own pixels, and the rest of the page is reported as the
// renderer's, with a within-one-pixel figure as well as an exact one.
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/radar/golden.json', 'utf8'));
const stars = JSON.parse(fs.readFileSync('../public/data/shapes/starfield-bytecode.json', 'utf8')).bytes;

// Line 2000's camera. X, Z and heading are flight's, read while RADAR held at the GET -
// RADAR never writes them - and Y and the pitch are the ones line 2000 forces.
const cam = {
  camera: { x: golden.during.x, y: 20000, z: golden.during.z },
  heading: golden.during.heading,
  pitch: 63,
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.drawRadarScreen), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose drawRadarScreen - is the dev server running at ' + PORT_URL + '?'); });

const shots = await page.evaluate(({ bytes, c }) => {
  const sv = window.__spaceVikings;
  const mk = () => {
    const el = document.createElement('canvas');
    el.width = 560; el.height = 384;
    const h = new sv.Hires(el);
    h.hgr();
    return h;
  };
  const overlayOnly = mk();
  sv.drawRadarOverlay(overlayOnly);
  const full = mk();
  sv.drawInstruments(full);
  sv.drawRadarScreen(full, sv.parseShipBytecode(bytes), c);
  return { overlay: Array.from(overlayOnly.snapshot().on), full: Array.from(full.snapshot().on) };
}, { bytes: stars, c: cam });
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

const diskOn = new Uint8Array(HGR_W * HGR_H);
for (const [x, y] of golden.screen.points) diskOn[y * HGR_W + x] = 1;
const overlayOn = Uint8Array.from(shots.overlay);
const fullOn = Uint8Array.from(shots.full);

console.log(`camera: X=${cam.camera.x} Y=${cam.camera.y} Z=${cam.camera.z} heading=${cam.heading} pitch=${cam.pitch}`);
console.log('');

// 1. The reticle, on its own pixels.
let want = 0, have = 0;
for (let k = 0; k < overlayOn.length; k++) {
  if (!overlayOn[k]) continue;
  want++;
  if (diskOn[k]) have++;
}
console.log('the reticle - lines 2005, 2032, 2033, 2040, 2042:');
console.log(`  the port plots ${want} pixels; ${have} of them are lit on the disk too  (${(100 * have / want).toFixed(2)}%)`);
if (have < want) {
  const miss = [];
  for (let k = 0; k < overlayOn.length && miss.length < 12; k++) {
    if (overlayOn[k] && !diskOn[k]) miss.push(`${k % HGR_W},${(k / HGR_W) | 0}`);
  }
  console.log(`    first misses: ${miss.join(' ')}`);
}

// And the other way round: disk pixels in the reticle's rows that the port does not plot
// are the renderer's, not the reticle's, so this is only a sanity check on the count.
console.log('');

// 2. The page as a whole, rows 0-123 (RADAR does not touch the panel).
const near = (arr, x, y) => {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || nx >= HGR_W || ny < 0 || ny >= HGR_H) continue;
    if (arr[ny * HGR_W + nx]) return true;
  }
  return false;
};
let diskLit = 0, portLit = 0, both = 0, diskNear = 0;
for (let y = 0; y <= 123; y++) for (let x = 0; x < HGR_W; x++) {
  const k = y * HGR_W + x;
  if (diskOn[k]) {
    diskLit++;
    if (fullOn[k]) both++;
    if (near(fullOn, x, y)) diskNear++;
  }
  if (fullOn[k]) portLit++;
}
console.log('the whole view, rows 0-123 - reticle and everything CALL 24576 drew:');
console.log(`  disk ${diskLit} lit, port ${portLit} lit, ${both} on the same pixel  (${(100 * both / diskLit).toFixed(1)}% exact)`);
console.log(`  ${diskNear} of the disk's pixels have a port pixel within one  (${(100 * diskNear / diskLit).toFixed(1)}%)`);

// 3. The panel below, which RADAR leaves alone.
let pd = 0, pp = 0, pdiff = 0;
for (let y = 124; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) {
  const k = y * HGR_W + x;
  if (diskOn[k]) pd++;
  if (fullOn[k]) pp++;
  if (diskOn[k] !== fullOn[k]) pdiff++;
}
console.log('');
console.log(`the panel below, rows 124-191: disk ${pd} lit, port ${pp} lit, ${pdiff} differ`);

fs.mkdirSync('captured/radar', { recursive: true });
fs.writeFileSync('captured/radar/port.png', toPng(fullOn));
const diff = new Uint8Array(diskOn.length);
for (let k = 0; k < diff.length; k++) diff[k] = diskOn[k] === fullOn[k] ? 0 : 1;
fs.writeFileSync('captured/radar/diff.png', toPng(diff, { colour: [255, 0, 0] }));
console.log('');
console.log('wrote captured/radar/port.png and diff.png');
