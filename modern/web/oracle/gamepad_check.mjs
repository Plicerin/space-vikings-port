// The gamepad, driven by a fake one.
//
// There is no pad on the machine - this is an addition, behind the `gamepad` switch - so there
// is nothing to compare it against. What there is to check is that it does what the keyboard
// does and nothing more: off it is inert, on it flies and fires, and a **held** button is one
// press and not sixty a second, because `Input` models the Apple's one-key latch and a poller
// that overwrote it every frame would turn a press into a stream.
//
// `navigator.getGamepads` is stubbed with a pad the test moves itself, which is the only way
// to drive this without hardware.
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';

const results = [];
const check = (what, ok, detail = '') => {
  results.push({ what, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};

async function run(gamepadOn) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(PORT_URL, { waitUntil: 'load' });
  await page.evaluate((on) => {
    try {
      localStorage.setItem('spaceVikingsQol', JSON.stringify(on ? { gamepad: true } : {}));
    } catch { /* storage refused */ }
  }, gamepadOn);

  // The stub has to be in place before the page's modules run, so it goes in on the reload.
  await page.addInitScript(() => {
    const pad = {
      connected: true, index: 0, id: 'oracle fake pad', mapping: 'standard',
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 })),
    };
    window.__pad = pad;
    navigator.getGamepads = () => [pad, null, null, null];
  });
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
    const pad = window.__pad;
    const hold = (i, down) => { pad.buttons[i].pressed = down; pad.buttons[i].value = down ? 1 : 0; };

    key('N');
    for (let i = 0; i < 160 && scene() !== 'cockpit'; i++) await sleep(250);
    await sleep(1500);

    const s = window.__spaceVikingsState;
    Object.assign(s, {
      x: 400, y: -100, z: -4300, heading: 0, pitch: 0, speed: 0, atmosphere: 0,
      shipKind: 3, shipVitality: 0, shipDestructionLimit: 10000, missilesRemaining: 60,
      weaponMode: 'missile', missileMode: true, autopilot: false,
    });
    await sleep(400);

    // --- the fire button, held ---------------------------------------------------------
    const before = s.missilesRemaining;
    hold(0, true);
    await sleep(2500);                 // well past a frame, nowhere near the 6.69 s interval
    const whileHeld = s.missilesRemaining;
    hold(0, false);
    await sleep(300);

    // --- the stick, which is a key held down -------------------------------------------
    //
    // This held the stick for 1800 ms and watched the heading, which worked while the port
    // steered by adding to a heading every browser frame. It does not any more: the controls
    // are the disk's, so a held stick banks one step a pass and the *bank* turns the nose -
    // and the first step, bank 4, is inside the heading dead band. Three passes at 2.55 s
    // each, and the thing to watch first is the bank.
    const bank0 = s.bank;
    pad.axes[0] = -1;                  // hard left
    await sleep(9000);
    const bankHeld = s.bank;
    pad.axes[0] = 0;
    await sleep(300);

    // And the reason a stick is not just four arrow keys: it is a paddle, and the control
    // table has four step sizes. Half deflection has to land on a smaller one than hard over.
    // Measured from the same place both times so the comparison is only about the stick.
    const bankOver = async (axis, ms) => {
      s.bank = 0;
      await sleep(100);
      pad.axes[0] = axis;
      await sleep(ms);
      pad.axes[0] = 0;
      const b = s.bank;
      await sleep(200);
      return b > 127 ? b - 256 : b;
    };
    const full = await bankOver(-1, 6000);
    const half = await bankOver(-0.6, 6000);
    // The cockpit keeps heading to itself and writes it back on the way out, so ask for COM.
    key('C');
    for (let i = 0; i < 160 && scene() !== 'com'; i++) await sleep(150);
    await sleep(400);

    return {
      gamepadOn: sv.qolOn('gamepad'),
      firedWhileHeld: before - whileHeld,
      heading: s.heading,
      bank: ((bankHeld - bank0) > 127 ? bankHeld - bank0 - 256 : bankHeld - bank0),
      full, half,
      scene: scene(),
    };
  });

  await browser.close();
  for (const e of errors.slice(0, 3)) console.log('page error:', e);
  return out;
}

console.log('with the switch off:');
const off = await run(false);
check('the switch reads off', off.gamepadOn === false);
check('a held fire button does nothing', off.firedWhileHeld === 0,
  `${off.firedWhileHeld} missiles spent`);
check('the stick does not steer', off.heading === 0 && off.bank === 0,
  `heading ${off.heading}, bank ${off.bank}`);

console.log('');
console.log('with the switch on:');
const on = await run(true);
check('the switch reads on', on.gamepadOn === true);
// Two is one shot: 1090 takes two from 38187 whether it hits or misses. Holding the button
// for two and a half seconds must not give more than that - the interval is 6.69 s.
check('a held fire button is one shot, not a stream', on.firedWhileHeld === 2,
  `${on.firedWhileHeld} missiles spent`);
// Bank first, because that is what the stick actually moves; heading follows from it, and
// only once the bank is out of the 0-4 dead band.
check('the stick banks the ship', on.bank !== 0, `bank 0 to ${on.bank}`);
check('and the bank turns the nose', on.heading !== 0, `heading ${on.heading}`);
// A key is on or off and a paddle is not. Half over has to bank less than hard over, in the
// same time - which is only true because the stick hands PDL(0) a real 0..255 now.
check('half a stick is a smaller step than all of it',
  on.half !== 0 && Math.abs(on.half) < Math.abs(on.full),
  `${on.full} hard over, ${on.half} at 0.6`);

fs.mkdirSync('captured/gamepad', { recursive: true });
fs.writeFileSync('captured/gamepad/result.json', JSON.stringify({
  source: 'a stubbed Gamepad API, with the switch off and on',
  off, on, results,
}) + String.fromCharCode(10));

const failed = results.filter((r) => !r.ok).length;
console.log('');
console.log(failed === 0 ? `gamepad: all ${results.length} checks passed`
  : `gamepad: ${failed} of ${results.length} failed`);
process.exit(failed === 0 ? 0 : 1);
