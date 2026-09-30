// The flight view against the machine's, at the camera that drew it.
//
// The one screen nothing compared. `transition_parity.mjs` reports it and moves on, because two
// live flights are never at the same point - but `probe_flightview.mjs` captures the page and
// the six camera cells together, so the port can be asked for that exact frame.
//
// What is compared is rows 0 to 123: the star table, the ship model and line 156's crosshair.
// The panel below is checked by `frame_parity.mjs` and by the scene route.
import { chromium } from 'playwright';
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/flightview/golden.json', 'utf8'));
const stars = JSON.parse(fs.readFileSync('../public/data/shapes/starfield-bytecode.json', 'utf8')).bytes;
const kind = golden.shipKind === 2 ? 3 : golden.shipKind;
const ship = kind > 0
  ? JSON.parse(fs.readFileSync(`../public/data/shapes/ship-${kind}-bytecode.json`, 'utf8')).bytes
  : null;

const disk = new Uint8Array(HGR_W * HGR_H);
for (const [x, y] of golden.points) disk[y * HGR_W + x] = 1;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.projectShipWorld),
  null, { timeout: 30000 });

const shot = await page.evaluate(({ starBytes, shipBytes, cam }) => {
  const sv = window.__spaceVikings;
  const c = document.createElement('canvas');
  c.width = 560; c.height = 384;
  const h = new sv.Hires(c);
  h.hgr();
  h.hcolor(3);
  const camera = { x: cam.x, y: cam.y, z: cam.z };
  // `CALL CA` walks one display list: the star table and the ship model, both in world
  // coordinates, both with no offset.
  sv.drawShipWorld(h, sv.projectShipWorld(sv.parseShipBytecode(starBytes), camera, cam.heading, cam.pitch, null));
  if (shipBytes) {
    sv.drawShipWorld(h, sv.projectShipWorld(sv.parseShipBytecode(shipBytes), camera, cam.heading, cam.pitch, null));
  }
  return Array.from(h.snapshot().on);
}, { starBytes: stars, shipBytes: ship, cam: golden.camera });
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

const port = Uint8Array.from(shot);
// Line 156's crosshair is printed by BASIC, not drawn by the renderer, so it is scored apart:
// `POKE 973,1: VTAB 8: HTAB 18: PRINT "-";CHR$(91);"  ";CHR$(93);"-"` - text row 7, columns
// 17 to 22.
const inCrosshair = (x, y) => y >= 56 && y <= 63 && x >= 119 && x <= 160;

let diff = 0, onlyDisk = 0, onlyPort = 0, diskLit = 0, portLit = 0, crossDisk = 0;
const perRow = new Uint16Array(HGR_H);
for (let y = 0; y <= 123; y++) for (let x = 0; x < HGR_W; x++) {
  const k = y * HGR_W + x;
  if (inCrosshair(x, y)) { if (disk[k]) crossDisk++; continue; }
  if (disk[k]) diskLit++;
  if (port[k]) portLit++;
  if (disk[k] && !port[k]) { onlyDisk++; diff++; perRow[y]++; }
  else if (!disk[k] && port[k]) { onlyPort++; diff++; perRow[y]++; }
}
console.log(`camera x ${golden.camera.x} y ${golden.camera.y} z ${golden.camera.z}, ` +
  `heading ${golden.camera.heading} pitch ${golden.camera.pitch}, ship kind ${golden.shipKind}`);
console.log('');
console.log("the view, rows 0-123, less line 156 crosshair:");
console.log(`  disk ${diskLit} lit, port ${portLit} lit`);
console.log(`  ${diff} differ  (${onlyDisk} disk only, ${onlyPort} port only)`);
console.log(`  (the crosshair itself is ${crossDisk} pixels on the disk and is printed, not rendered)`);
const rows = [...perRow.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
if (rows.length) console.log(`  ${rows.length} rows differ; worst: ` + rows.slice(0, 8).map(([y, n]) => `${y}(${n})`).join(' '));

fs.mkdirSync('captured/flightview', { recursive: true });
fs.writeFileSync('captured/flightview/port.png', toPng(port));
const mask = new Uint8Array(disk.length);
for (let k = 0; k < mask.length; k++) {
  const x = k % HGR_W, y = (k / HGR_W) | 0;
  if (y > 123 || inCrosshair(x, y)) continue;
  mask[k] = (disk[k] ? 1 : 0) !== (port[k] ? 1 : 0) ? 1 : 0;
}
fs.writeFileSync('captured/flightview/diff.png', toPng(mask));
console.log('');
console.log(diff === 0 ? 'flight view parity: clean' : `flight view parity: ${diff} pixels differ`);
process.exit(diff === 0 ? 0 : 1);
