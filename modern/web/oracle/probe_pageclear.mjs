// Does anything clear a hi-res page before the renderer draws into it?
//
// `$6DD5`'s off-page wrap puts two bytes into hi-res page 1 for any line with an endpoint at
// `sy` 96 - `oracle/probe_line6dd5wrap.mjs` measured 11 of the 370 sweep pairs doing it, at
// `$20xx` and `$3Bxx`. Whether that is ever *seen* depends on what happens to those bytes next:
//
//   147 POKE 29461,84 + OO: OP = ABS(OO - 1): POKE 29463,OP: POKE 29465,OP
//   150 CALL CA                                            ; CA = 36899 = $9023
//
// `29461` is `$7315` and 84/85 are the low bytes of the PAGE1/PAGE2 soft switches, so the
// displayed page alternates with `OO`. If the page being drawn into is cleared first, a stray
// byte written last frame is gone before anyone looks at it; if not, it stays.
//
// So: plant markers where the strays land, run the game, and watch them. No reasoning about
// what `$9023` might do - just whether the bytes survive.
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

// The two page-1 addresses the wrap was measured writing to, plus a control in each page that
// the picture is unlikely to touch.
const MARKS = [0x2004, 0x3B84, 0x2018, 0x3B98, 0x4004, 0x5F00];
const MARK = 0xAA;

console.log('');
console.log('  planting $AA at ' + MARKS.map((a) => '$' + a.toString(16).toUpperCase()).join(' '));
const r = JSON.parse(await a2.ev(`(() => {
  const M = window.M, cpu = M.cpu, mach = M.a2;
  const marks = ${JSON.stringify(MARKS)};
  for (const a of marks) cpu.write(a, ${MARK});
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
  // One sample per entry to $9023, which line 150 calls once a pass, for a dozen passes.
  const samples = [];
  let last = -1;
  for (let n = 0; n < 200000000 && samples.length < 12; n++) {
    if (cpu.getPC() === 0x9023 && n !== last) {
      last = n;
      samples.push({
        n,
        marks: marks.map((a) => cpu.read(a)),
        // $7315 is the displayed page's soft-switch low byte: $54 is page 1, $55 page 2
        page: cpu.read(0x7315),
        p7317: cpu.read(0x7317), p7319: cpu.read(0x7319),
      });
    }
    tick();
  }
  return JSON.stringify({ samples });
})()`));
await a2.close();

console.log('');
console.log('  at each call to $9023:');
console.log('   $7315  $7317 $7319   ' + MARKS.map((a) => '$' + a.toString(16).toUpperCase().padStart(4, '0')).join('  '));
for (const s of r.samples) {
  console.log(`   $${s.page.toString(16).toUpperCase()}      ${s.p7317}     ${s.p7319}     ` +
    s.marks.map((v) => ('$' + v.toString(16).toUpperCase().padStart(2, '0')).padStart(5)).join(' '));
}

const survived = MARKS.map((a, i) => r.samples.every((s) => s.marks[i] === MARK));
console.log('');
MARKS.forEach((a, i) => {
  const first = r.samples.findIndex((s) => s.marks[i] !== MARK);
  console.log(`  $${a.toString(16).toUpperCase()}: ` +
    (survived[i] ? 'still $AA at every sample - nothing cleared it'
      : `changed by sample ${first} (to $${r.samples[first].marks[i].toString(16).toUpperCase()})`));
});
const pageOneSurvives = survived[0] && survived[1] && survived[2] && survived[3];
console.log('');
console.log(pageOneSurvives
  ? '  page 1 is not cleared between frames, so a byte the wrap leaves there stays'
  : "  page 1 is cleared or drawn over, so the wrap's strays do not survive to be seen");

fs.mkdirSync('captured/pageclear', { recursive: true });
fs.writeFileSync('captured/pageclear/golden.json', JSON.stringify({
  source: 'markers planted in both hi-res pages and read at each entry to $9023 during flight',
  marks: MARKS, samples: r.samples,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/pageclear/golden.json');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
