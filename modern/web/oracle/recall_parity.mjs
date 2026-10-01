// The port's RECALL against the original's, all five branches.
//
// RECALL draws over COM's screen by way of GROUND FORCES, which has already blanked rows
// 1-12. That chain used to be replayed here by hand - panel, lamps, needles, COM, GROUND
// FORCES' clear, then RECALL's box - which tests the drawing and not the screen. It is walked
// for real now: a new game, C to COM, 2 to GROUND FORCES, and 2 again for each of the five
// branches, with the troops put where that branch needs them first.
//
// `captured/recall/branches.json` has all five, run on the disk by probe_recallbranches.mjs -
// 2005 needed Applesoft's own `TR` zeroed mid-startup, because it is read off the MISC FILE
// and there is no poking a DOS file.
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const branches = JSON.parse(fs.readFileSync('captured/recall/branches.json', 'utf8'));
const cases = branches.branches.filter((b) => b.screen);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.drawRecall), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose drawRecall - is the dev server running at ' + PORT_URL + '?'); });

const shots = await page.evaluate(async ({ jobs }) => {
  const sv = window.__spaceVikings;
  const press = (k) => {
    const code = /^[0-9]$/.test(k) ? 'Digit' + k : k === ' ' ? 'Space' : 'Key' + k.toUpperCase();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, code, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: k, code, bubbles: true }));
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sceneNow = () => {
    const l = window.__gameLog.getLog();
    return l.length ? l[l.length - 1].scene : '?';
  };
  // A scene change costs its disk load and the old screen stays up for it, so these wait on
  // the scene and not on the clock.
  const arrive = async (want, ms = 25000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (sceneNow().toLowerCase() === want.toLowerCase()) return true;
      await sleep(60);
    }
    return false;
  };

  press('N');
  if (!await arrive('cockpit', 35000)) throw new Error('no cockpit');
  await sleep(1200);

  const out = [];
  for (const j of jobs) {
    if (sceneNow().toLowerCase() !== 'groundforces') {
      if (sceneNow().toLowerCase() !== 'com') { press('C'); if (!await arrive('com')) throw new Error('no COM'); }
      await sleep(400);
      press('2');
      if (!await arrive('groundForces')) throw new Error('no GROUND FORCES');
    }
    await sleep(400);

    const st = window.__spaceVikingsState;
    st.planetIndex = j.planet;
    st.forces.troopPlanetIndex = j.troopPlanet;
    st.forces.troops = j.troops;
    st.forces.troopLocation = j.location;
    const before = st.forces.troopLocation;

    press('2');
    if (!await arrive('recall', 25000)) throw new Error('RECALL never ran');
    await sleep(500);
    const on = Array.from(sv.hires.snapshot().on);
    const r = sv.recallMessage({
      planet: j.planet, troopPlanet: j.troopPlanet, troops: j.troops, location: j.location,
    });
    // 2050 chains straight on to GROUND FORCES, so the message is only up for as long as that
    // load takes. Wait for it before setting the next branch up.
    await arrive('groundForces', 25000);
    await sleep(300);
    out.push({
      on, line: r.line, newLocation: r.newLocation, before,
      locationAfter: window.__spaceVikingsState.forces.troopLocation,
    });
  }
  return out;
}, {
  // `recallMessage` only ever compares the planet with the troops' planet, so what matters is
  // whether they are the same - the disk's 1 and 2 become the port's 0 and 1.
  jobs: cases.map((b) => ({
    planet: 0,
    troopPlanet: b.before['38209'] === b.before['38158'] ? 0 : 1,
    // 2005 is the one the disk reached with TR at zero; the rest ran with the file's 2000.
    troops: b.line === 2005 ? 0 : 2000,
    location: b.before['38166'],
  })),
});
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

// Rows 184 to 190 hold the DOS command line the previous program echoed when it ran RECALL -
// GROUND FORCES' own `PRINT D$;"RUN RECALL"`. It is on the page before RECALL draws anything
// and RECALL never touches it, so it is not RECALL's output and the port's replay chain does
// not produce it. 231 pixels of it, identically in all five captures.
const ECHO_ROW = 184;

let fail = 0;
console.log(`comparing rows 0-${ECHO_ROW - 1}; ${ECHO_ROW}-191 is the DOS echo of "RUN RECALL"`);
console.log('  line   disk lit   port lit   differ   agree      branch   38166');
for (let i = 0; i < cases.length; i++) {
  const b = cases[i];
  const s = shots[i];
  const diskOn = new Uint8Array(HGR_W * HGR_H);
  for (const [x, y] of b.screen.points) diskOn[y * HGR_W + x] = 1;
  const portOn = Uint8Array.from(s.on);
  let diff = 0, diskLit = 0, portLit = 0, cells = 0;
  for (let k = 0; k < diskOn.length; k++) {
    if (((k / HGR_W) | 0) >= ECHO_ROW) continue;
    cells++;
    if (diskOn[k]) diskLit++;
    if (portOn[k]) portLit++;
    if (diskOn[k] !== portOn[k]) diff++;
  }
  // The port's own branch choice, and what it says 38166 becomes, against what the disk did.
  // What 38166 became, taken from the game after the scene ran rather than from what the
  // logic said it would do.
  const expectAfter = s.locationAfter;
  const branchOk = s.line === b.line;
  const pokeOk = expectAfter === b.after;
  if (diff !== 0 || !branchOk || !pokeOk) fail++;
  console.log(`  ${b.line}   ${String(diskLit).padStart(8)}   ${String(portLit).padStart(8)}   ` +
    `${String(diff).padStart(6)}   ${(100 * (1 - diff / cells)).toFixed(3)}%   ` +
    `${branchOk ? 'ok' : `PORT SAYS ${s.line}`}       ${pokeOk ? 'ok' : `port ${expectAfter}, disk ${b.after}`}`);
  fs.writeFileSync(`captured/recall/port-${b.line}.png`, toPng(portOn));
  if (diff) {
    const d = new Uint8Array(diskOn.length);
    for (let k = 0; k < d.length; k++) d[k] = diskOn[k] === portOn[k] ? 0 : 1;
    fs.writeFileSync(`captured/recall/diff-${b.line}.png`, toPng(d, { colour: [255, 0, 0] }));
  }
}

// 2005 and 2030 are only told apart by TR, so they had better not be the same page.
const p2005 = shots[cases.findIndex((b) => b.line === 2005)];
const p2030 = shots[cases.findIndex((b) => b.line === 2030)];
if (p2005 && p2030) {
  const same = p2005.on.every((v, k) => v === p2030.on[k]);
  if (same) fail++;
  console.log('');
  console.log(`  2005 and 2030 are different pages in the port: ${same ? 'NO - FAILED' : 'yes'}`);
}

console.log('');
console.log(fail === 0 ? 'RECALL: all five branches exact' : `RECALL: ${fail} branch(es) differ`);
process.exit(fail === 0 ? 0 : 1);
