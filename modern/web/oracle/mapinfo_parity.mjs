// The page the galaxy map's Y answer leaves, against the machine's.
//
// `probe_mapinfo.mjs` walked it on the disk: the paddle cursor onto Alpha Centauri, the
// button, then Y, which 3260 answers with `POKE 38388,P: POKE 38149,8: RUN COM` - COM
// directly, with no INSTRUMENTS in between to repaint anything.
//
// The port stands in for the paddles with keys: I, J, K and M move the cursor and Return is
// the button.
import { chromium } from 'playwright';
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/mapinfo/golden.json', 'utf8'));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikingsState),
  null, { timeout: 30000 });

const shots = await page.evaluate(async ({ px, py }) => {
  const sv = window.__spaceVikings;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const scene = () => {
    const l = window.__gameLog.getLog();
    return l.length ? l[l.length - 1].scene : '?';
  };
  const arrive = async (want, ms = 30000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (scene().toLowerCase() === want.toLowerCase()) return true;
      await sleep(70);
    }
    return false;
  };
  const key = (k) => {
    const code = /^[0-9]$/.test(k) ? 'Digit' + k
      : k === ' ' ? 'Space' : k === 'Enter' ? 'Enter' : 'Key' + k.toUpperCase();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: k, code, bubbles: true }));
  };

  key('N');
  if (!await arrive('cockpit', 35000)) throw new Error('no cockpit');
  await sleep(1200);
  key('C'); if (!await arrive('com')) throw new Error('no COM');
  await sleep(500);
  key('1'); await sleep(1200);
  key('3'); if (!await arrive('galaxyMap')) throw new Error('no galaxy map');
  await sleep(900);

  // The cursor opens at 140, 75 and each press is five pixels - 3110's paddles in whole steps.
  let cx = 140, cy = 75;
  const step = async (k) => { key(k); await sleep(130); };
  // Vertically first. The cursor is an XDRAW and it inverts what it passes over, so a path
  // that crosses a star is not the same as one that does not - and the machine's cursor does
  // not travel at all, it is wherever the paddles say. Going along row 75 from 140 to 95 would
  // cross Sol's marker at 115, which the paddle jump never touches.
  while (cy > py) { await step('I'); cy -= 5; }
  while (cy < py) { await step('M'); cy += 5; }
  while (cx > px) { await step('J'); cx -= 5; }
  while (cx < px) { await step('K'); cx += 5; }
  await sleep(400);

  key('Enter');            // 3130's button
  await sleep(900);
  const readout = Array.from(sv.hires.snapshot().on);

  key('Y');                // 3260
  if (!await arrive('com', 30000)) throw new Error('COM never ran after Y');
  await sleep(1500);
  return { readout, info: Array.from(sv.hires.snapshot().on), cursor: [cx, cy] };
}, { px: golden.px, py: golden.py });
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

const asMask = (points) => {
  const on = new Uint8Array(HGR_W * HGR_H);
  for (const [x, y] of points) on[y * HGR_W + x] = 1;
  return on;
};
// The cursor's own thirteen pixels, and only those. 3110 is `PX = PDL(0) * 1.19`, a paddle
// reading, and a paddle comes back a count or two either side of what it was asked for -
// `probe_mappick.mjs` asked for 95 and the machine used 92.82. The port moves its cursor in
// whole steps of five from 140, 75 and cannot land on the fraction, so one pixel of the shape
// falls either side. Everything else on both pages is compared.
const nearCursor = (x, y) => Math.abs(x - golden.px) <= 4 && Math.abs(y - golden.py) <= 4;

let bad = 0;
const compare = (what, diskPoints, portOn, skipCursor = false) => {
  const disk = asMask(diskPoints);
  const port = Uint8Array.from(portOn);
  let diff = 0, onlyDisk = 0, onlyPort = 0;
  const perRow = new Uint16Array(HGR_H);
  for (let k = 0; k < disk.length; k++) {
    if (skipCursor && nearCursor(k % HGR_W, (k / HGR_W) | 0)) continue;
    if (disk[k] && !port[k]) { onlyDisk++; diff++; perRow[(k / HGR_W) | 0]++; }
    else if (!disk[k] && port[k]) { onlyPort++; diff++; perRow[(k / HGR_W) | 0]++; }
  }
  const rows = [...new Set([...perRow.entries()].filter(([, n]) => n > 0)
    .map(([y]) => ((y / 8) | 0) + 1))];
  console.log(`${what}: ${diff} of ${disk.length} differ  (${onlyDisk} disk only, ${onlyPort} port only)`);
  if (rows.length) console.log(`  text rows: ${rows.join(',')}`);
  if (diff) bad++;
  return port;
};

console.log(`the machine picked planet ${golden.pick} at PX ${golden.px}, PY ${golden.py}, `
  + `and COM came up with 38388 = ${golden.infoPlanet}`);
console.log(`the port's cursor ended at ${shots.cursor.join(', ')}`);
console.log('');
const readoutPort = compare('the readout  ', golden.readout.points, shots.readout, true);
const infoPort = compare('the Y page   ', golden.info.points, shots.info);

fs.mkdirSync('captured/mapinfo', { recursive: true });
fs.writeFileSync('captured/mapinfo/port-readout.png', toPng(readoutPort));
fs.writeFileSync('captured/mapinfo/port-info.png', toPng(infoPort));
console.log('');
console.log(bad === 0 ? 'map info parity: clean' : `map info parity: ${bad} of 2 pages differ`);
process.exit(bad === 0 && errors.length === 0 ? 0 : 1);
