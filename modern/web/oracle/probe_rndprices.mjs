// SHORE LEAVE's prices, recorded so they can be replayed.
//
// Four of its screens draw, and the listing has been quoted for them without ever being run:
//
//   2170  C = 20000 + ((RND(1) * 5000) * (RND(1) * 10))          a base, two draws
//   2400  L = PEEK(38171) * (300 * RND(1))                       the art in a loot sale, one
//   2520  CD = INT((RND(1) * 150) * (100 - ((D / 100) * 100)))   a repair, one per system
//   2524  IF D < 63 AND J = 2 THEN D2 = 63 - D: D2 = D2 * (100 / 63)
//   2525  D1 = INT((D2 / 100) * 100): CD = INT((RND(1) * 200) * (100 - D1))   energy
//   2530  CD = INT((RND(1) * 100) * (100 - PEEK(LO)))            missiles
//   3060  C = INT((RND(1) + .2) * 4 * MU(J1 + 1))                a weapon, one per type
//
// The RND sits inside each THEN, so a system already at full costs no draw at all - which
// makes the number of draws part of what there is to check, not just their values.
//
// 2520's `100 - ((D / 100) * 100)` is not obviously `100 - D`: Applesoft carries a 32-bit
// mantissa and D/100 is not exact in binary, so the product can come back a hair either side
// of D and INT can land a whole credit away. Replaying it against the machine is the only way
// to know which.
//
// Getting there: GROUND FORCES line 70 is `ON COM GOTO 100,2000,2080,2150,2160,2170,2180,2190`
// and each of those pokes 38388 before running SHORE LEAVE, whose line 20 is
// `ON J GOTO 2200,2400,2500,2100,4000`. So menu 5 is SELL LOOT, 6 is REPAIR/RESTOCK - which
// runs the repair at 2500 - and 7 is ESTABLISH BASE. Line 65 refuses 3 to 6 without a base on
// the planet, and 2505 wants the ship landed.
//
// BUY WEAPONS is **not** part of REPAIR/RESTOCK, which is where the name suggests it would be.
// It hangs off ENLIST TROOPS: `2290 TR = TR + EN: CR = CR - EN: GOSUB 3000`. So menu 4 pays for
// troops and then sells you fighters, transports, tanks and missiles, and menu 6 only repairs.
//
// 2275 and 3070 stop for input - the troop count and then one count per weapon type - so the
// recording is taken in slices with a `0` and a Return between them.
import { openOracle, VAR_READER } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import fs from 'fs';

const disk = openDisk(DISK);
const textOf = (name) => {
  const r = disk.read(disk.files.find((f) => f.name === name));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => `${l.num} ${l.text}`).join('\n');
};
const SIM = textOf('STARSHIP SIMULATOR');
const COM = textOf('COM');
const GF = textOf('GROUND FORCES');
const SL = textOf('SHORE LEAVE');

/** 2500's DATA, in the order the FOR J = 1 TO 12 loop reads it. */
const SYSTEMS = [
  ['SHIELD', 38200], ['ENERGY', 38199], ['# 1 ENGINE', 38198], ['# 2 ENGINE', 38197],
  ['COMPUTER', 38196], ['RADAR', 38195], ['ENV. CONTROL', 38194], ['HULL DMG.', 38193],
  ['HYPERDRIVE', 38190], ['MISSILES', 38187], ['LASER', 38186], ['NAV. COMP.', 38184],
];

const a2 = await openOracle();
await a2.ev(VAR_READER);
await a2.boot();
await a2.key('N');
const loaded = async () => {
  const b = await a2.readRange(0x800, 0x2000);
  const m = {};
  for (let k = 0; k < b.length; k++) m[0x800 + k] = b[k];
  try { return listProgram(m, 0x801, 0x2000).map((l) => `${l.num} ${l.text}`).join('\n'); }
  catch { return ''; }
};
const waitFor = async (w, label) => {
  for (let i = 0; i < 700; i++) { await a2.frames(20); if ((await loaded()) === w) return true; }
  console.log('  ' + label + ' never started');
  return false;
};

console.log('waiting for STARSHIP SIMULATOR...');
if (!await waitFor(SIM, 'STARSHIP SIMULATOR')) { await a2.close(); throw new Error('no simulator'); }
await a2.frames(200);
await a2.key('C');
if (!await waitFor(COM, 'COM')) { await a2.close(); throw new Error('no COM'); }
await a2.key('2');
if (!await waitFor(GF, 'GROUND FORCES')) { await a2.close(); throw new Error('no GROUND FORCES'); }
for (let i = 0; i < 30; i++) await a2.frames(20);

const planet = await a2.read(38209);
console.log(`  planet ${planet}`);

/** 3000's MU, in the order `FOR J1 = 0 TO 3` walks it. */
const WEAPON_NAMES = ['FIGHTERS', 'TRANSPORTS', 'TANKS', 'MISSILES'];
const weaponPrices = [];
let lootValue = null;
let baseCost = null;

/**
 * Applesoft variables by name, at whatever point the machine has been stopped at.
 *
 * Needed because the value a line computes is not visible at the draw that made it - the draw
 * happens first. And `C` in particular cannot be read a draw later either: `2080`, the routine
 * that clears the screen, is `FOR C = 2 TO 13: ... NEXT`, so it leaves **C = 14** behind, and
 * 3020 calls it before every one of 3060's four prices. So each price is read by stopping on
 * the line just after the one that assigns it.
 */
const grab = async (names) => JSON.parse(await a2.ev(`(() => {
  const v = window.M.vars();
  const g = (nm) => {
    const x = (v.vars || []).find((y) => y.name === nm && y.type === 'real');
    return x ? x.value : null;
  };
  const out = {};
  for (const nm of ${JSON.stringify('PLACEHOLDER')}) out[nm] = g(nm);
  return JSON.stringify(out);
})()`.replace('"PLACEHOLDER"', JSON.stringify(names))));

/** The recorder, in slices, so keys can be sent between them. */
await a2.ev(`(() => { window.__rec = []; return 'r'; })()`);
// The twelve systems 2500's DATA names, then the thirteen cargo counters 2400 prices, so the
// loot sale is replayed against the counts the machine actually held rather than the ones this
// file poked in.
const LOOT_ADDRESSES = [38171, 38172, 38173, 38174, 38175, 38176, 38177, 38178, 38179, 38180,
  38181, 38182, 38183];
const WATCH = [...SYSTEMS.map((s) => s[1]), ...LOOT_ADDRESSES];
/** Steps, recording every draw, and stops early the moment `untilLine` is the current line. */
const record = async (steps, untilLine = -1) => JSON.parse(await a2.ev(`(() => {
  const cpu = window.M.cpu;
  const watch = ${JSON.stringify(WATCH)};
  let n = 0, stopped = false;
  while (n < ${steps}) {
    if (${untilLine} >= 0 && (cpu.read(0x75) | (cpu.read(0x76) << 8)) === ${untilLine}) {
      stopped = true; break;
    }
    if (cpu.getPC() === 0xEFAE) {
      const v = window.M.vars();
      const g = (nm) => {
        const x = (v.vars || []).find((y) => y.name === nm && y.type === 'real');
        return x ? x.value : null;
      };
      window.__rec.push({
        seed: [cpu.read(0xC9), cpu.read(0xCA), cpu.read(0xCB), cpu.read(0xCC), cpu.read(0xCD)],
        a4: cpu.read(0xA4),
        line: cpu.read(0x75) | (cpu.read(0x76) << 8),
        bytes: watch.map((a) => cpu.read(a)),
        vars: { C: g('C'), L: g('L'), CD: g('CD'), P: g('P'), D: g('D'),
                D1: g('D1'), D2: g('D2'), J: g('J'), J1: g('J1'), CR: g('CR') },
      });
    }
    cpu.stepCycles(1);
    n++;
  }
  return JSON.stringify({ calls: window.__rec.length, stopped });
})()`));

// ---- REPAIR/RESTOCK, menu 6: the repair at 2500 and the weapon prices at 3000 ----------
// A base on the planet for line 65, landed for 2505, and every system knocked down to a
// different value so each one's cost is its own test. Energy is put below 63 so 2524 runs.
await a2.ev(`(() => {
  const w = window.M.wr;
  w(38303 + ${planet}, 1); w(38208, 1); w(38210, 1); w(29469, 10); w(29470, 0);
  w(38200, 41); w(38199, 17); w(38198, 73); w(38197, 6); w(38196, 99); w(38195, 1);
  w(38194, 55); w(38193, 84); w(38190, 12); w(38187, 3); w(38186, 68); w(38184, 37);
  return 'w';
})()`);
await a2.frames(20);
await a2.key('6');
// 2540 ends the loop and 2550 prints the total, so stopping there catches P complete and every
// system already poked back.
const rep = await record(30000000, 2550);
console.log(`  after REPAIR: ${rep.calls} draws` +
  `${rep.stopped ? ', stopped at 2550 with the loop finished' : ' (never reached 2550)'}`);
// The total and what each system was poked back to - 2520 and 2530 write 100, 2525 writes 63.
const repairEnd = JSON.parse(await a2.ev(`(() => {
  const cpu = window.M.cpu, v = window.M.vars();
  const g = (nm) => {
    const x = (v.vars || []).find((y) => y.name === nm && y.type === 'real');
    return x ? x.value : null;
  };
  return JSON.stringify({ P: g('P'), CD: g('CD'),
    bytes: ${JSON.stringify(WATCH)}.map((a) => cpu.read(a)) });
})()`));
console.log(`  the bill came to ${repairEnd.P}, and the systems now read ` +
  repairEnd.bytes.join(', '));
// 2580 asks whether you are paying; anything but N pays and returns to GROUND FORCES.
await a2.key('Y');
await record(6000000);

// ---- ENLIST TROOPS, menu 4, which falls into BUY WEAPONS ---------------------------------
if (!await waitFor(GF, 'GROUND FORCES (back from repair)')) {
  console.log('  did not return to GROUND FORCES after the repair');
} else {
  // 2210 allows it once a trip, 2240 wants the planet surrendered, and GROUND FORCES 66 wants
  // the troops on this planet rather than left behind on another.
  await a2.ev(`(() => {
    const w = window.M.wr;
    w(38303 + ${planet}, 1); w(38208, 1); w(38389, 0); w(38158, ${planet});
    w(38153, 0); w(38154, 0); w(38155, 0); w(38156, 0);
    return 'w';
  })()`);
  await a2.frames(20);
  await a2.key('4');
  await record(20000000);
  // 2275: how many troops. None, so the credits are left alone and 2290 falls into 3000.
  await a2.key('0');
  await a2.key(13);
  // 3060 assigns C and 3070 asks how many, so stopping at 3070 catches each price.
  for (let i = 0; i < 4; i++) {
    const w = await record(12000000, 3070);
    const v = await grab(['C', 'J1', 'CR']);
    weaponPrices.push({ stopped: w.stopped, C: v.C, J1: v.J1 });
    console.log(`    ${WEAPON_NAMES[i]} cost ${v.C}` + (w.stopped ? '' : '  (never reached 3070)'));
    await a2.key('0');
    await a2.key(13);
    // 3070 is still the current line while 5000 reads the digits, so step clear of it before
    // looking for the next one - otherwise the next stop is this same prompt and the prices
    // come out duplicated.
    await record(4000000);
  }
  console.log(`  after ENLIST and BUY WEAPONS: ${(await record(2000000)).calls} draws`);
}

// ---- SELL LOOT, menu 5 ------------------------------------------------------------------
if (!await waitFor(GF, 'GROUND FORCES (back from buy weapons)')) {
  console.log('  did not return to GROUND FORCES; recording what there is');
} else {
  await a2.ev(`(() => {
    const w = window.M.wr;
    w(38303 + ${planet}, 1); w(38208, 1);
    w(38171, 7); w(38172, 3); w(38173, 5); w(38174, 2); w(38175, 1); w(38176, 4);
    w(38177, 6); w(38178, 9); w(38179, 11); w(38180, 2); w(38181, 3); w(38182, 8);
    w(38183, 5);
    return 'w';
  })()`);
  await a2.frames(20);
  await a2.key('5');
  // 2406 doubles and 2408 truncates, then 2430 prints - so stop there for the final L.
  const sl = await record(25000000, 2430);
  lootValue = (await grab(['L', 'CR'])).L;
  console.log(`  after SELL LOOT: ${sl.calls} draws, the loot came to ${lootValue}`);
  await a2.key('N');

  // ---- ESTABLISH BASE, menu 7 -----------------------------------------------------------
  if (await waitFor(GF, 'GROUND FORCES (back from sell loot)')) {
    const tech = (await a2.readRange(0x9500, 0x9600))[38282 + planet - 0x9500];
    await a2.ev(`(() => {
      const w = window.M.wr;
      w(38303 + ${planet}, 0); w(38149, 0); w(38282 + ${planet}, ${Math.max(2, tech)});
      return 'w';
    })()`);
    await a2.frames(20);
    await a2.key('7');
    // 2100 calls 2170 and 2110 prints the price, so stop at 2110 before `C = INT(C)` runs.
    const bs = await record(25000000, 2110);
    baseCost = (await grab(['C', 'CR'])).C;
    console.log(`  after ESTABLISH BASE: ${bs.calls} draws, a base costs ${baseCost}`);
  }
}

const calls = JSON.parse(await a2.ev(`JSON.stringify(window.__rec)`));
await a2.close();

const byLine = {};
for (const c of calls) byLine[c.line] = (byLine[c.line] || 0) + 1;
console.log('');
console.log('  draws by the line that made them:');
for (const k of Object.keys(byLine).sort((a, b) => a - b)) {
  console.log(`    ${String(k).padStart(5)}  ${String(byLine[k]).padStart(4)}`);
}

fs.mkdirSync('captured/replay', { recursive: true });
fs.writeFileSync('captured/replay/prices.json', JSON.stringify({
  source: "every entry to $EFAE across SHORE LEAVE's repair, weapon, loot and base screens, with the seed before the call, the executing line, the twelve system bytes and the live Applesoft variables",
  planet, systems: SYSTEMS, lootAddresses: LOOT_ADDRESSES, watch: WATCH,
  calls, repairEnd, weaponPrices, lootValue, baseCost,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/replay/prices.json');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
