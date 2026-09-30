// Why a full-width PRINT loses its last character in one place and not the other.
//
// SUPPLY line 10 sets `POKE 32,1: POKE 33,39` - left margin 1, width 39 - and its clear leaves
// column 39 still showing the flood underneath. GROUND FORCES line 100 sets
// `POKE 32,0: POKE 33,40` and blanks all forty columns. Both windows end at column 39, so the
// left margin cannot be the whole story on its own, and the rule has been recorded from those
// two measurements without a mechanism behind it.
//
// Output goes through the HI-RES CHARACTER GENERATOR that START line 10 BLOADs to $9300. Which
// part of it runs is observed rather than guessed: the addresses actually executed during a
// real PRINT are collected first, and only those are disassembled as code. Then the behaviour
// is measured over a grid of (left margin, width, characters printed), through `$FDED` so the
// path is the one BASIC uses.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import { disasmRange } from './disasm6502.mjs';
import { decodeHgr, HGR_W } from './hgr.mjs';
import fs from 'fs';

const disk = openDisk(DISK);
const textOf = (name) => {
  const r = disk.read(disk.files.find((f) => f.name === name));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => `${l.num} ${l.text}`).join('\n');
};
const SIM = textOf('STARSHIP SIMULATOR');
const COM = textOf('COM');

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
  for (let i = 0; i < 700; i++) { await a2.frames(20); if ((await loaded()) === w) return true; }
  console.log('  ' + label + ' never started');
  return false;
};

console.log('waiting for STARSHIP SIMULATOR...');
if (!await waitFor(SIM, 'STARSHIP SIMULATOR')) { await a2.close(); throw new Error('no simulator'); }
await a2.frames(200);

const vec = await a2.readRange(0x3CC, 0x3D2);
const cswl = await a2.readRange(0x36, 0x38);
console.log('');
console.log(`  $3CC-$3D1: ${[...vec].map((b) => '$' + b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}` +
  `   (974 = $3CE holds $${vec[2].toString(16).toUpperCase()})`);
console.log(`  CSW ($36/$37) = $${((cswl[1] << 8) | cswl[0]).toString(16).toUpperCase()}` +
  `  - DOS 3.3's own output hook, which passes on to whatever it was chained to`);

// ---- what actually runs during a PRINT -------------------------------------------------------
// COM's menu is a screenful of text, so stepping into it collects the generator's real path.
await a2.key('C');
const seen = JSON.parse(await a2.ev(`(() => {
  const M = window.M, cpu = M.cpu, mach = M.a2;
  const hit = new Set();
  const entries = {};
  let cyc = 0, prevIn = false;
  for (let n = 0; n < 40000000; n++) {
    const pc = cpu.getPC();
    const inGen = pc >= 0x9300 && pc < 0x9400;
    if (inGen) {
      hit.add(pc);
      if (!prevIn) entries[pc] = (entries[pc] || 0) + 1;   // first instruction of each visit
    }
    prevIn = inGen;
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
  }
  return JSON.stringify({ hit: [...hit].sort((a, b) => a - b), entries });
})()`));
console.log('');
console.log(`  ${seen.hit.length} of the generator's 256 bytes were executed during COM's menu`);
const entries = Object.entries(seen.entries).map(([a, n]) => [Number(a), n])
  .sort((x, y) => y[1] - x[1]);
console.log('  entered at: ' + entries.slice(0, 6)
  .map(([a, n]) => `$${a.toString(16).toUpperCase()} x${n}`).join(', '));

const gen = await a2.readRange(0x9300, 0x9400);
const mem = {};
for (let i = 0; i < gen.length; i++) mem[0x9300 + i] = gen[i];
const SYM = {
  0x20: 'WNDLFT', 0x21: 'WNDWDTH', 0x22: 'WNDTOP', 0x23: 'WNDBTM',
  0x24: 'CH', 0x25: 'CV', 0x3CE: 'FLAG974', 0x8800: 'CHAR_TABLE',
};
const codeSet = new Set(seen.hit);
const lines = disasmRange(mem, 0x9300, 0x9400, { sym: SYM, code: codeSet });
fs.mkdirSync('captured/printmargin', { recursive: true });
fs.writeFileSync('captured/printmargin/chargen.asm',
  lines.map((l) => `${l.addr.toString(16).toUpperCase()}  ${l.text}`).join('\n') + '\n');
console.log(`  wrote captured/printmargin/chargen.asm`);
console.log('');
console.log('  the lines that touch CH, WNDWDTH or WNDLFT:');
for (const l of lines) {
  if (/WNDLFT|WNDWDTH|CH\b/.test(l.text)) {
    console.log(`    $${l.addr.toString(16).toUpperCase()}  ${l.text}`);
  }
}

// ---- and what it does, over a grid --------------------------------------------------------
const COLS = 40;
/** Print `n` spaces into the given window and report which columns lost the flood. */
const trial = async (left, width, n) => {
  const r = JSON.parse(await a2.ev(`(() => {
    const cpu = window.M.cpu;
    for (let a = 0x2000; a < 0x4000; a++) cpu.write(a, 0x7F);
    cpu.write(0x20, ${left}); cpu.write(0x21, ${width});
    cpu.write(0x22, 0); cpu.write(0x23, 24);
    // HOME leaves CH at the left margin, so start where the game starts
    cpu.write(0x24, ${left}); cpu.write(0x25, 0);
    // LDA #$A0 / JSR $FDED, n times, then a JMP to itself to stop on
    const P = 0x0300;
    let p = P;
    for (let i = 0; i < ${n}; i++) {
      cpu.write(p++, 0xA9); cpu.write(p++, 0xA0);
      cpu.write(p++, 0x20); cpu.write(p++, 0xED); cpu.write(p++, 0xFD);
    }
    const stop = p;
    cpu.write(p, 0x4C); cpu.write(p + 1, stop & 0xff); cpu.write(p + 2, (stop >> 8) & 0xff);
    const st = cpu.getState();
    st.pc = P; st.sp = 0xF0;
    cpu.setState(st);
    let steps = 0;
    while (cpu.getPC() !== stop && steps < 8000000) { cpu.stepCycles(1); steps++; }
    return JSON.stringify({ ran: cpu.getPC() === stop, ch: cpu.read(0x24), cv: cpu.read(0x25) });
  })()`));
  const on = decodeHgr(await a2.readRange(0x2000, 0x4000));
  const written = [];
  for (let c = 0; c < COLS; c++) {
    let lit = 0;
    for (let x = c * 7; x < c * 7 + 7 && x < HGR_W; x++) if (on[x]) lit++;
    if (lit < 7) written.push(c);          // the flood is every pixel on; a blank cell is not
  }
  return { written, ...r };
};

console.log('');
console.log('  spaces printed into a window, and which columns lost the flood:');
console.log('   left width   n   usable   columns   first..last   CH after');
const grid = [];
for (const [left, width] of [[0, 40], [1, 39], [0, 39], [1, 38], [2, 38], [0, 20], [1, 20], [5, 30]]) {
  for (const n of [width, width - 1]) {
    const t = await trial(left, width, n);
    const w = t.written;
    const first = w.length ? w[0] : null;
    const last = w.length ? w[w.length - 1] : null;
    grid.push({ left, width, n, count: w.length, first, last, ch: t.ch, cv: t.cv });
    // if CH is an absolute column that wraps at WNDWDTH, the window holds WNDWDTH - left
    // columns and anything beyond that wraps back onto the left margin
    const usable = width - left;
    const expected = left + Math.min(n, usable) - 1;
    console.log(`   ${String(left).padStart(4)} ${String(width).padStart(5)} ${String(n).padStart(3)}` +
      `   ${String(usable).padStart(6)}   ${String(w.length).padStart(7)}` +
      `   ${first === null ? '  -  ' : String(first).padStart(2) + '..' + String(last).padStart(2)}` +
      `        ${String(t.ch).padStart(3)}` +
      `${last === expected ? '' : `   <- expected last ${expected}`}`);
  }
}

await a2.close();
fs.writeFileSync('captured/printmargin/grid.json', JSON.stringify({
  source: 'spaces pushed through $FDED into a flooded hi-res page 1, per window setting',
  grid,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/printmargin/grid.json');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
