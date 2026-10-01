// The port's GROUND FORCES menu against the original's.
//
// GROUND FORCES is chained from COM and never clears the screen, so the page is COM's with
// rows 1-12 of the left column replaced. Comparing it means replaying the whole chain the
// way status_parity does: the panel, line 210's lamps, line 180's needles, COM (which erases
// two of those needle tracks on its own line 8), and then the menu on top.
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/groundforces/golden.json', 'utf8'));
const comGolden = JSON.parse(fs.readFileSync('captured/com/readouts.json', 'utf8'));
const tableJson = JSON.parse(fs.readFileSync('../public/data/shapes/shape-table.json', 'utf8'));
const radar = JSON.parse(fs.readFileSync('captured/radar/golden.json', 'utf8'));

// COM's readouts are still on the page, so the twelve bytes have to be the ones COM saw.
// They are the healthy-ship set probe_comreadouts captured.
const comBytes = comGolden.healthy.bytes;
const needles = { bank: 0, pitch: 0, speed: radar.during ? 120 : 0, energy: comBytes['38199'] };

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.drawGroundForcesMenu), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose drawGroundForcesMenu - is the dev server running at ' + PORT_URL + '?'); });

const shot = await page.evaluate(({ tj, bytes, n }) => {
  const sv = window.__spaceVikings;
  const shapes = sv.decodeShapeTableJson(tj);
  const c = document.createElement('canvas');
  c.width = 560; c.height = 384;
  const h = new sv.Hires(c);
  h.hgr();
  sv.drawInstruments(h);
  sv.drawPanelNeedles(h, shapes, n);
  sv.drawComMainScreen(h, bytes, shapes);
  sv.drawGroundForcesMenu(h);
  return Array.from(h.snapshot().on);
}, { tj: tableJson, bytes: comBytes, n: needles });
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

const diskOn = new Uint8Array(HGR_W * HGR_H);
for (const [x, y] of golden.menu.points) diskOn[y * HGR_W + x] = 1;
const portOn = Uint8Array.from(shot);

const region = (from, to, label) => {
  let both = 0, onlyDisk = 0, onlyPort = 0, diskLit = 0, portLit = 0;
  for (let y = from; y <= to; y++) for (let x = 0; x < HGR_W; x++) {
    const k = y * HGR_W + x;
    if (diskOn[k]) diskLit++;
    if (portOn[k]) portLit++;
    if (diskOn[k] && portOn[k]) both++;
    else if (diskOn[k]) onlyDisk++;
    else if (portOn[k]) onlyPort++;
  }
  const px = (to - from + 1) * HGR_W;
  console.log(`${label} (rows ${from}-${to}):`);
  console.log(`  disk ${diskLit} lit, port ${portLit} lit, ${both} in both`);
  console.log(`  ${onlyDisk + onlyPort} of ${px} differ  (${(100 * (1 - (onlyDisk + onlyPort) / px)).toFixed(2)}% agree)`);
  console.log(`    ${onlyDisk} disk only, ${onlyPort} port only`);
};

region(0, 123, "the menu and COM's screen under it");
region(124, HGR_H - 1, 'the panel below');
console.log('');

let diff = 0;
// Hoisted for the verdict: the battle layout is counted inside a block.
let want = 0, have = 0;
const perRow = new Uint16Array(HGR_H);
for (let k = 0; k < diskOn.length; k++) {
  if (diskOn[k] !== portOn[k]) { diff++; perRow[(k / HGR_W) | 0]++; }
}
console.log(`whole page: ${diff} of ${diskOn.length} differ  (${(100 * (1 - diff / diskOn.length)).toFixed(3)}% agree)`);
const rows = [...perRow.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
if (rows.length) {
  console.log(`${rows.length} rows differ; worst: ` + rows.slice(0, 8).map(([y, n]) => `${y}(${n})`).join(' '));
}

fs.mkdirSync('captured/groundforces', { recursive: true });
fs.writeFileSync('captured/groundforces/port.png', toPng(portOn));
const d = new Uint8Array(diskOn.length);
for (let k = 0; k < d.length; k++) d[k] = diskOn[k] === portOn[k] ? 0 : 1;
fs.writeFileSync('captured/groundforces/diff.png', toPng(d, { colour: [255, 0, 0] }));
console.log('wrote captured/groundforces/port.png and diff.png');

// The battle screen's fixed layout, lines 110-145. The numbers and the narrative lines are
// RND- and timing-driven, so only the layout can be compared - scored the way RADAR's
// reticle is: every pixel the port plots, checked against the original's page.
if (golden.battle) {
  const b2 = await chromium.launch({ headless: true });
  const p2 = await b2.newPage();
  await p2.goto(PORT_URL, { waitUntil: 'load' });
  await p2.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.drawGroundForcesBattle), null, { timeout: 30000 });
  const lay = await p2.evaluate(() => {
    const sv = window.__spaceVikings;
    const c = document.createElement('canvas');
    c.width = 560; c.height = 384;
    const h = new sv.Hires(c);
    h.hgr();
    sv.drawGroundForcesBattle(h);
    return Array.from(h.snapshot().on);
  });
  await b2.close();

  const bDisk = new Uint8Array(HGR_W * HGR_H);
  for (const [x, y] of golden.battle.points) bDisk[y * HGR_W + x] = 1;
  const layOn = Uint8Array.from(lay);
  want = 0; have = 0;
  const miss = [];
  for (let k = 0; k < layOn.length; k++) {
    if (!layOn[k]) continue;
    want++;
    if (bDisk[k]) have++;
    else if (miss.length < 14) miss.push(`${k % HGR_W},${(k / HGR_W) | 0}`);
  }
  console.log('');
  console.log('the battle screen layout - lines 110, 120, 130, 140, 145:');
  console.log(`  the port plots ${want} pixels; ${have} of them are lit on the disk too  (${(100 * have / want).toFixed(2)}%)`);
  if (miss.length) console.log(`    first misses: ${miss.join(' ')}`);
}

// The menu page is drawn from state and has to be exact, and every pixel the port plots for
// the battle screen has to be lit on the disk too.
console.log('');
const gfOk = diff === 0 && want > 0 && have === want;
console.log(gfOk ? 'groundforces parity: the page is exact and the battle layout lands on the disk'
  : `groundforces parity: ${diff} pixels differ, battle layout ${have} of ${want}`);
process.exit(gfOk && errors.length === 0 ? 0 : 1);
