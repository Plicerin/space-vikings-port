// The port's ground wireframe against the original's.
//
// captured/ground/golden.json holds star-only renders from the original renderer - the scene
// with the ship model blanked. The star table itself is PLANET # 0's record list, extracted
// by probe_starfield.mjs, and it is the same bytecode the ship models use, so the port's
// existing parser and world projection handle it unchanged.
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/ground/golden.json', 'utf8'));
const states = golden.states.filter((s) => s.lit > 0);
const stars = JSON.parse(fs.readFileSync('../public/data/shapes/planet-1-ground.json', 'utf8')).bytes;
// The approach snapshot's own camera, not the deep-space one.
const CAM = golden.camera;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.projectShipWorld), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose projectShipWorld - is the dev server running at ' + PORT_URL + '?'); });

const rendered = await page.evaluate(({ bytes, jobs }) => {
  const { Hires, parseShipBytecode, projectShipWorld, drawShipWorld } = window.__spaceVikings;
  const ops = parseShipBytecode(bytes);
  return jobs.map((j) => {
    const c = document.createElement('canvas');
    c.width = 560; c.height = 384;
    const h = new Hires(c);
    h.hgr();
    h.hcolor(3);
    const proj = projectShipWorld(ops, j.camera, j.heading, j.pitch, null);
    drawShipWorld(h, proj);
    return { on: Array.from(h.snapshot().on), dots: proj.dots.length, culled: proj.culled, clippedAway: proj.clippedAway };
  });
}, { bytes: stars, jobs: states.map((s) => ({ camera: { x: CAM.x, y: CAM.y, z: s.z }, heading: s.heading, pitch: s.pitch })) });
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

fs.mkdirSync('captured/ground/port', { recursive: true });
console.log('  state     disk px   port px   plotted   overlap   agreement   within 1px   disk extent        port extent');
let sumAgree = 0, sumNear = 0, n = 0;
for (let i = 0; i < states.length; i++) {
  const s = states[i];
  const r = rendered[i];
  const diskOn = new Uint8Array(HGR_W * HGR_H);
  for (const [x, y] of s.points) diskOn[y * HGR_W + x] = 1;
  const portOn = Uint8Array.from(r.on);
  let both = 0, portLit = 0, near = 0;
  let pminX = HGR_W, pmaxX = -1, pminY = HGR_H, pmaxY = -1;
  for (let k = 0; k < diskOn.length; k++) {
    if (portOn[k]) {
      portLit++;
      const x = k % HGR_W, y = (k / HGR_W) | 0;
      if (x < pminX) pminX = x; if (x > pmaxX) pmaxX = x;
      if (y < pminY) pminY = y; if (y > pmaxY) pmaxY = y;
    }
    if (diskOn[k] && portOn[k]) both++;
  }
  for (let k = 0; k < diskOn.length; k++) {
    if (!diskOn[k]) continue;
    const x = k % HGR_W, y = (k / HGR_W) | 0;
    let hit = false;
    for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1 && !hit; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || xx >= HGR_W || yy < 0 || yy >= HGR_H) continue;
      if (portOn[yy * HGR_W + xx]) hit = true;
    }
    if (hit) near++;
  }
  const union = s.lit + portLit - both;
  const agree = union ? both / union : 1;
  sumAgree += agree; sumNear += s.lit ? near / s.lit : 1; n++;
  console.log(`  ${s.label.padEnd(8)} ${String(s.lit).padStart(7)} ${String(portLit).padStart(9)} ${String(r.dots).padStart(9)} ` +
    `${String(both).padStart(9)} ${(100 * agree).toFixed(1).padStart(10)}% ${(100 * (s.lit ? near / s.lit : 1)).toFixed(0).padStart(11)}%   ` +
    `x${s.bounds.minX}-${s.bounds.maxX},y${s.bounds.minY}-${s.bounds.maxY}`.padEnd(19) +
    (pmaxX >= 0 ? `x${pminX}-${pmaxX},y${pminY}-${pmaxY}` : '(empty)'));
  const img = new Uint8Array(HGR_W * HGR_H);
  for (let k = 0; k < img.length; k++) img[k] = portOn[k] ? 1 : 0;
  fs.writeFileSync(`captured/ground/port/${s.label}.png`, toPng(img));
}
console.log(`\nmean agreement over ${n} states: ${(100 * sumAgree / n).toFixed(1)}%`);
console.log(`mean within one pixel: ${(100 * sumNear / n).toFixed(1)}%`);

// Twelve states of the ground wireframe, each the disk's own display list through the port's
// renderer. Nothing here is RND, so every state has to agree outright.
console.log('');
const groundOk = n > 0 && sumAgree / n === 1;
console.log(groundOk ? `ground parity: all ${n} states exact`
  : `ground parity: mean agreement ${(100 * sumAgree / n).toFixed(2)}% over ${n} states`);
process.exit(groundOk && errors.length === 0 ? 0 : 1);
