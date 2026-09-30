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

// ---- COLLECT's tech 1 path, 840-900 ---------------------------------------------------------
//
// `805 ON TECH + 1 GOSUB 820,840,910,1070,1090` sends a primitive planet to 840, which no
// assault had ever reached - every planet played so far has been tech 3. Forcing the planet's
// tech byte gets there, and the path is three lines with two bugs in them:
//
//   850 J = PEEK(38183) + (RND(1) * 5): IF J > 255 THEN J = 255
//   860 POKE 38183,J
//   870 F = PEEK(38182) + (RND(1) * 5): IF J > 255 THEN J = 255
//   880 POKE 38182,J
//   890 J = PEEK(38173) + (RND(1) * 10): IF J > 255 THEN J = 255
//   900 POKE 38173,J: RETURN
//
// 870 works the silver out into `F`, tests **J** rather than F, and 880 stores **J** - still
// gold's value. So silver always comes out equal to gold, and the draw 870 made is thrown away
// but still advances the stream. And 840 promises "WINES AND LIQUORS" while 890 credits 38173,
// which is luxury food; wine is 38172 and is never touched.
const tech1File = 'captured/replay/loot-tech1.json';
let tech1Bad = null;
if (fs.existsSync(tech1File)) {
  const T = JSON.parse(fs.readFileSync(tech1File, 'utf8'));
  if (T.start >= 0) {
    const names = T.loot.map((x) => x[0]);
    const seeds = Array.from({ length: 3 }, (_, k) => T.calls[T.start + k].seed);
    const b6 = await chromium.launch({ headless: true });
    const p6 = await b6.newPage();
    await p6.goto(PORT_URL, { waitUntil: 'load' });
    await p6.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.awardLoot),
      null, { timeout: 30000 });
    const out = await p6.evaluate(({ ss, a4, before, addrs }) => {
      const sv = window.__spaceVikings;
      const drawn = ss.map((x) => sv.rndEFAE(x, a4).value);
      let k = 0;
      const rnd = () => drawn[k++];
      const loot = {};
      addrs.forEach((a, i) => { loot[a] = before[i]; });
      const r = sv.awardLoot(loot, 1, false, rnd);
      return { drawn, used: k, loot: addrs.map((a) => r.loot[a]),
        modelByte: r.modelByteWritten };
    }, {
      ss: seeds,
      a4: T.calls[T.start].a4,
      before: T.calls[T.start].loot,
      addrs: T.loot.map((x) => x[1]),
    });
    await b6.close();

    tech1Bad = 0;
    console.log('');
    console.log(`COLLECT at tech ${T.tech}, the 840 path: ${T.calls.length} draws in all,` +
      ` ${T.calls.length - T.start} of them the loot`);
    console.log('  counter          before  disk after  port after   RND drawn');
    const WATCH = ['gold', 'silver', 'luxuryFood', 'wine'];
    for (const nm of WATCH) {
      const i = names.indexOf(nm);
      const before = T.calls[T.start].loot[i];
      const disk = T.final[i];
      const port = out.loot[i];
      const ok = disk === port;
      if (!ok) tech1Bad++;
      console.log(`  ${nm.padEnd(15)} ${String(before).padStart(6)} ${String(disk).padStart(11)}` +
        ` ${String(port).padStart(11)}${ok ? '' : '   DIFFERS'}`);
    }
    const gi = names.indexOf('gold');
    const si = names.indexOf('silver');
    const sameAsGold = T.final[gi] === T.final[si];
    if (!sameAsGold) tech1Bad++;
    console.log(`  silver equals gold on the machine: ${sameAsGold ? 'yes' : 'NO'}` +
      ` (${T.final[si]} against ${T.final[gi]}) - 880 stores J, not F`);
    const okDraws = out.used === 3;
    if (!okDraws) tech1Bad++;
    console.log(`  draws the port takes: ${out.used} against 3 on the machine` +
      `${okDraws ? ' - 870 throws its value away but still advances the stream' : '   DIFFERS'}`);
    const wi = names.indexOf('wine');
    console.log(`  wine, which 840's message promises: ${T.calls[T.start].loot[wi]} ->` +
      ` ${T.final[wi]}, untouched - 890 credits luxury food instead`);
    const okStray = T.finalStray === T.calls[T.start].stray;
    if (!okStray) tech1Bad++;
    console.log(`  31180 stays at ${T.finalStray}: ${okStray ? 'yes' : 'NO'}` +
      ' - 960 is on the 920 path, which tech 1 never reaches');
    console.log('');
    console.log(tech1Bad === 0
      ? 'the tech 1 path agrees, bugs and all'
      : `${tech1Bad} tech 1 check(s) differ`);
  }
}

// ---- line 5000's ground fire --------------------------------------------------------------
//
// probe_rndground.mjs records the executing line number with every draw, so each one is
// attributed to the line that made it rather than guessed at. X1 was the obvious tell and it is
// the wrong one: 5095 advances X1 at every step of the bolt, not only at 5000's setup.
//
// This drives the port's own `spawnGroundBolt5000` and `groundBoltStep5090` with an `rnd` that
// hands back the machine's recomputed draws in order, so it tests the shipped code and not a
// second copy of the formulas. How many draws each call takes is itself checked, against the run
// of line numbers the machine recorded - which is what catches a routine that draws the right
// values in the wrong order or the wrong number of times.
const groundFile = 'captured/replay/ground.json';
let groundBad = null;
if (fs.existsSync(groundFile)) {
  const G = JSON.parse(fs.readFileSync(groundFile, 'utf8'));
  const C = G.calls;
  const SHIELDS = G.watch.indexOf(38200);
  const BATTERIES = G.watch.indexOf(38207);
  const COND = G.watch.indexOf(38165);
  // What 5098 and 5200 add behind a 5090 draw. 5090 itself is not in the list: consecutive
  // steps of one bolt are consecutive 5090 draws, so including it would run them together.
  const STEP_LINES = [3205, 5210, 5240];

  // A bolt is a run of 5000/5045 draws; a step is a 5090 draw and whatever followed it.
  const boltStarts = C.map((c, i) => (c.line === 5000 && (i === 0 || C[i - 1].line !== 5000) ? i : -1))
    .filter((i) => i >= 0);
  const runLength = (i, lines) => {
    let n = 0;
    while (C[i + n] && lines.includes(C[i + n].line)) n++;
    return n;
  };

  const b4 = await chromium.launch({ headless: true });
  const p4 = await b4.newPage();
  await p4.goto(PORT_URL, { waitUntil: 'load' });
  await p4.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.spawnGroundBolt5000),
    null, { timeout: 30000 });

  const out = await p4.evaluate(({ calls, boltStarts, stepIdx }) => {
    const sv = window.__spaceVikings;
    // The machine's own draws, recomputed from the seed each call had.
    const drawn = calls.map((c) => sv.rndEFAE(c.seed, c.a4).value);
    /** An rnd that replays the stream from `at`, counting what gets taken. */
    const from = (at) => {
      let k = at;
      const f = () => drawn[k++];
      f.used = () => k - at;
      return f;
    };
    const bolts = boltStarts.map((i) => {
      const rnd = from(i);
      const b = sv.spawnGroundBolt5000(rnd);
      return { i, b, used: rnd.used() };
    });
    const steps = stepIdx.map((s) => {
      const rnd = from(s.i);
      const r = sv.groundBoltStep5090(s.damage, s.ctx, rnd);
      return { i: s.i, r, used: rnd.used() };
    });
    return { drawn, bolts, steps };
  }, {
    calls: C.map((c) => ({ seed: c.seed, a4: c.a4 })),
    boltStarts,
    stepIdx: C.map((c, i) => (c.line === 5090 ? {
      i,
      // the ship as it stood at that step, so the shields comparison is against the real byte
      damage: {
        shields: C[i].bytes[SHIELDS], radar: 200, engine1: 200,
        engine2: 200, computer: 200, laser: 200, hull: 200,
      },
      ctx: { condition: C[i].bytes[COND], batteries: C[i].bytes[BATTERIES] },
    } : null)).filter(Boolean),
  });
  await b4.close();

  const near = (a, b) => a !== null && b !== null && Math.abs(a - b) <= 1e-4 * Math.max(1, Math.abs(b));
  groundBad = 0;
  const checks = { X1: [0, 0], edge: [0, 0], Y2: [0, 0], X2: [0, 0], shape: [0, 0],
    setupDraws: [0, 0], hit: [0, 0], shields: [0, 0], returnFire: [0, 0], battery: [0, 0],
    stepDraws: [0, 0] };
  const tally = (k, ok) => { checks[k][1]++; if (ok) checks[k][0]++; else groundBad++; };

  for (const { i, b, used } of out.bolts) {
    if (i + 3 >= C.length) continue;
    // 5000's three draws, read back from the variables at the first step
    tally('X1', near(C[i + 1].vars.X1, b.x));
    // which line made the Y2 draw is the machine's own answer to `IF Y1 >= .4`
    tally('edge', C[i + 2].line === (b.y === 10 ? 5000 : 5045));
    tally('Y2', near(C[i + 3].vars.Y2, b.vy));
    tally('X2', C[i + 3].vars.X2 === b.vx);
    tally('shape', C[i + 3].vars.M === b.shape);
    tally('setupDraws', used === runLength(i, [5000, 5045]));
  }

  for (const { i, r, used } of out.steps) {
    // 5090's hit shows up as a 3205 draw right behind it, and 5200 is inside the same THEN
    tally('hit', r.hit === (C[i + 1] && C[i + 1].line === 3205));
    tally('stepDraws', used === 1 + runLength(i + 1, STEP_LINES));
    if (!r.hit || !C[i + 1] || C[i + 1].line !== 3205) continue;
    const after = C[i + 2] ? C[i + 2].bytes[SHIELDS] : null;
    if (after !== null) tally('shields', r.damage.shields === after);
    tally('returnFire', (r.returnFire !== null) === (!!C[i + 2] && C[i + 2].line === 5210));
    const kIdx = C.findIndex((c, k) => k > i && c.line === 5240);
    if (r.returnFire && kIdx > 0 && kIdx <= i + 3 && C[kIdx + 1]) {
      const before = C[kIdx].bytes[BATTERIES];
      tally('battery', C[kIdx + 1].bytes[BATTERIES]
        === (r.batteryDestroyed && before > 0 ? before - 1 : before));
    }
  }

  console.log('');
  console.log(`line 5000's ground fire: ${out.bolts.length} bolts, ${out.steps.length} steps, ` +
    `${C.filter((c) => c.line === 5210).length} hits that drew return fire, ` +
    `${C.filter((c) => c.line === 3205).length - C.filter((c) => c.line === 5210).length}` +
    ` of 3205's draws from the tick instead`);
  const LABEL = {
    X1: "5000's X1 across the screen", edge: 'which edge the bolt comes from',
    Y2: "Y2, including 5080's doubling", X2: "5050-5080's horizontal step",
    shape: 'the shape XDRAWn, 8, 9 or 10', setupDraws: 'draws a bolt costs to set up',
    hit: "5090's 30% hit, by what followed it", shields: '5098 - shields and nothing else',
    returnFire: '5200 only inside 5090\'s THEN', battery: '5240 - a battery off 38207',
    stepDraws: 'draws a step of the bolt takes',
  };
  for (const k of Object.keys(checks)) {
    const [good, n] = checks[k];
    console.log(`  ${LABEL[k].padEnd(38)} ${String(good).padStart(4)} of ${String(n).padStart(4)}` +
      `${good === n ? '' : '   DIFFERS'}`);
  }
}

// ---- SHORE LEAVE's prices -------------------------------------------------------------------
//
// Four screens draw: the repair bill at 2520-2530, a weapon's price at 3060, the art in a loot
// sale at 2400, and a base at 2170. This drives the port's own `repairBill2500`,
// `weaponCost3060`, `lootValue2400` and `baseCost2170` with the machine's recomputed draws.
//
// The value a line computes is not visible at the draw that made it, so probe_rndprices.mjs
// stops on the line just after each one and reads the variable. It has to: `2080`, which clears
// the screen, is `FOR C = 2 TO 13: ... NEXT` and leaves **C = 14** behind, and 3020 calls it
// before every one of 3060's four prices - so reading C at the next draw would give 14 every
// time rather than the previous price.
const priceFile = 'captured/replay/prices.json';
let priceBad = null;
if (fs.existsSync(priceFile)) {
  const S = JSON.parse(fs.readFileSync(priceFile, 'utf8'));
  const C = S.calls;
  const at = (line) => C.map((c, k) => (c.line === line ? k : -1)).filter((k) => k >= 0);
  const repairIdx = C.map((c, k) => ([2520, 2525, 2530].includes(c.line) ? k : -1)).filter((k) => k >= 0);
  const weaponIdx = at(3060);
  const lootIdx = at(2400);
  const baseIdx = at(2170);
  const nSys = S.systems.length;

  const b5 = await chromium.launch({ headless: true });
  const p5 = await b5.newPage();
  await p5.goto(PORT_URL, { waitUntil: 'load' });
  await p5.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.repairBill2500),
    null, { timeout: 30000 });

  const out = await p5.evaluate(({ calls, repairIdx, weaponIdx, lootIdx, baseIdx, values, counts }) => {
    const sv = window.__spaceVikings;
    const drawn = calls.map((c) => sv.rndEFAE(c.seed, c.a4).value);
    const from = (at) => {
      let k = at;
      const f = () => drawn[k++];
      f.used = () => k - at;
      return f;
    };
    const rRepair = from(repairIdx[0]);
    const repair = sv.repairBill2500(values, rRepair);
    const weapons = weaponIdx.map((k, n) =>
      sv.weaponCost3060(sv.WEAPONS[n].unit, from(k)));
    const rLoot = from(lootIdx[0]);
    const loot = sv.lootValue2400(counts, sv.rollArtRate(rLoot));
    const rBase = from(baseIdx[0]);
    const base = sv.baseCost2170(rBase);
    return { repair, repairUsed: rRepair.used(), weapons, loot, base,
      drawnBase: [drawn[baseIdx[0]], drawn[baseIdx[0] + 1]] };
  }, {
    calls: C.map((c) => ({ seed: c.seed, a4: c.a4 })),
    repairIdx, weaponIdx, lootIdx, baseIdx,
    // the twelve system bytes as they stood at the first repair draw
    values: C[repairIdx[0]].bytes.slice(0, nSys),
    // the thirteen cargo counters as they stood at 2400's draw
    counts: C[lootIdx[0]].bytes.slice(nSys),
  });
  await b5.close();

  priceBad = 0;
  const bad = (why) => { priceBad++; return '   ' + why; };

  // Each system's own cost comes out of P, which the recording carries at every draw: P at one
  // draw is the running total before it, so the differences are the individual bills.
  const pAt = repairIdx.map((k) => C[k].vars.P ?? 0);
  const machineCost = repairIdx.map((k, n) =>
    (n + 1 < pAt.length ? pAt[n + 1] : S.repairEnd.P) - pAt[n]);

  console.log('');
  console.log('SHORE LEAVE, the repair bill at 2520-2530:');
  console.log('   J  system          was  restored     disk cost    port cost');
  S.systems.forEach(([name], n) => {
    const line = out.repair.lines[n];
    const want = machineCost[n];
    const okCost = line.cost === want;
    const okByte = line.restoredTo === S.repairEnd.bytes[n];
    if (!okCost) bad('cost');
    if (!okByte) bad('byte');
    console.log(`  ${String(n + 1).padStart(2)}  ${name.padEnd(14)} ${String(line.before).padStart(4)}` +
      `   ${String(line.restoredTo).padStart(4)}      ${String(want).padStart(9)}` +
      `    ${String(line.cost).padStart(9)}` +
      `${okCost && okByte ? '' : '   DIFFERS'}`);
  });
  const okTotal = out.repair.total === S.repairEnd.P;
  if (!okTotal) bad('total');
  const okDraws = out.repairUsed === repairIdx.length;
  if (!okDraws) bad('draws');
  console.log(`  the bill: ${out.repair.total} against the machine's ${S.repairEnd.P}` +
    `${okTotal ? '' : '   DIFFERS'}`);
  console.log(`  draws taken: ${out.repairUsed} against ${repairIdx.length} on the machine` +
    `${okDraws ? '' : '   DIFFERS'}  - energy at 63 or better and missiles at 100 cost nothing`);

  console.log('');
  console.log("the weapon prices at 3060, and 2080's leftover C:");
  const NAMES = ['FIGHTERS', 'TRANSPORTS', 'TANKS', 'MISSILES'];
  NAMES.forEach((nm, n) => {
    const want = S.weaponPrices[n] ? S.weaponPrices[n].C : null;
    const ok = out.weapons[n] === want;
    if (!ok) bad('weapon');
    console.log(`  ${nm.padEnd(12)} disk ${String(want).padStart(5)}   port ` +
      `${String(out.weapons[n]).padStart(5)}${ok ? '' : '   DIFFERS'}`);
  });

  const okLoot = out.loot === S.lootValue;
  if (!okLoot) bad('loot');
  console.log('');
  console.log(`the loot sale at 2400: disk ${S.lootValue}, port ${out.loot}` +
    `${okLoot ? '' : '   DIFFERS'}  - twelve fixed rates and one drawn, doubled at 2406`);

  // 2110 prints INT(C) and then assigns it, so the machine's C is caught before the truncation.
  const okBase = out.base === Math.trunc(S.baseCost);
  if (!okBase) bad('base');
  const exact = 20000 + (out.drawnBase[0] * 5000) * (out.drawnBase[1] * 10);
  const okExact = Math.abs(exact - S.baseCost) <= 1e-4 * S.baseCost;
  if (!okExact) bad('base exact');
  console.log(`a base at 2170: disk ${S.baseCost} -> ${Math.trunc(S.baseCost)}, port ` +
    `${out.base}${okBase ? '' : '   DIFFERS'}  - two draws, ${okExact ? 'and the untruncated ' +
    'product agrees too' : 'BUT THE UNTRUNCATED PRODUCT DIFFERS'}`);

  console.log('');
  console.log(priceBad === 0
    ? 'every price on all four screens predicted from the seed'
    : `${priceBad} price check(s) differ`);
}

const total = bad + (combatBad ?? 0) + (lootBad ?? 0) + (groundBad ?? 0)
  + (priceBad ?? 0) + (tech1Bad ?? 0);
console.log('');
console.log(total === 0 ? 'replay: clean' : `replay: ${total} differ`);
process.exit(total === 0 ? 0 : 1);
