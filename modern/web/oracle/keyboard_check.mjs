// The game's keys against the browser's.
//
// Space fires and the arrows fly, and a browser scrolls a page with both - so on the landing
// page, pressing fire scrolled the game off the screen and holding an arrow scrolled it away
// while you were flying. The keys are swallowed now, but only while the game is on screen, so
// someone reading the article below can still page through it with Space.
//
// Every press here is a real one through Playwright's keyboard, which actually scrolls. A
// synthetic KeyboardEvent does not, so it could never have caught this.
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';

const results = [];
const check = (what, ok, detail = '') => {
  results.push({ what, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikingsState),
  null, { timeout: 30000 });

const scene = () => page.evaluate(() => {
  const l = window.__gameLog.getLog();
  return l.length ? l[l.length - 1].scene : '?';
});
const scrollY = () => page.evaluate(() => Math.round(window.scrollY));
const waitScene = async (want, ms = 90000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if ((await scene()).toLowerCase() === want.toLowerCase()) return true;
    await page.waitForTimeout(120);
  }
  return false;
};

// Into flight, with the game where a player would have it.
await waitScene('start', 30000);
await page.keyboard.press('KeyN');
await waitScene('opening', 20000);
await page.keyboard.press('Space');
if (!await waitScene('cockpit', 90000)) throw new Error('never reached flight');
await page.evaluate(() => document.getElementById('play').scrollIntoView({ block: 'center' }));
await page.waitForTimeout(600);

console.log('with the game on screen:');

// Firing must not move the page.
const beforeFire = await scrollY();
const misBefore = await page.evaluate(() => window.__spaceVikingsState.missilesRemaining);
await page.keyboard.press('Space');
await page.waitForTimeout(900);
const afterFire = await scrollY();
check('Space does not scroll the page', afterFire === beforeFire,
  `scrollY ${beforeFire} -> ${afterFire}`);

// And it must still reach the game. 1090 takes two whatever it hits.
await page.waitForTimeout(1200);
const misAfter = await page.evaluate(() => window.__spaceVikingsState.missilesRemaining);
check('and still fires', misAfter < misBefore, `${misBefore} -> ${misAfter} missiles`);

// Flying must not scroll either - the arrows are the ship.
//
// ArrowDown, not ArrowLeft. Left and right scroll a page sideways, and this one has nothing
// to scroll sideways to, so an ArrowLeft test passes whether the fix is there or not - which
// it did, the first time this was written. Down is the pitch control and does move the page.
const beforeFly = await scrollY();
await page.keyboard.down('ArrowDown');
await page.waitForTimeout(3200);
await page.keyboard.up('ArrowDown');
const afterFly = await scrollY();
const pitch = await page.evaluate(() => {
  const p = window.__spaceVikingsState.pitch;
  return p > 127 ? p - 256 : p;
});
check('the arrows do not scroll the page', afterFly === beforeFly,
  `scrollY ${beforeFly} -> ${afterFly}`);
check('and still fly the ship', pitch !== 0, `pitch ${pitch}`);

// Page Up and Page Down are not the game's, so the page keeps them even here.
const beforePgDn = await scrollY();
await page.keyboard.press('PageDown');
await page.waitForTimeout(500);
const afterPgDn = await scrollY();
check('Page Down still belongs to the page', afterPgDn !== beforePgDn,
  `scrollY ${beforePgDn} -> ${afterPgDn}`);

// ---------------------------------------------------------------------------------------
console.log('');
console.log('scrolled down to read the article:');

await page.evaluate(() => document.getElementById('oracle').scrollIntoView({ block: 'start' }));
await page.waitForTimeout(700);
const beforeRead = await scrollY();
await page.keyboard.press('Space');
await page.waitForTimeout(600);
const afterRead = await scrollY();
check('Space pages the article again', afterRead !== beforeRead,
  `scrollY ${beforeRead} -> ${afterRead}`);

fs.mkdirSync('captured/keyboard', { recursive: true });
fs.writeFileSync('captured/keyboard/port.json', JSON.stringify({ results }, null, 1) + '\n');
for (const e of errors.slice(0, 3)) console.log('page error:', e);
await browser.close();

const failed = results.filter((r) => !r.ok).length;
console.log('');
console.log(failed === 0 ? `keyboard: all ${results.length} checks passed`
  : `keyboard: ${failed} of ${results.length} failed`);
process.exit(failed === 0 ? 0 : 1);
