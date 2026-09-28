// Snapshot the machine at the instant the renderer is entered.
//
// Calling $6000 from a cold machine with every binary loaded draws nothing - it needs more
// setup than START's BLOADs, at least whatever TRANLIT.OBJ0 builds and whatever object list
// $6140 walks from page $73. Reconstructing that by hand is guesswork.
//
// So don't reconstruct it. Run the real game, stop the 6502 on the instruction at $6000,
// and take all 48K plus the registers. Replayed into a fresh machine that is, by
// construction, exactly the state the renderer saw - and then the ship can be moved and it
// can be asked to draw again.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import fs from 'fs';

const RAM_LO = 0x0000, RAM_HI = 0xc000;
const RENDER = 0x6000;

const disk = openDisk(DISK);
const sim = disk.read(disk.files.find((f) => f.name === 'STARSHIP SIMULATOR'));
const wanted = listProgram(asMemory(sim, 0x801), 0x801, 0x801 + sim.len + 2)
  .map((l) => `${l.num} ${l.text}`).join('\n');

const a2 = await openOracle();
await a2.boot();
await a2.key('N');

console.log('waiting for STARSHIP SIMULATOR...');
let running = false;
for (let i = 0; i < 400 && !running; i++) {
  await a2.frames(20);
  const bytes = await a2.readRange(0x800, 0x2000);
  const mem = {};
  for (let k = 0; k < bytes.length; k++) mem[0x800 + k] = bytes[k];
  try { running = listProgram(mem, 0x801, 0x2000).map((l) => `${l.num} ${l.text}`).join('\n') === wanted; }
  catch { /* mid-load */ }
}
if (!running) { await a2.close(); throw new Error('STARSHIP SIMULATOR never started'); }

// Let flight settle so the object list and working state are fully populated, then stop on
// the renderer's own entry instruction.
await a2.frames(600);
console.log('in flight; stepping to $6000\n');

const stop = JSON.parse(await a2.ev(`(() => {
  const M = window.M, cpu = M.cpu, a2 = M.a2;
  let steps = 0, cyc = 0;
  while (cpu.getPC() !== ${RENDER} && steps < 8000000) {
    const before = cpu.getCycles();
    cpu.stepCycles(1);
    steps++;
    cyc += cpu.getCycles() - before;
    // keep the machine's own housekeeping running, or timing loops never finish
    if (cyc >= M.FRAME_CYCLES) {
      cyc = 0;
      const mmu = a2.getMMU && a2.getMMU();
      if (mmu && mmu.resetVB) mmu.resetVB();
      const io = a2.getIO();
      if (io && io.tick) io.tick();
      if (a2.tick) a2.tick();
    }
  }
  return JSON.stringify({ steps, pc: cpu.getPC(), reached: cpu.getPC() === ${RENDER} });
})()`));
if (!stop.reached) { await a2.close(); throw new Error(`never reached $6000 (stopped at $${stop.pc.toString(16)} after ${stop.steps} steps)`); }
console.log(`stopped at $6000 after ${stop.steps.toLocaleString()} instructions`);

const snap = JSON.parse(await a2.ev(`(() => {
  const M = window.M, cpu = M.cpu;
  let s = '';
  for (let a = ${RAM_LO}; a < ${RAM_HI}; a++) s += String.fromCharCode(cpu.read(a));
  return JSON.stringify({ ram: btoa(s), cpu: cpu.getState() });
})()`));

const ram = Buffer.from(snap.ram, 'base64');
if (ram.length !== RAM_HI - RAM_LO) throw new Error(`snapshot is ${ram.length} bytes, expected ${RAM_HI - RAM_LO}`);
fs.mkdirSync('captured/snapshot', { recursive: true });
fs.writeFileSync('captured/snapshot/flight.bin', ram);
fs.writeFileSync('captured/snapshot/flight.json', JSON.stringify({
  lo: RAM_LO, hi: RAM_HI, pc: RENDER, cpu: snap.cpu,
  note: 'taken with the 6502 stopped on the instruction at $6000, during live flight',
}, null, 2) + '\n');

const s16 = (a) => { const v = ram[a] | (ram[a + 1] << 8); return v > 32767 ? v - 65536 : v; };
console.log(`\nwrote captured/snapshot/flight.bin (${ram.length} bytes) and flight.json`);
console.log(`registers: A=$${snap.cpu.a.toString(16)} X=$${snap.cpu.x.toString(16)} ` +
  `Y=$${snap.cpu.y.toString(16)} SP=$${snap.cpu.sp.toString(16)}`);
console.log(`ship at snapshot: X=${s16(0x731b)} Y=${s16(0x731d)} Z=${s16(0x731f)}  ` +
  `pitch=${ram[0x7321]} bank=${ram[0x7322]} heading=${ram[0x7323]}`);
console.log(`speed=${ram[0x950d]}  planet=${ram[0x9541]}  shipKind=${ram[0x953d]}`);
const lit = (() => { let n = 0; for (let a = 0x2000; a < 0x4000; a++) for (let b = 0; b < 8; b++) if ((ram[a] >> b) & 1) n++; return n; })();
console.log(`hi-res page 1 holds ${lit} set bits at the moment of the snapshot`);
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
