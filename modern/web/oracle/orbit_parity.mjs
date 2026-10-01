// The port's ORBIT screen against the original's.
//
// ORBIT draws over what flight left and floods only rows 0-125, so the comparison replays
// the panel with its lamps and needles underneath.
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/orbit/golden.json', 'utf8'));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikingsState), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose drawOrbitScreen - is the dev server running at ' + PORT_URL + '?'); });

// This used to compose the page it compared - `drawInstruments` and then `drawOrbitScreen`
// into a canvas of its own - which is the one thing a parity harness must not do: ORBIT
// floods rows 0 to 125 and inherits everything below from the flight it interrupted, so a
// hand-built panel tests the drawing and not the screen. It flies there now, the way 158
// does: `IF PEEK(38210) = 1 AND Y > 4000 THEN RUN ORBIT`.
const shot = await page.evaluate(async () => {
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
  const arrive = async (want, ms = 25000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (scene().toLowerCase() === want.toLowerCase()) return true;
      await sleep(80);
    }
    return false;
  };

  press('N');
  if (!await arrive('cockpit', 30000)) throw new Error('no cockpit');
  await sleep(1200);
  // Into the atmosphere first - 158 only fires with 38210 set - and then climb out of it.
  const st = window.__spaceVikingsState;
  st.atmosphere = 1; st.inOrbit = false;
  await sleep(600);
  st.y = 4200;
  if (!await arrive('orbit', 30000)) throw new Error('never reached ORBIT');
  await sleep(1500);
  return Array.from(sv.hires.snapshot().on);
});
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

const diskOn = new Uint8Array(HGR_W * HGR_H);
for (const [x, y] of golden.screen.points) diskOn[y * HGR_W + x] = 1;
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
  console.log(`${label} (rows ${from}-${to}): ${onlyDisk + onlyPort} of ${px} differ  ` +
    `(${(100 * (1 - (onlyDisk + onlyPort) / px)).toFixed(2)}%)   disk ${diskLit} lit, port ${portLit} lit, ` +
    `${onlyDisk} disk only, ${onlyPort} port only`);
  return onlyDisk + onlyPort;
};
const own = region(0, 125, "ORBIT's own area");
region(126, 183, 'the panel it inherits');
region(184, 191, "line 155's live readout");

let diff = 0;
const perRow = new Uint16Array(HGR_H);
for (let k = 0; k < diskOn.length; k++) if (diskOn[k] !== portOn[k]) { diff++; perRow[(k / HGR_W) | 0]++; }
console.log(`whole page: ${diff} of ${diskOn.length} differ  (${(100 * (1 - diff / diskOn.length)).toFixed(3)}% agree)`);
const rows = [...perRow.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
if (rows.length) console.log(`${rows.length} rows differ; worst: ` + rows.slice(0, 10).map(([y, n]) => `${y}(${n})`).join(' '));

fs.mkdirSync('captured/orbit', { recursive: true });
fs.writeFileSync('captured/orbit/port.png', toPng(portOn));
const d = new Uint8Array(diskOn.length);
for (let k = 0; k < d.length; k++) d[k] = diskOn[k] === portOn[k] ? 0 : 1;
fs.writeFileSync('captured/orbit/diff.png', toPng(d, { colour: [255, 0, 0] }));
console.log('wrote captured/orbit/port.png and diff.png');
console.log('');
// What ORBIT itself draws has to be exact. Below it, two things are known not to be and are
// reported rather than required: text row 24 is STARSHIP SIMULATOR line 155's live position,
// which the two machines never share, and the bank and pitch needles depend on which hi-res
// page the flight loop had flipped to when 158 fired - the capture this is compared against
// caught a page with neither.
// ---------------------------------------------------------------------------------------
// And what you can do once you are there, which the pixels say nothing about.
//
// ORBIT line 35 leaves the ship at (700, 200, 2000) with the atmosphere flag cleared, so it
// is in vacuum and outside the box. Line 156 brings it back - `IF ABS(X) < 900 AND ABS(Y) <
// 900 AND ABS(Z) < 900 AND PEEK(38210) = 0 THEN "RUNRE"` - and the way back is to fly Z down
// until it is inside. The port used to test `!state.inOrbit` as well, which has no byte
// behind it on the disk and stopped that from ever happening.
const reentered = await (async () => {
  const b2 = await chromium.launch({ headless: true });
  const pg = await b2.newPage();
  await pg.goto(PORT_URL, { waitUntil: 'load' });
  await pg.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikingsState),
    null, { timeout: 30000 });
  const out = await pg.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const scene = () => {
      const l = window.__gameLog.getLog();
      return l.length ? l[l.length - 1].scene : '?';
    };
    const init = { key: 'N', code: 'KeyN', bubbles: true };
    window.dispatchEvent(new KeyboardEvent('keydown', init));
    window.dispatchEvent(new KeyboardEvent('keyup', init));
    for (let i = 0; i < 500 && scene() !== 'cockpit'; i++) await sleep(70);
    await sleep(1500);

    // Where ORBIT leaves you, lamp and all.
    const s = window.__spaceVikingsState;
    Object.assign(s, { x: 700, y: 200, z: 2000, atmosphere: 0, inOrbit: true, speed: 0 });
    await sleep(400);
    const before = scene();

    // Fly in. Z inside 900 is the only thing missing.
    s.z = 400;
    for (let i = 0; i < 300 && scene() === 'cockpit'; i++) await sleep(100);
    return { before, after: scene(), inOrbit: s.inOrbit };
  });
  await b2.close();
  return out;
})();

const reentryOk = reentered.after === 'reentry' || reentered.after === 'cockpit'
  ? reentered.after === 'reentry' : false;
console.log('');
console.log(reentryOk
  ? `  ok    from orbit, flying into the 900 box re-enters   ${reentered.before} -> ${reentered.after}`
  : `  FAIL  from orbit, flying into the 900 box re-enters   ${reentered.before} -> ${reentered.after}`);

console.log('');
console.log(own === 0 ? "orbit parity: ORBIT's own rows 0-125 are exact"
  : `orbit parity: ${own} pixels differ inside ORBIT's own rows`);
process.exit(own === 0 && reentryOk && errors.length === 0 ? 0 : 1);
