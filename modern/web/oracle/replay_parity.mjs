// The damage tick, checked on the numbers rather than by predicate.
//
// probe_rndreplay.mjs recorded, at every entry to `$EFAE` during a damaging flight, the seed
// before the call and the seven system bytes 3205-3350 write. Consecutive entries bracket one
// draw each, so with `rndEFAE` the exact value the machine drew can be recomputed and the
// formula checked against it:
//
//   3205  shields -= RND(1) * 1.1
//   3230  radar, 3260 engine 1, 3270 engine 2, computer, laser  -= RND(1) * 5
//   3350  hull -= RND(1) * 4
//
// each stored through `3380 IF J < 0 THEN J = 0` and a POKE, which truncates. That is seven
// draws in a fixed order, and a window of seven consecutive calls over which all seven systems
// change is a tick that got past 3205's gate.
//
// This is what the RND work bought: before it, the most that could be said was that shields
// never lost more than 1.1 and the rest never more than 5. Now each loss is predicted exactly.
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/replay/damage.json', 'utf8'));
const calls = golden.calls;
const NAMES = golden.systems.map((s) => s[0]);
/** 3205 and 3230-3350: what each draw is multiplied by, in the order the lines run. */
const SCALE = [1.1, 5, 5, 5, 5, 5, 4];

// A tick past 3205 writes all seven in order, one per draw.
const windows = [];
for (let i = 0; i + 7 < calls.length; i++) {
  let all = true;
  for (let k = 0; k < 7; k++) if (calls[i + k].sys[k] === calls[i + k + 1].sys[k]) all = false;
  if (all) windows.push(i);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.rndEFAE), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose rndEFAE - is the dev server running?'); });

const drawn = await page.evaluate(({ jobs }) => {
  const sv = window.__spaceVikings;
  return jobs.map((j) => j.seeds.map((s) => sv.rndEFAE(s, j.a4).value));
}, {
  jobs: windows.map((i) => ({
    a4: calls[i].a4,
    seeds: Array.from({ length: 7 }, (_, k) => calls[i + k].seed),
  })),
});
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

console.log(`${calls.length} recorded draws, ${windows.length} of them the start of a tick past 3205`);
console.log(`$A4 in the running game: $${calls[0].a4.toString(16)}`);
console.log('');
console.log('  tick  system     before  after   RND drawn     predicted   ');

let checks = 0;
let bad = 0;
windows.forEach((i, w) => {
  for (let k = 0; k < 7; k++) {
    const before = calls[i + k].sys[k];
    const after = calls[i + k + 1].sys[k];
    const v = drawn[w][k];
    const raw = before - v * SCALE[k];
    const predicted = raw < 0 ? 0 : Math.trunc(raw);
    checks++;
    const ok = predicted === after;
    if (!ok) bad++;
    if (w < 2 || !ok) {
      console.log(`  ${String(w).padStart(4)}  ${NAMES[k].padEnd(9)} ${String(before).padStart(6)} ` +
        `${String(after).padStart(6)}   ${v.toFixed(9)}   ${String(predicted).padStart(9)}   ` +
        `${ok ? '' : 'DIFFERS'}`);
    }
  }
});

console.log('');
console.log(`${checks - bad} of ${checks} losses predicted to the byte from the recomputed RND value`);

// ---- GROUND FORCES' combat, the same way ---------------------------------------------------
//
// A round draws eighteen values in a fixed order - VIC, then T2/T3/X, then two each for T, P
// and M, one for TP, three for TR, three for ET and one more for X because 38205 is non-zero -
// so a round is predictable from the seed at its first draw. Where that first draw falls in the
// recording is not known, so every offset is tried and the one that predicts the next round is
// the right one. Getting it wrong fails on the first round, so there is nothing to fit.
const combatFile = 'captured/replay/combat.json';
let combatBad = null;
if (fs.existsSync(combatFile)) {
  const c = JSON.parse(fs.readFileSync(combatFile, 'utf8'));
  const cc = c.calls;
  const DRAWS = 18;

  const b2 = await chromium.launch({ headless: true });
  const p2 = await b2.newPage();
  await p2.goto(PORT_URL, { waitUntil: 'load' });
  await p2.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.combatRound550), null, { timeout: 30000 });
  const res = await p2.evaluate(({ calls, draws, tech, morale }) => {
    const sv = window.__spaceVikings;
    const tryOffset = (off) => {
      const rounds = [];
      for (let i = off; i + draws < calls.length; i += draws) {
        const v = calls[i].vars;
        const next = calls[i + draws];
        if (v.T === null || !next) break;
        // The same seed the machine had, fed through the transcribed RND in order.
        let s = calls[i].seed.slice();
        const rnd = () => { const r = sv.rndEFAE(s, calls[i].a4); s = r.seed; return r.value; };
        const r = sv.combatRound550({
          fighters: v.P, transports: v.TP, tanks: v.T, missiles: v.M,
          troops: v.TR, enemyTroops: 0, vitality: v.VP,
        }, { tech, surrenderAt: 200, morale, penalty: true }, rnd);
        const t = sv.truncate4000(r);
        rounds.push({
          predicted: [t.missiles, t.tanks, t.transports, t.fighters],
          actual: [next.bytes[0], next.bytes[1], next.bytes[2], next.bytes[3]],
          // TR is the one that discriminates hardest: 560 scales it by T2, and T2 is the
          // `200 * (RND * 5)` that had been read as `200 + (RND * 5)`. The two differ by up to
          // five hundred, so a round's troop loss tells them apart on its own.
          tr: t.troops, actualTr: next.vars.TR === null ? null : Math.trunc(next.vars.TR),
          // VP exercises the branch, the morale term at 575 and the clamps at 580-585 - but
          // GROUND FORCES never pokes it back. Line 600 writes only the four weapon bytes, so
          // 38160 sits at whatever it was and VP lives in the variable alone. 4000 does not
          // truncate it either, so it carries a fraction from round to round - which means it
          // accumulates in Applesoft's 32-bit mantissa where the port accumulates in a double.
          // Compared to a tolerance for that reason, and the drift reported.
          vp: r.vitality, actualVp: next.vars.VP,
        });
      }
      return rounds;
    };
    const scored = [];
    for (let off = 0; off < draws; off++) {
      const rounds = tryOffset(off);
      let good = 0;
      for (const r of rounds) {
        if (r.predicted.join(',') === r.actual.join(',') && r.tr === r.actualTr
          && Math.abs(r.vp - r.actualVp) < 1e-4) good++; else break;
      }
      scored.push({ off, rounds, good });
    }
    scored.sort((a, b) => b.good - a.good || b.rounds.length - a.rounds.length);
    return scored[0];
  }, { calls: cc, draws: DRAWS, tech: c.tech, morale: c.morale });
  await b2.close();

  console.log('');
  console.log(`${cc.length} draws recorded during a real assault, tech ${c.tech}, morale ${c.morale}`);
  console.log(`the round boundary falls at draw ${res.off} of every ${DRAWS}`);
  console.log('');
  console.log('  round   M   T   TP   P        TR       VP       predicted TR / VP');
  combatBad = 0;
  res.rounds.forEach((r, i) => {
    const counts = r.predicted.join(',') === r.actual.join(',');
    const ok = counts && r.tr === r.actualTr && Math.abs(r.vp - r.actualVp) < 1e-4;
    if (!ok) combatBad++;
    if (i < 5 || !ok) {
      console.log(`  ${String(i).padStart(5)} ${r.actual.map((v) => String(v).padStart(3)).join(' ')}` +
        ` ${String(r.actualTr).padStart(8)} ${r.actualVp.toFixed(4).padStart(9)}   ` +
        `${String(r.tr).padStart(8)} ${r.vp.toFixed(4).padStart(9)}   ` +
        `${ok ? '' : `DIFFERS${counts ? '' : ' (counts)'}`}`);
    }
  });
  console.log('');
  const drift = Math.max(...res.rounds.map((r) => Math.abs(r.vp - r.actualVp)));
  console.log(`${res.rounds.length - combatBad} of ${res.rounds.length} rounds predicted ` +
    `- four weapon counts and the troop total to the unit, the assault's progress to ${drift.toExponential(1)}`);
}

// ---- COLLECT's thirteen loot draws --------------------------------------------------------
//
// 920 draws thirteen values in a fixed order at rates J1 and J2, each stored through
// `915 IF J > 255 THEN J = 255` and a truncating POKE. The recording says where they start - the
// draw after which gold first moves is 925 - and carries J1 and J2 as the machine held them, so
// 920's `IF PEEK(301) = 1 THEN J1 = J1 * .6` needs no guessing at what 301 was.
const lootFile = 'captured/replay/loot.json';
let lootBad = null;
if (fs.existsSync(lootFile)) {
  const L = JSON.parse(fs.readFileSync(lootFile, 'utf8'));
  if (L.start >= 0) {
    const names = L.loot.map((x) => x[0]);
    const seeds = Array.from({ length: 13 }, (_, k) => L.calls[L.start + k].seed);
    const b3 = await chromium.launch({ headless: true });
    const p3 = await b3.newPage();
    await p3.goto(PORT_URL, { waitUntil: 'load' });
    await p3.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.rndEFAE), null, { timeout: 30000 });
    const drawn = await p3.evaluate(({ ss, a4 }) => {
      const sv = window.__spaceVikings;
      return ss.map((s) => sv.rndEFAE(s, a4).value);
    }, { ss: seeds, a4: L.calls[L.start].a4 });
    await b3.close();

    const { J1: j1, J2: j2 } = L.calls[L.start].rates;
    // 925-1050 in order, with the rate each line uses. 1030's luxury food is the one flat rate.
    const ORDER = [
      ['gold', j2], ['silver', j2], ['platinum', j2], ['titanium', j2], ['collapsium', j1],
      ['steel', j2], ['fissionables', j2], ['electronics', j1], ['weapons', j1],
      ['fighterParts', j2], ['luxuryFood', 20], ['wine', j2], ['art', j1],
    ];
    // 915 caps at 255 and the POKE truncates.
    const cap = (v) => (v > 255 ? 255 : Math.trunc(v));
    // the counters after the thirteenth draw are only visible once the loop has finished
    const after = (k, idx) => (L.calls[L.start + k + 1]
      ? L.calls[L.start + k + 1].loot[idx] : L.final[idx]);

    console.log('');
    console.log(`COLLECT at tech ${L.tech}: 920 ran with J1 = ${j1} and J2 = ${j2}`);
    console.log('  line  counter          before  after   RND drawn     predicted');
    lootBad = 0;
    const LINES = [925, 940, 950, 960, 970, 980, 990, 1000, 1010, 1020, 1030, 1040, 1050];
    ORDER.forEach(([name, rate], k) => {
      const idx = names.indexOf(name);
      const before = L.calls[L.start + k].loot[idx];
      // 960 peeks 38180 but pokes 31180, so titanium is read and left where it was
      const stray = name === 'titanium';
      const predicted = stray ? before : cap(before + drawn[k] * rate);
      const got = after(k, idx);
      const ok = predicted === got;
      if (!ok) lootBad++;
      console.log(`  ${String(LINES[k]).padStart(4)}  ${name.padEnd(15)}${String(before).padStart(6)} ` +
        `${String(got).padStart(6)}   ${drawn[k].toFixed(9)}   ${String(predicted).padStart(9)}` +
        `${stray ? '   (960 pokes 31180 instead)' : ''}${ok ? '' : '   DIFFERS'}`);
    });

    // and where 960's value actually went: J = PEEK(38180) + RND * J2, poked to 31180.
    const tIdx = names.indexOf('titanium');
    const strayPredicted = cap(L.calls[L.start + 3].loot[tIdx] + drawn[3] * j2);
    const strayOk = strayPredicted === L.finalStray;
    if (!strayOk) lootBad++;
    console.log(`  960's value lands in 31180 = $79CC, inside the loaded ship model: ` +
      `${L.calls[L.start].stray} -> ${L.finalStray}, predicted ${strayPredicted}` +
      `${strayOk ? '' : '   DIFFERS'}`);
    console.log('');
    console.log(`${ORDER.length + 1 - lootBad} of ${ORDER.length + 1} predicted - the thirteen ` +
      `counters and the ship-model byte 960 writes instead of titanium`);
  }
}

const total = bad + (combatBad ?? 0) + (lootBad ?? 0);
console.log('');
console.log(total === 0 ? 'replay: clean' : `replay: ${total} differ`);
process.exit(total === 0 ? 0 : 1);
