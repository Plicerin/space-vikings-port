// Is COLLECT's "already collected this trip" flag safe where it lives?
//
// COLLECT keeps it in 301, and `301` is `$012D` - inside the 6502 stack page, which runs
// $0100-$01FF and grows down from $01FF. So the flag sits 210 bytes down the stack, and any
// nesting deep enough to push the stack pointer below $2D writes over it. H/D line 5 pokes it
// back to 0 on a jump and COLLECT 921 pokes it to 1, but in between it is exposed.
//
// Whether that ever actually happens is a measurement, not an argument: this runs a full
// assault into COLLECT and samples the stack pointer, reporting how close it comes.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';

const disk = openDisk(DISK);
const textOf = (name) => {
  const r = disk.read(disk.files.find((f) => f.name === name));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => `${l.num} ${l.text}`).join('\n');
};
const SIM = textOf('STARSHIP SIMULATOR');
const COM = textOf('COM');
const GF = textOf('GROUND FORCES');

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
const waitFor = async (w, label) => {
  for (let i = 0; i < 600; i++) { await a2.frames(20); if ((await loaded()) === w) return true; }
  console.log('  ' + label + ' never started');
  return false;
};

console.log('waiting for STARSHIP SIMULATOR...');
if (!await waitFor(SIM, 'STARSHIP SIMULATOR')) { await a2.close(); throw new Error('no simulator'); }
await a2.frames(200);
await a2.key('C');
if (!await waitFor(COM, 'COM')) { await a2.close(); throw new Error('no COM'); }
await a2.key('2');
if (!await waitFor(GF, 'GROUND FORCES')) { await a2.close(); throw new Error('no GROUND FORCES'); }
for (let i = 0; i < 30; i++) await a2.frames(20);

const planet = await a2.read(38209);
await a2.ev(`(() => {
  const w = window.M.wr;
  w(38158, ${planet}); w(38150, 2); w(38160, 0); w(38208, 0); w(38203, 6);
  w(38151, 0); w(38205, 3); w(38206, 100); w(301, 0);
  return 'w';
})()`);
await a2.frames(20);
await a2.key('1');

// Sample the stack pointer as the assault and COLLECT run. Sampling rather than every
// instruction because a deep-stack episode lasts thousands of instructions, so it cannot hide
// between samples; and record every distinct value 301 takes, with where it was written from.
const r = JSON.parse(await a2.ev(`(() => {
  const cpu = window.M.cpu;
  let minSp = 0xff, n = 0;
  let last = cpu.read(301);
  const changes = [];
  while (n < 80000000) {
    if ((n & 0xff) === 0) {
      const sp = cpu.getState().sp;
      if (sp < minSp) minSp = sp;
    }
    const v = cpu.read(301);
    if (v !== last) { if (changes.length < 40) changes.push({ from: last, to: v, pc: cpu.getPC() }); last = v; }
    cpu.stepCycles(1);
    n++;
  }
  return JSON.stringify({ minSp, steps: n, changes, final: cpu.read(301) });
})()`));
await a2.close();

console.log('');
console.log(`over ${r.steps.toLocaleString()} instructions the stack pointer got down to ` +
  `$${r.minSp.toString(16).toUpperCase()}, i.e. $01${r.minSp.toString(16).toUpperCase()}`);
console.log(`301 is $012D, so the stack came within ${r.minSp - 0x2d} bytes of it` +
  (r.minSp <= 0x2d ? ' - IT REACHED THE FLAG' : ' - it never reached the flag'));
console.log('');
console.log(`301 changed ${r.changes.length} time(s):`);
for (const c of r.changes) {
  console.log(`  ${c.from} -> ${c.to} at PC $${c.pc.toString(16).toUpperCase()}`);
}
console.log(`  and ended at ${r.final}`);
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
