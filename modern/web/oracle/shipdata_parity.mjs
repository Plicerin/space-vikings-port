// SHIP'S DATA, 38150-38203, against what a new game in the port starts with.
//
// probe_shipdata.mjs measured all 54 bytes - the master as stored, beside the same range read
// out of a freshly booted game - and nothing has ever compared them to the port. These are the
// numbers every other screen is built from: get one wrong and STATUS, SUPPLY, DMG, COM and
// SHORE LEAVE are all wrong together, in a way their pixel harnesses cannot see, because those
// compare a disk screen against a port screen driven from the same wrong value.
//
// The `inRam` column is the one that matters. The `-M` master on the diskette is what START
// 2000-2050 copies, and a few cells have already moved by the time the simulator is running:
// the harness reports those rather than requiring them.
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/shipdata/golden.json', 'utf8'));

/**
 * Which port field holds each address.
 *
 * `null` means the port does not model that cell. That is not automatically a fault - several
 * are zero in both columns and nothing on the disk reads them - so they are counted and listed
 * rather than failed, and the ones that are non-zero are called out.
 */
const MAP = {
  38150: 's.planetVitalityLimit',
  // Also modelled and also missed by this map: `runGroundForcesOnReturn`. COM 98 and 115
  // read it, and GROUND FORCES 310, 670 and 1130 and COLLECT 17 set it to 7.
  38151: 's.runGroundForcesOnReturn ? 7 : 0',
  38152: 's.shipVitality',
  38153: 's.forces.groundMissiles',
  38154: 's.forces.tanks',
  38155: 's.forces.transports',
  38156: 's.forces.fighters',
  38157: 's.speed',
  // Modelled all along, as `forces.troopPlanetIndex`, and this map had it as a gap - the
  // harness's fault, not the port's. The offset is the usual one: the disk numbers its
  // planets from 1 and the port's index 0 is the disk's planet 1, so START 2030's
  // `POKE 38158,1` and the port's 0 are the same place, Sol.
  38158: 's.forces.troopPlanetIndex + 1',
  38159: null,
  38160: 's.planetVitality',
  38161: null,
  38162: null,
  38163: 's.navDestination === null ? 0 : s.navDestination',
  38164: 's.autopilot ? 1 : 0',
  38165: "s.condition === 'green' ? 1 : s.condition === 'blue' ? 2 : 3",
  38166: 's.forces.troopLocation',
  38167: 's.laserType',
  38168: null,
  38169: null,
  38170: null,
  38171: 's.loot.artUnits',
  38172: 's.loot.wineCases',
  38173: 's.loot.luxuryFoodCases',
  38174: 's.loot.fighterPartCrates',
  38175: 's.loot.weaponCrates',
  38176: 's.loot.electronicCrates',
  38177: 's.loot.fissionablesLb',
  38178: 's.loot.steelTons',
  38179: 's.loot.collapsiumTons',
  38180: 's.loot.titaniumKlb',
  38181: 's.loot.platinum',
  38182: 's.loot.silver',
  38183: 's.loot.gold',
  // STATUS 5120 prints NAV.COMP. as a constant 100 and never reads 38184, so the port has
  // no field for it. SHORE LEAVE's repair DATA does name it, and charges for it.
  38184: null,
  38185: 's.damage.comsPct',
  38186: 's.damage.laserPct',
  38187: 's.missilesRemaining',
  38188: null,
  38189: null,
  38190: 's.damage.hyperdrivePct',
  38191: null,
  38192: null,
  38193: 's.damage.hullPct',
  38194: 's.damage.envPct',
  38195: 's.damage.radarPct',
  38196: 's.damage.computerPct',
  38197: 's.damage.engine2Pct',
  38198: 's.damage.engine1Pct',
  38199: 's.energy',
  38200: 's.damage.shieldsPct',
  38201: 's.shieldsOn ? 1 : 0',
  38202: 's.missileMode ? 1 : 0',
  38203: 's.forces.morale',
};

/**
 * The cells with no field behind them because nothing can change them.
 *
 * Each was traced through all 23 programs - direct references, the computed addresses
 * (`38219 + P` and friends, all of which land outside this block), and the four variable
 * aliases that name an address in range: `LT = 38167`, `LO = 38156`, `C = 38171` and
 * `LOC = 38198`, which com.bas assigns at line 40 and never reads.
 *
 * Checking the golden still holds these is the point. The port carries no field for them, so
 * there is nothing to compare - but if a re-capture ever disagrees, one of these readings was
 * wrong and this says so instead of staying quiet.
 */
const CONSTANTS = [
  {
    addr: 38159, value: 20,
    why: 'read only by STATUS 1386, as the low byte of a 16-bit value with 38167; '
      + 'written by nothing. 3 * 256 + 20 is 788, and the troops start at 2000, so whatever '
      + 'that pair is, it is not the troop count',
  },
  {
    addr: 38184, value: 100,
    why: "named only in SHORE LEAVE 2500's repair DATA, as J = 12. Nothing damages it - not "
      + 'the damage routine at 3230-3350, not anything else - so it is always 100 and the '
      + '`IF D < 100` at 2520 always skips it. The port passes 100 in its place',
  },
  { addr: 38188, value: 100, why: 'referenced by nothing in any of the 23 programs' },
  { addr: 38192, value: 62, why: 'referenced by nothing in any of the 23 programs' },
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikingsState),
  null, { timeout: 30000 });

// A new game, played to the cockpit, and then read - not a GameState built by hand. What START
// and the first pass leave behind is the thing being compared.
const port = await page.evaluate(async (map) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const scene = () => {
    const l = window.__gameLog.getLog();
    return l.length ? l[l.length - 1].scene : '?';
  };
  const init = { key: 'N', code: 'KeyN', bubbles: true };
  window.dispatchEvent(new KeyboardEvent('keydown', init));
  window.dispatchEvent(new KeyboardEvent('keyup', init));
  for (let i = 0; i < 600 && scene() !== 'cockpit'; i++) await sleep(70);
  if (scene() !== 'cockpit') throw new Error('no cockpit');
  await sleep(1500);

  const s = window.__spaceVikingsState;
  const out = {};
  for (const [addr, expr] of Object.entries(map)) {
    if (expr === null) { out[addr] = null; continue; }
    try {
      // eslint-disable-next-line no-eval
      const v = eval(expr);
      out[addr] = v === undefined ? 'undefined' : v;
    } catch (e) {
      out[addr] = 'threw';
    }
  }
  return out;
}, MAP);

const rows = golden.rows;
const wrong = [];
const unmodelled = [];
const notFound = [];

for (const r of rows) {
  const got = port[String(r.addr)];
  const name = r.name || '(unnamed)';
  if (MAP[r.addr] === null) {
    unmodelled.push({ ...r, name });
    continue;
  }
  if (got === 'undefined' || got === 'threw') {
    notFound.push({ ...r, name, expr: MAP[r.addr], got });
    continue;
  }
  const mine = typeof got === 'boolean' ? (got ? 1 : 0) : Math.round(Number(got));
  if (mine !== r.inRam) wrong.push({ ...r, name, mine });
}

console.log(`SHIP'S DATA, 38150-38203, a new game in the port against a new game on the disk:`);
console.log('');
if (wrong.length === 0) console.log('  ok    every cell the port models matches');
for (const w of wrong) {
  console.log(`  FAIL  ${w.addr}  ${w.name}`);
  console.log(`          disk ${w.inRam}, port ${w.mine}   (${MAP[w.addr]})`);
}
for (const n of notFound) {
  console.log(`  FAIL  ${n.addr}  ${n.name} - this harness looked for ${n.expr} and got ${n.got}`);
}

// The cells with no field behind them. Those that are zero in a fresh game and referenced by
// nothing need no comment; the four that hold something are named, with why they cannot move.
const constWrong = [];
console.log('');
console.log('  cells with no port field, because nothing on the disk can change them:');
for (const c of CONSTANTS) {
  const row = rows.find((r) => r.addr === c.addr);
  const ok = row && row.inRam === c.value && row.onDisk === c.value;
  if (!ok) constWrong.push({ ...c, got: row ? `${row.onDisk}/${row.inRam}` : 'missing' });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${c.addr} = ${c.value}   ${c.why}`);
  if (!ok) console.log(`          the golden now says ${row ? row.onDisk + '/' + row.inRam : 'nothing'}`);
}
const quiet = unmodelled.filter((u) => !CONSTANTS.some((c) => c.addr === u.addr));
console.log(`  and ${quiet.length} more that are zero in a new game on both sides, so `
  + 'nothing here can tell whether the port carries them: '
  + quiet.map((q) => q.addr).join(', '));

const moved = rows.filter((r) => r.onDisk !== r.inRam);
console.log('');
console.log(`  ${moved.length} cells differ between the -M master and a running game, reported `
  + 'not required:');
for (const m of moved) console.log(`      ${m.addr}  master ${m.onDisk} -> running ${m.inRam}   ${m.name || ''}`);

fs.writeFileSync('captured/shipdata/port.json',
  JSON.stringify({ port, wrong, notFound, unmodelled: unmodelled.map((u) => u.addr) }, null, 1)
  + String.fromCharCode(10));
for (const e of errors.slice(0, 3)) console.log('page error:', e);
await browser.close();

const failed = wrong.length + notFound.length + constWrong.length;
console.log('');
console.log(failed === 0
  ? `ship data parity: all ${rows.length - unmodelled.length} modelled cells match`
  : `ship data parity: ${failed} cells differ`);
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
