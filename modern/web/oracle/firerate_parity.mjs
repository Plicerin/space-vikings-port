// How fast the port lets you fire, against how fast the machine does.
//
// `probe_firerate.mjs` held the paddle button down on the machine and timed the cells a shot
// moves: a missile every 400-402 frames (6.69 s) and a laser every 355-359 (5.99 s), because
// 185 tests the button once a pass and a pass that fires is a long one.
//
// This holds the key down in the port and times the same thing. It runs twice: once as the
// disk plays it, and once with the `fastFire` switch on, which is the QOL panel's way of
// putting the old 0.45 s back.
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/firerate/golden.json', 'utf8'));

/** Drive one run in a fresh context, so no setting leaks between them. */
async function measure(fastFire) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(PORT_URL, { waitUntil: 'load' });
  await page.evaluate((on) => {
    try {
      localStorage.setItem('spaceVikingsQol', JSON.stringify(on ? { fastFire: true } : {}));
    } catch { /* storage refused */ }
  }, fastFire);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikingsState),
    null, { timeout: 30000 });

  const out = await page.evaluate(async () => {
    const sv = window.__spaceVikings;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const scene = () => {
      const l = window.__gameLog.getLog();
      return l.length ? l[l.length - 1].scene : '?';
    };
    const key = (k) => {
      const code = k === ' ' ? 'Space' : 'Key' + k.toUpperCase();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: k, code, bubbles: true }));
    };
    key('N');
    for (let i = 0; i < 160 && scene() !== 'cockpit'; i++) await sleep(250);
    await sleep(1500);

    const s = window.__spaceVikingsState;
    Object.assign(s, {
      x: 400, y: -100, z: -4300, heading: 0, pitch: 0, speed: 0, atmosphere: 0,
      shipKind: 3, shipVitality: 0, shipDestructionLimit: 10000, missilesRemaining: 250,
      weaponMode: 'missile', missileMode: true, autopilot: false, commanderMode: false,
    });
    await sleep(400);

    // Hold it: a press every 60 ms, so the limit measured is the game's and not the hand's.
    const t0 = Date.now();
    const at = [];
    let last = s.missilesRemaining;
    for (let i = 0; i < 400 && at.length < 5; i++) {
      key(' ');
      await sleep(60);
      if (s.missilesRemaining !== last) { at.push(Date.now() - t0); last = s.missilesRemaining; }
    }
    return { at, fastFire: sv.qolOn('fastFire'), missilesLeft: s.missilesRemaining };
  });

  await browser.close();
  for (const e of errors.slice(0, 3)) console.log('page error:', e);
  const gaps = out.at.slice(1).map((m, i) => m - out.at[i]);
  return { ...out, gaps };
}

const results = {};
for (const fast of [false, true]) {
  const r = await measure(fast);
  results[fast ? 'fastFire' : 'asTheDiskPlaysIt'] = r;
  const label = fast ? 'with fastFire on ' : 'as the disk plays it';
  console.log(`${label}: switch reads ${r.fastFire}, ${r.at.length} shots, `
    + `gaps ${r.gaps.map((g) => (g / 1000).toFixed(2)).join(', ')} s`);
}

const diskMissileMs = (() => {
  const m = golden.missile;
  if (!m || m.length < 2) return null;
  const gaps = m.slice(1).map((x, i) => x.frame - m[i].frame);
  gaps.sort((a, b) => a - b);
  return gaps[gaps.length >> 1] * golden.frameMs;
})();

console.log('');
console.log(`the machine's missile interval: ${(diskMissileMs / 1000).toFixed(2)} s`);

const slow = results.asTheDiskPlaysIt.gaps;
const fast = results.fastFire.gaps;
// A frame of slack either way: the port runs its cooldown off wall-clock deltas.
const slowOk = slow.length >= 2 && slow.every((g) => Math.abs(g - diskMissileMs) < 400);
const fastOk = fast.length >= 2 && fast.every((g) => g < 1500);
console.log(`  ${slowOk ? 'ok  ' : 'FAIL'}  off, the port fires at the machine's rate`);
console.log(`  ${fastOk ? 'ok  ' : 'FAIL'}  on, fastFire puts it back under a second and a half`);

fs.mkdirSync('captured/firerate', { recursive: true });
fs.writeFileSync('captured/firerate/port.json', JSON.stringify({
  source: 'the key held down in the port, with the fastFire switch off and on',
  diskMissileMs, results,
}) + String.fromCharCode(10));
console.log('');
console.log(slowOk && fastOk ? 'fire rate parity: clean' : 'fire rate parity: FAILED');
process.exit(slowOk && fastOk ? 0 : 1);
