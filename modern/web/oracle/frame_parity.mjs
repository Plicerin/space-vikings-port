// Frame parity: the port's screen against the disk's, pixel for pixel.
//
// Until now nothing answered "does this look like the original?" - the port had a
// typechecker and some screenshots. This renders the same screen on both sides and counts
// the pixels that disagree.
//
// The screen is the cockpit panel (INSTRUMENTS.bas lines 10-200). It is the right one to
// start with because it is a pure sequence of HPLOTs and PRINTs with no RNG, no input and
// no dependence on ship state, so any difference is the port's and not timing's.
//
// Both sides are reduced to 280x192 lit-or-not. Colour is deliberately left out: hi-res
// colour is a property of bit positions and fringing, and comparing it would confuse "the
// port drew the wrong thing" with "the port resolves fringing differently". Getting the
// geometry right comes first.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import { decodeHgr, compare, toPng, HGR_W, HGR_H } from './hgr.mjs';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT = 'captured/parity';
const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';

// --- the disk side ---------------------------------------------------------------------
//
// Capture the hi-res page at the moment INSTRUMENTS has finished drawing and before
// STARSHIP SIMULATOR starts drawing ships over it. INSTRUMENTS is identified by its
// program image, not by a delay, so this cannot drift.
async function fromDisk() {
  const disk = openDisk(DISK);
  const f = disk.files.find((x) => x.name === 'INSTRUMENTS');
  const r = disk.read(f);
  const wanted = listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => `${l.num} ${l.text}`).join('\n');

  const a2 = await openOracle();
  await a2.boot();
  await a2.key('N');

  let lastPanel = null, sawInstruments = false;
  for (let i = 0; i < 200; i++) {
    await a2.frames(30);
    const bytes = await a2.readRange(0x800, 0x2000);
    const mem = {};
    for (let k = 0; k < bytes.length; k++) mem[0x800 + k] = bytes[k];
    let text = '';
    try {
      text = listProgram(mem, 0x801, 0x2000).map((l) => `${l.num} ${l.text}`).join('\n');
    } catch { /* mid-load, not a program yet */ }

    if (text === wanted) {
      sawInstruments = true;
      lastPanel = await a2.readRange(0x2000, 0x4000);     // keep the newest panel frame
    } else if (sawInstruments) {
      break;                                             // it has chained on; we have it
    }
  }
  const errors = a2.errors.slice(0, 3);
  await a2.close();
  if (!lastPanel) throw new Error('never caught INSTRUMENTS running - nothing to compare against');
  return { on: decodeHgr(lastPanel), errors };
}

// --- the port side ---------------------------------------------------------------------
//
// drawInstruments() is a pure draw, so this runs it on a throwaway Hires rather than
// racing the real scene, which chains onward to the cockpit within a frame or two.
async function fromPort() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(PORT_URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__spaceVikings, null, { timeout: 30000 })
    .catch(() => { throw new Error('the port did not expose window.__spaceVikings - is the dev server running at ' + PORT_URL + '?'); });

  const snap = await page.evaluate(() => {
    const { Hires, drawInstruments } = window.__spaceVikings;
    const c = document.createElement('canvas');
    c.width = 560; c.height = 384;
    const h = new Hires(c);
    h.hgr();
    drawInstruments(h);
    const s = h.snapshot();
    return { w: s.w, h: s.h, on: Array.from(s.on) };
  });
  await browser.close();
  if (snap.w !== HGR_W || snap.h !== HGR_H) {
    throw new Error(`the port snapshot is ${snap.w}x${snap.h}, expected ${HGR_W}x${HGR_H}`);
  }
  return { on: Uint8Array.from(snap.on), errors };
}

// --- run ---------------------------------------------------------------------------------
fs.mkdirSync(OUT, { recursive: true });
console.log('rendering the cockpit panel on both sides\n');
const [a, b] = await Promise.all([fromDisk(), fromPort()]);
for (const e of [...a.errors, ...b.errors]) console.log('page error:', e);

const c = compare(a.on, b.on);
const diff = new Uint8Array(a.on.length);
for (let i = 0; i < diff.length; i++) diff[i] = a.on[i] === b.on[i] ? 0 : 1;

fs.writeFileSync(path.join(OUT, 'disk.png'), toPng(a.on));
fs.writeFileSync(path.join(OUT, 'port.png'), toPng(b.on));
fs.writeFileSync(path.join(OUT, 'diff.png'), toPng(diff, { colour: [255, 0, 0] }));

console.log(`disk: ${c.litA} lit pixels`);
console.log(`port: ${c.litB} lit pixels`);
console.log(`differing: ${c.differing} of ${c.total}  (${(100 * c.agreement).toFixed(3)}% agree)`);
console.log(`  ${c.onlyA} lit on the disk only, ${c.onlyB} lit in the port only`);

const rows = [...c.perRow.entries()].filter(([, n]) => n > 0);
if (rows.length) {
  console.log(`
${rows.length} of ${HGR_H} rows differ; worst:`);
  for (const [y, n] of rows.sort((p, q) => q[1] - p[1]).slice(0, 6)) {
    const lit = (arr) => { let t = 0, odd = 0; for (let x = 0; x < HGR_W; x++) if (arr[y * HGR_W + x]) { t++; if (x % 2) odd++; } return { t, odd }; };
    const d = lit(a.on), pt = lit(b.on);
    console.log(`  row ${String(y).padStart(3)}  ${String(n).padStart(3)} px differ   ` +
      `disk ${String(d.t).padStart(3)} lit (${d.odd} odd)   port ${String(pt.t).padStart(3)} lit (${pt.odd} odd)`);
    const strip = (arr) => Array.from(arr.slice(y * HGR_W + 1, y * HGR_W + 41)).join('');
    console.log(`       disk x1-40 ${strip(a.on)}`);
    console.log(`       port x1-40 ${strip(b.on)}`);
  }
}
console.log(`
wrote ${OUT}/disk.png, port.png, diff.png`);
