// H/D lines 90-93, and whether the surrender point survives the jump.
//
//   26 POKE 38209, PEEK(38163)                       the destination becomes the current planet
//   90 TECH = PEEK(38282 + PEEK(38209)): IF TECH < 2 THEN POKE 38150,0
//   93 IF TECH > 1 THEN POKE 38150,TECH * 60: POKE 38204,TECH * 60: POKE 38160,0: POKE 38161,0
//
// Line 26 has already moved 38209, so TECH is the **destination's**. Jumping to a tech 2 planet
// should therefore leave 38150 at 120. A reading taken once before said 0, but it was taken
// after the simulator had resumed and so could not say whether 93 never ran, ran with a
// different TECH, or ran and was overwritten.
//
// This watches the bytes themselves through the whole jump, recording the PC and the Applesoft
// line at every change, so the answer does not depend on when anyone looked.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import fs from 'fs';

const disk = openDisk(DISK);
const textOf = (name) => {
  const r = disk.read(disk.files.find((f) => f.name === name));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => `${l.num} ${l.text}`).join('\n');
};
const SIM = textOf('STARSHIP SIMULATOR');
const HD = textOf('H/D');

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
const waitFor = async (w, label, tries = 700) => {
  for (let i = 0; i < tries; i++) { await a2.frames(20); if ((await loaded()) === w) return true; }
  console.log('  ' + label + ' never started');
  return false;
};

console.log('waiting for STARSHIP SIMULATOR...');
if (!await waitFor(SIM, 'STARSHIP SIMULATOR')) { await a2.close(); throw new Error('no simulator'); }
await a2.frames(300);

// A planet whose tech is over 1, so 93 is the branch taken. Line 1 wants the ship out of
// atmosphere, the destination set, and the destination not where the ship already is.
const techOf = await a2.readRange(0x9500, 0x9600);
// `DEST=5 node probe_hdjump.mjs` aims at a particular planet; otherwise the first one whose
// tech is over 1, so that 93 is the branch taken.
const dest = process.env.DEST
  ? Number(process.env.DEST)
  : [...Array(21).keys()].find((p) => p > 0 && techOf[38282 + p - 0x9500] > 1);
if (dest === undefined) { await a2.close(); throw new Error('no planet with tech over 1'); }
console.log('  planet techs: ' + [...Array(21).keys()]
  .map((p) => `${p}:${techOf[38282 + p - 0x9500]}`).join(' '));
const destTech = techOf[38282 + dest - 0x9500];
console.log(`  jumping to planet ${dest}, whose tech is ${destTech}` +
  ` - so 93 should leave 38150 and 38204 at ${destTech * 60}`);
await a2.ev(`(() => {
  const M = window.M;
  M.wr(38163, ${dest});
  M.wr(38209, ${dest === 1 ? 2 : 1});
  M.wr(38210, 0);
  M.wr(38199, 63);
  M.wr(38150, 77);           // markers, so "never written" is visible as 77
  M.wr(38204, 77);
  M.wr(38152, 77);
  M.wr(38161, 77);
  return 'w';
})()`);
await a2.frames(30);
await a2.key('H');
if (!await waitFor(HD, 'H/D', 400)) { await a2.close(); throw new Error('H/D never started'); }
console.log('  H/D is running');

// 38152 is the enemy-damage counter 1540 and 1560 use; 38161 is in the list because 93
// pokes it and nothing on the disk ever reads it.
const WATCH = [38150, 38204, 38160, 38161, 38209, 38152];
const r = JSON.parse(await a2.ev(`(() => {
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
  const was = watch.map((a) => cpu.read(a));
  const out = [];
  for (let n = 0; n < 500000000 && out.length < 60; n++) {
    tick();
    for (let i = 0; i < watch.length; i++) {
      const v = cpu.read(watch[i]);
      if (v === was[i]) continue;
      out.push({ addr: watch[i], from: was[i], to: v, pc: cpu.getPC(),
        line: cpu.read(0x75) | (cpu.read(0x76) << 8) });
      was[i] = v;
    }
  }
  return JSON.stringify({ out, now: watch.map((a) => cpu.read(a)) });
})()`));

const after = await loaded();
const where = after === SIM ? 'STARSHIP SIMULATOR' : (after === HD ? 'H/D' : 'something else');
console.log('');
console.log(`  ${r.out.length} change(s) while the jump ran; now in ${where}`);
for (const w of r.out) {
  console.log(`    ${w.addr} ${String(w.from).padStart(4)} -> ${String(w.to).padStart(4)}` +
    `   line ${String(w.line).padStart(5)}   PC $${w.pc.toString(16).toUpperCase()}`);
}
const finals = {};
WATCH.forEach((a, i) => { finals[a] = r.now[i]; });
console.log('');
console.log(`  38150 is now ${finals[38150]}, 38204 ${finals[38204]},` +
  ` 38160 ${finals[38160]}, 38161 ${finals[38161]}, 38209 ${finals[38209]},` +
  ` 38152 ${finals[38152]}`);
const want = destTech * 60;
console.log(finals[38150] === want
  ? `  38150 is ${want}, which is TECH * 60 - line 93 ran and held`
  : `  38150 is ${finals[38150]}, not the ${want} line 93 should have left`);

await a2.close();
fs.mkdirSync('captured/hdjump', { recursive: true });
fs.writeFileSync('captured/hdjump/golden.json', JSON.stringify({
  source: 'every change to 38150, 38204, 38160, 38161 and 38209 across an H/D jump, with the line and PC',
  dest, destTech, changes: r.out, finals,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/hdjump/golden.json');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
