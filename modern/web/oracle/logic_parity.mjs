// The port's economy and combat against what the disk actually does.
//
// The economy is deterministic once the one randomly-priced counter is emptied, so
// probe_economy.mjs's capture is an exact answer to check against.
//
// The combat is not: lines 550-680 are all RND, and Applesoft's RND is a five-byte float LCG
// whose sequence cannot be had without transcribing the ROM's floating-point multiply and
// add. So it is checked the way probe_combat.mjs checked the machine - against predicates the
// formulas make and the wrong formulas fail:
//
//   - transports change by (-0.5, +0.5] and go UP about half the time. The port had
//     `rnd * rnd * 0.5`, which can only subtract and never exceeds 0.5 down.
//   - tanks, fighters and missiles lose 0..5 a round and never gain.
//   - line 4000 truncates all five every round.
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const econ = JSON.parse(fs.readFileSync('captured/economy/golden.json', 'utf8'));
const combat = JSON.parse(fs.readFileSync('captured/combat/golden.json', 'utf8'));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.lootValue2400), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose lootValue2400 - is the dev server running?'); });

const sellRun = econ.runs.find((r) => r.what === 'sell loot, no random term');
const baseRun = econ.runs.find((r) => r.what === 'establish base');

const got = await page.evaluate(({ counts, rounds }) => {
  const sv = window.__spaceVikings;
  // The deterministic sale: art emptied, so the random rate cannot matter.
  const loot = sv.lootValue2400(counts, 0);
  const rates = sv.LOOT_RATES;
  const weapons = sv.WEAPONS;
  const bases = []; for (let i = 0; i < 20000; i++) bases.push(sv.baseCost2170());
  const costs = weapons.map((w) => {
    const c = []; for (let i = 0; i < 5000; i++) c.push(sv.weaponCost3060(w.unit));
    return { name: w.name, unit: w.unit, min: Math.min(...c), max: Math.max(...c) };
  });

  // Run the port's combat for a while and collect the same statistics.
  let s = { fighters: 75, transports: 6, tanks: 50, missiles: 60, troops: 2000, enemyTroops: 50000, vitality: 0 };
  const inp = { tech: 3, surrenderAt: 40, morale: 4, penalty: true };
  const tp = { rise: 0, fall: 0, worstUp: 0, worstDown: 0 };
  const others = { T: { rise: 0, worst: 0 }, P: { rise: 0, worst: 0 }, M: { rise: 0, worst: 0 } };
  let truncations = 0;
  for (let i = 0; i < rounds; i++) {
    const r = sv.combatRound550(s, inp);
    const d = r.transports - s.transports;
    if (d > 0) { tp.rise++; tp.worstUp = Math.max(tp.worstUp, d); }
    else if (d < 0) { tp.fall++; tp.worstDown = Math.max(tp.worstDown, -d); }
    for (const [k, key] of [['T', 'tanks'], ['P', 'fighters'], ['M', 'missiles']]) {
      const dd = r[key] - s[key];
      if (dd > 0 && s[key] > 0) others[k].rise++;
      if (dd < 0) others[k].worst = Math.max(others[k].worst, -dd);
    }
    const t = sv.truncate4000(r);
    if (t.transports !== r.transports || t.tanks !== r.tanks) truncations++;
    s = { ...t, vitality: r.vitality };
    if (r.outcome !== 'continue') {
      s = { fighters: 75, transports: 6, tanks: 50, missiles: 60, troops: 2000, enemyTroops: 50000, vitality: 0 };
    }
  }
  return { loot, rates, bases: { min: Math.min(...bases), max: Math.max(...bases) }, costs, tp, others, truncations };
}, { counts: sellRun.counts, rounds: 20000 });
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

let fail = 0;
const check = (name, ok, detail) => {
  if (!ok) fail++;
  console.log(`  ${name.padEnd(46)} ${ok ? 'ok' : 'FAILED'}${detail ? `   ${detail}` : ''}`);
};

console.log('the economy, against SHORE LEAVE run on the disk');
check(`sell loot, counts ${sellRun.counts.join(',')}`, got.loot === sellRun.L,
  `machine ${sellRun.L}, port ${got.loot}`);
check('the thirteen rates', JSON.stringify(got.rates) === JSON.stringify(econ.rates),
  got.rates.map((r) => r ?? 'RND').join(','));
check('base cost inside 20000..70000', got.bases.min >= 20000 && got.bases.max <= 70000,
  `${got.bases.min}..${got.bases.max}, the disk gave ${Math.trunc(baseRun.C)}`);
check('the disk\'s base cost is inside the port\'s range',
  baseRun.C >= got.bases.min - 1 && baseRun.C <= got.bases.max + 1);
for (const c of got.costs) {
  check(`${c.name} cost inside 0.8..4.8 x ${c.unit}`,
    c.min >= Math.trunc(0.8 * c.unit) && c.max <= Math.trunc(4.8 * c.unit), `${c.min}..${c.max}`);
}

console.log('');
console.log('the combat, against the predicates a real assault satisfied');
const m = (() => {
  const s = combat.samples.filter((x) => x.TP !== undefined);
  const seq = []; for (const x of s) if (!seq.length || x.TP !== seq[seq.length - 1]) seq.push(x.TP);
  let rise = 0, fall = 0;
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1], b = seq[i];
    if (a < 0 && b === 0) continue;
    if (b === Math.trunc(a) && a !== b) continue;
    if (b > a) rise++; else if (b < a) fall++;
  }
  return { rise, fall };
})();
console.log(`  the disk's assault: transports rose ${m.rise} times and fell ${m.fall}`);
check('transports rise as well as fall', got.tp.rise > 0 && got.tp.fall > 0,
  `${got.tp.rise} up, ${got.tp.fall} down in 20000 rounds`);
check('transports change by at most 0.5 either way',
  got.tp.worstUp <= 0.5001 && got.tp.worstDown <= 0.5001,
  `+${got.tp.worstUp.toFixed(4)} / -${got.tp.worstDown.toFixed(4)}`);
check('rises are roughly half the changes',
  Math.abs(got.tp.rise / (got.tp.rise + got.tp.fall) - 0.5) < 0.1,
  `${(100 * got.tp.rise / (got.tp.rise + got.tp.fall)).toFixed(1)}%`);
for (const [k, label] of [['T', 'tanks'], ['P', 'fighters'], ['M', 'missiles']]) {
  check(`${label} never gain, lose at most 5`,
    got.others[k].rise === 0 && got.others[k].worst <= 5.0001,
    `${got.others[k].rise} rises, worst ${got.others[k].worst.toFixed(4)}`);
}
check('line 4000 truncates', got.truncations > 0, `${got.truncations} rounds of 20000`);

console.log('');
console.log(fail === 0 ? 'logic parity: clean' : `logic parity: ${fail} check(s) failed`);
process.exit(fail === 0 ? 0 : 1);
