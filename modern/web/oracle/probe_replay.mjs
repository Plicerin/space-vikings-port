// Replay the flight snapshot and make the renderer draw.
//
// probe_snapshot.mjs stopped the 6502 on the instruction at $6000 during live flight and
// took all 48K. Writing that back into a fresh machine reproduces, by construction, exactly
// the state the renderer saw - no reconstruction of what TRANLIT.OBJ0 builds, no guessing
// at the object list.
//
// It draws to hi-res page 2 ($4000-$5FFF) while page 1 is displayed - STARSHIP SIMULATOR
// line 147 pokes $7315 with $54 or $55, the low byte of the PAGE1/PAGE2 soft switch, and
// flips between them. So page 2 is what gets cleared and read here.
//
// Page 1 is deliberately left alone. Clearing it cut the render short - 3,254 instructions
// instead of 604,164 - so the renderer reads something out of that region as well as
// drawing into page 2.
//
// The return address on the stack is replaced with a trap so stepping stops the instant the
// routine returns.
import { openOracle } from './a2.mjs';
import { decodeHgr, toPng, HGR_W, HGR_H } from './hgr.mjs';
import fs from 'fs';

const TRAP = 0x0300;
const meta = JSON.parse(fs.readFileSync('captured/snapshot/flight.json', 'utf8'));
const ram = fs.readFileSync('captured/snapshot/flight.bin');
const b64 = ram.toString('base64');

const a2 = await openOracle();
await a2.ev(`(() => {
  window.M.a2.reset();
  return 'reset';
})()`);
await a2.frames(10);

/** Put the snapshot back, point the graphics switches the way flight leaves them. */
async function restore() {
  await a2.ev(`(() => {
    const M = window.M, cpu = M.cpu;
    const s = atob(${JSON.stringify(b64)});
    for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
    // full-screen hi-res, page 1 - reading these switches is how the Apple sets them
    cpu.read(0xC050); cpu.read(0xC052); cpu.read(0xC054); cpu.read(0xC057);
    const st = cpu.getState();
    st.a = ${meta.cpu.a}; st.x = ${meta.cpu.x}; st.y = ${meta.cpu.y};
    st.s = ${meta.cpu.s}; st.sp = ${meta.cpu.sp}; st.pc = ${meta.pc};
    cpu.setState(st);
    return 'restored';
  })()`);
}

/** Run from $6000 until it returns. Returns how it went. */
async function render({ clear = true } = {}) {
  return JSON.parse(await a2.ev(`(() => {
    const M = window.M, cpu = M.cpu, a2 = M.a2;
    ${clear ? 'for (let a = 0x4000; a < 0x6000; a++) cpu.write(a, 0);' : ''}
    // trap the return: at entry the return address sits just above the stack pointer
    const sp = cpu.getState().sp;
    cpu.write(0x0100 + ((sp + 1) & 0xff), ${(TRAP - 1) & 0xff});
    cpu.write(0x0100 + ((sp + 2) & 0xff), ${(TRAP - 1) >> 8});
    cpu.write(${TRAP}, 0x4C); cpu.write(${TRAP + 1}, ${TRAP & 0xff}); cpu.write(${TRAP + 2}, ${TRAP >> 8});
    let steps = 0, cyc = 0;
    while (cpu.getPC() !== ${TRAP} && steps < 4000000) {
      const b = cpu.getCycles();
      cpu.stepCycles(1);
      steps++;
      cyc += cpu.getCycles() - b;
      if (cyc >= M.FRAME_CYCLES) {
        cyc = 0;
        const mmu = a2.getMMU && a2.getMMU();
        if (mmu && mmu.resetVB) mmu.resetVB();
        const io = a2.getIO();
        if (io && io.tick) io.tick();
        if (a2.tick) a2.tick();
      }
    }
    return JSON.stringify({ steps, returned: cpu.getPC() === ${TRAP}, pc: cpu.getPC() });
  })()`));
}

const bounds = (on) => {
  let n = 0, minX = HGR_W, maxX = -1, minY = HGR_H, maxY = -1;
  for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) {
    if (!on[y * HGR_W + x]) continue;
    n++;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { n, minX, maxX, minY, maxY };
};

fs.mkdirSync('captured/render', { recursive: true });

await restore();
const r = await render();
let on = decodeHgr(await a2.readRange(0x4000, 0x6000));
let b = bounds(on);
console.log(`the call ${r.returned ? 'returned' : 'DID NOT RETURN (stopped at $' + r.pc.toString(16) + ')'} after ${r.steps.toLocaleString()} instructions`);
console.log(`it drew ${b.n} pixels` + (b.n ? `, within x ${b.minX}-${b.maxX}, y ${b.minY}-${b.maxY}` : ''));
if (b.n) {
  fs.writeFileSync('captured/render/replay.png', toPng(on));
  console.log('wrote captured/render/replay.png');
}

// If it draws, it is an oracle: move the ship and it should draw something different.
if (b.n) {
  console.log('\nmoving the ship and re-rendering:\n');
  console.log('        Z   heading    pixels   extent');
  const shots = [];
  for (const [z, heading] of [[-6401, 0], [-4000, 0], [-2000, 0], [-6401, 16], [-6401, 32], [-6401, 64]]) {
    await restore();
    await a2.ev(`(() => {
      const w = window.M.cpu.write.bind(window.M.cpu);
      w(0x731F, ${z & 0xff}); w(0x7320, ${(z >> 8) & 0xff});
      w(0x7323, ${heading});
      return 'moved';
    })()`);
    const rr = await render();
    on = decodeHgr(await a2.readRange(0x4000, 0x6000));
    b = bounds(on);
    console.log(`  ${String(z).padStart(7)}   ${String(heading).padStart(7)}   ${String(b.n).padStart(7)}   ` +
      (b.n ? `x ${b.minX}-${b.maxX}, y ${b.minY}-${b.maxY}` : '(nothing)') + (rr.returned ? '' : '  DID NOT RETURN'));
    const name = `captured/render/z${z}_h${heading}.png`;
    if (b.n) { fs.writeFileSync(name, toPng(on)); shots.push(name); }
  }
  console.log(`\nwrote ${shots.length} render(s)`);
}
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
