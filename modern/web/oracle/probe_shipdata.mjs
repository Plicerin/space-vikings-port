// Where a new game's ship state comes from.
//
// 38199 reads 63 on a fresh ship and no BASIC program pokes it, so the value had to arrive with
// a BLOAD. It does: **START line 2020, `BLOAD SHIP'S DATA-M,A$9506`** - 54 bytes covering
// $9506-$953B, which is 38150 to 38203. The byte at 38199 in that file is 63.
//
// That is not one value, it is the whole opening ship: every weapon count, every system's
// health, the loot, the morale and the mode flags are those 54 bytes. START 2020 loads the
// master copy for a new game; 3020 loads `SHIP'S DATA` instead, the saved one, which is not on
// this disk - so a fresh image always starts from the master.
//
// This dumps the file beside the same range read out of a freshly booted machine, so anything
// that changes between the BLOAD and the first frame shows up rather than being assumed away.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import fs from 'fs';

/** What this project has established these addresses mean, from DISK_TRUTH and the port. */
const NAMES = {
  38150: 'planet vitality limit (surrender point)',
  38151: 'chain flag - COM 115 and GROUND FORCES read it',
  38152: 'enemy damage, DP is built from it',
  38153: 'missiles in store (SHORE LEAVE 3000 MU 30)',
  38154: 'tanks (MU 40)',
  38155: 'transports (MU 75)',
  38156: 'fighters (MU 50)',
  38157: 'speed',
  38158: 'the planet the troops are on',
  38160: 'VP, the assault progress',
  38163: 'hyperdrive destination',
  38164: 'paddle/auto flag - line 15 reads it',
  38165: 'condition: 1 green, 2 blue, 3 red',
  38166: 'troop location - GROUND FORCES 177 sets it',
  38171: 'art works', 38172: 'wine', 38173: 'luxury food', 38174: 'fighter parts',
  38175: 'weapons', 38176: 'electronics', 38177: 'fissionables', 38178: 'steel',
  38179: 'collapsium', 38180: 'titanium', 38181: 'platinum', 38182: 'silver', 38183: 'gold',
  38184: 'nav. comp.',
  38186: 'laser',
  38187: 'missiles aboard',
  38190: 'hyperdrive',
  38193: 'hull',
  38194: 'env. control',
  38195: 'radar',
  38196: 'computer',
  38197: 'engine 2',
  38198: 'engine 1',
  38199: 'ENERGY - the byte this was about',
  38200: 'shields',
  38201: 'shields on',
  38202: 'missile mode - 1 diverts the fire button to 1000',
  38203: 'morale',
};

const disk = openDisk(DISK);
const file = disk.read(disk.files.find((f) => f.name.trim() === "SHIP'S DATA-M"));
const BASE = 0x9506;
console.log(`SHIP'S DATA-M: ${file.len} bytes, BLOADed to $${BASE.toString(16).toUpperCase()}` +
  ` - ${BASE} to ${BASE + file.len - 1}`);
console.log('');

const textOf = (name) => {
  const r = disk.read(disk.files.find((f) => f.name === name));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => `${l.num} ${l.text}`).join('\n');
};
const SIM = textOf('STARSHIP SIMULATOR');

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
console.log('booting a fresh game to read the same range back...');
let ok = false;
for (let i = 0; i < 700; i++) { await a2.frames(20); if ((await loaded()) === SIM) { ok = true; break; } }
if (!ok) { await a2.close(); throw new Error('no simulator'); }
await a2.frames(200);
const live = await a2.readRange(BASE, BASE + file.len);
await a2.close();

console.log('  addr   byte   live   what it is');
const rows = [];
let differ = 0;
for (let i = 0; i < file.len; i++) {
  const addr = BASE + i;
  const onDisk = file.data[i];
  const inRam = live[i];
  const name = NAMES[addr] || '';
  if (onDisk !== inRam) differ++;
  rows.push({ addr, onDisk, inRam, name });
  console.log(`  ${addr}  ${String(onDisk).padStart(5)}  ${String(inRam).padStart(5)}` +
    `   ${name}${onDisk === inRam ? '' : '   <- changed since the BLOAD'}`);
}
console.log('');
console.log(`${file.len - differ} of ${file.len} bytes are still exactly what the file holds;` +
  ` ${differ} changed on the way to the first frame`);

// ---- and who changes the five ----------------------------------------------------------------
//
// No BASIC program pokes 38158, 38165, 38187, 38201 or 38202, and no other BLOAD overlaps
// $9506-$953B, so something in machine code is writing them. Rather than guess which binary,
// this watches the bytes themselves from the moment the BLOAD lands - 38199 going to 63 is the
// signal - and records the PC and the Applesoft line current at each change.
const WATCH = [38158, 38165, 38187, 38201, 38202];
const a2b = await openOracle();
await a2b.boot();
await a2b.key('N');
console.log('');
console.log('  second machine, watching the five from the moment SHIP\'S DATA-M lands...');
const writes = JSON.parse(await a2b.ev(`(() => {
  const M = window.M, cpu = M.cpu, mach = M.a2;
  const watch = ${JSON.stringify(WATCH)};
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
  // Wait for the BLOAD: the file's own signature at 38199 and 38155.
  let n = 0;
  for (; n < 400000000; n++) {
    if (cpu.read(38199) === 63 && cpu.read(38155) === 6 && cpu.read(38157) === 120) break;
    tick();
  }
  if (n >= 400000000) return JSON.stringify({ landed: false, out: [] });
  const was = watch.map((a) => cpu.read(a));
  const out = [];
  for (let k = 0; k < 300000000 && out.length < 40; k++) {
    tick();
    for (let i = 0; i < watch.length; i++) {
      const v = cpu.read(watch[i]);
      if (v === was[i]) continue;
      out.push({ addr: watch[i], from: was[i], to: v, pc: cpu.getPC(),
        line: cpu.read(0x75) | (cpu.read(0x76) << 8) });
      was[i] = v;
    }
  }
  return JSON.stringify({ landed: true, out });
})()`));
await a2b.close();
if (!writes.landed) {
  console.log('  the BLOAD never landed within the step budget');
} else {
  console.log(`  ${writes.out.length} change(s):`);
  for (const w of writes.out) {
    console.log(`    ${w.addr} ${String(w.from).padStart(4)} -> ${String(w.to).padStart(4)}` +
      `   PC $${w.pc.toString(16).toUpperCase()}   Applesoft line ${w.line}` +
      `   ${NAMES[w.addr] || ''}`);
  }
}

fs.mkdirSync('captured/shipdata', { recursive: true });
fs.writeFileSync('captured/shipdata/golden.json', JSON.stringify({
  source: "SHIP'S DATA-M as stored, beside the same range read from a freshly booted game",
  base: BASE, length: file.len, rows, writes: writes.out,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/shipdata/golden.json');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
