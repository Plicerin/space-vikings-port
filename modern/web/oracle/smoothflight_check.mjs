// `smoothFlight`, which was a switch that did nothing.
//
// There is no golden here and there cannot be: the disk has no smooth flight to compare
// against. What there is to check is that the switch does what it says, which nothing checked
// - and it did not. Measured with it on: 765 browser frames and **one** distinct picture in
// six seconds. It redrew as hard as it could and the image never changed.
//
// Two reasons, both in the port. The redraw was gated on the simulator step, which is right -
// the machine draws one picture a pass - and the switch "put the other fifty-nine frames
// back", but the ship only moves inside the step, so those frames all drew the same camera
// from the same place. And when the camera was finally carried forward between steps,
// `renderStarfield(_cam)` turned out to ignore its camera argument and read `state` directly.
//
// So this counts distinct pictures, both ways, and insists the ship's own position is stepped
// either way - because the disk's motion is what every other harness reads.
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';

const results = [];
const check = (what, ok, detail = '') => {
  results.push({ what, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};

/** One run: set the switch, fly in open space, count distinct pictures and watch `state.z`. */
async function fly(on) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(PORT_URL, { waitUntil: 'load' });
  await page.evaluate((v) => {
    try { localStorage.setItem('spaceVikingsQol', JSON.stringify(v ? { smoothFlight: true } : {})); }
    catch { /* storage refused */ }
  }, on);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikingsState),
    null, { timeout: 30000 });

  const out = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const scene = () => {
      const l = window.__gameLog.getLog();
      return l.length ? l[l.length - 1].scene : '?';
    };
    const init = { key: 'N', code: 'KeyN', bubbles: true };
    window.dispatchEvent(new KeyboardEvent('keydown', init));
    window.dispatchEvent(new KeyboardEvent('keyup', init));
    for (let i = 0; i < 600 && scene() !== 'cockpit'; i++) await sleep(70);
    if (scene() !== 'cockpit') throw new Error('no cockpit');
    await sleep(1800);

    const s = window.__spaceVikingsState;
    // Open space at full speed, which is where the starfield has the most to say.
    Object.assign(s, { atmosphere: 0, speed: 120, x: 700, y: 200, z: -6880, pitch: 0, heading: 0 });
    await sleep(400);

    const c = document.getElementById('stage');
    const g = c.getContext('2d');
    const hash = () => {
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let h = 0;
      for (let i = 0; i < d.length; i += 211) h = (h * 31 + d[i]) | 0;
      return h;
    };

    const SECONDS = 8;
    const pictures = new Set();
    const zSeen = new Set();
    let frames = 0;
    const t0 = performance.now();
    await new Promise((done) => {
      const step = () => {
        pictures.add(hash());
        zSeen.add(Math.round(s.z));
        frames++;
        if (performance.now() - t0 < SECONDS * 1000) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    });

    const zs = [...zSeen].sort((a, b) => a - b);
    const steps = zs.slice(1).map((v, i) => v - zs[i]);
    return {
      seconds: SECONDS,
      browserFrames: frames,
      pictures: pictures.size,
      perSecond: +(pictures.size / SECONDS).toFixed(2),
      zSteps: steps,
    };
  });

  for (const e of errors.slice(0, 3)) console.log('page error:', e);
  await browser.close();
  return out;
}

console.log('with the switch off, which is the machine:');
const off = await fly(false);
console.log(`  ${off.browserFrames} browser frames, ${off.pictures} distinct pictures `
  + `in ${off.seconds}s`);
// A pass is about 2.55 s, so eight seconds is three or four new pictures. Anything much above
// that means the gate has stopped working and the port is drawing faster than the disk did.
check('off, the picture changes about once a pass', off.perSecond > 0 && off.perSecond < 1.5,
  `${off.perSecond} a second`);

console.log('');
console.log('with the switch on:');
const on = await fly(true);
console.log(`  ${on.browserFrames} browser frames, ${on.pictures} distinct pictures `
  + `in ${on.seconds}s`);
// The bug this exists for gave 0.17 a second with the switch on - indistinguishable from off.
// Eight is far below what a working version manages (measured around 17) and far above what a
// broken one can reach.
check('on, the view actually moves between steps', on.perSecond > 8,
  `${on.perSecond} a second, against ${off.perSecond} off`);
check('and that is a real difference, not noise', on.perSecond > off.perSecond * 5,
  `${(on.perSecond / Math.max(off.perSecond, 0.01)).toFixed(0)}x`);

// The important half: the switch is allowed to move the camera and nothing else.
for (const [name, r] of [['off', off], ['on', on]]) {
  const stepped = r.zSteps.length > 0 && r.zSteps.every((d) => Math.abs(d - 120) < 0.001);
  check(`${name}, the ship's own position still steps 120 at a time`, stepped,
    r.zSteps.join(', ') || 'no movement seen');
}

fs.mkdirSync('captured/smoothflight', { recursive: true });
fs.writeFileSync('captured/smoothflight/port.json',
  JSON.stringify({ off, on, results }, null, 1) + String.fromCharCode(10));

const failed = results.filter((r) => !r.ok).length;
console.log('');
console.log(failed === 0 ? `smooth flight: all ${results.length} checks passed`
  : `smooth flight: ${failed} of ${results.length} failed`);
process.exit(failed === 0 ? 0 : 1);
