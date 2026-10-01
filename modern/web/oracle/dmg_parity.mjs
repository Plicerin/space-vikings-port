// The port's DMG against the original's.
//
// DMG draws one thing - the damage lamp - and clears nothing, so the comparison is the lamp
// itself, pixel for pixel, plus a check that nothing else on the page moved.
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/dmg/golden.json', 'utf8'));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.drawDamageLamp), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose drawDamageLamp - is the dev server running?'); });

const shots = await page.evaluate(() => {
  const sv = window.__spaceVikings;
  const mk = (colour) => {
    const c = document.createElement('canvas');
    c.width = 560; c.height = 384;
    const h = new sv.Hires(c);
    h.hgr();
    if (colour !== null) sv.drawDamageLamp(h, colour);
    return Array.from(h.snapshot().on);
  };
  return { orange: mk(5), green: mk(1), blank: mk(null) };
});
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

const lampOf = (on) => {
  const pts = [];
  for (let y = 153; y <= 157; y++) for (let x = 262; x <= 271; x++) if (on[y * HGR_W + x]) pts.push(`${x},${y}`);
  return pts;
};
const disk = new Set(golden.lamp.points.map(([x, y]) => `${x},${y}`));
const port = new Set(lampOf(Uint8Array.from(shots.orange)));
const missing = [...disk].filter((k) => !port.has(k));
const extra = [...port].filter((k) => !disk.has(k));

console.log('the damage lamp, x 262-271 y 153-157, HCOLOR 5:');
console.log(`  disk ${disk.size} lit, port ${port.size} lit, ${missing.length} missing, ${extra.length} extra`);
if (missing.length) console.log(`    missing: ${missing.join(' ')}`);
if (extra.length) console.log(`    extra:   ${extra.join(' ')}`);
console.log(`  disk columns: ${golden.lamp.columns.join(', ')}`);

// Nothing else should be touched.
const blank = Uint8Array.from(shots.blank);
const orange = Uint8Array.from(shots.orange);
let outside = 0;
for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) {
  const inLamp = x >= 262 && x <= 271 && y >= 153 && y <= 157;
  if (!inLamp && blank[y * HGR_W + x] !== orange[y * HGR_W + x]) outside++;
}
console.log(`  pixels changed outside the lamp: ${outside}`);

// SHORE LEAVE line 2545 paints the same lamp green, so check it lands on the same cells.
const green = new Set(lampOf(Uint8Array.from(shots.green)));
console.log('');
console.log(`HCOLOR 1 on the same lamp - SHORE LEAVE 2545's repair light: ${green.size} lit`);
console.log(`  same columns as orange: ${[...green].every((k) => port.has(k)) && green.size === port.size}`);
console.log(`  38393 after DMG on the machine: ${golden.flag}`);

fs.mkdirSync('captured/dmg', { recursive: true });
fs.writeFileSync('captured/dmg/port.png', toPng(orange));
console.log('');
console.log('wrote captured/dmg/port.png');

// The lamp is ten by five and fixed, DMG clears nothing, and 2545 paints the same cells
// green. All three are exact statements, so all three are required.
console.log('');
const dmgOk = missing.length === 0 && extra.length === 0 && outside === 0
  && green.size === port.size && [...green].every((k) => port.has(k));
console.log(dmgOk ? 'dmg parity: the lamp is exact and nothing else moved'
  : `dmg parity: ${missing.length} missing, ${extra.length} extra, ${outside} outside the lamp`);
process.exit(dmgOk && errors.length === 0 ? 0 : 1);
