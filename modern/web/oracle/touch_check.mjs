// Can the game be played on a phone, with no keyboard at all?
//
// It could not. The touch pad was three clusters of markup built for the cockpit, so the title
// screen - which asks for `N` - had no `N` on it, and a phone could reach the title and go no
// further. Nor could it pay the troops (`Y`/`N`), work the galaxy map (`I J K M`, Return) or
// answer COM, whose menus run to 6 while the pad stopped at 4.
//
// Every tap here is a real pointer event on a real button. Nothing in this file presses a key.
import { chromium, devices } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';

const results = [];
const check = (what, ok, detail = '') => {
  results.push({ what, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};

const browser = await chromium.launch({ headless: true });
// A real phone profile, so the coarse-pointer rules the pad depends on actually apply.
const context = await browser.newContext({ ...devices['iPhone 13'] });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikingsState),
  null, { timeout: 30000 });

const scene = () => page.evaluate(() => {
  const l = window.__gameLog.getLog();
  return l.length ? l[l.length - 1].scene : '?';
});
const pad = () => page.evaluate(() => [...document.querySelectorAll('.touch-control')]
  .map((b) => b.textContent.trim()));
const waitScene = async (want, ms = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if ((await scene()).toLowerCase() === want.toLowerCase()) return true;
    await page.waitForTimeout(120);
  }
  return false;
};
/** Tap a pad button by its visible label. Throws if that screen does not offer it. */
async function tap(label, holdMs = 0) {
  const btn = page.locator('.touch-control', { hasText: label }).first();
  if (!await btn.count()) throw new Error(`no button labelled ${label} on ${await scene()}`);
  if (holdMs) {
    const box = await btn.boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(holdMs);
  } else {
    await btn.tap();
  }
}

// The pad is built from the current screen, and at `load` the game has not announced one yet -
// reading it straight away catches the fallback, not the title. Wait for the title first.
await waitScene('start', 30000);

console.log('the pad shows what each screen reads:');
check('the title offers a way to start', (await pad()).some((l) => l.includes('NEW')),
  (await pad()).join(' '));

// --- starting a game, by touch -----------------------------------------------------------
await tap('N) NEW');
check('tapping it starts the game', await waitScene('opening', 20000), await scene());
const openingPad = await pad();
check('the opening offers a skip', openingPad.some((l) => l === 'SKIP'), openingPad.join(' '));
await tap('SKIP');
check('which reaches flight', await waitScene('cockpit', 60000), await scene());

// --- flying, by touch ---------------------------------------------------------------------
const flightPad = await pad();
check('the cockpit gets the flight pad', flightPad.includes('FIRE') && flightPad.includes('COM'),
  `${flightPad.length} buttons`);

// A *tap* on an arrow, which is the thing a phone player will actually do.
//
// The flight loop asks `isDown` once a pass, and a pass is 2.55 s, so a tap used to be over
// long before anything looked and the arrows did nothing unless you knew to hold them. A short
// press is latched for one pass now, which is the single step a player holding the paddle
// across one pass would have got.
const s8 = (v) => (v > 127 ? v - 256 : v);
const bankBefore = await page.evaluate(() => window.__spaceVikingsState.bank);
{
  const btn = page.locator('.touch-control', { hasText: '◀' }).first();
  const box = await btn.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}
await page.waitForTimeout(4200);              // one pass, plus the latch's margin
const bankAfterTap = await page.evaluate(() => window.__spaceVikingsState.bank);
check('a tap on an arrow banks the ship, not just a hold',
  s8(bankAfterTap) !== s8(bankBefore),
  `bank ${s8(bankBefore)} -> ${s8(bankAfterTap)}`);

// --- the screens that were unreachable ------------------------------------------------------
await tap('COM');
check('COM is reachable by touch', await waitScene('com', 30000), await scene());
const comPad = await pad();
check('and COM offers 1 to 6, which it asks for',
  ['1', '2', '3', '4', '5', '6'].every((d) => comPad.includes(d)), comPad.join(' '));
check('and a way to confirm a two-digit entry', comPad.includes('ENTER'), comPad.join(' '));

// GROUND FORCES, which COM 2 reaches, and whose menu runs to 9.
await tap('2');
if (await waitScene('groundForces', 30000)) {
  const gfPad = await pad();
  check('GROUND FORCES offers its nine orders',
    ['1', '5', '9'].every((d) => gfPad.includes(d)), gfPad.join(' '));
} else {
  check('GROUND FORCES offers its nine orders', false, `stuck on ${await scene()}`);
}

// --- shore leave, where the game asks a yes or no -------------------------------------------
const shore = await page.evaluate(async () => {
  const s = window.__spaceVikingsState;
  Object.assign(s, { atmosphere: 1, y: 20, credits: 99999, shoreLeaveMode: 0, planetSurrendered: true });
  s.planets[s.planetIndex].surrendered = true;
  window.__spaceVikings.scenes.run('shoreLeave');
  await new Promise((r) => setTimeout(r, 1500));
  return [...document.querySelectorAll('.touch-control')].map((b) => b.textContent.trim());
});
check('shore leave offers yes and no', shore.some((l) => l.includes('YES')) && shore.some((l) => l.includes('NO')),
  shore.join(' '));
check('and the digits it asks a quantity in', ['0', '7', '9'].every((d) => shore.includes(d)),
  shore.filter((l) => /^[0-9]$/.test(l)).join(''));

fs.mkdirSync('captured/touch', { recursive: true });
await page.screenshot({ path: 'captured/touch/phone.png', fullPage: false });
for (const e of errors.slice(0, 3)) console.log('page error:', e);
await browser.close();

const failed = results.filter((r) => !r.ok).length;
console.log('');
console.log(failed === 0 ? `touch: all ${results.length} checks passed`
  : `touch: ${failed} of ${results.length} failed`);
process.exit(failed === 0 ? 0 : 1);
