// diskSound.ts against the machine, toggle for toggle.
//
// probe_sound.mjs runs SOUND GEN, LASER and EXPL on the emulator and records the cycle at
// every $C030 access. This runs the port's transcription over the same parameters and
// compares the whole timeline - not just how many toggles there are, but when each one
// happens, which is the only thing that decides what the sound is.
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/sound/golden.json', 'utf8'));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.soundGen9276), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose soundGen9276 - is the dev server running?'); });

const got = await page.evaluate((jobs) => {
  const sv = window.__spaceVikings;
  return jobs.map((j) => {
    if (j.name === 'LASER') return sv.laser92D1();
    if (j.name.startsWith('EXPL')) return sv.expl9276(j.y, 0x0414, 0, j.carry);
    const p = j.poke;
    return sv.soundGen9276({
      reg: (p['37489'] ?? p[0x9271] ?? 0) * 256 + (p['37488'] ?? p[0x9270] ?? 0),
      count: p[0x9272], outer: p[0x9273], period: p[0x9274], sweep: p[0x9275],
    });
  });
}, golden.jobs.map((j) => ({ name: j.name, y: j.y, carry: j.carry, poke: j.poke ?? {} })));
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

let failures = 0;
console.log(`${golden.jobs.length} runs`);
console.log('');
console.log('  routine                     toggles          cycles to the RTS      verdict');
golden.jobs.forEach((j, i) => {
  const g = got[i];
  const same = g.toggles.length === j.clicks.length
    && g.toggles.every((t, k) => t === j.clicks[k]);
  const cyc = g.cycles === j.total;
  if (!same || !cyc) failures++;
  const firstBad = g.toggles.findIndex((t, k) => t !== j.clicks[k]);
  console.log(`  ${j.name.padEnd(26)} ${String(j.clicks.length).padStart(5)} / ` +
    `${String(g.toggles.length).padEnd(6)} ${String(j.total).padStart(8)} / ` +
    `${String(g.cycles).padEnd(9)} ${same && cyc ? 'exact' : 'DIFFERS'}`);
  if (!same && firstBad >= 0) {
    console.log(`      first difference at toggle ${firstBad}: machine ${j.clicks[firstBad]}, port ${g.toggles[firstBad]}`);
  } else if (!same) {
    console.log(`      the port produced ${g.toggles.length} toggles, the machine ${j.clicks.length}`);
  }
  if (!cyc) console.log(`      total cycles: machine ${j.total}, port ${g.cycles}`);
});

const total = golden.jobs.reduce((n, j) => n + j.clicks.length, 0);
console.log('');
console.log(`${total} toggles in all`);
console.log(failures === 0 ? 'sound parity: clean' : `sound parity: ${failures} run(s) differ`);
process.exit(failures === 0 ? 0 : 1);
