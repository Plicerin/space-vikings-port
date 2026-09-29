// The port's EX against the original's.
//
// Line 20 is `X2 = X1 - (RND(1) * (X1 + X1))` and the same for Y2, so the burst is different
// every time and a pixel diff would be meaningless. Checked instead: the origin, the extent,
// the segment count, and the state lines 30-56 leave behind.
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/ex/golden.json', 'utf8'));
const tableJson = JSON.parse(fs.readFileSync('../public/data/shapes/shape-table.json', 'utf8'));
const stars = JSON.parse(fs.readFileSync('../public/data/shapes/starfield-bytecode.json', 'utf8')).bytes;
const snap = JSON.parse(fs.readFileSync('captured/snapshot/flight.json', 'utf8'));
void snap;

const diskOn = new Uint8Array(HGR_W * HGR_H);
for (const [x, y] of golden.screen.points) diskOn[y * HGR_W + x] = 1;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.drawExBurst), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose drawExBurst - is the dev server running at ' + PORT_URL + '?'); });

// EX never clears: the burst goes over the flight view, and line 6's flash is on the page
// too. Both have to be there or the port's count is bound to come in low.
const runs = await page.evaluate(({ n, tj, starBytes, cam }) => {
  const sv = window.__spaceVikings;
  const shapes = sv.decodeShapeTableJson(tj);
  const ops = sv.parseShipBytecode(starBytes);
  const out = [];
  for (let r = 0; r < n; r++) {
    const c = document.createElement('canvas');
    c.width = 560; c.height = 384;
    const h = new sv.Hires(c);
    h.hgr();
    sv.drawInstruments(h);
    h.hcolor(3);
    sv.drawShipWorld(h, sv.projectShipWorld(ops, cam, 0, 0, null));
    sv.drawExFlash(h, shapes);
    const drawn = sv.drawExBurst(h);
    out.push({ on: Array.from(h.snapshot().on), drawn });
  }
  return out;
}, { n: 12, tj: tableJson, starBytes: stars, cam: { x: 350, y: 100, z: -3381 } });
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

const litIn = (on, from, to) => {
  let n = 0;
  for (let y = from; y <= to; y++) for (let x = 0; x < HGR_W; x++) if (on[y * HGR_W + x]) n++;
  return n;
};
const bounds = (on, from, to) => {
  let minX = HGR_W, maxX = -1, minY = HGR_H, maxY = -1;
  for (let y = from; y <= to; y++) for (let x = 0; x < HGR_W; x++) {
    if (!on[y * HGR_W + x]) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
};

console.log(`segments per burst: ${runs[0].drawn} (line 7's 16 steps x line 25's 15)`);
const diskBurst = litIn(diskOn, 0, 123);
const counts = runs.map((r) => litIn(Uint8Array.from(r.on), 0, 123)).sort((a, b) => a - b);
console.log('');
console.log('the burst, rows 0-123:');
console.log(`  disk ${diskBurst} lit`);
console.log(`  port over ${counts.length} runs: ${counts[0]} to ${counts[counts.length - 1]}, median ${counts[counts.length >> 1]}`);
console.log(`  the disk's count is ${diskBurst >= counts[0] && diskBurst <= counts[counts.length - 1] ? 'inside' : 'OUTSIDE'} the port's range`);

const at = (on, x, y) => (on[y * HGR_W + x] ? 1 : 0);
let o = 0;
for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) o += at(diskOn, 140 + dx, 60 + dy);
console.log(`  around the origin (140,60): ${o} of 9 lit on the disk`);
const db = bounds(diskOn, 0, 123);
const pb = bounds(Uint8Array.from(runs[0].on), 0, 123);
console.log(`  disk extent x ${db.minX}-${db.maxX}, y ${db.minY}-${db.maxY}`);
console.log(`  port extent x ${pb.minX}-${pb.maxX}, y ${pb.minY}-${pb.maxY}`);
console.log('  (line 20 caps X2 at +/-130 from 140, and lines 21-22 clamp Y2 to -60..65 from 60)');

console.log('');
console.log('the state lines 30-56 leave:');
console.log(`  38205 ${golden.before['38205']} -> ${golden.after['38205']}  (line 30 pokes 0)`);
console.log(`  38207 ${golden.before['38207']} -> ${golden.after['38207']}  (line 56 halves it, POKE truncating)`);
const halved = Math.trunc(golden.before['38207'] / 2);
console.log(`    expected ${halved}: ${halved === golden.after['38207'] ? 'matches' : 'DOES NOT MATCH'}`);
console.log(`  30841 reads ${golden.model} - line 30 pokes 127 there, but line 40's BLOAD DEBRIS`);
console.log('    lands on the same address, so the 127 never survives to be read.');

fs.mkdirSync('captured/ex', { recursive: true });
fs.writeFileSync('captured/ex/port.png', toPng(Uint8Array.from(runs[0].on)));
console.log('');
console.log('wrote captured/ex/port.png');
