// The galaxy map with a star picked, against the machine's own page.
//
// `galaxymap_parity.mjs` covers the map and the cursor's two draws. This covers what happens
// after 3130's button: 3210's black DRAW, 3230's hit test, and 3250/3320/3260's three lines of
// readout - the only state-dependent part of the page, and the part nothing was checking.
//
// `probe_mappick.mjs` put the paddle cursor exactly on a star, pressed the button and captured
// the page; the twenty stars' X, Y, Z and secured bytes came off the machine with it, so the
// port draws from the same numbers rather than from its own state.
import { chromium } from 'playwright';
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/mappick/golden.json', 'utf8'));
const tableJson = JSON.parse(fs.readFileSync('../public/data/shapes/shape-table.json', 'utf8'));

const disk = new Uint8Array(HGR_W * HGR_H);
for (const [x, y] of golden.points) disk[y * HGR_W + x] = 1;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.drawStarPick),
  null, { timeout: 30000 });

const shot = await page.evaluate(({ g, tj }) => {
  const sv = window.__spaceVikings;
  const shapes = sv.decodeShapeTableJson(tj);
  const c = document.createElement('canvas');
  c.width = 560; c.height = 384;
  const h = new sv.Hires(c);
  h.hgr();
  const d = { stars: g.stars, here: g.here };
  sv.drawGalaxyMap(h, shapes, d);
  // 3120 put the cursor up and 3210 takes it off again with a black DRAW, leaving a hole.
  sv.drawGalaxyCursor(h, shapes, g.px, g.py);
  sv.eraseGalaxyCursor3210(h, shapes, g.px, g.py);
  const p = sv.starUnderCursor(d.stars, g.px, g.py);
  if (p !== g.pick) return { on: null, p };
  sv.drawStarPick(h, d, p);
  return { on: Array.from(h.snapshot().on), p };
}, { g: golden, tj: tableJson });
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

if (!shot.on) {
  console.log(`the port's 3230 picked star ${shot.p}, the machine's picked ${golden.pick}`);
  process.exit(1);
}
console.log(`3230 on both sides picks star ${shot.p} at PX ${golden.px}, PY ${golden.py}`);

const port = Uint8Array.from(shot.on);
let diff = 0, onlyDisk = 0, onlyPort = 0, diskLit = 0, portLit = 0;
const perRow = new Uint16Array(HGR_H);
for (let k = 0; k < disk.length; k++) {
  if (disk[k]) diskLit++;
  if (port[k]) portLit++;
  if (disk[k] && !port[k]) { onlyDisk++; diff++; perRow[(k / HGR_W) | 0]++; }
  else if (!disk[k] && port[k]) { onlyPort++; diff++; perRow[(k / HGR_W) | 0]++; }
}
console.log(`  disk ${diskLit} lit, port ${portLit} lit`);
console.log(`  ${diff} of ${HGR_W * HGR_H} differ  (${onlyDisk} disk only, ${onlyPort} port only)`);
const rows = [...perRow.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
if (rows.length) console.log(`  ${rows.length} rows differ; worst: ` + rows.slice(0, 8).map(([y, n]) => `${y}(${n})`).join(' '));

fs.mkdirSync('captured/mappick', { recursive: true });
fs.writeFileSync('captured/mappick/port.png', toPng(port));
const mask = new Uint8Array(disk.length);
for (let k = 0; k < mask.length; k++) mask[k] = (disk[k] ? 1 : 0) !== (port[k] ? 1 : 0) ? 1 : 0;
fs.writeFileSync('captured/mappick/diff.png', toPng(mask));
console.log('');
console.log(diff === 0 ? 'map pick parity: clean' : `map pick parity: ${diff} pixels differ`);
process.exit(diff === 0 ? 0 : 1);
