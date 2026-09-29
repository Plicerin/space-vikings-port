// The port's clip step against the machine's.
//
// probe_clipedge.mjs calls $6979 directly on 488 segment pairs - A inside the frustum, B out
// in every direction and at every depth, plus corners, points exactly on a plane, points
// behind the camera and 400 pseudo-random pairs. This runs clipEnd6979() over the same ones.
//
// Two things are checked: that the clipped end lands on the same integer point, and that its
// outcode afterwards agrees - the disk loops until the outcode clears, so an end that lands a
// unit the wrong side of a plane costs an extra round or a rejection.
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/clip/edges.json', 'utf8'));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.clipEnd6979), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose clipEnd6979 - is the dev server running?'); });

const got = await page.evaluate((cases) => {
  const sv = window.__spaceVikings;
  return cases.map((c) => {
    const a = { x: c.a[0], y: c.a[1], z: c.a[2] };
    const b = { x: c.b[0], y: c.b[1], z: c.b[2] };
    return {
      outcodeA: sv.outcode67EF(a), outcodeB: sv.outcode67EF(b),
      clipped: c.outcodeB ? (() => { const r = sv.clipEnd6979(a, b, c.outcodeB); return [r.x, r.y, r.z, sv.outcode67EF(r)]; })() : null,
    };
  });
}, golden.cases);
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

let oc = 0, ocN = 0, pt = 0, ptN = 0, after = 0, afterN = 0;
const bad = [];
golden.cases.forEach((c, i) => {
  const g = got[i];
  ocN += 2;
  if (g.outcodeA === c.outcodeA) oc++;
  if (g.outcodeB === c.outcodeB) oc++;
  if (!c.clipped) return;
  ptN++; afterN++;
  const same = g.clipped[0] === c.clipped[0] && g.clipped[1] === c.clipped[1] && g.clipped[2] === c.clipped[2];
  if (same) pt++;
  else if (bad.length < 8) {
    bad.push(`A ${JSON.stringify(c.a)} B ${JSON.stringify(c.b)} (outcode $${c.outcodeB.toString(16)}): ` +
      `machine ${JSON.stringify(c.clipped)}, port ${JSON.stringify(g.clipped.slice(0, 3))}`);
  }
  if (g.clipped[3] === c.outcodeAfter) after++;
});

console.log(`${golden.cases.length} pairs, ${ptN} of them clipped`);
console.log('');
console.log(`  $67EF outcodes                    ${oc} of ${ocN} exact`);
console.log(`  $6979 clipped point               ${pt} of ${ptN} exact`);
console.log(`  $6979 outcode after the clip      ${after} of ${afterN} exact`);
for (const b of bad) console.log(`    MISMATCH ${b}`);

const ok = oc === ocN && pt === ptN && after === afterN;
console.log('');
console.log(ok ? 'clip parity: clean' : 'clip parity: FAILED');
process.exit(ok ? 0 : 1);
