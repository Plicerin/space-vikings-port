// What whitens the page before S/X cuts the death burst out of it.
//
// S/X line 5 listed as `HCOLOR= 0: Y1 = 20: POKE 973,255: PRINT ""` and the page came back
// white, which looked like an empty inverse PRINT doing something remarkable. It is not.
//
// The listing was lying. The line's bytes end `BA 22 0C 22` - `PRINT "<$0C>"`, a **form feed**
// inside the quotes. `detokenise.mjs` emitted control characters as themselves, which is
// invisible in a terminal, so the string read as empty. It now writes them in caret notation
// and the line reads `PRINT "^L"`. Line 3 is the same shape: `PRINT "^DBLOAD EXPL"`, the Ctrl-D
// that starts every DOS command.
//
// So the mechanism is: 973 ($3CD) is the generator's inverse flag, a form feed clears the
// screen, and clearing while inverse writes a white cell into all 40x24 of it.
//
// Two machines. The first pushes single characters through `$FDED` onto a seeded page, which
// needs the PC hijacked and so leaves the game unrunnable; the second is booted fresh to watch
// the real S/X.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import { disasmRange } from './disasm6502.mjs';
import { decodeHgr, HGR_W, HGR_H } from './hgr.mjs';
import fs from 'fs';

const disk = openDisk(DISK);
const textOf = (name) => {
  const r = disk.read(disk.files.find((f) => f.name === name));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => `${l.num} ${l.text}`).join('\n');
};
const SIM = textOf('STARSHIP SIMULATOR');
const SX = textOf('S/X');
const HD = textOf('H/D');

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
const waitFor = async (w, label, tries = 700) => {
  for (let i = 0; i < tries; i++) { await a2.frames(20); if ((await loaded()) === w) return true; }
  console.log('  ' + label + ' never started');
  return false;
};

console.log('waiting for STARSHIP SIMULATOR...');
if (!await waitFor(SIM, 'STARSHIP SIMULATOR')) { await a2.close(); throw new Error('no simulator'); }
await a2.frames(300);

const lit = (on) => { let n = 0; for (let i = 0; i < on.length; i++) if (on[i]) n++; return n; };
const solidRows = (on) => {
  let rows = 0;
  for (let y = 0; y < HGR_H; y++) {
    let all = true;
    for (let x = 0; x < HGR_W; x++) if (!on[y * HGR_W + x]) { all = false; break; }
    if (all) rows++;
  }
  return rows;
};

// ---- one character at a time, onto a seeded page ---------------------------------------------
const send = async (ch, { inverse, chPos, cvPos, trace = false }) => {
  const r = JSON.parse(await a2.ev(`(() => {
    const cpu = window.M.cpu;
    // a sparse pattern, so a fill shows whether it lights the page or clears it
    for (let a = 0x2000; a < 0x4000; a++) cpu.write(a, (a & 3) === 0 ? 0x15 : 0x00);
    cpu.write(0x3CD, ${inverse ? 255 : 0});
    cpu.write(0x3CE, 32);
    cpu.write(0x20, 0); cpu.write(0x21, 40); cpu.write(0x22, 0); cpu.write(0x23, 24);
    cpu.write(0x24, ${chPos}); cpu.write(0x25, ${cvPos});
    const P = 0x0300;
    cpu.write(P, 0xA9); cpu.write(P + 1, ${ch});
    cpu.write(P + 2, 0x20); cpu.write(P + 3, 0xED); cpu.write(P + 4, 0xFD);
    const stop = P + 5;
    cpu.write(stop, 0x4C); cpu.write(stop + 1, stop & 0xff); cpu.write(stop + 2, (stop >> 8) & 0xff);
    const st = cpu.getState();
    st.pc = P; st.sp = 0xF0;
    cpu.setState(st);
    const hit = ${trace ? 'new Set()' : 'null'};
    let steps = 0;
    while (cpu.getPC() !== stop && steps < 8000000) {
      ${trace ? 'const pc = cpu.getPC(); if (pc >= 0x9300 && pc < 0x9400) hit.add(pc);' : ''}
      cpu.stepCycles(1); steps++;
    }
    return JSON.stringify({ ch: cpu.read(0x24), cv: cpu.read(0x25),
      hit: hit ? [...hit].sort((a, b) => a - b) : null });
  })()`));
  const on = decodeHgr(await a2.readRange(0x2000, 0x4000));
  return { ...r, lit: lit(on), solid: solidRows(on) };
};

console.log('');
console.log('  one character through $FDED onto a page seeded at 5760 lit:');
console.log('  char                  inverse   pixels lit   solid rows   CH,CV after');
const rows = [];
for (const [name, code] of [['CR        ($8D)', 0x8D], ['form feed ($8C)', 0x8C],
  ['space     ($A0)', 0xA0], ['"A"       ($C1)', 0xC1]]) {
  for (const inverse of [false, true]) {
    const r = await send(code, { inverse, chPos: 0, cvPos: 0 });
    rows.push({ char: name, inverse, lit: r.lit, solid: r.solid, ch: r.ch, cv: r.cv });
    console.log(`  ${name.padEnd(20)} ${String(inverse).padEnd(8)} ${String(r.lit).padStart(9)}` +
      `   ${String(r.solid).padStart(10)}      ${r.ch},${r.cv}`);
  }
}

// ---- and the code a form feed runs ------------------------------------------------------------
const tracedFF = await send(0x8C, { inverse: true, chPos: 0, cvPos: 0, trace: true });
const tracedCR = await send(0x8D, { inverse: true, chPos: 0, cvPos: 0, trace: true });
console.log('');
console.log(`  an inverse form feed executes ${tracedFF.hit.length} distinct bytes of the` +
  ` generator; a carriage return, ${tracedCR.hit.length}`);
const gen = await a2.readRange(0x9300, 0x9400);
const mem = {};
for (let i = 0; i < gen.length; i++) mem[0x9300 + i] = gen[i];
const SYM = {
  0x20: 'WNDLFT', 0x21: 'WNDWDTH', 0x22: 'WNDTOP', 0x23: 'WNDBTM',
  0x24: 'CH', 0x25: 'CV', 0x3CD: 'INVFLAG', 0x3CE: 'FLAG974', 0x8800: 'CHAR_TABLE',
};
const ffLines = disasmRange(mem, 0x9300, 0x9400, { sym: SYM, code: new Set(tracedFF.hit) });
fs.mkdirSync('captured/inverseprint', { recursive: true });
fs.writeFileSync('captured/inverseprint/formfeed.asm',
  ffLines.map((l) => `${l.addr.toString(16).toUpperCase()}  ${l.text}`)
    .join(String.fromCharCode(10)) + String.fromCharCode(10));
console.log('  wrote captured/inverseprint/formfeed.asm');
console.log('  the dispatch the two take:');
for (const l of ffLines) {
  if (l.addr >= 0x933C && l.addr <= 0x9360 && tracedFF.hit.includes(l.addr)) {
    console.log(`    $${l.addr.toString(16).toUpperCase()}  ${l.text}`);
  }
}

// ---- the real S/X, on a machine whose PC has not been hijacked --------------------------------
await a2.close();
a2 = await openOracle();
await a2.boot();
await a2.key('N');
console.log('');
console.log('  second machine, for the real S/X...');
if (!await waitFor(SIM, 'STARSHIP SIMULATOR (second machine)')) {
  await a2.close(); throw new Error('no simulator on the second machine');
}
await a2.frames(300);
// H/D line 2 finds the energy at 0 and goes to line 3, which runs S/X.
await a2.ev(`(() => { window.M.wr(38163, 5); window.M.wr(38199, 0); return 'w'; })()`);
await a2.frames(20);
await a2.key('H');
const gotHd = await waitFor(HD, 'H/D', 400);
const gotSx = await waitFor(SX, 'S/X', 600);
console.log(`  H/D ${gotHd ? 'ran' : 'did not run'}, S/X ${gotSx ? 'is running' : 'did not run'}`);

let sxChars = [];
let afterLine5 = null;
if (gotSx) {
  const onEntry = decodeHgr(await a2.readRange(0x2000, 0x4000));
  console.log(`  on entry to S/X: ${lit(onEntry)} pixels lit, ${solidRows(onEntry)} solid rows`);

  const chars = JSON.parse(await a2.ev(`(() => {
    const M = window.M, cpu = M.cpu, mach = M.a2;
    const line = () => cpu.read(0x75) | (cpu.read(0x76) << 8);
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
    for (let n = 0; n < 30000000 && line() !== 5; n++) tick();
    if (line() !== 5) return JSON.stringify({ reached: false, calls: [] });
    const calls = [];
    for (let n = 0; n < 30000000; n++) {
      if (cpu.getPC() === 0x933C && calls.length < 50) {
        const st = cpu.getState();
        calls.push({ a: st.a, ch: cpu.read(0x24), cv: cpu.read(0x25), inv: cpu.read(0x3CD),
          page0: cpu.read(0x2000) });
      }
      tick();
      if (line() !== 5) break;
    }
    return JSON.stringify({ reached: true, calls });
  })()`));
  sxChars = chars.calls;
  const after = decodeHgr(await a2.readRange(0x2000, 0x4000));
  afterLine5 = { lit: lit(after), solid: solidRows(after) };
  console.log('');
  console.log(`  line 5 handed the generator ${sxChars.length} character(s):`);
  for (const c of sxChars) {
    console.log(`    A=$${c.a.toString(16).toUpperCase().padStart(2, '0')}` +
      `  CH=${c.ch} CV=${c.cv}  $3CD=${c.inv}` +
      `  $2000 was $${c.page0.toString(16).padStart(2, '0').toUpperCase()}`);
  }
  console.log(`  after line 5: ${afterLine5.lit} pixels lit, ${afterLine5.solid} of 192 rows solid`);
}

await a2.close();
fs.writeFileSync('captured/inverseprint/grid.json', JSON.stringify({
  source: 'single characters through $FDED onto a seeded page, and the real S/X line 5',
  rows, sxChars, afterLine5,
  formFeedBytes: tracedFF.hit, carriageReturnBytes: tracedCR.hit,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/inverseprint/grid.json');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
