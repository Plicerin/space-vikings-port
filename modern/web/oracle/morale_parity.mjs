// The morale penalty for jumping with the crew grounded, port against machine.
//
// This mechanic came out of the seven cells shipdata_parity could not see past - zero in a new
// game on both sides. Six of the seven are dead. 38170 is this, and the port did not have it
// at all: `hyperdrive.ts` had no morale handling of any kind.
//
// captured/morale/golden.json is probe_morale.mjs driving the real H/D with the flag set each
// way. The port is driven the same way here, through its own scenes rather than by calling the
// jump directly, because the question is whether playing it has the effect.
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/morale/golden.json', 'utf8'));

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
    const init = { key: k, code, bubbles: true };
    window.dispatchEvent(new KeyboardEvent('keydown', init));
    window.dispatchEvent(new KeyboardEvent('keyup', init));
  };
  const arrive = async (want, ms = 40000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (scene().toLowerCase() === want.toLowerCase()) return true;
      await sleep(70);
    }
    return false;
  };
  window.__h = { sleep, scene, key, arrive };
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikingsState),
  null, { timeout: 30000 });
await page.evaluate(HELPERS);

await page.evaluate(async () => {
  const h = window.__h;
  h.key('N');
  if (!await h.arrive('cockpit')) throw new Error('no cockpit');
  await h.sleep(1500);
});

/** One jump, played: set the flag and the morale, plot a course, press H, read both back. */
async function jump(page, crewGrounded, morale, to) {
  return page.evaluate(async ({ crewGrounded, morale, to }) => {
    const h = window.__h;
    const s = window.__spaceVikingsState;
    Object.assign(s, {
      crewGrounded, atmosphere: 0, navDestination: to, planetIndex: to === 5 ? 7 : 5,
    });
    s.forces.morale = morale;
    await h.sleep(300);
    h.key('H');
    if (!await h.arrive('hyperdrive')) throw new Error('no hyperdrive');
    if (!await h.arrive('cockpit')) throw new Error('never came back to flight');
    await h.sleep(800);
    return { morale: s.forces.morale, flag: s.crewGrounded, planet: s.planetIndex };
  }, { crewGrounded, morale, to });
}

console.log('jumping, with the flag set each way:');
const where = [5, 7, 5, 7, 5];
let i = 0;
for (const g of golden.jumps) {
  const to = where[i++];
  const got = await jump(page, g.flagBefore, g.moraleBefore, to);
  if (got.planet !== to) { check(`jump ${i} moved the ship`, false, `at ${got.planet}`); continue; }
  check(`38170 ${String(g.flagBefore).padStart(2)}, morale ${g.moraleBefore}`
    + ` -> morale ${g.morale}, flag ${g.flag}`,
    got.morale === g.morale && got.flag === g.flag,
    `port gives morale ${got.morale}, flag ${got.flag}`);
}

// The two ends of it, played rather than poked: landing sets the flag, shore leave takes it off.
console.log('');
console.log('and the two places the flag is set:');

const landed = await page.evaluate(async () => {
  const h = window.__h;
  const s = window.__spaceVikingsState;
  Object.assign(s, { crewGrounded: 0, y: 20, atmosphere: 1, planetSurrendered: false });
  await h.sleep(300);
  h.key('C');
  if (!await h.arrive('com')) throw new Error('no COM');
  await h.sleep(600);
  h.key('2');                              // COM 127: 2 is GROUND FORCES
  if (!await h.arrive('groundForces')) throw new Error('no GROUND FORCES');
  await h.sleep(900);
  return s.crewGrounded;
});
check('GROUND FORCES line 14 sets it, landed at Y 20',
  landed === golden.groundForcesSetsFlag, `port gives ${landed}, machine ${golden.groundForcesSetsFlag}`);

/**
 * One shore-leave answer, played from a fresh page.
 *
 * Two things this got wrong first. It pressed '1' to pick the pay-them screen, which does
 * nothing - SHORE LEAVE's five screens are chosen by `state.shoreLeaveMode`, and GROUND FORCES
 * option **3** is the one that sets it to 0 - so the second pass ran whatever mode the first
 * had left behind. And it called `scenes.run('shoreLeave')` with the cockpit still running:
 * `Input` models $C000, one latch and first reader wins, so the scene left behind ate the
 * answer meant for this one. Both showed up as "passes on its own, fails in the suite", which
 * is the worst way for a check to behave.
 *
 * So this plays the chain the way a player would - C, 2, 3 - on a page of its own.
 */
async function shoreLeaveAnswer(page, answer) {
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikingsState),
    null, { timeout: 30000 });
  await page.evaluate(HELPERS);
  return page.evaluate(async (ans) => {
    const h = window.__h;
    h.key('N');
    if (!await h.arrive('cockpit')) throw new Error('no cockpit');
    await h.sleep(1500);

    const s = window.__spaceVikingsState;
    Object.assign(s, {
      crewGrounded: 17, atmosphere: 1, y: 20, credits: 99999, planetSurrendered: true,
    });
    s.forces.morale = 4;
    s.planets[s.planetIndex].surrendered = true;
    await h.sleep(300);

    h.key('C');
    if (!await h.arrive('com')) throw new Error('no COM');
    await h.sleep(500);
    h.key('2');
    if (!await h.arrive('groundForces')) throw new Error('no GROUND FORCES');
    await h.sleep(700);
    const from = window.__gameLog.getLog().length;
    h.key('3');                              // 3 is the pay-the-troops screen
    if (!await h.arrive('shoreLeave')) throw new Error('no SHORE LEAVE');
    h.key(ans);

    // `pay=` is logged straight after the answer is taken, so it is the signal that the
    // question was asked and answered rather than skipped.
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      if (window.__gameLog.getLog().slice(from)
        .some((l) => l.event === 'shoreLeave' && (l.detail || '').startsWith('pay='))) {
        return s.crewGrounded;
      }
      await h.sleep(60);
    }
    throw new Error(`SHORE LEAVE never took the ${ans}`);
  }, answer);
}

// 2087 sits before the pay-them branch, so answering N still clears the grounded state - the
// crew got their leave either way, they just did not get paid for it.
const afterLeave = {
  Y: await shoreLeaveAnswer(page, 'Y'),
  N: await shoreLeaveAnswer(page, 'N'),
};
check('SHORE LEAVE 2087 clears it whether or not you pay',
  afterLeave.Y === 70 && afterLeave.N === 70,
  `paid ${afterLeave.Y}, refused ${afterLeave.N}`);

fs.writeFileSync('captured/morale/port.json',
  JSON.stringify({ results, landed, afterLeave }, null, 1) + String.fromCharCode(10));
for (const e of errors.slice(0, 3)) console.log('page error:', e);
await browser.close();

const failed = results.filter((r) => !r.ok).length;
console.log('');
console.log(failed === 0 ? `morale parity: all ${results.length} checks passed`
  : `morale parity: ${failed} of ${results.length} failed`);
process.exit(failed === 0 ? 0 : 1);
