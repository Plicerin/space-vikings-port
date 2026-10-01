// Save slots, which the disk does not have.
//
// There is nothing to compare against here - END writes over the same three files every time,
// so the machine keeps one game - and that is exactly why this is behind a switch. What there
// is to check is that the addition does what it claims and that it leaves the disk's behaviour
// alone when it is off, which `save_parity.mjs` covers from the other side.
//
// Two things are claimed: four saves that do not tread on each other, and a game that comes
// back **where it was**. The second is the whole point: the disk loses the ship's position to
// a power cycle because 38211-38219 is in none of the three BSAVEs, and with slots on those
// nine cells travel in the payload instead.
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';

const results = [];
const check = (what, ok, detail = '') => {
  results.push({ what, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};

const HELPERS = () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const scene = () => {
    const l = window.__gameLog.getLog();
    return l.length ? l[l.length - 1].scene : '?';
  };
  const key = (k) => {
    const code = /^[0-9]$/.test(k) ? 'Digit' + k : k === ' ' ? 'Space' : 'Key' + k.toUpperCase();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: k, code, bubbles: true }));
  };
  const arrive = async (want, ms = 30000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (scene().toLowerCase() === want.toLowerCase()) return true;
      await sleep(70);
    }
    return false;
  };
  window.__h = { sleep, scene, key, arrive };
};

/** Reload and wait for the game to be up again, which empties the session gap holder. */
async function reopen(page) {
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikingsState),
    null, { timeout: 30000 });
  await page.evaluate(HELPERS);
}

async function open(withSlots) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(PORT_URL, { waitUntil: 'load' });
  await page.evaluate((on) => {
    try { localStorage.setItem('spaceVikingsQol', JSON.stringify(on ? { saveSlots: true } : {})); }
    catch { /* storage refused */ }
  }, withSlots);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikingsState),
    null, { timeout: 30000 });
  await page.evaluate(HELPERS);
  return { browser, page, errors };
}

/** Start a game, put the ship somewhere recognisable, and save it into `slot`. */
async function playAndSave(page, slot, mark) {
  return page.evaluate(async ({ slot, mark }) => {
    const h = window.__h;
    h.key('N');
    if (!await h.arrive('cockpit', 35000)) throw new Error('no cockpit');
    await h.sleep(1200);
    const s = window.__spaceVikingsState;
    Object.assign(s, {
      x: mark.x, y: mark.y, z: mark.z, heading: mark.heading, pitch: 0, speed: 0,
      atmosphere: 0, inOrbit: false, planetIndex: mark.planet,
      credits: mark.credits, stardate: mark.stardate,
    });
    s.forces.troops = mark.troops;
    s.damage.shieldsPct = mark.shields;
    await h.sleep(400);

    h.key('C'); if (!await h.arrive('com')) throw new Error('no COM');
    await h.sleep(500);
    h.key('4'); if (!await h.arrive('end')) throw new Error('no END');
    await h.sleep(600);
    h.key('1');                       // SAVE GAME
    await h.sleep(700);               // the chooser
    h.key(String(slot));
    await h.sleep(2500);
    return { stored: Object.keys(localStorage).filter((k) => k.startsWith('spaceVikingsSave')) };
  }, { slot, mark });
}

/** Load `slot` from the title screen and report what came back. */
async function loadSlot(page, slot) {
  return page.evaluate(async ({ slot }) => {
    const h = window.__h;
    h.key('O');
    await h.sleep(700);               // the chooser
    h.key(String(slot));
    if (!await h.arrive('cockpit', 35000)) throw new Error('the load never reached flight');
    await h.sleep(1200);
    const s = window.__spaceVikingsState;
    return {
      x: Math.round(s.x), y: Math.round(s.y), z: Math.round(s.z), heading: s.heading,
      planet: s.planetIndex, credits: Math.floor(s.credits), stardate: s.stardate,
      troops: s.forces.troops, shields: s.damage.shieldsPct,
    };
  }, { slot });
}

const TWO = { x: 1111, y: 222, z: -3333, heading: 64, planet: 4, credits: 22222,
  stardate: 122.2, troops: 2222, shields: 22 };
const THREE = { x: 777, y: -88, z: -999, heading: 128, planet: 9, credits: 33333,
  stardate: 133.3, troops: 3333, shields: 33 };

console.log('with the switch on:');
const a = await open(true);
const savedTwo = await playAndSave(a.page, 2, TWO);
await reopen(a.page);
const savedThree = await playAndSave(a.page, 3, THREE);
check('two saves land in two keys',
  savedThree.stored.includes('spaceVikingsSave:2') && savedThree.stored.includes('spaceVikingsSave:3'),
  savedThree.stored.join(' '));
check('slot 1 is untouched', !savedThree.stored.includes('spaceVikingsSave'),
  savedTwo.stored.join(' ') || 'nothing in slot 1');

// A reload first, so nothing is coming out of the session's own memory.
await reopen(a.page);
const two = await loadSlot(a.page, 2);
check('slot 2 comes back as slot 2', two.credits === TWO.credits && two.troops === TWO.troops
  && two.shields === TWO.shields, `${two.credits} CR, ${two.troops} troops, ${two.shields}% shields`);
check('and it comes back where it was', two.x === TWO.x && two.planet === TWO.planet
  && Math.abs(two.z - TWO.z) < 400,
  `${two.x}, ${two.y}, ${two.z} at planet ${two.planet}`);

// The other slot, from the same storage - a fresh browser would have none of it.
await reopen(a.page);
const three = await loadSlot(a.page, 3);
check('slot 3 is the other game', three.credits === THREE.credits && three.planet === THREE.planet,
  `${three.credits} CR at planet ${three.planet}`);
check('and it comes back where slot 3 was', three.x === THREE.x,
  `${three.x}, ${three.y}, ${three.z}`);

// An answer that is not a slot. Neither chooser has a line of BASIC behind it, so there is
// no disk behaviour to copy - the rule is that it leaves the menu where it was and writes
// nothing, rather than guessing at a slot.
const cancelled = await a.page.evaluate(async () => {
  const h = window.__h;
  h.key('C'); await h.arrive('com'); await h.sleep(500);
  h.key('4'); await h.arrive('end'); await h.sleep(600);
  h.key('1'); await h.sleep(800);          // the chooser
  h.key('9'); await h.sleep(900);          // not a slot
  return { scene: h.scene(), stored: Object.keys(localStorage).filter((k) => k.startsWith('spaceVikingsSave')) };
});
check('a key that is not a slot writes nothing and stays in END',
  cancelled.scene === 'end' && !cancelled.stored.includes('spaceVikingsSave'),
  `${cancelled.scene}, ${cancelled.stored.join(' ')}`);

await reopen(a.page);
const titleCancel = await a.page.evaluate(async () => {
  const h = window.__h;
  h.key('O'); await h.sleep(800);          // the chooser
  h.key('9'); await h.sleep(900);          // not a slot
  const before = h.scene();
  h.key('O'); await h.sleep(800);          // and it can be asked again
  h.key('2');
  const flew = await h.arrive('cockpit', 35000);
  return { before, flew };
});
check('and on the title it goes back to the prompt, which still works',
  titleCancel.before === 'start' && titleCancel.flew, titleCancel.before);

for (const e of a.errors.slice(0, 3)) console.log('page error:', e);
await a.browser.close();

console.log('');
console.log('with the switch off:');
const b = await open(false);
const off = await b.page.evaluate(async () => {
  const h = window.__h;
  h.key('N');
  if (!await h.arrive('cockpit', 35000)) throw new Error('no cockpit');
  await h.sleep(1200);
  Object.assign(window.__spaceVikingsState, { atmosphere: 0, credits: 4242 });
  h.key('C'); await h.arrive('com'); await h.sleep(500);
  h.key('4'); await h.arrive('end'); await h.sleep(600);
  h.key('1');                       // no chooser should appear
  await h.sleep(2500);
  return { stored: Object.keys(localStorage).filter((k) => k.startsWith('spaceVikingsSave')) };
});
check('one save, in the plain key, with no slot asked for',
  off.stored.length === 1 && off.stored[0] === 'spaceVikingsSave', off.stored.join(' '));
await b.browser.close();

fs.mkdirSync('captured/saveslots', { recursive: true });
fs.writeFileSync('captured/saveslots/result.json', JSON.stringify({
  source: 'the save slots addition, driven with the switch on and off',
  two, three, off, results,
}) + String.fromCharCode(10));

const failed = results.filter((r) => !r.ok).length;
console.log('');
console.log(failed === 0 ? `save slots: all ${results.length} checks passed`
  : `save slots: ${failed} of ${results.length} failed`);
process.exit(failed === 0 ? 0 : 1);
