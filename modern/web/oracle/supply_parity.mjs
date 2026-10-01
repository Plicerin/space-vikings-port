// The port's SUPPLY against the original's, both pages.
//
// This used to compose the page it then compared - `drawInstruments`, the needles, then
// `drawSupplyPage1` - which is the one thing a parity harness must not do. SUPPLY fills only
// rows 0 to 123 and leaves the panel standing from whatever drew it last, so the panel is
// half of what the screen is, and a harness that paints its own cannot see a wrong one.
// It drives the game now: a new game, C to COM, 1 to the computer, 5 to SUPPLY.
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/supply/golden.json', 'utf8'));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikingsState),
  null, { timeout: 30000 })
  .catch(() => { throw new Error('the port never came up - is the dev server running at ' + PORT_URL + '?'); });

const shots = await page.evaluate(async ({ cargo, credits }) => {
  const sv = window.__spaceVikings;
  const press = (k) => {
    const code = /^[0-9]$/.test(k) ? 'Digit' + k : k === ' ' ? 'Space' : 'Key' + k.toUpperCase();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: k, code, bubbles: true }));
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const scene = () => {
    const l = window.__gameLog.getLog();
    return l.length ? l[l.length - 1].scene : '?';
  };
  // A scene change costs its disk load and the old screen stays up for it, so wait on the
  // scene rather than on the clock.
  const arrive = async (want, ms = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (scene().toLowerCase() === want.toLowerCase()) return true;
      await sleep(60);
    }
    return false;
  };
  const grab = () => Array.from(sv.hires.snapshot().on);

  press('N');
  if (!await arrive('cockpit', 30000)) throw new Error('no cockpit');
  await sleep(800);
  // The machine's own cargo and purse, so the manifest reads the same.
  const st = window.__spaceVikingsState;
  const l = st.loot;
  l.platinum = cargo[38181] ?? 0; l.gold = cargo[38183] ?? 0; l.silver = cargo[38182] ?? 0;
  l.titaniumKlb = cargo[38180] ?? 0; l.collapsium = cargo[38179] ?? 0;
  l.steel = cargo[38178] ?? 0; l.fissionables = cargo[38177] ?? 0;
  l.wineCases = cargo[38172] ?? 0; l.liquorCases = cargo[38171] ?? 0;
  l.luxuryFood = cargo[38173] ?? 0; l.staples = cargo[38174] ?? 0;
  l.medicine = cargo[38175] ?? 0; l.art = cargo[38176] ?? 0;
  st.credits = credits;

  press('C'); if (!await arrive('com')) throw new Error('no COM');
  await sleep(500);
  press('1'); await sleep(1200);
  press('5'); if (!await arrive('supply')) throw new Error('no SUPPLY');
  await sleep(600);
  const page1 = grab();
  press(' '); await sleep(900);
  const page2 = grab();
  return { page1, page2 };
}, { cargo: golden.cargo, credits: golden.misc.CR });
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

for (const name of ['page1', 'page2']) {
  const diskOn = new Uint8Array(HGR_W * HGR_H);
  for (const [x, y] of golden[name].points) diskOn[y * HGR_W + x] = 1;
  const portOn = Uint8Array.from(shots[name]);
  let diskLit = 0, portLit = 0, both = 0, onlyDisk = 0, onlyPort = 0;
  const perRow = new Uint16Array(HGR_H);
  for (let k = 0; k < diskOn.length; k++) {
    // Text row 24, y 184-191, is STARSHIP SIMULATOR line 155's five numbers, and whether they
    // are on the page when you get here is not a property of SUPPLY at all. The simulator
    // draws into one hi-res page while the other is displayed, so what COM inherits - and
    // hands on - depends on which pass you left flight in. Measured both ways on the machine:
    // leave quickly and the row carries 20 pixels, fly for twenty seconds first and it carries
    // 254. The galaxy map then clears it for good, 250 to 152 to 20, which the port follows to
    // the pixel. `transition_parity` leaves this row out everywhere for the same reason.
    if ((k / HGR_W | 0) >= 184 && (k / HGR_W | 0) <= 191) continue;
    if (diskOn[k]) diskLit++;
    if (portOn[k]) portLit++;
    if (diskOn[k] && portOn[k]) both++;
    else if (diskOn[k]) { onlyDisk++; perRow[(k / HGR_W) | 0]++; }
    else if (portOn[k]) { onlyPort++; perRow[(k / HGR_W) | 0]++; }
  }
  const diff = onlyDisk + onlyPort;
  console.log(`${name}:`);
  console.log(`  disk ${diskLit} lit, port ${portLit} lit, ${both} in both`);
  console.log(`  ${diff} of ${diskOn.length} differ  (${(100 * (1 - diff / diskOn.length)).toFixed(3)}% agree)`);
  console.log(`    ${onlyDisk} disk only, ${onlyPort} port only`);
  const rows = [...perRow.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (rows.length) console.log(`  ${rows.length} rows differ; worst: ` + rows.slice(0, 8).map(([y, n]) => `${y}(${n})`).join(' '));
  console.log('');
  fs.mkdirSync('captured/supply', { recursive: true });
  fs.writeFileSync(`captured/supply/${name}-port.png`, toPng(portOn));
  const d = new Uint8Array(diskOn.length);
  for (let k = 0; k < d.length; k++) d[k] = diskOn[k] === portOn[k] ? 0 : 1;
  fs.writeFileSync(`captured/supply/${name}-diff.png`, toPng(d, { colour: [255, 0, 0] }));
}
console.log('wrote captured/supply/*-port.png and *-diff.png');
