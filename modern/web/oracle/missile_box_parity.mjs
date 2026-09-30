// The port's missile against the nine shots the machine took.
//
// `probe_missilebox.mjs` fired from nine places around the fixed target at X9 400, Y9 -100,
// Z9 -3500 and recorded which ones moved 38152. This asks the port's own 1000-1090 for the
// same nine, using the direction the machine had in ZP, XH, ZH and YP at the moment it fired,
// so the only thing being compared is the decision.
//
// The one that matters most is 50 below the box. 1050 is `Y0 < Y9 + 60 AND Y0 > Y9 - 20` -
// sixty above and twenty below - and the port used to test `Math.abs(dy) < 60`, which calls
// that shot a hit. The machine misses it.
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/missilebox/golden.json', 'utf8'));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.missileHit1000),
  null, { timeout: 30000 });

const got = await page.evaluate((g) => {
  const sv = window.__spaceVikings;
  return g.results.map((r) => {
    // 1000: X2 = S2 * (ZP * XH), Z2 = S2 * ZP * ZH, Y2 = S2 * YP, with the machine's own
    // trigonometry rather than the port's, so a rounding difference cannot be read as a
    // difference in the test.
    const fwd = { x: r.dir.zp * r.dir.xh, y: r.dir.yp, z: r.dir.zp * r.dir.zh };
    const hit = sv.missileHit1000({ x: r.x, y: r.y, z: r.z }, fwd, r.pitch, { atmosphere: false });
    const steps = sv.missileFlight1000({ x: r.x, y: r.y, z: r.z }, fwd, r.pitch);
    return { hit, steps: steps.length, last: steps[steps.length - 1] };
  });
}, golden);
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

console.log(`the target is at ${golden.target.x}, ${golden.target.y}, ${golden.target.z}; ` +
  `TE ${golden.te}, so a hit is worth ${golden.hitValue}`);
console.log('');
let bad = 0;
for (let i = 0; i < golden.results.length; i++) {
  const m = golden.results[i], p = got[i];
  const agree = m.hit === p.hit;
  if (!agree) bad++;
  console.log(`  ${agree ? 'agree ' : 'DIFFER'}  ${m.name.padEnd(24)} ` +
    `(${m.x}, ${m.y}, ${m.z})  machine ${m.hit ? 'hit ' : 'miss'}  port ${p.hit ? 'hit ' : 'miss'}`);
}
console.log('');
const steps = got[0].steps;
console.log(`  the flight is ${steps} steps of ${golden.step}; the last is tested at ` +
  `z ${Math.round(got[0].last.z)}, ${Math.round(got[0].last.z - golden.results[0].z)} ahead of the ship`);
if (steps !== golden.steps) { console.log(`  but the machine's loop has ${golden.steps}`); bad++; }

fs.mkdirSync('captured/missilebox', { recursive: true });
fs.writeFileSync('captured/missilebox/port.json', JSON.stringify({ got }) + String.fromCharCode(10));
console.log('');
console.log(bad === 0 ? `missile box parity: all ${golden.results.length} shots agree`
  : `missile box parity: ${bad} disagree`);
process.exit(bad === 0 && errors.length === 0 ? 0 : 1);
