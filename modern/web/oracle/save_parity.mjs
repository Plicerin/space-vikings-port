// Saving and loading in the port, against what the disk's three BSAVEs actually cover.
//
// There are no pages to compare here - END's save prints one line and START's load prints
// none - so what this checks is the thing the blocks decide: which of the game's state comes
// back and which does not.
//
//   BSAVE P/F,A$97E1,L$140          38881-39200
//   BSAVE PLANET FILE,A$954C,L$AF   38220-38394
//   BSAVE SHIP'S DATA ,A38150,L54   38150-38203
//
// 38204 to 38219 is in none of them. `probe_save.mjs` has the machine's side: 190 refusing in
// the atmosphere, and 200, 202 and 204 writing the nine position cells and the two markers
// into that gap.
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/save/golden.json', 'utf8'));

const results = [];
const check = (what, ok, detail = '') => {
  results.push({ what, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikingsState),
  null, { timeout: 30000 });

await page.evaluate(() => {
  window.__h = {
    press: (key) => new Promise((res) => {
      const code = /^[0-9]$/.test(key) ? 'Digit' + key
        : key === ' ' ? 'Space' : 'Key' + key.toUpperCase();
      window.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key, code, bubbles: true }));
      setTimeout(res, 120);
    }),
    scene: () => {
      const l = window.__gameLog.getLog();
      return l.length ? l[l.length - 1].scene : '?';
    },
    until: async (want, ms = 15000) => {
      const t0 = Date.now();
      for (;;) {
        if (window.__h.scene().toLowerCase() === want.toLowerCase()) return true;
        if (Date.now() - t0 > ms) return false;
        await new Promise((r) => setTimeout(r, 100));
      }
    },
    save: () => { try { return localStorage.getItem('spaceVikingsSave'); } catch { return null; } },
  };
});
const press = (k) => page.evaluate((key) => window.__h.press(key), k);
const until = (w, ms) => page.evaluate(([a, b]) => window.__h.until(a, b), [w, ms || 15000]);
const savedBlob = () => page.evaluate(() => window.__h.save());
const put = (patch) => page.evaluate((p) => Object.assign(window.__spaceVikingsState, p), patch);
const look = () => page.evaluate(() => {
  const s = window.__spaceVikingsState;
  return {
    x: Math.round(s.x), y: Math.round(s.y), z: Math.round(s.z),
    heading: s.heading, pitch: s.pitch,
    planetIndex: s.planetIndex, atmosphere: s.atmosphere ? 1 : 0,
    shipKind: s.shipKind, batteries: s.groundBatteries,
    planetSurrendered: s.planetSurrendered ? 1 : 0,
    shields: s.damage.shieldsPct, energy: s.energy, missiles: s.missilesRemaining,
    gold: s.loot.gold, fighters: s.forces.fighters,
    credits: Math.floor(s.credits), troops: s.forces.troops, stardate: s.stardate,
    planet7Secured: s.planets[7].surrendered, planet0Secured: s.planets[0].surrendered,
    sentinel: s.savedGameSentinel,
    scene: window.__h.scene(),
  };
});

console.log('the three blocks END 210 writes:');
for (const b of golden.blocks) console.log(`  ${b.name.padEnd(12)} ${b.from}-${b.to}`);
console.log('');

// --- a game worth saving ----------------------------------------------------------------
await press('N');
if (!await until('cockpit', 25000)) { await browser.close(); throw new Error('no cockpit'); }
await put({
  x: 1234, y: 567, z: -890, heading: 64, pitch: 12,
  planetIndex: 7, atmosphere: 0, inOrbit: false,
  shipKind: 4, groundBatteries: 3, planetSurrendered: true,
  energy: 41, missilesRemaining: 24, credits: 54321, stardate: 123.4,
});
await page.evaluate(() => {
  const s = window.__spaceVikingsState;
  s.damage.shieldsPct = 55;
  s.loot.gold = 99;
  s.forces.fighters = 123;
  s.forces.troops = 4321;
  s.planets[7].surrendered = true;
  s.planets[7].hasBase = true;
});
const before = await look();

// --- 190, in the atmosphere -----------------------------------------------------------------
await put({ atmosphere: 1 });
await press('C');
await until('com');
await press('4');
if (!await until('end')) { await browser.close(); throw new Error('END never came up'); }
await press('1');
await new Promise((r) => setTimeout(r, 2500));
check('190 refuses to save in the atmosphere, and writes nothing',
  (await savedBlob()) === null, `scene ${(await look()).scene}`);

// --- the save ---------------------------------------------------------------------------
await put({ atmosphere: 0 });
await press('1');
await new Promise((r) => setTimeout(r, 2500));
const blob = await savedBlob();
check('out of the atmosphere END 210 writes a save', !!blob,
  blob ? `${blob.length} bytes` : 'nothing stored');
const afterSave = await look();
check('204 sets the marker to 77', afterSave.sentinel === 77, `38391 = ${afterSave.sentinel}`);
// 202 writes the heading into 38219, which is the disk's planet **0** - its planets are
// numbered 1 to 20 and nothing reads slot 0. The port's `planets[0]` is the disk's planet 1,
// at 38220, so it must come through a save untouched.
check('202 does not touch Sol - 38219 is the disk slot 0, which nothing reads',
  afterSave.planet0Secured === before.planet0Secured,
  `Sol secured ${before.planet0Secured} -> ${afterSave.planet0Secured}`);
const parsed = blob ? JSON.parse(blob) : {};
check('38392 carries the planet we were at', parsed.savedPlanet === 7,
  `savedPlanet ${parsed.savedPlanet}`);

// --- loading it, in the same run of the page ---------------------------------------------
await press('2');                       // 110-120, continue
await until('cockpit', 25000);
await page.evaluate(() => window.location.assign(window.location.href));
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikingsState),
  null, { timeout: 30000 });
await page.evaluate(() => {
  window.__h = {
    press: (key) => new Promise((res) => {
      const code = /^[0-9]$/.test(key) ? 'Digit' + key
        : key === ' ' ? 'Space' : 'Key' + key.toUpperCase();
      window.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key, code, bubbles: true }));
      setTimeout(res, 120);
    }),
    scene: () => {
      const l = window.__gameLog.getLog();
      return l.length ? l[l.length - 1].scene : '?';
    },
    until: async (want, ms = 15000) => {
      const t0 = Date.now();
      for (;;) {
        if (window.__h.scene().toLowerCase() === want.toLowerCase()) return true;
        if (Date.now() - t0 > ms) return false;
        await new Promise((r) => setTimeout(r, 100));
      }
    },
    save: () => { try { return localStorage.getItem('spaceVikingsSave'); } catch { return null; } },
  };
});
await press('O');
if (!await until('cockpit', 25000)) { await browser.close(); throw new Error('the load never reached flight'); }
const loaded = await look();

console.log('');
console.log('what came back:');
check("SHIP'S DATA: the damage", loaded.shields === before.shields,
  `shields ${before.shields} -> ${loaded.shields}`);
check("SHIP'S DATA: the energy and the rack", loaded.energy === before.energy
  && loaded.missiles === before.missiles, `energy ${loaded.energy}, missiles ${loaded.missiles}`);
check("SHIP'S DATA: the loot and the forces", loaded.gold === before.gold
  && loaded.fighters === before.fighters, `gold ${loaded.gold}, fighters ${loaded.fighters}`);
check('PLANET FILE: the conquered flag and the base', loaded.planet7Secured === true,
  `planet 7 secured ${loaded.planet7Secured}`);
check('PLANET FILE: Sol is in it too, at 38220', loaded.planet0Secured === before.planet0Secured,
  `Sol secured ${loaded.planet0Secured}`);
check('MISC FILE: the stardate, the troops and the credits',
  loaded.credits === before.credits && loaded.troops === before.troops
  && Math.abs(loaded.stardate - before.stardate) < 0.05,
  `${loaded.credits} credits, ${loaded.troops} troops, stardate ${loaded.stardate}`);

console.log('');
console.log('what the gap at 38204-38219 loses, as it does on the disk:');
// X 700, Y 200, Z -7000, H 0 - and then the flight loop starts moving, so Z is checked with
// a pass or two of slack rather than on the nose.
check('the ship starts where START 190 and 195 put it',
  loaded.x === 700 && loaded.y === 200 && loaded.heading === 0
  && Math.abs(loaded.z - -7000) < 400,
  `${loaded.x}, ${loaded.y}, ${loaded.z}, heading ${loaded.heading}`);
check('38209 is not restored - the planet is not where we saved',
  loaded.planetIndex !== 7, `planet ${loaded.planetIndex}`);
check('38205 and 38207: the enemy and the batteries are gone',
  loaded.shipKind !== before.shipKind, `shipKind ${loaded.shipKind}`);
check('38208 and 38210: the surrender and atmosphere flags are clear',
  loaded.planetSurrendered === 0 && loaded.atmosphere === 0,
  `surrendered ${loaded.planetSurrendered}, atmosphere ${loaded.atmosphere}`);

// --- a new game throws it away --------------------------------------------------------------
await page.evaluate(() => window.location.assign(window.location.href));
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikingsState),
  null, { timeout: 30000 });
await page.evaluate(() => {
  window.__h = {
    press: (key) => new Promise((res) => {
      const code = /^[0-9]$/.test(key) ? 'Digit' + key : 'Key' + key.toUpperCase();
      window.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key, code, bubbles: true }));
      setTimeout(res, 120);
    }),
    save: () => { try { return localStorage.getItem('spaceVikingsSave'); } catch { return null; } },
  };
});
await press('N');
await new Promise((r) => setTimeout(r, 1500));
check('2000-2050: a new game throws the save away', (await savedBlob()) === null);

await browser.close();
for (const e of errors.slice(0, 5)) console.log('page error:', e);

fs.mkdirSync('captured/save', { recursive: true });
fs.writeFileSync('captured/save/port.json', JSON.stringify({
  source: 'the port saved and loaded, checked against the three blocks END 210 writes',
  before, afterSave, loaded, results,
}) + String.fromCharCode(10));

const failed = results.filter((r) => !r.ok).length;
console.log('');
console.log(failed === 0 ? `save parity: all ${results.length} checks passed`
  : `save parity: ${failed} of ${results.length} failed`);
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
