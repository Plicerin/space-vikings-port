// EX line 6's five XDRAWs, captured either side so the XOR can be checked.
//
//   5 HCOLOR= 3: Y1 = 20: EN = 30841: EX = 37494
//   6 SCALE= 2: XDRAW 2 AT 140,65: XDRAW 15 AT 140,65: XDRAW 16 AT 140,65:
//     XDRAW 17 AT 140,65: XDRAW 18 AT 140,65: ... SCALE= 1
//
// XDRAW is Applesoft's XOR draw: it toggles the pixels a shape would plot rather than setting
// them. EX never clears the page - the flash goes straight over the live flight view - so
// wherever the view already has a pixel, XDRAW takes it away. The port draws these instead of
// XORing, which is right only on the pixels that were dark.
//
// Nothing about that can be settled from a finished screen, so this captures the page
// immediately before line 6 and immediately after it. The difference is exactly the five
// shapes XORed onto whatever was underneath, and `ex_parity.mjs` can then replay it.
//
// Catching line 6 needs stepping rather than frame polling: lines 0-6 go past in a moment. The
// slack comes from line 4, `BLOAD SOUND GEN`, whose disk access takes long enough that the
// program is detected and the stepper is watching well before line 6 arrives.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import { decodeHgr, toPng, HGR_W, HGR_H } from './hgr.mjs';
import fs from 'fs';

const disk = openDisk(DISK);
const textOf = (name) => {
  const r = disk.read(disk.files.find((f) => f.name === name));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => `${l.num} ${l.text}`).join('\n');
};
const SIM = textOf('STARSHIP SIMULATOR');
const EX = textOf('EX');

const a2 = await openOracle();
await a2.boot();
await a2.key('N');
const loaded = async () => {
  const b = await a2.readRange(0x800, 0x2000);
  const m = {};
  for (let k = 0; k < b.length; k++) m[0x800 + k] = b[k];
  try { return listProgram(m, 0x801, 0x2000).map((l) => `${l.num} ${l.text}`).join('\n'); }
  catch { return ''; }
};

console.log('waiting for STARSHIP SIMULATOR...');
let ok = false;
for (let i = 0; i < 700; i++) { await a2.frames(20); if ((await loaded()) === SIM) { ok = true; break; } }
if (!ok) { await a2.close(); throw new Error('no simulator'); }
await a2.frames(300);

// Line 1560 runs EX when the damage beats 38204 and a ship is out there. Line 1540 wants the
// ship out of atmosphere, 1502 a working laser, 1501 the missile flag clear.
await a2.ev(`(() => {
  const M = window.M;
  M.wr(38152, 200); M.wr(38204, 1); M.wr(38205, 1);
  M.wr(38202, 0); M.wr(38186, 100); M.wr(38210, 0);
  return 'w';
})()`);
console.log('holding the fire button - line 185 reads PEEK(-16287)');
let started = false;
for (let i = 0; i < 200 && !started; i++) {
  await a2.ev(`(() => { window.M.a2.getIO().buttonDown(0); return 'b'; })()`);
  await a2.frames(6);
  await a2.ev(`(() => { window.M.a2.getIO().buttonUp(0); return 'b'; })()`);
  await a2.ev(`(() => { window.M.wr(38152, 200); window.M.wr(38204, 1); window.M.wr(38205, 1); return 'w'; })()`);
  await a2.frames(3);
  started = (await loaded()) === EX;
}
if (!started) { await a2.close(); throw new Error('EX never started'); }
console.log('EX is running');

// Step to the start of line 6, note the page, run the line, note it again.
const r = JSON.parse(await a2.ev(`(() => {
  const M = window.M, cpu = M.cpu, mach = M.a2;
  const line = () => cpu.read(0x75) | (cpu.read(0x76) << 8);
  let cyc = 0;
  const tick = () => {
    const before = cpu.getCycles();
    cpu.stepCycles(1);
    cyc += cpu.getCycles() - before;
    if (cyc >= M.FRAME_CYCLES) {
      cyc = 0;
      const mmu = mach.getMMU && mach.getMMU();
      if (mmu && mmu.resetVB) mmu.resetVB();
      const io = mach.getIO();
      if (io && io.tick) io.tick();
      if (mach.tick) mach.tick();
    }
  };
  const page = () => {
    const out = new Array(0x2000);
    for (let i = 0; i < 0x2000; i++) out[i] = cpu.read(0x2000 + i);
    return out;
  };
  for (let n = 0; n < 200000000 && line() !== 6; n++) tick();
  if (line() !== 6) return JSON.stringify({ reached: false });
  const before = page();
  const state = { hcolor: cpu.read(0xE4), scale: cpu.read(0xE7), page974: cpu.read(0x3CE) };
  for (let n = 0; n < 200000000 && line() === 6; n++) tick();
  return JSON.stringify({ reached: true, before, after: page(), state, nextLine: line() });
})()`));
await a2.close();

if (!r.reached) throw new Error('never reached EX line 6');
console.log(`  line 6 entered with HCOLOR byte $${r.state.hcolor.toString(16).toUpperCase()},` +
  ` SCALE ${r.state.scale}, and left for line ${r.nextLine}`);

const toOn = (bytes) => decodeHgr(Uint8Array.from(bytes));
const beforeOn = toOn(r.before);
const afterOn = toOn(r.after);
const count = (on) => { let n = 0; for (let i = 0; i < on.length; i++) if (on[i]) n++; return n; };

let turnedOn = 0;
let turnedOff = 0;
const changed = [];
for (let y = 0; y < HGR_H; y++) {
  for (let x = 0; x < HGR_W; x++) {
    const i = y * HGR_W + x;
    if (beforeOn[i] === afterOn[i]) continue;
    if (afterOn[i]) turnedOn++; else turnedOff++;
    changed.push([x, y, beforeOn[i] ? 1 : 0]);
  }
}
console.log('');
console.log(`  page before line 6: ${count(beforeOn)} lit`);
console.log(`  page after:         ${count(afterOn)} lit`);
console.log(`  pixels the five XDRAWs turned ON:  ${turnedOn}`);
console.log(`  pixels they turned OFF:            ${turnedOff}`);
console.log('');
console.log(turnedOff > 0
  ? `  ${turnedOff} pixels went dark, which a DRAW could not do - XDRAW is XORing over the view`
  : '  nothing went dark, so on this page a DRAW would have given the same result');

const bounds = (list) => {
  let minX = 999, maxX = -1, minY = 999, maxY = -1;
  for (const [x, y] of list) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
};
const b = bounds(changed);
console.log(`  the flash spans x ${b.minX}-${b.maxX}, y ${b.minY}-${b.maxY}` +
  ` (drawn at 140,65 with SCALE 2)`);

fs.mkdirSync('captured/exflash', { recursive: true });
fs.writeFileSync('captured/exflash/before.png', toPng(beforeOn));
fs.writeFileSync('captured/exflash/after.png', toPng(afterOn));
fs.writeFileSync('captured/exflash/golden.json', JSON.stringify({
  source: 'EX line 6: the hi-res page immediately before and after the five XDRAWs',
  state: r.state,
  before: Array.from(beforeOn),
  after: Array.from(afterOn),
  turnedOn, turnedOff,
  changed,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/exflash/golden.json, before.png, after.png');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
