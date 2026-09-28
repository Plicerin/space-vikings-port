// Which bytes of the renderer are code?
//
// A static disassembly cannot tell you. Decoding data produces confident nonsense, and a
// 597-byte blob that draws 3D wireframes is certain to contain tables. So this runs the
// game and records every address the 6502 actually executes inside SPACE SIMULATOR
// ASSEMBLY, along with which addresses it reads and writes.
//
// STARSHIP SIMULATOR line 150 does CALL CA every pass, CA = $9023, so flight exercises it
// continuously.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import fs from 'fs';

// Defaults trace SPACE SIMULATOR ASSEMBLY ($9023 + $255). Pass lo, hi and a frame count to
// point it somewhere else - the renderer at $6000 needs far more frames, because one pass
// of the Applesoft main loop costs half a million instructions.
const LO = Number(process.argv[2] ?? 0x9023);
const HI = Number(process.argv[3] ?? 0x9278);
const FRAMES = Number(process.argv[4] ?? 240);
const OUT = process.argv[5] ?? 'captured/trace_9023.json';
const TRIG_LO = 0x6000, TRIG_HI = 0x6300;

const disk = openDisk(DISK);
const sim = disk.files.find((f) => f.name === 'STARSHIP SIMULATOR');
const r = disk.read(sim);
const wanted = listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
  .map((l) => `${l.num} ${l.text}`).join('\n');

const a2 = await openOracle();
await a2.boot();
await a2.key('N');

console.log('waiting for STARSHIP SIMULATOR to be the running program...');
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
console.log('it is running; tracing\n');

// Trace inside the page: a few hundred thousand instructions over the bridge would take
// all day, and the CPU exposes a per-instruction hook.
const trace = JSON.parse(await a2.ev(`(() => {
  const M = window.M, cpu = M.cpu;
  const LO = ${LO}, HI = ${HI}, TLO = ${TRIG_LO}, THI = ${TRIG_HI};
  const exec = new Uint8Array(HI - LO);
  const trig = new Uint8Array(THI - TLO);
  const entries = {};          // addresses reached by JSR/JMP from outside the routine
  let instructions = 0, inside = 0, prevPC = -1;

  const hook = () => {
    const pc = cpu.getPC();
    instructions++;
    if (pc >= LO && pc < HI) {
      exec[pc - LO] = 1;
      inside++;
      if (prevPC < LO || prevPC >= HI) entries[pc] = (entries[pc] || 0) + 1;
    } else if (pc >= TLO && pc < THI) {
      trig[pc - TLO] = 1;
    }
    prevPC = pc;
  };

  // Every pass of the main loop calls into both modules.
  for (let f = 0; f < ${FRAMES}; f++) {
    cpu.stepCyclesDebug(M.FRAME_CYCLES, hook);
    const mmu = M.a2.getMMU && M.a2.getMMU();
    if (mmu && mmu.resetVB) mmu.resetVB();
    const io = M.a2.getIO();
    if (io && io.tick) io.tick();
    if (M.a2.tick) M.a2.tick();
  }
  return JSON.stringify({
    instructions, inside,
    exec: Array.from(exec), trig: Array.from(trig),
    entries: Object.entries(entries).map(([a, n]) => [Number(a), n]).sort((x, y) => y[1] - x[1]),
  });
})()`));

const image = await a2.readRange(LO, HI);
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();

const execCount = trace.exec.reduce((s, v) => s + v, 0);
const trigCount = trace.trig.reduce((s, v) => s + v, 0);
console.log(`${trace.instructions.toLocaleString()} instructions traced, ${trace.inside.toLocaleString()} inside $9023-$9277`);
console.log(`${execCount} of ${HI - LO} bytes in the routine were executed (${(100 * execCount / (HI - LO)).toFixed(1)}%)`);
console.log(`${trigCount} bytes executed in $6000-$62FF (LO-HI A2-3D1, the sin/cos tables)`);

console.log('\nentered from outside at:');
for (const [addr, n] of trace.entries.slice(0, 10)) {
  console.log(`  $${addr.toString(16).toUpperCase()}  ${n.toLocaleString()} times`);
}

// Runs of bytes never executed - the tables.
const gaps = [];
let start = -1;
for (let i = 0; i <= trace.exec.length; i++) {
  const isCode = i < trace.exec.length && trace.exec[i];
  if (!isCode && start < 0) start = i;
  if ((isCode || i === trace.exec.length) && start >= 0) {
    if (i - start >= 4) gaps.push([LO + start, LO + i - 1]);
    start = -1;
  }
}
console.log(`\n${gaps.length} run(s) of 4+ bytes never executed:`);
for (const [a, b] of gaps) console.log(`  $${a.toString(16).toUpperCase()}-$${b.toString(16).toUpperCase()}  (${b - a + 1} bytes)`);

fs.writeFileSync(OUT, JSON.stringify({
  lo: LO, hi: HI, image: Array.from(image), exec: trace.exec, trig: trace.trig,
  entries: trace.entries, instructions: trace.instructions, inside: trace.inside,
}) + '\n');
console.log('\nwrote ' + OUT);
