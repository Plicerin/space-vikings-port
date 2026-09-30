// How fast the ship actually moves, on the machine and in the port.
//
// Playing the port, a few seconds at full speed puts the ship at X 18,000 - past every bound the
// game itself uses. STARSHIP SIMULATOR 192 only runs the damage tick while X is between -3500
// and 4500, Y between -3000 and 3000 and Z between -6000 and 2000, and line 156 re-enters the
// atmosphere inside a 900-unit cube, so the whole game happens in a box a few thousand units
// across. Crossing it in a second or two is a different game from crossing it in a minute.
//
// This is not something the pixel harnesses can see: the flight view moves every frame and is
// never compared. So measure it. Read X, Y and Z out of the machine's own 16-bit cells at
// 29467, 29469 and 29471 - line 8's XI, YI and ZI, decoded the way line 6600 decodes them -
// twice, a known number of frames apart, at a known speed byte.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const XI = 29467, YI = 29469, ZI = 29471;
const SPEED = 38157;
const FRAMES = 600;                 // ten seconds of Apple time
const SECONDS = FRAMES / 60;

const disk = openDisk(DISK);
const simText = (() => {
  const r = disk.read(disk.files.find((f) => f.name === 'STARSHIP SIMULATOR'));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => `${l.num} ${l.text}`).join('\n');
})();

const a2 = await openOracle();
await a2.boot();
await a2.key('N');
const inSim = async () => {
  const b = await a2.readRange(0x800, 0x2000);
  const m = {};
  for (let k = 0; k < b.length; k++) m[0x800 + k] = b[k];
  try { return listProgram(m, 0x801, 0x2000).map((l) => `${l.num} ${l.text}`).join('\n') === simText; }
  catch { return false; }
};

console.log('waiting for STARSHIP SIMULATOR...');
let ok = false;
for (let i = 0; i < 900; i++) { await a2.frames(20); if (await inSim()) { ok = true; break; } }
if (!ok) { await a2.close(); throw new Error('the simulator never started'); }
await a2.frames(300);

/** Line 6600: hi >= 129 is negative. */
const signed = (lo, hi) => (hi < 129 ? hi * 256 + lo : (hi - 255) * 256 + (lo - 256));
const pos = async () => {
  const b = await a2.readRange(XI, ZI + 2);
  return {
    x: signed(b[0], b[1]), y: signed(b[2], b[3]), z: signed(b[4], b[5]),
  };
};

// The speed byte cannot be poked: line 210 is `POKE 38157,S` and runs every pass, so the BASIC
// variable S puts it straight back. S only moves when a digit key is pressed - 1 and 2 are -3
// and +3, 3 and 4 are -15 and +15 - so drive it the way a player does. The first run of this
// poked 38157 and got the same 36 units a second at every "speed", which is what gave it away.
const speedNow = async () => (await a2.readRange(SPEED, SPEED + 1))[0];
const setSpeed = async (want) => {
  // One key per pass, and a pass is about half a second, so hold each press past one and check
  // the byte afterwards rather than counting presses. Counting was the first try and it lost
  // most of them: eight presses of 4 moved the byte by 30.
  for (let i = 0; i < 120; i++) {
    const now = await speedNow();
    if (now === want) return now;
    const d = want - now;
    const key = d >= 15 ? '4' : d > 0 ? '2' : d <= -15 ? '3' : '1';
    await a2.key(key, { holdFrames: 40, afterFrames: 40 });
  }
  const got = await speedNow();
  console.log(`  (asked for speed ${want}, the machine settled at ${got})`);
  return got;
};

const rows = [];
for (const want of [120, 60, 30]) {
  const s = await setSpeed(want);
  await a2.frames(120);
  const before = await pos();
  const t0 = Number(await a2.ev('window.M.cpu.getCycles()'));
  await a2.frames(FRAMES);
  const after = await pos();
  const t1 = Number(await a2.ev('window.M.cpu.getCycles()'));
  const d = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
  // The emulator counts 6502 cycles; an Apple II runs 1,020,484 a second.
  const secs = (t1 - t0) / 1020484;
  rows.push({ speed: s, from: before, to: after, distance: d, seconds: secs,
    perSecond: d / secs });
  console.log(`  speed ${String(s).padStart(3)}: ` +
    `(${before.x}, ${before.y}, ${before.z}) -> (${after.x}, ${after.y}, ${after.z})  ` +
    `${d.toFixed(0)} units in ${secs.toFixed(1)}s = ${(d / secs).toFixed(1)} units/s`);
}
// And the step itself. Units a second is a product of two things - how far a pass moves the
// ship and how often a pass happens - and the port has to get both right, so measure them
// apart: sample Z often enough to see each jump.
console.log('');
const stepped = [];
for (const want of [120, 60, 30]) {
  await setSpeed(want);
  let last = (await pos()).z;
  const jumps = [];
  const marks = [];
  for (let i = 0; i < 400; i++) {
    const t = Number(await a2.ev('window.M.cpu.getCycles()'));
    await a2.frames(3);
    const z = (await pos()).z;
    if (z !== last) { jumps.push(z - last); marks.push(t / 1020484); last = z; }
  }
  const sizes = [...new Set(jumps)].sort((a, b) => a - b);
  const gaps = marks.slice(1).map((t, i) => t - marks[i]);
  const mean = gaps.reduce((a, b) => a + b, 0) / Math.max(1, gaps.length);
  console.log(`  at speed ${String(want).padStart(3)} the machine moves in steps of ` +
    `${sizes.join(', ')} every ${mean.toFixed(2)}s (${jumps.length} steps seen)`);
  stepped.push({ speed: want, sizes, meanGap: mean, steps: jumps.length });
}

if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();

// --- the port -----------------------------------------------------------------------------
console.log('');
console.log('the port, driven the same way:');
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikingsState),
  null, { timeout: 30000 });
const portRows = await page.evaluate(async (speeds) => {
  const press = (key) => new Promise((res) => {
    const code = /^[0-9]$/.test(key) ? 'Digit' + key : 'Key' + key.toUpperCase();
    window.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key, code, bubbles: true }));
    setTimeout(res, 700);
  });
  for (let i = 0; i < 7; i++) await press('N');
  await new Promise((r) => setTimeout(r, 2000));
  const st = window.__spaceVikingsState;
  const out = [];
  for (const s of speeds) {
    // Put the ship back near the origin and stop it re-entering, so every run measures the
    // same thing rather than whatever scene the last one flew into.
    // Y 5000 keeps the ship outside line 156's 900-unit re-entry cube for the whole window.
    // At Y 0 the speed-120 run flew into it, RE moved the ship, and the endpoint distance came
    // out as 18,002 units - a scene change, not a speed.
    st.x = 0; st.y = 5000; st.z = -2000; st.atmosphere = false; st.inOrbit = false;
    st.speed = s;
    await new Promise((r) => setTimeout(r, 300));
    const a = { x: st.x, y: st.y, z: st.z };
    const t0 = performance.now();
    // Long enough that the count is not quantised by the tick: the port moves in one jump per
    // pass, and a four-second window over a two-and-a-half-second pass measures 1 or 2.
    await new Promise((r) => setTimeout(r, 25000));
    const b = { x: st.x, y: st.y, z: st.z };
    const secs = (performance.now() - t0) / 1000;
    const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    out.push({ speed: s, from: a, to: b, distance: d, seconds: secs, perSecond: d / secs });
  }
  return out;
}, [120, 60, 30]);
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);
for (const r of portRows) {
  console.log(`  speed ${String(r.speed).padStart(3)}: ` +
    `${r.distance.toFixed(0)} units in ${r.seconds.toFixed(1)}s = ${r.perSecond.toFixed(1)} units/s`);
}

console.log('');
console.log('  speed   disk units/s   port units/s   port is');
for (let i = 0; i < rows.length; i++) {
  const d = rows[i];
  const p = portRows[i];
  console.log(`  ${String(d.speed).padStart(5)}   ${d.perSecond.toFixed(1).padStart(11)}   ` +
    `${p.perSecond.toFixed(1).padStart(12)}   ${(p.perSecond / d.perSecond).toFixed(2)}x`);
}

fs.mkdirSync('captured/flightspeed', { recursive: true });
fs.writeFileSync('captured/flightspeed/golden.json', JSON.stringify({
  source: 'X, Y and Z at 29467/29469/29471 on the machine over 600 frames at three speed bytes, and the port over the same wall time',
  disk: rows, port: portRows, step: stepped,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/flightspeed/golden.json');
