// The port's screens across scene changes, against the disk's.
//
// `probe_transitions.mjs` walks a route on the machine and captures the page after each step.
// This drives the port along the same route and compares. It is the check the rest of this
// directory does not make: every other harness captures one screen reached one way, and the last
// three bugs found were all in the getting there - the ground wireframe with nothing calling it,
// a stardate nothing advanced, and the galaxy map's caption left under COM because the disk goes
// through INSTRUMENTS and the port went straight across.
//
// The flight view is not compared pixel for pixel. It moves every frame and the two machines are
// not in step; what is compared there is the panel, which is static.
import { chromium } from 'playwright';
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/transitions/golden.json', 'utf8'));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.hires),
  null, { timeout: 30000 });

// Drive it the way a player would: synthetic key events, and read the page out of the Hires the
// game is actually drawing into.
const shots = await page.evaluate(async (steps) => {
  const sv = window.__spaceVikings;
  const press = (key, ms) => new Promise((res) => {
    const code = /^[0-9]$/.test(key) ? 'Digit' + key
      : key === ' ' ? 'Space' : 'Key' + key.toUpperCase();
    window.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key, code, bubbles: true }));
    setTimeout(res, ms);
  });
  const sceneNow = () => {
    const l = window.__gameLog.getLog();
    return l.length ? l[l.length - 1].scene : '?';
  };
  const grab = () => Array.from(sv.hires.snapshot().on);

  // through the title screens to the cockpit
  for (let i = 0; i < 7; i++) await press('N', 700);
  await new Promise((r) => setTimeout(r, 1500));

  const out = [];
  for (const s of steps) {
    if (s.key !== null) await press(s.key, 800);
    else await new Promise((r) => setTimeout(r, 800));
    // Settle on the drawing, not on a timer: a scene that is still painting gives a count that
    // looks like a missing screen. Wait for two equal snapshots in a row, up to four seconds.
    let last = -1;
    let stable = 0;
    // Some of these scenes fetch a table before they draw - the radar and the ship
    // identification both do - so the wait has to outlast a load, not just a paint.
    for (let n = 0; n < 90; n++) {
      await new Promise((r) => setTimeout(r, 100));
      const lit = sv.hires.snapshot().on.reduce((a, b) => a + (b ? 1 : 0), 0);
      if (lit === last) stable++; else stable = 0;
      last = lit;
      if (stable >= 5) break;
    }
    out.push({ label: s.label, scene: sceneNow(), on: grab() });
  }
  return out;
}, golden.steps.map((s) => ({ label: s.label, key: s.key })));
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

const diskOf = (step) => {
  const on = new Uint8Array(HGR_W * HGR_H);
  for (const [x, y] of step.points) on[y * HGR_W + x] = 1;
  return on;
};
const litIn = (on, from, to) => {
  let n = 0;
  for (let y = from; y <= to; y++) for (let x = 0; x < HGR_W; x++) if (on[y * HGR_W + x]) n++;
  return n;
};

// The flight view moves every frame, and the galaxy map's cursor toggles, so those two are
// reported rather than required. The menus and reports are static and are compared outright.
// Everything is compared except the screens that move.
//
// The flight view never repeats and the galaxy map's cursor is toggling over it. The radar's
// two are the same case one step removed: 2000 borrows the ship's own X, Z and heading and only
// forces Y and the pitch, so the view is a projection from wherever the ship happens to be, and
// the two machines are not at the same point in the same flight. Its **panel** is compared -
// rows 124-191 are exact - and the view itself is what `radar_parity.mjs` checks, at a camera
// captured with it, where it now agrees on all 1,226 pixels.
const MOVES = new Set(['in flight', 'computer -> galaxy map', 'end -> flight',
  'COM -> radar', 'ship id -> radar']);

/** For the ones that move, the panel underneath is still fair game. */
const PANEL_ONLY = new Set(['COM -> radar', 'ship id -> radar']);

// Text row 23, y 184 to 191, is STARSHIP SIMULATOR line 155's five numbers - INT(X/2),
// INT(Y/2), INT(Z/2) and the two headings. They are the ship's live position, and the two
// machines are not at the same point in the same flight, so the digits there are never going to
// agree. It is left out everywhere: on the screens reached through INSTRUMENTS, RE, ORBIT or
// RADAR the row is blank on both sides anyway, so the only thing excluding it costs is the one
// place it could never have passed. What is in that row is checked instead by
// `probe_comreadouts.mjs` and by the panel's own captures.
const LIVE_READOUT = { from: 184, to: 191 };
const skipped = (label, y) => y >= LIVE_READOUT.from && y <= LIVE_READOUT.to;

console.log(`${golden.steps.length} steps along the same route`);
console.log('');
console.log('  step                        disk lit   port lit   differing   verdict');
let failures = 0;
const results = [];
golden.steps.forEach((g, i) => {
  const want = diskOf(g);
  const got = Uint8Array.from(shots[i].on);
  const panelOnly = PANEL_ONLY.has(g.label);
  let diff = 0;
  for (let k = 0; k < want.length; k++) {
    const y = Math.floor(k / HGR_W);
    if (skipped(g.label, y)) continue;
    if (panelOnly && y < 124) continue;
    if ((want[k] ? 1 : 0) !== (got[k] ? 1 : 0)) diff++;
  }
  const panelWant = litIn(want, 124, HGR_H - 1);
  const panelGot = litIn(got, 124, HGR_H - 1);
  const compared = !MOVES.has(g.label) || panelOnly;
  const ok = compared ? diff === 0 : true;
  if (!ok) failures++;
  results.push({ label: g.label, chain: g.chain, diskLit: g.lit, portLit: litIn(got, 0, HGR_H - 1),
    diff, panelWant, panelGot, compared });
  console.log(`  ${g.label.padEnd(26)} ${String(g.lit).padStart(8)} ` +
    `${String(litIn(got, 0, HGR_H - 1)).padStart(10)} ${String(diff).padStart(11)}   ` +
    (panelOnly ? (ok ? 'panel exact - the view follows the ship' : 'PANEL DIFFERS')
      : compared ? (ok ? 'exact' : 'DIFFERS') : 'not compared - it moves'));
});

// Where the difference lives. A count that matches while the pixels do not says the ink has
// moved, not that it is missing, and the row bands say which part of the screen moved it: the
// caption and the top of the menu, the menu body and the damage grid, and the panel.
const BANDS = [['rows 0-40', 0, 40], ['rows 41-123', 41, 123], ['rows 124-191', 124, HGR_H - 1]];
const diffOf = new Map();
console.log('');
console.log('  where the difference is, by row band (disk / port / differing):');
golden.steps.forEach((g, i) => {
  if (MOVES.has(g.label)) return;
  const want = diskOf(g);
  const got = Uint8Array.from(shots[i].on);
  const cells = BANDS.map(([name, a, b]) => {
    let d = 0;
    for (let y = a; y <= b; y++) for (let x = 0; x < HGR_W; x++) {
      if (skipped(g.label, y)) continue;
      const k = y * HGR_W + x;
      if ((want[k] ? 1 : 0) !== (got[k] ? 1 : 0)) d++;
    }
    return `${name}: ${litIn(want, a, b)} / ${litIn(got, a, b)} / ${d}`;
  });
  console.log(`    ${g.label}`);
  for (const c of cells) console.log(`      ${c}`);
  // and a picture of exactly which pixels differ, which is quicker to read than any count
  const mask = new Uint8Array(want.length);
  for (let k = 0; k < want.length; k++) mask[k] = (want[k] ? 1 : 0) !== (got[k] ? 1 : 0) ? 1 : 0;
  // the route visits `COM -> computer` twice, so the step number keeps the two apart
  // and, for a residue small enough to read, the rows themselves
  const rows = [];
  for (let y = 0; y < HGR_H; y++) {
    const dw = [], dp = [];
    if (skipped(g.label, y)) continue;
    for (let x = 0; x < HGR_W; x++) {
      const k = y * HGR_W + x;
      if (want[k] && !got[k]) dw.push(x);
      if (!want[k] && got[k]) dp.push(x);
    }
    if (dw.length || dp.length) rows.push({ y, diskOnly: dw, portOnly: dp });
  }
  if (diffOf.get(g.label) === undefined) diffOf.set(g.label, rows);
  if (rows.length && rows.reduce((a, r) => a + r.diskOnly.length + r.portOnly.length, 0) <= 200) {
    console.log(`      the rows that differ:`);
    for (const r of rows) {
      console.log(`        y=${String(r.y).padStart(3)}` +
        (r.diskOnly.length ? `  disk only ${r.diskOnly.join(' ')}` : '') +
        (r.portOnly.length ? `  port only ${r.portOnly.join(' ')}` : ''));
    }
  }
  const name = `diff-${i}-` + g.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  fs.mkdirSync('captured/transitions', { recursive: true });
  fs.writeFileSync(`captured/transitions/${name}.png`, toPng(mask));
});

console.log('');
console.log('  the programs the disk ran at each step:');
for (const g of golden.steps) console.log(`    ${g.label.padEnd(26)} ${g.chain.join(' -> ')}`);

fs.mkdirSync('captured/transitions', { recursive: true });
shots.forEach((s, i) => {
  const name = 'port-' + golden.steps[i].label.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  fs.writeFileSync(`captured/transitions/${name}.png`, toPng(Uint8Array.from(s.on)));
});
fs.writeFileSync('captured/transitions/parity.json', JSON.stringify({ results }) + String.fromCharCode(10));
console.log('');
console.log(failures === 0 ? 'transition parity: clean'
  : `transition parity: ${failures} step(s) differ`);
process.exit(failures === 0 ? 0 : 1);
