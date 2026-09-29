// The port's GALAXY MAP against the original's.
//
// captured/galaxymap/golden.json is the original, reached from flight by C, 1, 3, with the
// paddle cursor separated out: the map is static and line 3120/3200's XDRAW toggles, so a
// pixel lit in every sample is map and a pixel that ever goes dark is cursor.
//
// drawGalaxyMap() is pure and calls hgr() itself - GALAXY MAP owns the whole page, unlike
// COM and STATUS, which leave the instrument panel standing underneath.
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/galaxymap/golden.json', 'utf8'));
const tableJson = JSON.parse(fs.readFileSync('../public/data/shapes/shape-table.json', 'utf8'));

const data = {
  stars: golden.planets.map((p) => ({ x: p.x, y: p.y, z: p.z, secured: p.secured })),
  here: golden.here,
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.drawGalaxyMap), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose drawGalaxyMap - is the dev server running at ' + PORT_URL + '?'); });

const shot = await page.evaluate(({ d, tj }) => {
  const sv = window.__spaceVikings;
  const shapes = sv.decodeShapeTableJson(tj);
  const c = document.createElement('canvas');
  c.width = 560; c.height = 384;
  const h = new sv.Hires(c);
  sv.drawGalaxyMap(h, shapes, d);
  return Array.from(h.snapshot().on);
}, { d: data, tj: tableJson });
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

const diskOn = new Uint8Array(HGR_W * HGR_H);
for (const [x, y] of golden.map.points) diskOn[y * HGR_W + x] = 1;
const portOn = Uint8Array.from(shot);

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
console.log(`disk: ${diskLit} lit, x ${golden.map.bounds.minX}-${golden.map.bounds.maxX}, y ${golden.map.bounds.minY}-${golden.map.bounds.maxY}`);
console.log(`port: ${portLit} lit, ${both} in both`);
console.log(`differing: ${differing} of ${diskOn.length}  (${(100 * (1 - differing / diskOn.length)).toFixed(3)}% agree)`);
console.log(`  ${onlyDisk} on the disk only, ${onlyPort} in the port only`);
console.log(`  (the paddle cursor is ${golden.cursor.pixels} pixels at PX ${golden.cursor.px}, PY ${golden.cursor.py} and is not in either)`);

const rows = [...perRow.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
if (rows.length) {
  console.log(`\n${rows.length} rows differ; worst:`);
  for (const [y, n] of rows.slice(0, 8)) {
    const strip = (arr) => {
      const xs = [];
      for (let x = 0; x < HGR_W; x++) if (arr[y * HGR_W + x]) xs.push(x);
      return xs.length > 24 ? `${xs.length} lit` : xs.join(',');
    };
    console.log(`  row ${String(y).padStart(3)}  ${String(n).padStart(3)} px`);
    console.log(`       disk ${strip(diskOn)}`);
    console.log(`       port ${strip(portOn)}`);
  }
}

fs.mkdirSync('captured/galaxymap', { recursive: true });
fs.writeFileSync('captured/galaxymap/port.png', toPng(portOn));
const diff = new Uint8Array(diskOn.length);
for (let k = 0; k < diff.length; k++) diff[k] = diskOn[k] === portOn[k] ? 0 : 1;
fs.writeFileSync('captured/galaxymap/diff.png', toPng(diff, { colour: [255, 0, 0] }));
console.log('\nwrote captured/galaxymap/port.png and diff.png');

// The paddle cursor, line 3120's XDRAW 12 at PX,PY. The probe separates it out by sampling,
// so its pixels are known exactly and can be checked on their own.
if (golden.cursor.points) {
  const browser2 = await chromium.launch({ headless: true });
  const page2 = await browser2.newPage();
  await page2.goto(PORT_URL, { waitUntil: 'load' });
  await page2.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.drawGalaxyCursor), null, { timeout: 30000 });
  const cur = await page2.evaluate(({ tj, px, py }) => {
    const sv = window.__spaceVikings;
    const shapes = sv.decodeShapeTableJson(tj);
    const c = document.createElement('canvas');
    c.width = 560; c.height = 384;
    const h = new sv.Hires(c);
    h.hgr();
    sv.drawGalaxyCursor(h, shapes, px, py);
    return Array.from(h.snapshot().on);
  }, { tj: tableJson, px: golden.cursor.px, py: golden.cursor.py });
  await browser2.close();

  const want = new Set(golden.cursor.points.map(([x, y]) => `${x},${y}`));
  const got = new Set();
  for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) if (cur[y * HGR_W + x]) got.add(`${x},${y}`);
  const missing = [...want].filter((k) => !got.has(k));
  const extra = [...got].filter((k) => !want.has(k));
  console.log('');
  console.log(`the cursor at PX ${golden.cursor.px}, PY ${golden.cursor.py}:`);
  console.log(`  disk ${want.size} pixels, port ${got.size}, ${missing.length} missing, ${extra.length} extra`);
  if (missing.length) console.log(`    missing: ${missing.join(' ')}`);
  if (extra.length) console.log(`    extra:   ${extra.join(' ')}`);
}
