// The port's transcription of $68A1 against the machine.
//
// probe_project6000.mjs calls $6000's own projection directly over 261 points - a hand-picked
// sweep plus 240 pseudo-random ones, including z on the wrong side of the camera. This runs
// the port's diskProjectionFixed.ts over the same inputs.
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/project6000/golden.json', 'utf8'));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.project68A1), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose project68A1 - is the dev server running?'); });

const got = await page.evaluate(({ samples, ops }) => {
  const sv = window.__spaceVikings;
  return samples.map((s) => sv.project68A1(s.x, s.y, s.z, ops));
}, { samples: golden.samples, ops: golden.operands });
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

let ok = 0;
const bad = [];
golden.samples.forEach((s, i) => {
  if (got[i].sx === s.sx && got[i].sy === s.sy) ok++;
  else bad.push(`(${s.x},${s.y},${s.z}) machine ${s.sx},${s.sy} port ${got[i].sx},${got[i].sy}`);
});
console.log(`$68A1 transcription: ${ok} of ${golden.samples.length} samples match`);
console.log(`  operands: x limit ${golden.operands.xLimit} offset ${golden.operands.xOffset}, ` +
  `y limit ${golden.operands.yLimit} offset ${golden.operands.yOffset}`);
for (const b of bad.slice(0, 10)) console.log(`  MISMATCH ${b}`);

// And what the real renderer handed it during a live render, if that capture exists.
if (fs.existsSync('captured/project6000/calls.json')) {
  const calls = JSON.parse(fs.readFileSync('captured/project6000/calls.json', 'utf8'));
  const b2 = await chromium.launch({ headless: true });
  const p2 = await b2.newPage();
  await p2.goto(PORT_URL, { waitUntil: 'load' });
  await p2.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.project68A1), null, { timeout: 30000 });
  const got2 = await p2.evaluate(({ samples, ops }) => {
    const sv = window.__spaceVikings;
    return samples.map((s) => sv.project68A1(s.x, s.y, s.z, ops));
  }, { samples: calls.calls, ops: golden.operands });
  await b2.close();
  let ok2 = 0;
  calls.calls.forEach((s, i) => {
    const sx = s.sx < 0 ? s.sx + 256 : s.sx;
    const sy = s.sy < 0 ? s.sy + 256 : s.sy;
    if (got2[i].sx === sx && got2[i].sy === sy) ok2++;
  });
  console.log('');
  console.log(`against a live render's own calls: ${ok2} of ${calls.calls.length} match`);
}

// $68A1 is arithmetic: every sample and every call of a live render has to come out the same.
console.log('');
const projOk = ok === golden.samples.length;
console.log(projOk ? `project6000 parity: all ${ok} samples match`
  : `project6000 parity: ${ok} of ${golden.samples.length} samples match`);
process.exit(projOk ? 0 : 1);
