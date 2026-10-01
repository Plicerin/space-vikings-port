// A game played end to end, checked on where it goes rather than on what it draws.
//
// Every other harness here compares pixels. This one asks a different question: does the game
// still work? It walks a whole loop - fly in, re-enter, orbit, come back down, take the planet,
// collect the loot, build a base, sell the haul, enlist, jump to another system - and checks the
// scene it lands in and the state each step is supposed to leave behind.
//
// That is the class of bug the pixel harnesses keep missing. RADAR drawing perfectly but
// returning to the wrong program, the ship identification screen being unreachable, the galaxy
// directory coming back to the wrong menu: all of those were right in every capture and wrong in
// the game.
//
// Two shortcuts are taken deliberately and marked where they happen. The ship is placed rather
// than flown, because a pass of the main loop is two and a half seconds and crossing the map
// takes minutes; and a planet's surrender flag is cleared so the assault has something to do.
// Neither invents behaviour - they set the state the game would have reached.
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikingsState),
  null, { timeout: 30000 });

await page.exposeFunction('noop', () => {});
await page.evaluate(() => {
  const press = (key) => new Promise((res) => {
    const code = /^[0-9]$/.test(key) ? 'Digit' + key
      : key === ' ' ? 'Space' : 'Key' + key.toUpperCase();
    window.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key, code, bubbles: true }));
    setTimeout(res, 60);
  });
  window.__play = {
    press,
    scene: () => {
      const l = window.__gameLog.getLog();
      return l.length ? l[l.length - 1].scene : '?';
    },
    /** Wait for a scene, or give up. */
    until: async (want, ms = 12000) => {
      const t0 = Date.now();
      for (;;) {
        if (window.__play.scene().toLowerCase() === want.toLowerCase()) return true;
        if (Date.now() - t0 > ms) return false;
        await new Promise((r) => setTimeout(r, 100));
      }
    },
  };
});

const results = [];
const check = (what, ok, detail = '') => {
  results.push({ what, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};
const scene = () => page.evaluate(() => window.__play.scene());
const state = () => page.evaluate(() => {
  const s = window.__spaceVikingsState;
  return {
    scene: window.__play.scene(),
    x: Math.round(s.x), y: Math.round(s.y), z: Math.round(s.z),
    atmosphere: s.atmosphere, inOrbit: s.inOrbit, planetIndex: s.planetIndex,
    surrendered: s.planetSurrendered, credits: Math.floor(s.credits),
    troops: s.forces.troops, troopLocation: s.forces.troopLocation,
    troopPlanet: s.forces.troopPlanetIndex, hasBase: s.planets[s.planetIndex].hasBase,
    stardate: s.stardate, shipDamaged: s.shipDamaged, gold: s.loot.gold,
    runGroundForcesOnReturn: s.runGroundForcesOnReturn,
  };
});
const press = (k) => page.evaluate((key) => window.__play.press(key), k);
const until = (w, ms) => page.evaluate(([want, t]) => window.__play.until(want, t), [w, ms || 12000]);
/** Wait for a condition on the state, which is what most of these steps are really about. */
const untilState = async (pred, ms = 20000) => {
  const t0 = Date.now();
  for (;;) {
    if (pred(await state())) return true;
    if (Date.now() - t0 > ms) return false;
    await new Promise((r) => setTimeout(r, 200));
  }
};
const put = (patch) => page.evaluate((p) => Object.assign(window.__spaceVikingsState, p), patch);

console.log('a game, start to finish');
console.log('');

// --- into flight ---------------------------------------------------------------------------
await press('N');
check('the title starts a game', await until('cockpit', 20000), `scene ${await scene()}`);

// --- re-entry ------------------------------------------------------------------------------
// The shortcut: put the ship inside line 156's cube - `ABS(X) < 900 AND ABS(Y) < 900 AND
// ABS(Z) < 900` - instead of flying there, which at 120 units a pass would take minutes.
await put({ x: 100, y: 100, z: -500 });
check('flying into the planet re-enters', await untilState((s) => s.atmosphere),
  JSON.stringify(await (async () => { const s = await state(); return { y: s.y, z: s.z, atmosphere: s.atmosphere }; })()));
{
  const s = await state();
  // RE 27-35: Y1 = 0, Y2 = 4 is 1024, and Z1 = 168, Z2 = 228 is -7000 signed.
  check('RE leaves the ship where lines 27-35 put it', s.y >= 900 && s.y <= 1100 && s.z <= -6800 && s.z >= -7100,
    `y ${s.y}, z ${s.z}`);
}

// --- orbit ---------------------------------------------------------------------------------
// Line 158: `IF PEEK(38210) = 1 AND Y > 4000 THEN RUN ORBIT`.
await put({ y: 4200 });
check('climbing out of the atmosphere reaches orbit', await untilState((s) => s.inOrbit),
  JSON.stringify(await (async () => {
    const s = await state(); return { inOrbit: s.inOrbit, atmosphere: s.atmosphere, x: s.x, z: s.z };
  })()));

// --- back down, and take the planet --------------------------------------------------------
await put({ x: 100, y: 100, z: -500, inOrbit: false });
check('and back down again', await untilState((s) => s.atmosphere),
  `atmosphere ${(await state()).atmosphere}`);

await page.evaluate(() => {
  const s = window.__spaceVikingsState;
  s.planets[s.planetIndex].surrendered = false;   // the shortcut: something to attack
  s.planetSurrendered = false;
  s.credits = 60000;
});
await press('C');
check('C reaches COM', await until('com'), `scene ${await scene()}`);
await press('2');
check('COM 2 reaches the ground forces menu', await until('groundForces'), `scene ${await scene()}`);
await press('1');
check('1 starts the assault', await until('collect', 90000) || (await scene()) === 'com',
  `scene ${await scene()}`);
{
  const s = await state();
  check('the planet surrenders and the loot is collected', s.surrendered, `gold ${s.gold}`);
}
// COLLECT 17's POKE 38151,7 takes the trip back through COM to the ground-forces menu.
check('a won assault ends in the ground forces menu', await until('groundForces', 30000),
  `scene ${await scene()}`);

// --- shore leave ---------------------------------------------------------------------------
await press('7');
check('7 reaches ESTABLISH BASE', await until('shoreLeave'), `scene ${await scene()}`);
await press('Y');
await until('groundForces', 20000);
{
  const s = await state();
  check('the base is built or refused for a stated reason', s.scene === 'groundForces',
    `base ${s.hasBase}, credits ${s.credits}`);
}
await press('5');
check('5 reaches SELL LOOT', await until('shoreLeave'), `scene ${await scene()}`);
await until('groundForces', 20000);
{
  const s = await state();
  check('the loot is sold and the hold is empty', s.gold === 0, `credits ${s.credits}`);
}

// --- back to flight and away -----------------------------------------------------------------
// --- REPAIR/RESTOCK, which has a gate nothing had ever tested -----------------------------
// 2505 is `IF PEEK(38210) = 0 OR PEEK(29469) > 22`, and 29469 is only the **low byte** of Y,
// the way 140 stores it. So the gate is not really an altitude at all: Y 1030 has a low byte
// of 6 and gets through, while Y 1000 has 232 and does not. 147 parks a landed ship on 20,
// which is what the test was written for.
{
  const grab = () => page.evaluate(() => {
    const s = window.__spaceVikingsState;
    return { e: s.energy, m: s.missilesRemaining };
  });
  const wreck = () => page.evaluate(() => {
    const s = window.__spaceVikingsState;
    s.energy = 9; s.missilesRemaining = 0; s.damage.laserPct = 0; s.credits = 9000000;
  });

  await put({ y: 1000, speed: 0 });
  await wreck();
  await press('6');
  await new Promise((r) => setTimeout(r, 1500));
  const high = await grab();
  check('REPAIR refuses at a Y whose low byte is over 22', high.m === 0 && high.e === 9,
    `y 1000 -> low byte 232, energy ${high.e}, missiles ${high.m}`);
  await until('groundForces', 20000);

  await put({ y: 20 });
  await wreck();
  await press('6');
  let done = null;
  for (let i = 0; i < 60 && !done; i++) {
    const v = await grab();
    if (v.m === 100 && v.e === 63) done = v;
    else await new Promise((r) => setTimeout(r, 300));
  }
  await press('Y');     // 2580's prompt
  check('landed, REPAIR refuels to 63 and restocks to 100', !!done,
    done ? `energy ${done.e}, missiles ${done.m}` : 'never restocked');
  await until('groundForces', 20000);
}

await press('9');
check('9 returns to COM', await until('com'), `scene ${await scene()}`);
await press('5');
check('COM 5 returns to flight', await until('cockpit', 20000), `scene ${await scene()}`);

// --- a jump --------------------------------------------------------------------------------
{
  // H/D line 1: `IF PEEK(38210) = 1 OR PEEK(38209) = PEEK(38163) OR PEEK(38163) = 0 THEN RUN
  // STARSHIP SIMULATOR`. In the atmosphere the jump is refused and the program bounces straight
  // back, so the way out is to take off first.
  await page.evaluate(() => { window.__spaceVikingsState.navDestination = 6; });
  await press('H');
  await new Promise((r) => setTimeout(r, 1500));
  check('H is refused while in the atmosphere', (await state()).planetIndex === 0,
    `planet ${(await state()).planetIndex}`);

  await put({ y: 4200 });
  check('taking off clears the atmosphere', await untilState((s2) => !s2.atmosphere),
    `inOrbit ${(await state()).inOrbit}`);

  const before = await state();
  await page.evaluate(() => { window.__spaceVikingsState.navDestination = 6; });
  await press('H');
  // Wait for the jump itself before waiting to be back in flight - the cockpit is where we
  // already are, so `until('cockpit')` on its own would pass before anything happened.
  const started = await until('hyperdrive', 20000);
  const ok = started && await untilState((s2) => s2.planetIndex === 6, 40000);
  const s = await state();
  check('the hyperdrive jumps and the stardate moves', ok && s.planetIndex === 6
    && s.stardate > before.stardate, `planet ${s.planetIndex}, stardate ${before.stardate} -> ${s.stardate}`);
}

// --- the radar, the one that was returning to the wrong place --------------------------------
await press('R');
check('R reaches the radar', await until('radar', 20000), `scene ${await scene()}`);
await press('Z');
check('any key but X identifies the ship', await until('shipId', 20000), `scene ${await scene()}`);
await press(' ');
await until('radar', 20000);
await press('X');
check('X from a radar opened in flight returns to flight', await until('cockpit', 20000),
  `scene ${await scene()}`);

// --- the enemy ship, the one path nothing had ever flown ---------------------------------------
// 1000-1090 is the only weapon that can destroy it: the laser's J2 is 1, which divided by
// TE + 1 truncates to nothing on every shot, while the missile's is 120. The shot is decided
// inside the pass it was fired in - sixteen steps of 160 along the ship's own forward vector -
// so being 800 short of the target at X9 400, Y9 -100, Z9 -3500 is enough, and the machine
// agreed from that exact place in `probe_missilebox.mjs`.
{
  // The cockpit owns its own heading while it is running and writes it back on the way out,
  // so the way to aim is to set the state from outside the scene and come back in.
  await press('C');
  await until('com', 20000);
  await page.evaluate(() => {
    Object.assign(window.__spaceVikingsState, {
      x: 400, y: -100, z: -4300, heading: 0, pitch: 0, speed: 0,
      atmosphere: 0, inOrbit: false, autopilot: false, commanderMode: false,
      shipKind: 3, shipVitality: 0, shipDestructionLimit: 150,
      missilesRemaining: 60, weaponMode: 'missile', missileMode: true,
    });
  });
  await press('5');
  check('back into flight, lined up on the enemy', await until('cockpit', 20000),
    `scene ${await scene()}`);
  // Nothing is waited for here on purpose. `setScene('cockpit')` is logged before the scene
  // awaits its assets, so this shot is fired into the gap - and the point is that it still
  // lands, because the key sits in the latch at $C000 until the cockpit reads it, the way it
  // does on the machine.

  const vit = () => page.evaluate(() => window.__spaceVikingsState.shipVitality);
  const missiles = () => page.evaluate(() => window.__spaceVikingsState.missilesRemaining);
  // TE is the planet's own tech - line 8's `PEEK(38282 + PEEK(38209))`, a getter here - so the
  // step is whatever that planet gives, not a number chosen for the test.
  const te = await page.evaluate(() => window.__spaceVikingsState.defenseTech);
  const limit = await page.evaluate(() => window.__spaceVikingsState.shipDestructionLimit);
  // 1540's store: `DP = PEEK(38152) + J2 / (TE + 1): IF DP < 255 THEN POKE 38152,DP`, so each
  // shot truncates and the fraction is gone. 1560 then tests the un-truncated DP.
  let want = 0, shots = 0;
  while (want + 120 / (te + 1) <= limit) { want = Math.trunc(want + 120 / (te + 1)); shots++; }
  const before = await missiles();
  await press(' ');
  await new Promise((r) => setTimeout(r, 500));
  const afterOne = await vit();
  const firstStep = Math.trunc(120 / (te + 1));
  check('one missile does 120 / (TE + 1), truncated', afterOne === firstStep,
    `TE ${te}, shipVitality ${afterOne}, expected ${firstStep}`);
  check('and costs two, whatever it hit', (await missiles()) === before - 2,
    `${before} -> ${await missiles()}`);

  // 1560 is `DP > PEEK(38204)`, so it takes one more shot than gets there exactly. Keep
  // firing rather than counting presses - the cockpit has a cooldown and a press inside it
  // is simply lost, which is a property of the port's input and not of 1090.
  let ended = false;
  for (let i = 0; i < shots + 6 && !ended; i++) {
    await press(' ');
    await new Promise((r) => setTimeout(r, 700));
    ended = (await scene()) === 'ex';
  }
  if (!ended) ended = await until('ex', 20000);
  check(`about ${shots + 1} hits destroy the ship and 1560 runs EX`, ended,
    `limit ${limit}, shipVitality ${await vit()}, scene ${await scene()}`);
}

await browser.close();
for (const e of errors.slice(0, 5)) console.log('page error:', e);

fs.mkdirSync('captured/playthrough', { recursive: true });
fs.writeFileSync('captured/playthrough/result.json', JSON.stringify({
  source: 'the port played end to end, checked on scene transitions and state rather than pixels',
  results, pageErrors: errors,
}) + String.fromCharCode(10));

const failed = results.filter((r) => !r.ok).length;
console.log('');
console.log(failed === 0 ? `playthrough: all ${results.length} checks passed`
  : `playthrough: ${failed} of ${results.length} checks failed`);
if (errors.length) console.log(`(${errors.length} page error(s) - see captured/playthrough/result.json)`);
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
