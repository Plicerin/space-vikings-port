// Is the panel's 63-pixel residue a drawing fault or a lamp phase?
//
// `transition_parity.mjs` reports the same 63 differing pixels in rows 124-191 on four
// separate steps, all of them screens whose panel came from INSTRUMENTS. The diff mask puts
// every one of them inside the gauge boxes at byte columns 1, 10 and 37 - which is where
// $9602 writes - and none anywhere else on the panel.
//
// $9602 draws six lamps from six flag bytes, and four of the six flip their flag as they
// draw, so the appearance on screen is whichever phase the main loop happened to leave. The
// port draws them from one fixed phase, `LAMPS_AT_CAPTURE`, read off the COM capture.
//
// So: render the port's panel in all 96 phases and see whether any of them matches the
// disk's captures outright. If one does, the 63 pixels are a phase and not a fault, and the
// panel geometry is exact.
import { chromium } from 'playwright';
import { HGR_W, HGR_H } from './hgr.mjs';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/transitions/golden.json', 'utf8'));

const PHASES = [];
for (const a of [0, 1]) for (const b of [0, 1]) for (const c of [1, 2, 3])
  for (const d of [0, 1]) for (const atmosphere of [0, 1]) for (const f of [0, 1])
    PHASES.push({ a, b, c, d, atmosphere, f });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__spaceVikings, null, { timeout: 30000 });

const rendered = await page.evaluate((phases) => {
  const { Hires, drawInstruments, drawPanelLamps } = window.__spaceVikings;
  const c = document.createElement('canvas');
  c.width = 560; c.height = 384;
  const h = new Hires(c);
  return phases.map((st) => {
    h.hgr();
    drawInstruments(h);
    // drawInstruments already put the fixed phase down; $9602's STA overwrites, so drawing
    // again with another phase is exactly what the machine does on the next pass.
    drawPanelLamps(h, { ...st });
    return Array.from(h.snapshot().on);
  });
}, PHASES);
await browser.close();

/** The panel only: rows 124-191. Nothing above it comes from INSTRUMENTS. */
const panelDiff = (want, got) => {
  let d = 0;
  for (let y = 124; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) {
    const k = y * HGR_W + x;
    if ((want[k] ? 1 : 0) !== (got[k] ? 1 : 0)) d++;
  }
  return d;
};

const out = [];
for (const step of golden.steps) {
  const want = new Uint8Array(HGR_W * HGR_H);
  for (const [x, y] of step.points) want[y * HGR_W + x] = 1;
  let best = 0, bestD = Infinity;
  rendered.forEach((on, i) => {
    const d = panelDiff(want, Uint8Array.from(on));
    if (d < bestD) { bestD = d; best = i; }
  });
  const p = PHASES[best];
  out.push({ label: step.label, best: p, differing: bestD });
  console.log(`  ${step.label.padEnd(24)} best phase ` +
    `a${p.a} b${p.b} c${p.c} d${p.d} atm${p.atmosphere} f${p.f} -> ${bestD} differing`);
}

fs.mkdirSync('captured/lampphase', { recursive: true });
fs.writeFileSync('captured/lampphase/golden.json', JSON.stringify({
  source: 'the port panel rendered in all 96 lamp phases, against each transition capture, rows 124-191',
  phases: PHASES.length, results: out,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/lampphase/golden.json');
