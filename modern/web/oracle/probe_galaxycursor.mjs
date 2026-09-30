// GALAXY MAP's paddle cursor, over something.
//
//   3110 PX = PDL(0) * 1.19: PY = PDL(1) ... clamps ...
//   3120 XDRAW 12 AT PX,PY
//   3130 IF PEEK(-16287) > 127 THEN 3210
//   3200 XDRAW 12 AT PX,PY: GOTO 3110
//   3210 HCOLOR= 0: DRAW 12 AT PX,PY
//
// The port draws the cursor, on the reasoning that over the map's black background a DRAW and
// an XDRAW come to the same thing. At the emulator's resting paddle position that happens to be
// true - the thirteen cursor pixels land on no lit map pixel at all - so the existing capture
// could never have told the two apart. The cursor roams x 10-270 and y 10-145 though, which is
// where the stars are.
//
// So this drives the paddles to put the cursor **on a star** and captures the page with the
// cursor drawn and with it toggled off again. And then it presses the button, because 3210 is
// not an XDRAW: it is `HCOLOR= 0: DRAW`, which forces those pixels black rather than restoring
// what was under them.
import { openOracle, VAR_READER } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import { decodeHgr, toPng, HGR_W } from './hgr.mjs';
import fs from 'fs';

const disk = openDisk(DISK);
const textOf = (name) => {
  const r = disk.read(disk.files.find((f) => f.name === name));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => `${l.num} ${l.text}`).join('\n');
};
const SIM = textOf('STARSHIP SIMULATOR');
const COM = textOf('COM');
const GMAP = textOf('GALAXY MAP');

const a2 = await openOracle();
await a2.ev(VAR_READER);
await a2.boot();
await a2.key('N');
const loaded = async () => {
  const b = await a2.readRange(0x800, 0x2000);
  const m = {};
  for (let k = 0; k < b.length; k++) m[0x800 + k] = b[k];
  try { return listProgram(m, 0x801, 0x2000).map((l) => `${l.num} ${l.text}`).join('\n'); }
  catch { return ''; }
};
const waitFor = async (w, label, tries = 700) => {
  for (let i = 0; i < tries; i++) { await a2.frames(20); if ((await loaded()) === w) return true; }
  console.log('  ' + label + ' never started');
  return false;
};

console.log('waiting for STARSHIP SIMULATOR...');
if (!await waitFor(SIM, 'STARSHIP SIMULATOR')) { await a2.close(); throw new Error('no simulator'); }
await a2.frames(300);
await a2.key('C');
if (!await waitFor(COM, 'COM')) { await a2.close(); throw new Error('no COM'); }
for (let i = 0; i < 30; i++) await a2.frames(20);
await a2.key('1');
for (let i = 0; i < 30; i++) await a2.frames(20);
await a2.key('3');
if (!await waitFor(GMAP, 'GALAXY MAP')) { await a2.close(); throw new Error('no GALAXY MAP'); }
for (let i = 0; i < 40; i++) await a2.frames(20);
console.log('  GALAXY MAP is running');

// Where to aim. 3230 compares `INT(PX / 10)` with X(P), but 3215 has already done
// `PX = PX + 35` by then, so that mapping is the hit test's and not where the star is drawn -
// aiming by it puts the cursor 35 pixels off and over nothing. Read the page instead and pick a
// pixel that is actually lit, which needs no mapping at all.

/** Step until `line` is the current Applesoft line, then read the page. */
const pageAt = async (line, cap = 40000000) => {
  const r = JSON.parse(await a2.ev(`(() => {
    const M = window.M, cpu = M.cpu, mach = M.a2;
    const cur = () => cpu.read(0x75) | (cpu.read(0x76) << 8);
    let cyc = 0;
    for (let n = 0; n < ${cap}; n++) {
      if (cur() === ${line}) {
        const out = new Array(0x2000);
        for (let i = 0; i < 0x2000; i++) out[i] = cpu.read(0x2000 + i);
        return JSON.stringify({ ok: true, page: out });
      }
      const b = cpu.getCycles();
      cpu.stepCycles(1);
      cyc += cpu.getCycles() - b;
      if (cyc >= M.FRAME_CYCLES) {
        cyc = 0;
        const mmu = mach.getMMU && mach.getMMU();
        if (mmu && mmu.resetVB) mmu.resetVB();
        const io = mach.getIO();
        if (io && io.tick) io.tick();
        if (mach.tick) mach.tick();
      }
    }
    return JSON.stringify({ ok: false });
  })()`));
  return r.ok ? decodeHgr(Uint8Array.from(r.page)) : null;
};

/** Run the loop a moment and read where PX and PY ended up. */
const cursorAt = async () => {
  await a2.frames(40);
  const v = JSON.parse(await a2.ev(`(() => {
    const v = window.M.vars();
    const g = (n) => {
      const x = (v.vars || []).find((y) => y.name === n && y.type === 'real');
      return x ? x.value : null;
    };
    return JSON.stringify({ px: g('PX'), py: g('PY') });
  })()`));
  return v;
};
const setPaddles = async (v0, v1) => {
  await a2.ev(`(() => {
    const io = window.M.a2.getIO();
    io.paddle(0, ${v0}); io.paddle(1, ${v1});
    return 'p';
  })()`);
};

// The paddle scale is not documented here, so it is calibrated: set a value, see what PX and PY
// become, and solve for the value that lands on the star.
// Both calibration points have to sit below 3110's `IF PY > 145 THEN PY = 145`, or the second
// one reads back clamped and the slope comes out of a straight line and a flat one.
await setPaddles(0.2, 0.2);
const low = await cursorAt();
await setPaddles(0.5, 0.5);
const mid = await cursorAt();
console.log(`  paddle 0.2 -> PX ${low.px}, PY ${low.py};  0.5 -> PX ${mid.px}, PY ${mid.py}`);
const solve = (loA, valA, loB, valB, want) => {
  if (valA === null || valB === null || valA === valB) return 0.5;
  const t = loA + (want - valA) * (loB - loA) / (valB - valA);
  return Math.max(0, Math.min(1, t));
};
// The clean map, with the cursor toggled off, so a target can be chosen from what is lit.
const cleanMap = await pageAt(3110);
if (!cleanMap) { await a2.close(); throw new Error('could not catch the loop'); }
let target = null;
for (let y = 20; y <= 140 && !target; y++) {
  for (let x = 40; x <= 250; x++) {
    if (!cleanMap[y * HGR_W + x]) continue;
    // count what is lit nearby, so the cursor lands on a star rather than a stray pixel
    let near = 0;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (cleanMap[(y + dy) * HGR_W + (x + dx)]) near++;
      }
    }
    if (near >= 5) { target = { sx: x, sy: y, near }; break; }
  }
}
if (!target) { await a2.close(); throw new Error('no lit map pixel within the cursor\'s reach'); }
console.log(`  aiming at a lit pixel at (${target.sx}, ${target.sy}), ${target.near} lit within 3px`);

const v0 = solve(0.2, low.px, 0.5, mid.px, target.sx);
const v1 = solve(0.2, low.py, 0.5, mid.py, target.sy);
await setPaddles(v0, v1);
const got = await cursorAt();
console.log(`  paddles ${v0.toFixed(3)}, ${v1.toFixed(3)} -> PX ${got.px}, PY ${got.py}`);

// 3120 draws the cursor and the next line is 3125; 3200 takes it away and goes back to 3110.
const withCursor = await pageAt(3125);
const withoutCursor = await pageAt(3110);
if (!withCursor || !withoutCursor) { await a2.close(); throw new Error('could not catch the loop'); }

const diff = (a, b) => {
  let on = 0;
  let off = 0;
  const pts = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (b[i]) on++; else off++;
    pts.push([i % HGR_W, (i / HGR_W) | 0, a[i] ? 1 : 0]);
  }
  return { on, off, pts };
};
const d = diff(withoutCursor, withCursor);
console.log('');
console.log(`  drawing the cursor turned ${d.on} pixels on and ${d.off} off`);
console.log(d.off > 0
  ? `  ${d.off} pixels went dark, so the cursor is inverting the star underneath - a DRAW cannot`
  : '  nothing went dark, so at this position a DRAW would look the same');

// And the selection. 3130 sees the button, 3210 does `HCOLOR= 0: DRAW 12`, 3215 follows.
await a2.ev(`(() => { window.M.a2.getIO().buttonDown(0); return 'b'; })()`);
const afterSelect = await pageAt(3215);
await a2.ev(`(() => { window.M.a2.getIO().buttonUp(0); return 'b'; })()`);
let select = null;
if (afterSelect) {
  select = diff(withoutCursor, afterSelect);
  console.log('');
  console.log(`  after 3210's black DRAW, against the map with no cursor: ` +
    `${select.on} on, ${select.off} off`);
  console.log(select.off > 0
    ? `  ${select.off} map pixels are gone - 3210 is HCOLOR= 0: DRAW, not an XDRAW, so it` +
      ' paints the cursor black instead of restoring what was under it'
    : '  the map came back intact');
} else {
  console.log('  never reached 3215');
}

await a2.close();
fs.mkdirSync('captured/galaxycursor', { recursive: true });
fs.writeFileSync('captured/galaxycursor/with-cursor.png', toPng(withCursor));
fs.writeFileSync('captured/galaxycursor/without-cursor.png', toPng(withoutCursor));
if (afterSelect) fs.writeFileSync('captured/galaxycursor/after-select.png', toPng(afterSelect));
fs.writeFileSync('captured/galaxycursor/golden.json', JSON.stringify({
  source: 'GALAXY MAP with the paddles driven onto a star: the page with the cursor XDRAWn, with it toggled off, and after 3210',
  target, px: got.px, py: got.py,
  draw: { on: d.on, off: d.off, points: d.pts },
  select: select && { on: select.on, off: select.off, points: select.pts },
  without: Array.from(withoutCursor),
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/galaxycursor/golden.json and three PNGs');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
