// REPAIR/RESTOCK in the port, against the machine's own three pages.
//
// `probe_repair.mjs` landed the ship at Y 20, broke eight of the twelve systems and walked
// COM -> GROUND FORCES -> REPAIR/RESTOCK, stopping the CPU at 2545, at 2600 and at 2615 so
// each page could be read whole.
//
// Two of the three are deterministic and are compared pixel for pixel:
//
// - **the itemised list**, which prints only the byte each system was at before the repair,
// - **the refusal**, which is seven fixed lines and no numbers at all.
//
// The bill in between carries `P`, which is a sum of RND draws, so it cannot be reproduced.
// What is checked there is its shape: the rows that hold no number. It is also never on
// screen for a frame on either machine - 2560 falls straight into 2600 - so the port draws it
// and overdraws it in the same tick, exactly as the disk does.
import { chromium } from 'playwright';
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/repair/golden.json', 'utf8'));

const asMask = (points) => {
  const on = new Uint8Array(HGR_W * HGR_H);
  for (const [x, y] of points) on[y * HGR_W + x] = 1;
  return on;
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.hires),
  null, { timeout: 30000 });

const shots = await page.evaluate(async (slots) => {
  const sv = window.__spaceVikings;
  const press = (key, ms) => new Promise((res) => {
    const code = /^[0-9]$/.test(key) ? 'Digit' + key
      : key === ' ' ? 'Space' : 'Key' + key.toUpperCase();
    window.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key, code, bubbles: true }));
    setTimeout(res, ms);
  });
  const sceneNow = () => {
    const l = window.__gameLog.getLog();
    return l.length ? l[l.length - 1].scene : '?';
  };
  const grab = () => Array.from(sv.hires.snapshot().on);
  const byAddr = Object.fromEntries(slots.map((s) => [s.addr, s.before]));

  for (let i = 0; i < 7; i++) await press('N', 700);
  await new Promise((r) => setTimeout(r, 1500));

  // The same state the machine was in: on the deck, in atmosphere, eight systems broken.
  const setUp = (credits) => {
    const s = window.__spaceVikingsState;
    const d = s.damage;
    s.atmosphere = 1; s.inOrbit = false; s.speed = 0; s.y = 20;
    d.shieldsPct = byAddr[38200]; s.energy = byAddr[38199];
    d.engine1Pct = byAddr[38198]; d.engine2Pct = byAddr[38197];
    d.computerPct = byAddr[38196]; d.radarPct = byAddr[38195];
    d.envPct = byAddr[38194]; d.hullPct = byAddr[38193];
    d.hyperdrivePct = byAddr[38190]; s.missilesRemaining = byAddr[38187];
    d.laserPct = byAddr[38186];
    s.credits = credits;
  };

  const out = {};
  // --- the poor run: the list, then the refusal ------------------------------------------
  setUp(10000);
  await press('C', 900);
  await press('2', 900);
  await press('6', 450);
  out.list = grab();
  out.listScene = sceneNow();
  // The list stands for 1500ms, then the bill and the refusal land in the same tick.
  await new Promise((r) => setTimeout(r, 2200));
  out.refusal = grab();
  const after = window.__spaceVikingsState;
  out.after = {
    energy: after.energy, missiles: after.missilesRemaining,
    shields: after.damage.shieldsPct, laser: after.damage.laserPct,
    credits: Math.floor(after.credits),
    surrendered: after.planets[after.planetIndex].surrendered,
  };

  // --- the rich run: the bill, held by 2580's prompt ---------------------------------------
  await new Promise((r) => setTimeout(r, 3000));
  setUp(99999999);
  if (sceneNow() !== 'groundForces') await press('9', 900);
  await press('6', 2400);
  out.bill = grab();
  out.billScene = sceneNow();
  return out;
}, golden.slots);
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

let bad = 0;
// Text row 24 is the flight readout - `155 VTAB 24 ... INT(X / 2) ... INT(Z / 2)` - and the
// two ships are not parked in the same place, so it is not part of what this screen is.
const READOUT_ROW = 24;
const compare = (what, diskPoints, portOn, skipRows = []) => {
  skipRows = skipRows.concat([READOUT_ROW]);
  const disk = asMask(diskPoints);
  const port = Uint8Array.from(portOn);
  const skip = new Set(skipRows);
  let diff = 0, onlyDisk = 0, onlyPort = 0, diskLit = 0, portLit = 0;
  const perRow = new Uint16Array(HGR_H);
  for (let y = 0; y < HGR_H; y++) {
    if (skip.has(((y / 8) | 0) + 1)) continue;
    for (let x = 0; x < HGR_W; x++) {
      const k = y * HGR_W + x;
      if (disk[k]) diskLit++;
      if (port[k]) portLit++;
      if (disk[k] && !port[k]) { onlyDisk++; diff++; perRow[y]++; }
      else if (!disk[k] && port[k]) { onlyPort++; diff++; perRow[y]++; }
    }
  }
  console.log(`${what}: disk ${diskLit} lit, port ${portLit} lit, ${diff} differ `
    + `(${onlyDisk} disk only, ${onlyPort} port only)`);
  const rows = [...perRow.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (rows.length) {
    console.log('  worst rows: ' + rows.slice(0, 8).map(([y, n]) => `${y}(${n})`).join(' ')
      + `  -> text rows ${[...new Set(rows.map(([y]) => ((y / 8) | 0) + 1))].slice(0, 8).join(',')}`);
  }
  if (diff) bad++;
  return { disk, port };
};

console.log(`the machine landed at Y with low byte ${golden.gate.yiByte}, billed ${golden.billTotal} `
  + `against ${golden.credits} credits, and stopped at ${golden.summaryStoppedAt}`);
console.log('');
const list = compare('the itemised list ', golden.list.points, shots.list);
compare('the refusal       ', golden.summary.points, shots.refusal);
// Rows 8 and 9 hold the bill and the purse; 11 and 12 hold 2580's prompt, which the machine
// had not printed yet when the page was taken.
compare('the bill (no sums)', golden.billPage.points, shots.bill, [8, 9, 11, 12]);

console.log('');
console.log('what the twelve came out as:');
for (const s of golden.slots) {
  const got = { 38200: shots.after.shields, 38199: shots.after.energy,
    38187: shots.after.missiles, 38186: shots.after.laser }[s.addr];
  if (got === undefined) continue;
  const ok = got === s.after;
  if (!ok) bad++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${s.name.padEnd(12)} ${s.before} -> machine ${s.after}, port ${got}`);
}
const lostIt = shots.after.surrendered === false && shots.after.credits === 0;
console.log(`  ${lostIt ? 'ok  ' : 'FAIL'}  2610 takes the planet back and empties the purse `
  + `(credits ${shots.after.credits}, still ours ${shots.after.surrendered})`);
if (!lostIt) bad++;

fs.mkdirSync('captured/repair', { recursive: true });
fs.writeFileSync('captured/repair/port-list.png', toPng(list.port));
fs.writeFileSync('captured/repair/port-refusal.png', toPng(Uint8Array.from(shots.refusal)));
fs.writeFileSync('captured/repair/port-bill.png', toPng(Uint8Array.from(shots.bill)));
console.log('');
console.log(bad === 0 ? 'repair parity: clean' : `repair parity: ${bad} checks failed`);
process.exit(bad === 0 && errors.length === 0 ? 0 : 1);
