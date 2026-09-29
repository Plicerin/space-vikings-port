// Hires.segment6DD5() against $6DD5 itself.
//
// probe_line6dd5.mjs calls the disk's line routine directly on 370 endpoint pairs - shallow,
// steep, diagonal, horizontal, vertical, reversed, degenerate, and 300 random - and records
// every pixel it lights. This runs the port's over the same pairs.
//
// The port steps one half-column at a time. $6DD5 does not: it builds a horizontal run per
// row and ORs it in as a mask. They agree on endpoints and on most interior pixels, and this
// says by how much.
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/line6dd5/golden.json', 'utf8'));
const lines = golden.lines.filter((l) => l.ok);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.Hires), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose Hires - is the dev server running?'); });

const got = await page.evaluate((jobs) => {
  const { Hires } = window.__spaceVikings;
  const c = document.createElement('canvas');
  c.width = 560; c.height = 384;
  const h = new Hires(c);
  return jobs.map((j) => {
    h.hgr();
    h.hcolor(3);
    // $6DD5's own mapping: x + 70 as a half-column, 95 - y as the row.
    h.segment6DD5(j.a[0] + 70, 95 - j.a[1], j.b[0] + 70, 95 - j.b[1]);
    const snap = h.snapshot();
    const px = [];
    for (let k = 0; k < snap.on.length; k++) if (snap.on[k]) px.push([k % snap.w, (k / snap.w) | 0]);
    return px;
  });
}, lines.map((l) => ({ a: l.a, b: l.b })));
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

// A row of -1 is reachable: sy of 96 is y/z of exactly 1, which is where a clipped endpoint
// lands. $6DB5 does not reject it - it runs the same ROR/AND on the wrapped byte and lands on
// a row table entry off the bottom of the page - so those lines go somewhere the port has no
// framebuffer for. They are counted apart rather than averaged in.
const wraps = (l) => 95 - l.a[1] < 0 || 95 - l.b[1] < 0;

// $691E clamps x to +/-69 and y to +/-62 before $68A1 adds the offsets, so the only endpoints
// the renderer can ever hand $6DD5 have sx in -69..69 and sy in -28..96. The sweep goes wider
// on purpose - a rule that only holds inside the reachable box is worth knowing about - but
// the two are counted apart, because being exact everywhere the machine can reach is the
// claim, and being exact on inputs it cannot produce is a bonus.
const reachable = (l) => [l.a, l.b].every(([sx, sy]) => sx >= -69 && sx <= 69 && sy >= -28 && sy <= 96);

let exact = 0, sumBoth = 0, sumDisk = 0, sumPort = 0;
let exactOn = 0, onN = 0, sumBothOn = 0, sumDiskOn = 0;
let exactR = 0, rN = 0, sumBothR = 0, sumDiskR = 0;
const worst = [];
lines.forEach((l, i) => {
  const disk = new Set(l.pixels.map(([x, y]) => y * 280 + x));
  const port = new Set(got[i].map(([x, y]) => y * 280 + x));
  let both = 0;
  for (const k of disk) if (port.has(k)) both++;
  sumBoth += both; sumDisk += disk.size; sumPort += port.size;
  const ok = both === disk.size && both === port.size;
  if (ok) exact++;
  else worst.push({ a: l.a, b: l.b, disk: disk.size, port: port.size, both, wrap: wraps(l), reach: reachable(l) });
  if (!wraps(l)) { onN++; sumBothOn += both; sumDiskOn += disk.size; if (ok) exactOn++; }
  if (reachable(l)) { rN++; sumBothR += both; sumDiskR += disk.size; if (ok) exactR++; }
});
worst.sort((x, y) => (y.disk + y.port - 2 * y.both) - (x.disk + x.port - 2 * x.both));

console.log(`${lines.length} lines through $6DD5`);
console.log('');
console.log(`  lines identical pixel for pixel   ${exact} of ${lines.length}`);
console.log(`  disk pixels the port also lights  ${sumBoth} of ${sumDisk}  (${(100 * sumBoth / sumDisk).toFixed(1)}%)`);
console.log(`  pixels the port lights            ${sumPort}`);
console.log('');
console.log(`  of the lines $68A1 can actually produce (${rN} of ${lines.length}):`);
console.log(`    identical pixel for pixel       ${exactR} of ${rN}`);
console.log(`    disk pixels the port lights     ${sumBothR} of ${sumDiskR}  (${(100 * sumBothR / sumDiskR).toFixed(1)}%)`);
console.log('');
console.log(`  of the lines that stay on the page (${onN} of ${lines.length}):`);
console.log(`    identical pixel for pixel       ${exactOn} of ${onN}`);
console.log(`    disk pixels the port lights     ${sumBothOn} of ${sumDiskOn}  (${(100 * sumBothOn / sumDiskOn).toFixed(1)}%)`);
console.log('');
console.log('  the eight that differ most:');
console.log('     endpoints                 disk  port  shared');
for (const w of worst.slice(0, 8)) {
  console.log(`     ${JSON.stringify(w.a).padEnd(11)}->${JSON.stringify(w.b).padEnd(12)} ` +
    `${String(w.disk).padStart(5)} ${String(w.port).padStart(5)} ${String(w.both).padStart(7)}` +
    (w.wrap ? '   (off the page)' : '') + (w.reach ? '' : '   ($68A1 cannot produce this)'));
}
