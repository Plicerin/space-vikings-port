// ENLIST TROOPS in the port, against the five pages the machine drew.
//
// `probe_enlist.mjs` answered the question three times on the disk - once with a number the
// purse cannot cover, once with one that would burst the 20000 ceiling, once with one that
// works - and captured the page at each stop. The two refusals are loops, not endings: 2281
// goes back to 2270 and 2285 goes back to 2200 with the trip's enlistment handed back.
//
// Everything on these pages is printed from state, so all five reproduce exactly, except the
// RND price on the BUY WEAPONS page - `C = INT((RND(1) + .2) * 4 * MU(J1 + 1))` - whose row
// is scored out.
import { chromium } from 'playwright';
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/enlist/golden.json', 'utf8'));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.hires),
  null, { timeout: 30000 });

const shots = await page.evaluate(async (g) => {
  const sv = window.__spaceVikings;
  const send = (key, code) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key, code, bubbles: true }));
  };
  const press = (key, ms) => new Promise((res) => {
    const code = /^[0-9]$/.test(key) ? 'Digit' + key
      : key === ' ' ? 'Space' : 'Key' + key.toUpperCase();
    send(key, code);
    setTimeout(res, ms);
  });
  const typeIn = async (digits) => {
    for (const ch of digits) await press(ch, 90);
    send('Enter', 'Enter');
    await new Promise((r) => setTimeout(r, 250));
  };
  const grab = () => Array.from(sv.hires.snapshot().on);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  for (let i = 0; i < 7; i++) await press('N', 700);
  await wait(1500);

  // The machine's own starting point: a planet that has given up, 10000 credits, 2000 troops,
  // the trip's enlistment unspent, and the four weapon counts it had on screen.
  const setUp = () => {
    const s = window.__spaceVikingsState;
    s.atmosphere = 1; s.inOrbit = false; s.speed = 0; s.y = 20;
    s.planetSurrendered = true;
    s.planets[s.planetIndex].surrendered = true;
    s.credits = g.before.credits;
    s.forces.troops = g.before.troops;
    s.forces.fighters = 75; s.forces.transports = 6;
    s.forces.tanks = 0; s.forces.groundMissiles = 0;
    s.enlistedThisTrip = false;
  };
  setUp();

  const out = {};
  await press('C', 900);
  await press('2', 900);
  await press('4', 900);
  out.prompt = grab();

  // 2280: more than the purse holds.
  await typeIn(String(g.before.credits + 50000));
  await wait(400);
  out.poor = grab();

  // 2281 puts the question back.
  await wait(2200);
  out.reask = grab();

  // 2285: the machine had TR raised to 19500 between the re-ask and this answer, so the
  // TROOPS= line on screen is still the old one on both sides.
  window.__spaceVikingsState.forces.troops = 19500;
  await typeIn('1000');
  await wait(400);
  out.toomany = grab();

  // 2285 starts the screen again; the trip's enlistment is back.
  await wait(2200);
  out.flagAfterTooMany = window.__spaceVikingsState.enlistedThisTrip ? 1 : 0;
  await typeIn('100');
  await wait(600);
  out.buyweapons = grab();
  const s = window.__spaceVikingsState;
  out.after = { credits: Math.floor(s.credits), troops: s.forces.troops };
  return out;
}, golden);
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

const asMask = (points) => {
  const on = new Uint8Array(HGR_W * HGR_H);
  for (const [x, y] of points) on[y * HGR_W + x] = 1;
  return on;
};
// Text row 24 is the flight readout, which is the ship's position and not this screen.
const READOUT_ROW = 24;
let bad = 0;
const compare = (name, skipRows = []) => {
  const disk = asMask(golden.pages[name].points);
  const port = Uint8Array.from(shots[name]);
  const skip = new Set(skipRows.concat([READOUT_ROW]));
  let diff = 0, onlyDisk = 0, onlyPort = 0;
  const perRow = new Uint16Array(HGR_H);
  for (let y = 0; y < HGR_H; y++) {
    if (skip.has(((y / 8) | 0) + 1)) continue;
    for (let x = 0; x < HGR_W; x++) {
      const k = y * HGR_W + x;
      if (disk[k] && !port[k]) { onlyDisk++; diff++; perRow[y]++; }
      else if (!disk[k] && port[k]) { onlyPort++; diff++; perRow[y]++; }
    }
  }
  const rows = [...new Set([...perRow.entries()].filter(([, n]) => n > 0)
    .map(([y]) => ((y / 8) | 0) + 1))];
  console.log(`  ${diff === 0 ? 'clean ' : 'DIFFER'}  ${name.padEnd(11)} ${diff} differ`
    + (diff ? ` (${onlyDisk} disk only, ${onlyPort} port only), text rows ${rows.join(',')}` : ''));
  if (diff) bad++;
  fs.writeFileSync(`captured/enlist/port-${name}.png`, toPng(port));
};

console.log(`the machine started on ${golden.before.credits} credits and ${golden.before.troops} `
  + `troops, and after enlisting 100 had ${golden.after.credits} and ${golden.after.troops}`);
console.log('');
compare('prompt');
compare('poor');
compare('reask');
compare('toomany');
// 3060's price is an RND draw, so its row cannot be reproduced.
compare('buyweapons', [10]);

console.log('');
// 2285's `POKE 38389,0` is only observable through what happens next: if the attempt were
// not handed back, the restarted screen would stop at 2210 and the second answer would never
// be taken. It was taken, which is what the sums below show.
const sumsOk = shots.after.credits === Math.floor(golden.after.credits)
  && shots.after.troops === Math.floor(golden.after.troops);
console.log(`  ${sumsOk ? 'ok  ' : 'FAIL'}  2290 charges one credit a troop `
  + `(machine ${golden.after.credits}/${golden.after.troops}, `
  + `port ${shots.after.credits}/${shots.after.troops})`);
if (!sumsOk) bad++;

console.log('');
console.log(bad === 0 ? 'enlist parity: clean' : `enlist parity: ${bad} checks failed`);
process.exit(bad === 0 && errors.length === 0 ? 0 : 1);
