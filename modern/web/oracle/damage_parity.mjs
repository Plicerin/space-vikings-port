// The port's damage model against what the disk does.
//
// Lines 3000-3381 are RND-driven and Applesoft's RND cannot be replayed, so this checks the
// same predicates probe_damage.mjs checked on the machine - each of which a misread formula
// fails - plus the one number that can be had from the listing outright: how often a tick
// does anything at all.
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/damage/golden.json', 'utf8'));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.damageTick3000), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose damageTick3000 - is the dev server running?'); });

const got = await page.evaluate(({ ticks }) => {
  const sv = window.__spaceVikings;
  const full = () => ({ shields: 200, radar: 200, engine1: 200, engine2: 200, computer: 200, laser: 200, hull: 200 });
  const keys = ['shields', 'radar', 'engine1', 'engine2', 'computer', 'laser', 'hull'];
  const bound = { shields: 1.1, radar: 5, engine1: 5, engine2: 5, computer: 5, laser: 5, hull: 4 };

  const run = (ctx) => {
    let d = full();
    let struck = 0, absorbed = 0, shieldOnly = 0, fullTick = 0, rises = 0, over = 0, fractional = 0;
    for (let i = 0; i < ticks; i++) {
      const r = sv.damageTick3000(d, ctx);
      const moved = keys.filter((k) => r.damage[k] !== d[k]);
      for (const k of moved) {
        const delta = d[k] - r.damage[k];
        if (delta < 0) rises++;
        if (delta > Math.ceil(bound[k])) over++;
      }
      for (const k of keys) if (r.damage[k] !== Math.trunc(r.damage[k])) fractional++;
      if (r.struck) struck++;
      if (r.absorbedByShields) absorbed++;
      if (moved.length === 1 && moved[0] === 'shields') shieldOnly++;
      else if (moved.length > 1) fullTick++;
      d = r.damage;
      if (r.destroyed) d = full();
      if (d.shields <= 0 && ctx.keepShields) d.shields = 200;
    }
    return { struck, absorbed, shieldOnly, fullTick, rises, over, fractional };
  };

  // Ground fire: 5098 sends L = 7 into 3205, so shields and nothing else, ever.
  let g = full();
  let gOther = 0, gShield = 0;
  for (let i = 0; i < ticks; i++) {
    const r = sv.groundFire5098(g);
    if (keys.some((k) => k !== 'shields' && r.damage[k] !== g[k])) gOther++;
    if (r.damage.shields !== g.shields) gShield++;
    g = r.damage;
    if (g.shields <= 0) g = full();
  }

  return {
    down: run({ shieldsOn: false, enemyPresent: true, atmosphere: false, keepShields: true }),
    up: run({ shieldsOn: true, enemyPresent: true, atmosphere: false, keepShields: true }),
    quiet: run({ shieldsOn: false, enemyPresent: false, atmosphere: false }),
    ground: { other: gOther, shield: gShield },
    chance: sv.TICK_DAMAGE_CHANCE,
    damaged: sv.DAMAGED_SYSTEMS.map((x) => x.address),
    undamaged: [...sv.UNDAMAGED_SYSTEMS],
  };
}, { ticks: 40000 });
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

// What the machine did, for the report.
const OTHER = new Set(['envControl', 'missiles', 'shieldsOn']);
const machineMoved = new Set();
const machineMovedAll = new Set();
for (const run of golden.runs) {
  for (let i = 1; i < run.seq.length; i++) {
    for (const k of Object.keys(run.seq[i])) {
      if (run.seq[i][k] === run.seq[i - 1][k]) continue;
      machineMovedAll.add(k);
      if (!OTHER.has(k)) machineMoved.add(k);
    }
  }
}

let fail = 0;
const check = (name, ok, detail) => {
  if (!ok) fail++;
  console.log(`  ${name.padEnd(48)} ${ok ? 'ok' : 'FAILED'}${detail ? `   ${detail}` : ''}`);
};

console.log(`the disk moved exactly these under damage: ${[...machineMoved].sort().join(', ')}`);
console.log('');
console.log('40000 ticks of the port, against the same predicates');
check('nothing ever goes up (3380)', got.down.rises === 0 && got.up.rises === 0,
  `${got.down.rises + got.up.rises} rises`);
check('no change exceeds its per-tick bound', got.down.over === 0 && got.up.over === 0,
  `${got.down.over + got.up.over} over`);
check('every value is a whole number (the POKE)', got.down.fractional === 0,
  `${got.down.fractional} fractional`);
check('no enemy and no atmosphere means no damage (3000)',
  got.quiet.struck === 0 && got.quiet.fullTick === 0, `${got.quiet.struck} struck`);
check('a tick damages something 41.2% of the time',
  Math.abs(got.down.struck / 40000 - got.chance) < 0.01,
  `${(100 * got.down.struck / 40000).toFixed(1)}% against ${(100 * got.chance).toFixed(1)}%`);
check('shields up and high absorb it (3205)', got.up.absorbed > 0 && got.up.shieldOnly > 0,
  `${got.up.absorbed} absorbed of ${got.up.struck} struck`);
check('shields down let the rest through', got.down.fullTick > 0,
  `${got.down.fullTick} full ticks of ${got.down.struck} struck`);
check('ground fire touches shields and nothing else (5098)',
  got.ground.other === 0 && got.ground.shield > 0,
  `${got.ground.shield} shield changes, ${got.ground.other} anything else`);
check('the six damaged addresses are the disk\'s six',
  JSON.stringify(got.damaged.slice().sort()) === JSON.stringify([38186, 38193, 38195, 38196, 38197, 38198]),
  got.damaged.join(','));
// Of the five 3230-3350 leaves alone, three have no other writer either, so they should not
// have moved at all in the capture. The other two do: 38194 is MEM TRANSFER A's loop counter
// and 38187 is the missile count.
const NEVER = { energy: 38199, hyperdrive: 38190, navComp: 38184 };
const stillMoved = Object.entries(NEVER).filter(([k]) => machineMovedAll.has(k)).map(([k]) => k);
check('energy, hyperdrive and nav. comp. never moved at all',
  stillMoved.length === 0, stillMoved.length ? `but ${stillMoved.join(', ')} did` : '38199, 38190, 38184');
check('the two that did move have writers of their own',
  machineMovedAll.has('envControl') && machineMovedAll.has('missiles'),
  "38194 is MEM TRANSFER A's counter, 38187 the missile count");

console.log('');
console.log(fail === 0 ? 'damage parity: clean' : `damage parity: ${fail} check(s) failed`);
process.exit(fail === 0 ? 0 : 1);
