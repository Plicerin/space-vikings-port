// Snapshot the machine on approach, with a numbered planet loaded.
//
// STARSHIP SIMULATOR line 156 runs RE when |X|, |Y| and |Z| are all under 900. RE flashes
// the screen, sets the atmosphere flag at $9542, BLOADs PLANET # <current planet> to $7300,
// repositions the ship and returns to STARSHIP SIMULATOR. So the approach scene is ordinary
// flight with a ground wireframe in place of the star table.
//
// This flies there rather than reconstructing it: from the opening position the ship is
// already heading that way, so it is a matter of letting it run and watching $9542.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import fs from 'fs';

const RAM_LO = 0x0000, RAM_HI = 0xc000;
const RENDER = 0x6000, ATMOS = 0x9542;

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

const s16 = (v) => (v > 32767 ? v - 65536 : v);
const where = async () => JSON.parse(await a2.ev(`JSON.stringify({
  x: window.M.rd(0x731B) | (window.M.rd(0x731C) << 8),
  y: window.M.rd(0x731D) | (window.M.rd(0x731E) << 8),
  z: window.M.rd(0x731F) | (window.M.rd(0x7320) << 8),
  atmos: window.M.rd(${ATMOS}), planet: window.M.rd(0x9541)
})`));

let st = await where();
console.log(`flying from X=${s16(st.x)} Y=${s16(st.y)} Z=${s16(st.z)} towards |X|,|Y|,|Z| < 900\n`);

let frames = 0;
for (let i = 0; i < 300 && !st.atmos; i++) {
  await a2.frames(60);
  frames += 60;
  st = await where();
  if (i % 20 === 0) console.log(`  ${String(frames).padStart(6)} frames   X=${String(s16(st.x)).padStart(6)} ` +
    `Y=${String(s16(st.y)).padStart(5)} Z=${String(s16(st.z)).padStart(7)}   atmosphere=${st.atmos}`);
}
if (!st.atmos) { await a2.close(); throw new Error(`never reached re-entry after ${frames} frames`); }
console.log(`\nre-entry ran after ${frames} frames; atmosphere=${st.atmos}, planet=${st.planet}`);
console.log(`ship repositioned to X=${s16(st.x)} Y=${s16(st.y)} Z=${s16(st.z)}`);

// Let the new scene settle, then stop on the renderer's entry instruction.
await a2.frames(300);
const stop = JSON.parse(await a2.ev(`(() => {
  const M = window.M, cpu = M.cpu, a2 = M.a2;
  let steps = 0, cyc = 0;
  while (cpu.getPC() !== ${RENDER} && steps < 8000000) {
    const before = cpu.getCycles();
    cpu.stepCycles(1);
    steps++;
    cyc += cpu.getCycles() - before;
    if (cyc >= M.FRAME_CYCLES) {
      cyc = 0;
      const mmu = a2.getMMU && a2.getMMU();
      if (mmu && mmu.resetVB) mmu.resetVB();
      const io = a2.getIO();
      if (io && io.tick) io.tick();
      if (a2.tick) a2.tick();
    }
  }
  return JSON.stringify({ steps, reached: cpu.getPC() === ${RENDER} });
})()`));
if (!stop.reached) { await a2.close(); throw new Error('never reached $6000 after re-entry'); }
console.log(`stopped at $6000 after ${stop.steps.toLocaleString()} more instructions`);

const snap = JSON.parse(await a2.ev(`(() => {
  const cpu = window.M.cpu;
  let s = '';
  for (let a = ${RAM_LO}; a < ${RAM_HI}; a++) s += String.fromCharCode(cpu.read(a));
  return JSON.stringify({ ram: btoa(s), cpu: cpu.getState() });
})()`));
const ram = Buffer.from(snap.ram, 'base64');
fs.mkdirSync('captured/snapshot', { recursive: true });
fs.writeFileSync('captured/snapshot/approach.bin', ram);
fs.writeFileSync('captured/snapshot/approach.json', JSON.stringify({
  lo: RAM_LO, hi: RAM_HI, pc: RENDER, cpu: snap.cpu,
  note: 'taken on the instruction at $6000 after RE ran, with a numbered planet loaded at $7300',
  planet: ram[0x9541], atmosphere: ram[0x9542],
}, null, 2) + '\n');

const w16 = (a) => s16(ram[a] | (ram[a + 1] << 8));
console.log(`\nwrote captured/snapshot/approach.bin (${ram.length} bytes)`);
console.log(`planet ${ram[0x9541]}, atmosphere ${ram[0x9542]}`);
console.log(`ship X=${w16(0x731b)} Y=${w16(0x731d)} Z=${w16(0x731f)} ` +
  `pitch=${ram[0x7321]} bank=${ram[0x7322]} heading=${ram[0x7323]}`);

// Is the planet file really there? Compare $7324 onwards with PLANET # n from the disk.
const pf = disk.read(disk.files.find((f) => f.name === `PLANET # ${ram[0x9541]}`));
let same = 0, n = 0;
for (let i = 36; i < pf.len; i++, n++) if (ram[0x7300 + i] === pf.data[i]) same++;
console.log(`$7324 onwards matches PLANET # ${ram[0x9541]} on the disk in ${same} of ${n} bytes`);
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
