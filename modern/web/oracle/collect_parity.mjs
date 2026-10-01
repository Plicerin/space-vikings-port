// The port's COLLECT against the original's.
//
// COLLECT writes only the band GROUND FORCES' line 170 clears - rows 11-14, columns 0-38 -
// and inherits $3CD = 255 from there, so it is inverse. Everything else on the captured page
// is the battle screen underneath, whose numbers are RND-driven, so the comparison is scoped
// to the band.
//
// The band used to be drawn into a blank canvas here, which tests `drawCollectMessage` and not
// COLLECT: it could not tell whether the scene draws it, nor whether it lands on the battle
// screen with the inverse flag GROUND FORCES left set. The assault is fought for real now -
// C to COM, 2 to GROUND FORCES, 1 to attack - and the band is read off the page COLLECT
// actually leaves.
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/collect/golden.json', 'utf8'));

const BAND_TOP = 88;    // row 11
const BAND_BOTTOM = 119; // row 14

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikingsState), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose drawCollectMessage - is the dev server running at ' + PORT_URL + '?'); });

const shot = await page.evaluate(async ({ tech }) => {
  const sv = window.__spaceVikings;
  const press = (k) => {
    const code = /^[0-9]$/.test(k) ? 'Digit' + k : k === ' ' ? 'Space' : 'Key' + k.toUpperCase();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: k, code, bubbles: true }));
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sceneNow = () => {
    const l = window.__gameLog.getLog();
    return l.length ? l[l.length - 1].scene : '?';
  };
  const arrive = async (want, ms = 25000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (sceneNow().toLowerCase() === want.toLowerCase()) return true;
      await sleep(80);
    }
    return false;
  };

  press('N');
  if (!await arrive('cockpit', 35000)) throw new Error('no cockpit');
  await sleep(1200);

  // The assault is RND-driven and can be lost, so it is set up to be winnable and retried.
  for (let attempt = 0; attempt < 4; attempt++) {
    const st = window.__spaceVikingsState;
    // The planet the capture was taken on, and a force that will take it.
    st.planets[st.planetIndex].defense = tech;
    st.planets[st.planetIndex].surrendered = false;
    st.planetSurrendered = false;
    st.credits = 60000;
    st.forces.troops = 20000;
    st.forces.troopLocation = 0;
    st.forces.troopPlanetIndex = st.planetIndex;

    if (sceneNow().toLowerCase() !== 'groundforces') {
      if (sceneNow().toLowerCase() !== 'com') { press('C'); if (!await arrive('com')) throw new Error('no COM'); }
      await sleep(400);
      press('2');
      if (!await arrive('groundForces')) throw new Error('no GROUND FORCES');
    }
    await sleep(400);
    press('1');
    if (await arrive('collect', 120000)) {
      await sleep(600);
      return Array.from(sv.hires.snapshot().on);
    }
    // Lost, or bounced back: let it settle and go round again.
    await sleep(2000);
  }
  throw new Error('the assault never reached COLLECT in four attempts');
}, { tech: golden.tech });
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

const diskOn = new Uint8Array(HGR_W * HGR_H);
for (const [x, y] of golden.screen.points) diskOn[y * HGR_W + x] = 1;
const portOn = Uint8Array.from(shot);

let both = 0, onlyDisk = 0, onlyPort = 0, diskLit = 0, portLit = 0;
const perRow = new Uint16Array(HGR_H);
for (let y = BAND_TOP; y <= BAND_BOTTOM; y++) for (let x = 0; x < HGR_W; x++) {
  const k = y * HGR_W + x;
  if (diskOn[k]) diskLit++;
  if (portOn[k]) portLit++;
  if (diskOn[k] && portOn[k]) both++;
  else if (diskOn[k]) { onlyDisk++; perRow[y]++; }
  else if (portOn[k]) { onlyPort++; perRow[y]++; }
}
const px = (BAND_BOTTOM - BAND_TOP + 1) * HGR_W;
console.log(`COLLECT's band, rows ${BAND_TOP}-${BAND_BOTTOM} (text rows 11-14), tech ${golden.tech}:`);
console.log(`  disk ${diskLit} lit, port ${portLit} lit, ${both} in both`);
console.log(`  ${onlyDisk + onlyPort} of ${px} differ  (${(100 * (1 - (onlyDisk + onlyPort) / px)).toFixed(2)}% agree)`);
console.log(`    ${onlyDisk} disk only, ${onlyPort} port only`);
const rows = [...perRow.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
if (rows.length) console.log(`  ${rows.length} rows differ; worst: ` + rows.slice(0, 8).map(([y, n]) => `${y}(${n})`).join(' '));

// The two bugs, against what the machine did.
console.log('');
console.log('the loot, as the machine awarded it:');
const NAMES = {
  38171: 'ART WORKS', 38172: 'WINE/LIQUOR', 38173: 'LUXURY FOODS', 38174: 'FIGHTER PARTS',
  38175: 'WEAPONS', 38176: 'ELECTRONIC PARTS', 38177: 'FISSIONABLES', 38178: 'STEEL',
  38179: 'COLLAPSIUM', 38180: 'TITANIUM', 38181: 'PLATINUM', 38182: 'SILVER', 38183: 'GOLD',
};
const j1 = golden.tech === 2 ? 0 : golden.tech === 3 ? 10 : 15;
const j2 = golden.tech === 2 ? 10 : golden.tech === 3 ? 7 : 15;
console.log(`  tech ${golden.tech} gives J1 = ${j1}, J2 = ${j2}`);
let ok = true;
for (const a of Object.keys(NAMES).map(Number)) {
  const gained = golden.after[a] - golden.before[a];
  const limit = a === 38173 ? 20 : [38179, 38176, 38175, 38171].includes(a) ? j1 : j2;
  const within = a === 38180 ? gained === 0 : gained >= 0 && gained <= limit;
  if (!within) ok = false;
  console.log(`  ${NAMES[a].padEnd(17)} +${String(gained).padStart(3)}  against a cap of ` +
    `${a === 38180 ? 'nothing - line 960 misses it' : limit}${within ? '' : '   OUT OF RANGE'}`);
}
console.log(`  every gain within its rate: ${ok}`);
console.log('');
console.log(`  titanium ${golden.before[38180]} -> ${golden.after[38180]}, and 31180 ` +
  `${golden.modelBefore} -> ${golden.modelAfter}: line 960's typo, confirmed`);
console.log(`  the line 880 silver bug is a tech 1 path and was not exercised here (tech ${golden.tech})`);

fs.mkdirSync('captured/collect', { recursive: true });
fs.writeFileSync('captured/collect/port.png', toPng(portOn));
console.log('');
console.log('wrote captured/collect/port.png');

// Two separate claims: the band COLLECT writes is exact, and every commodity the machine
// awarded is inside the rate its tech allows. The loot itself is RND-driven, so the second is
// a range and not an equality - that is what `replay_parity` pins exactly.
console.log('');
const collectOk = onlyDisk === 0 && onlyPort === 0 && ok;
console.log(collectOk ? "collect parity: the band is exact and every gain is within its rate"
  : `collect parity: ${onlyDisk + onlyPort} pixels differ, gains within their rates: ${ok}`);
process.exit(collectOk && errors.length === 0 ? 0 : 1);
