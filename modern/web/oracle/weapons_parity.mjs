// The port's weapons model against what firing on the disk actually does.
//
// probe_weapons.mjs holds the fire button on the real machine and reads the bytes back. Each
// of these checks fails if the formulas are read as the port had them.
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const g = JSON.parse(fs.readFileSync('captured/weapons/golden.json', 'utf8'));
const tech = g.tech;
const find = (w) => g.runs.find((r) => r.what === w);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.fireLaser1500), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose fireLaser1500 - is the dev server running?'); });

const got = await page.evaluate((te) => {
  const sv = window.__spaceVikings;
  const ctx = (over) => ({ tech: te, atmosphere: false, laserPct: 100,
    enemyLimit: 250, enemyPresent: true, ...over });
  const st = (over) => ({ planetVitality: 0, enemyDamage: 0, missiles: 60,
    surrendered: false, surrenderAt: 255, ...over });

  // a run of laser shots in space, then the same in atmosphere
  const fire = (n, c, s0) => { let s = s0; for (let i = 0; i < n; i++) s = sv.fireLaser1500(s, c); return s; };
  const space = fire(8, ctx(), st());
  const air = fire(8, ctx({ atmosphere: true }), st());

  // the two settings of 38160 the disk was measured at
  const at250one = sv.fireLaser1500(st({ planetVitality: 250 }), ctx()).planetVitality;
  const at250 = fire(8, ctx(), st({ planetVitality: 250 })).planetVitality;
  const at253 = fire(8, ctx(), st({ planetVitality: 253 })).planetVitality;

  // one shot, to read the step
  const one = sv.fireLaser1500(st(), ctx()).planetVitality;

  // a dead laser fires nothing
  const dead = sv.fireLaser1500(st(), ctx({ laserPct: 0 }));

  // missiles: a hit, a miss, and what each costs
  const hit = sv.fireMissile1000(st(), ctx(), true);
  const miss = sv.fireMissile1000(st(), ctx(), false);

  // 1500: firing at a planet that has surrendered puts the bar back to 100
  const unsurrender = sv.fireLaser1500(st({ surrendered: true, surrenderAt: 40 }), ctx());

  // 5250 and 5251
  const battery = sv.groundBatteryDestroyed5250(4, 60);

  return { space, air, at250, at250one, at253, one, dead, hit, miss, unsurrender, battery,
    box: sv.missileHits1050({ x: 400, y: -100, z: -3500 }),
    boxOut: sv.missileHits1050({ x: 400, y: -100, z: -3200 }),
    enemy: sv.ENEMY_POSITION, laser: sv.LASER, missile: sv.MISSILE };
}, tech);
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

let fail = 0;
const check = (name, ok, detail) => {
  if (!ok) fail++;
  console.log(`  ${name.padEnd(52)} ${ok ? 'ok' : 'FAILED'}${detail ? `   ${detail}` : ''}`);
};

const step = Math.trunc(10 / (tech + 1));
const trunc = find('truncation and the 255 test');
const dp = find('laser vs the enemy ship');
const air = find('laser in atmosphere');
const cost = find('missile cost');

console.log(`the disk, at TE = ${tech}: a shot adds ${(10 / (tech + 1)).toFixed(2)} to 38160 and ` +
  `${(1 / (tech + 1)).toFixed(2)} to 38152`);
console.log(`  it moved 38160 from 250 to ${trunc.at250}, left it at ${trunc.at253} from 253, ` +
  `and 38152 stayed ${dp.at38152}`);
console.log('');
check('the laser needs no aiming - every shot counts', got.one > 0, `one shot gives ${got.one}`);
check(`a shot steps 38160 by ${step}, the fraction dropped`, got.one === step, `${got.one}`);
// The disk's 500-frame hold got one shot away, not eight - the main loop reads the button
// once a pass and a pass is long. So what that measurement pins down is the step from 250,
// not where a run of shots ends up.
check('one shot from 250 lands where the disk landed', got.at250one === trunc.at250,
  `disk ${trunc.at250}, port ${got.at250one}`);
check('a run from 250 stalls at 254, one step short of 255', got.at250 === 254,
  `${got.at250} - 254 + 2.5 is not under 255, so nothing more is stored`);
check('from 253 it does not move, as on the disk', got.at253 === trunc.at253,
  `disk ${trunc.at253}, port ${got.at253}`);
check('the laser cannot touch the enemy ship at this tech',
  got.space.enemyDamage === dp.at38152, `disk ${dp.at38152}, port ${got.space.enemyDamage}`);
check('in atmosphere the enemy takes nothing',
  got.air.enemyDamage === 0 && air.after[38152] === air.before[38152],
  `port ${got.air.enemyDamage}`);
check('a dead laser fires nothing', got.dead.fired === false);
check('a missile costs 2 whether it hits or misses',
  60 - got.hit.missiles === 2 && 60 - got.miss.missiles === 2,
  `disk took ${cost.before - cost.after} over two firings`);
check('a missile hit is worth 120 to the enemy ship',
  got.hit.enemyDamage === Math.trunc(120 / (tech + 1)), `${got.hit.enemyDamage}`);
check('a missile miss is worth nothing', got.miss.enemyDamage === 0 && got.miss.planetVitality === 0);
check('firing at a surrendered planet puts the bar back to 100',
  got.unsurrender.surrenderAt === 100 && got.unsurrender.surrendered === false);
check('shooting a ground battery costs two missiles (5251)',
  got.battery.batteries === 3 && got.battery.missiles === 58,
  `${got.battery.batteries} left, ${got.battery.missiles} missiles`);
check('the enemy is the fixed point line 2 sets',
  got.enemy.x === 400 && got.enemy.y === -100 && got.enemy.z === -3500);
check('1050\'s box accepts the centre and rejects 300 beyond it',
  got.box === true && got.boxOut === false);

console.log('');
console.log(fail === 0 ? 'weapons parity: clean' : `weapons parity: ${fail} check(s) failed`);
process.exit(fail === 0 ? 0 : 1);
