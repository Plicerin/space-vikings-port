// The port's shape-table interpreter against the Apple II ROM's.
//
// probe_shapetable.mjs drew all 26 shapes of ENEMY I.A24580.L68 on the real ROM, at
// (140,96) with ROT=0, SCALE=1 and HCOLOR=3. This draws the same 26 with the port's
// ShapeRenderer and compares pixel for pixel.
//
// Agreeing with the Apple II Reference Manual is not the same as agreeing with the machine:
// a shape table packs three vectors into a byte, the plot bit moves as well as plots, and
// the direction encoding is easy to get a quarter turn wrong. Only the machine settles it.
import { decodeHgr, HGR_W, HGR_H } from './hgr.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const rom = JSON.parse(fs.readFileSync('captured/shape_renders.json', 'utf8'));
const tableJson = JSON.parse(fs.readFileSync('../public/data/shapes/shape-table.json', 'utf8'));
const [AT_X, AT_Y] = rom.at;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.ShapeRenderer), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose ShapeRenderer - is the dev server running at ' + PORT_URL + '?'); });

const rendered = await page.evaluate(({ tableJson, count, x, y }) => {
  const { Hires, ShapeRenderer, decodeShapeTableJson } = window.__spaceVikings;
  const table = decodeShapeTableJson(tableJson);
  const out = [];
  for (let i = 0; i < count; i++) {
    const c = document.createElement('canvas');
    c.width = 560; c.height = 384;
    const h = new Hires(c);
    h.hgr();
    h.hcolor(3);
    const r = new ShapeRenderer(h);
    r.rot = 0; r.scale = 1;
    r.draw(table, i, x, y);
    out.push(Array.from(h.snapshot().on));
  }
  return { shapes: out, decoded: table.shapes.map((s) => s.length) };
}, { tableJson, count: rom.count, x: AT_X, y: AT_Y });
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

const key = (x, y) => y * HGR_W + x;
let exact = 0, totalDiff = 0;
console.log('shape   ROM px   port px   differ   verdict');
for (let i = 0; i < rom.count; i++) {
  const romOn = new Uint8Array(HGR_W * HGR_H);
  for (const [x, y] of rom.shapes[i].points) romOn[key(x, y)] = 1;
  const portOn = Uint8Array.from(rendered.shapes[i]);
  let differ = 0, portLit = 0;
  for (let k = 0; k < romOn.length; k++) {
    if (portOn[k]) portLit++;
    if (romOn[k] !== portOn[k]) differ++;
  }
  totalDiff += differ;
  if (differ === 0) exact++;
  console.log(`  ${String(i + 1).padStart(2)}   ${String(rom.shapes[i].lit).padStart(6)}   ` +
    `${String(portLit).padStart(7)}   ${String(differ).padStart(6)}   ${differ === 0 ? 'exact' : 'DIFFERS'}`);
}
console.log('');
console.log(`${exact} of ${rom.count} shapes render exactly; ${totalDiff} pixels differ in total.`);
process.exit(exact === rom.count ? 0 : 1);
