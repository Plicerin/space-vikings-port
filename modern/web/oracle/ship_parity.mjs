// The port's ship rendering against the original's, pixel for pixel.
//
// captured/ship/golden.json holds ship-only renders taken from the original renderer, by
// replaying a flight snapshot and differencing each frame against the same frame with an
// empty model at $7879.
//
// The comparison is split in two, because the port is not attempting the same thing as the
// disk and one number would hide that:
//
//   PLACEMENT - where and how big the ship is on screen. The disk projects world
//   coordinates, so range and heading decide this. The port's projectShipBytecode() centres
//   the model on its own bounds and then rescales to a span the caller picks, so it cannot
//   place anything; the caller does. This reports the gap.
//
//   SHAPE - given the disk's own bounding box handed to the port as its desired span and
//   centre, do the pixels agree? That asks whether the model is being drawn correctly,
//   separately from where it is put.
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/ship/golden.json', 'utf8'));
const states = golden.states.filter((s) => s.lit > 0);
const shipBytes = JSON.parse(fs.readFileSync('../public/data/shapes/ship-3-bytecode.json', 'utf8')).bytes;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.projectShipBytecode), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose projectShipBytecode - is the dev server running at ' + PORT_URL + '?'); });

// Draw each state with the port, given the disk's own centre and span.
const rendered = await page.evaluate(({ bytes, jobs }) => {
  const { Hires, parseShipBytecode, projectShipBytecode, drawShipWireframe,
    COCKPIT_SHIP_WIREFRAME_VIEW } = window.__spaceVikings;
  const ops = parseShipBytecode(bytes);
  return jobs.map((j) => {
    const c = document.createElement('canvas');
    c.width = 560; c.height = 384;
    const h = new Hires(c);
    h.hgr();
    h.hcolor(3);
    const proj = projectShipBytecode(ops, j.span, COCKPIT_SHIP_WIREFRAME_VIEW);
    if (!proj) return { on: null };
    drawShipWireframe(h, proj, j.cx, j.cy);
    return { on: Array.from(h.snapshot().on), segments: proj.segments.length };
  });
}, {
  bytes: shipBytes,
  jobs: states.map((s) => ({
    span: Math.max(s.bounds.maxX - s.bounds.minX + 1, s.bounds.maxY - s.bounds.minY + 1),
    cx: Math.round((s.bounds.minX + s.bounds.maxX) / 2),
    cy: Math.round((s.bounds.minY + s.bounds.maxY) / 2),
  })),
});
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

fs.mkdirSync('captured/ship/port', { recursive: true });

console.log('PLACEMENT - where the disk puts the ship, and how big it is\n');
console.log('  state       disk centre      disk span   disk px');
for (const s of states) {
  const cx = Math.round((s.bounds.minX + s.bounds.maxX) / 2);
  const cy = Math.round((s.bounds.minY + s.bounds.maxY) / 2);
  const span = Math.max(s.bounds.maxX - s.bounds.minX + 1, s.bounds.maxY - s.bounds.minY + 1);
  console.log(`  ${s.label.padEnd(8)}  (${String(cx).padStart(3)}, ${String(cy).padStart(3)})` +
    `${' '.repeat(8)}${String(span).padStart(4)}${String(s.lit).padStart(10)}`);
}
console.log('\nThe port does not compute any of that: projectShipBytecode() takes the span and');
console.log('the centre as arguments. Placement is the caller\'s, and in the cockpit it comes');
console.log('from a distance heuristic, not from the world projection the disk does.\n');

console.log('SHAPE - the port given the disk\'s own centre and span\n');
console.log('  state     disk px   port px   overlap   agreement   disk w x h   port w x h   too tall');
let sumAgree = 0, n = 0, sumTall = 0;
for (let i = 0; i < states.length; i++) {
  const s = states[i];
  const r = rendered[i];
  if (!r.on) { console.log(`  ${s.label.padEnd(8)}  (the port produced no projection)`); continue; }
  const diskOn = new Uint8Array(HGR_W * HGR_H);
  for (const [x, y] of s.points) diskOn[y * HGR_W + x] = 1;
  const portOn = Uint8Array.from(r.on);
  let both = 0, portLit = 0, differ = 0;
  let pminX = HGR_W, pmaxX = -1, pminY = HGR_H, pmaxY = -1;
  for (let k = 0; k < diskOn.length; k++) {
    if (portOn[k]) {
      portLit++;
      const x = k % HGR_W, y = (k / HGR_W) | 0;
      if (x < pminX) pminX = x; if (x > pmaxX) pmaxX = x;
      if (y < pminY) pminY = y; if (y > pmaxY) pmaxY = y;
    }
    if (diskOn[k] && portOn[k]) both++;
    if (diskOn[k] !== portOn[k]) differ++;
  }
  // Jaccard: how much of the union the two agree on. 1.0 is identical.
  const union = s.lit + portLit - both;
  const agree = union ? both / union : 1;
  sumAgree += agree; n++;
  const dw = s.bounds.maxX - s.bounds.minX + 1, dh = s.bounds.maxY - s.bounds.minY + 1;
  const pw = pmaxX - pminX + 1, ph = pmaxY - pminY + 1;
  const tall = dh ? ph / dh : 0;
  sumTall += tall;
  console.log(`  ${s.label.padEnd(8)} ${String(s.lit).padStart(7)} ${String(portLit).padStart(9)} ` +
    `${String(both).padStart(9)} ${(100 * agree).toFixed(1).padStart(10)}%   ` +
    `${String(dw).padStart(3)} x ${String(dh).padStart(3)}   ${String(pw).padStart(4)} x ${String(ph).padStart(3)}` +
    `${tall.toFixed(2).padStart(11)}x`);
  const img = new Uint8Array(HGR_W * HGR_H);
  for (let k = 0; k < img.length; k++) img[k] = portOn[k] ? 1 : 0;
  fs.writeFileSync(`captured/ship/port/${s.label}.png`, toPng(img));
}
console.log(`\nmean shape agreement over ${n} states: ${(100 * sumAgree / n).toFixed(1)}%`);
console.log(`the port's ship is on average ${(sumTall / n).toFixed(2)}x as tall as the disk's, at the same width.`);
console.log('');
console.log("The width matches because it was handed to the port. The height is the port's own:");
console.log('projectShipBytecode() views the model at COCKPIT_SHIP_WIREFRAME_VIEW - yaw -1.05,');
console.log('pitch -0.27, roll 0.05 - a fixed three-quarter view - then scales so the larger of');
console.log('width and height fills the span. The disk projects world coordinates from the');
console.log('cockpit, which at these ranges is nearly edge-on, so its ship is wide and flat.');
console.log(`wrote ${n} port render(s) to captured/ship/port/`);
