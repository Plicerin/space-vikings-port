// The port's H/D jump against the original's.
//
// Line 20 draws 175 lines from (140,63) to `RND(1) * 279, RND(1) * 125`, so no two runs of
// the original agree with each other either and a pixel diff would be meaningless. What can
// be checked is everything that is not the random part:
//
//   - the origin is lit
//   - the streaks stay inside rows 0-125, and line 17's clear leaves 126-127 black
//   - the panel below is untouched
//   - the lit count falls in the range the port's own runs produce
//
// The jump's arithmetic is checked separately and exactly: the capture went from 63 energy
// to 51, and INT(SQR(3 * (22 - 15) ^ 2) + .6) is 12.
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/hd/golden.json', 'utf8'));
const galaxy = JSON.parse(fs.readFileSync('captured/galaxymap/golden.json', 'utf8'));

const diskOn = new Uint8Array(HGR_W * HGR_H);
for (const [x, y] of golden.screen.points) diskOn[y * HGR_W + x] = 1;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.Hires), null, { timeout: 30000 });

// Draw the streaks the way hyperdrive.ts does, without running the scene.
const runs = await page.evaluate(({ origin, count, n }) => {
  const sv = window.__spaceVikings;
  const out = [];
  for (let r = 0; r < n; r++) {
    const c = document.createElement('canvas');
    c.width = 560; c.height = 384;
    const h = new sv.Hires(c);
    h.hgr();
    sv.drawInstruments(h);
    h.hcolor(1);
    for (let row = 1; row <= 16; row++) h.text(' '.repeat(40), 1, row);
    h.hcolor(3);
    for (let i = 0; i < count; i++) {
      h.line(origin.x, origin.y, Math.floor(Math.random() * 279), Math.floor(Math.random() * 125));
    }
    out.push(Array.from(h.snapshot().on));
  }
  return out;
}, { origin: { x: 140, y: 63 }, count: 175, n: 12 });
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

const litIn = (on, from, to) => {
  let n = 0;
  for (let y = from; y <= to; y++) for (let x = 0; x < HGR_W; x++) if (on[y * HGR_W + x]) n++;
  return n;
};

const diskStreaks = litIn(diskOn, 0, 125);
const counts = runs.map((r) => litIn(Uint8Array.from(r), 0, 125)).sort((a, b) => a - b);
console.log('the streaks, rows 0-125:');
console.log(`  disk ${diskStreaks} lit`);
console.log(`  port over ${counts.length} runs: ${counts[0]} to ${counts[counts.length - 1]}, ` +
  `median ${counts[counts.length >> 1]}`);
const inRange = diskStreaks >= counts[0] && diskStreaks <= counts[counts.length - 1];
console.log(`  the disk's count is ${inRange ? 'inside' : 'OUTSIDE'} the port's range`);

const at = (on, x, y) => (on[y * HGR_W + x] ? 1 : 0);
let o = 0;
for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) o += at(diskOn, 140 + dx, 63 + dy);
console.log(`  around the origin (140,63): ${o} of 9 lit on the disk`);

console.log('');
console.log('line 17 clears rows 0-15 (y 0-127) and line 20 only reaches y 125:');
console.log(`  disk rows 126-127: ${litIn(diskOn, 126, 127)} lit`);
console.log(`  port rows 126-127: ${litIn(Uint8Array.from(runs[0]), 126, 127)} lit`);

console.log('');
const diskPanel = litIn(diskOn, 128, HGR_H - 1);
const portPanel = litIn(Uint8Array.from(runs[0]), 128, HGR_H - 1);
console.log(`the panel below, rows 128-191: disk ${diskPanel} lit, port ${portPanel} lit`);

// The arithmetic, exactly.
console.log('');
const X = (p) => galaxy.planets[p - 1].x;
const d1 = Math.floor(Math.sqrt(3 * (X(golden.after.planet) - X(golden.before.planet)) ** 2) + 0.6);
console.log('the jump itself:');
console.log(`  planet ${golden.before.planet} -> ${golden.after.planet}, ` +
  `X ${X(golden.before.planet)} -> ${X(golden.after.planet)}`);
console.log(`  D1 = INT(SQR(3 * dX^2) + .6) = ${d1}`);
console.log(`  energy ${golden.before.energy} -> ${golden.after.energy}, a cost of ` +
  `${golden.before.energy - golden.after.energy}` +
  (golden.before.energy - golden.after.energy === d1 ? '  - matches' : '  - DOES NOT MATCH'));
console.log(`  Z = ${golden.after.z}, |Z| ${Math.abs(golden.after.z) >= 7000 ? '>=' : '<'} 7000 (line 70 retries until it is)`);
console.log(`  pitch ${golden.after.pitch}, bank ${golden.after.bank}, heading ${golden.after.heading}`);
console.log(`  38240 + ${golden.destination} (visited) = ${golden.visited}`);

fs.mkdirSync('captured/hd', { recursive: true });
fs.writeFileSync('captured/hd/port.png', toPng(Uint8Array.from(runs[0])));
console.log('');
console.log('wrote captured/hd/port.png');
