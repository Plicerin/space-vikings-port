// STARSHIP SIMULATOR's two missile flashes, 1100 and 1200-1222.
//
//   1085 IF HIT = 1 THEN GOSUB 1200: J1 = 10: J2 = 120: GOSUB 1535: GOTO 1090
//   1088 GOSUB 1100
//
// so a missile that connects flashes at 1200 and one that misses flashes at 1100. 5250 calls
// 1100 too, when the ship's return fire kills a ground battery.
//
//   1100 ... FOR X0 = 1 TO 2: FOR LY = 0 TO 1: ROT= LY * 25:
//            XDRAW 2 AT M1 - M2,M: CALL SG: XDRAW 2 AT M1 + M2,M: CALL SG: NEXT:
//            HCOLOR= 0: NEXT: ROT= 1: RETURN
//   1200 FOR X0 = 1 TO 2: FOR LY = 1 TO 2: SCALE= LY: XDRAW 2 AT M1 - M2,M: NEXT: SCALE= 1:
//        XDRAW 15/16/17/18 AT M1 - M2,M ... GOSUB 4100
//   1220 FOR LY = 1 TO 2: SCALE= LY: XDRAW 2 AT M1 + M2,M: NEXT
//   1222 SCALE= 1: XDRAW 15/16/17/18 AT M1 + M2,M ... NEXT: RETURN
//
// Both are wrapped in `FOR X0 = 1 TO 2`, so every shape at every scale and rotation is XDRAWn
// an even number of times - and XDRAW is its own inverse. Reading it that way says the page
// comes back exactly as it was and the flash is pure flicker. That is a prediction, and the
// point of this file is to check it rather than believe it: the page is captured at the moment
// the subroutine is entered and again at the moment it returns.
//
// Getting there: 1501 sends the fire button to the missile code when 38202 is 1, and line
// 1010's `IF PEEK(38210) = 1 AND Y0 < VV THEN HIT = 1` makes a missile connect at once in
// atmosphere. Clearing 38210 and leaving no enemy in the box gives the miss instead.
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

let a2 = await openOracle();
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

const count = (on) => { let n = 0; for (let i = 0; i < on.length; i++) if (on[i]) n++; return n; };

/**
 * Hold the fire button until `entry` is the current line, then run until the flash returns.
 *
 * `lines` is the set the subroutine occupies; leaving it is the RETURN.
 */
const flash = async (label, entry, exitLines, setup) => {
  await a2.ev(setup);
  await a2.frames(30);
  const r = JSON.parse(await a2.ev(`(() => {
    const M = window.M, cpu = M.cpu, mach = M.a2;
    const io = mach.getIO();
    const line = () => cpu.read(0x75) | (cpu.read(0x76) << 8);
    // The end is the RETURN to the caller, not "the line number changed": both subroutines
    // GOSUB 4100 partway through, so watching for a line outside their own numbers stops after
    // a few hundred instructions and measures nothing.
    const exits = new Set(${JSON.stringify(exitLines)});
    let cyc = 0;
    const tick = () => {
      const before = cpu.getCycles();
      cpu.stepCycles(1);
      cyc += cpu.getCycles() - before;
      if (cyc >= M.FRAME_CYCLES) {
        cyc = 0;
        const mmu = mach.getMMU && mach.getMMU();
        if (mmu && mmu.resetVB) mmu.resetVB();
        if (io && io.tick) io.tick();
        if (mach.tick) mach.tick();
      }
    };
    const page = () => {
      const out = new Array(0x2000);
      for (let i = 0; i < 0x2000; i++) out[i] = cpu.read(0x2000 + i);
      return out;
    };
    io.buttonDown(0);
    for (let n = 0; n < 200000000 && line() !== ${entry}; n++) tick();
    io.buttonUp(0);
    if (line() !== ${entry}) return JSON.stringify({ reached: false });
    const before = page();
    let n = 0;
    let done = false;
    for (; n < 200000000; n++) {
      tick();
      if (exits.has(line())) { done = true; break; }
    }
    return JSON.stringify({ reached: true, done, before, after: page(), steps: n, backAt: line() });
  })()`));
  if (!r.reached) { console.log(`  ${label}: never reached line ${entry}`); return null; }
  const beforeOn = decodeHgr(Uint8Array.from(r.before));
  const afterOn = decodeHgr(Uint8Array.from(r.after));
  let on = 0;
  let off = 0;
  for (let i = 0; i < beforeOn.length; i++) {
    if (beforeOn[i] === afterOn[i]) continue;
    if (afterOn[i]) on++; else off++;
  }
  console.log('');
  console.log(`  ${label} (line ${entry}, returned to ${r.backAt} after ` +
    `${r.steps.toLocaleString()} steps${r.done ? '' : ' - NEVER RETURNED'})`);
  console.log(`    page before: ${count(beforeOn)} lit`);
  console.log(`    page after:  ${count(afterOn)} lit`);
  console.log(`    turned on: ${on}   turned off: ${off}`);
  console.log(`    ${on === 0 && off === 0
    ? 'the page came back exactly as it was - the flash is pure flicker'
    : 'THE PAGE CHANGED, so the flash leaves something behind'}`);
  return { label, entry, on, off, before: Array.from(beforeOn), after: Array.from(afterOn),
    litBefore: count(beforeOn), litAfter: count(afterOn), steps: r.steps, backAt: r.backAt };
};

// Each case gets its own machine. Firing twenty missiles to find a miss empties the rack and
// leaves the ship somewhere else, and arranging the hit needs the simulator restarted on top of
// that; two runs in one session kept ending with the second one never reaching its line.
//
// The miss first, because it needs nothing arranged: out of atmosphere, with no ship out there
// to fall inside 1050's box, every missile misses and 1088 calls 1100.
const miss = await flash('missile miss', 1100, [1088, 1090], `(() => {
  const M = window.M;
  M.wr(38202, 1); M.wr(38187, 20); M.wr(38210, 0); M.wr(38205, 0); M.wr(38208, 0);
  return 'w';
})()`);

await a2.close();
a2 = await openOracle();
await a2.boot();
await a2.key('N');
console.log('');
console.log('  second machine, for the hit...');
{
  let back = false;
  for (let i = 0; i < 700; i++) { await a2.frames(20); if ((await loaded()) === SIM) { back = true; break; } }
  if (!back) { await a2.close(); throw new Error('no simulator on the second machine'); }
}
await a2.frames(300);

// The hit needs more, and the reason is worth stating. HIT is set at 1010 from `Y0 < VV` or at
// 1050 from a box around the enemy, and both use `X`, `Y` and `Z` - which line 8 reads out of
// 29467/29469/29471 **once**, on the way in. Nothing on the disk jumps back to line 8, so the
// ship position those tests see is frozen at whatever it was when STARSHIP SIMULATOR started,
// and poking the bytes mid-flight changes nothing at all.
//
// So the position is poked and the simulator is restarted through COM's RETURN, which makes
// line 8 read it again. Y goes to 0, well under VV's opening 160, so the first missile fired in
// atmosphere connects.
console.log('');
console.log('  restarting the simulator with Y poked to 0, so line 8 reads it back');
await a2.ev(`(() => {
  const M = window.M;
  M.wr(29469, 0); M.wr(29470, 0);
  M.wr(38210, 1); M.wr(38208, 0);
  return 'w';
})()`);
await a2.frames(20);
await a2.key('C');
for (let i = 0; i < 40; i++) await a2.frames(20);
await a2.key('5');
{
  let back = false;
  for (let i = 0; i < 700; i++) { await a2.frames(20); if ((await loaded()) === SIM) { back = true; break; } }
  console.log(`  simulator ${back ? 'restarted' : 'did NOT restart'}`);
}
await a2.frames(200);

const hit = await flash('missile hit', 1200, [1085], `(() => {
  const M = window.M;
  M.wr(38202, 1); M.wr(38187, 20); M.wr(38210, 1); M.wr(38208, 0);
  return 'w';
})()`);

await a2.close();
fs.mkdirSync('captured/destructionflash', { recursive: true });
if (hit) {
  fs.writeFileSync('captured/destructionflash/hit-before.png',
    toPng(Uint8Array.from(hit.before)));
  fs.writeFileSync('captured/destructionflash/hit-after.png',
    toPng(Uint8Array.from(hit.after)));
}
fs.writeFileSync('captured/destructionflash/golden.json', JSON.stringify({
  source: 'the hi-res page at entry to and return from 1200-1222 and 1100',
  hit: hit && { ...hit, before: undefined, after: undefined },
  miss: miss && { ...miss, before: undefined, after: undefined },
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/destructionflash/golden.json');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
void HGR_W; void HGR_H;
