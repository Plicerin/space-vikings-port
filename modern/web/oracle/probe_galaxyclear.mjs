// GALAXY MAP line 3000's form feed - the second one on the disk.
//
// `probe_controlchars.mjs` swept every Applesoft program for control characters hidden inside
// strings. Of the 161 it found, 159 are the Ctrl-D that opens a DOS command and say nothing.
// The other two are form feeds: S/X line 5, already run down, and this one -
//
//   3000 POKE 32,0: POKE 33,39: POKE 34,19: POKE 35,23: PRINT "^L": HTAB 1: VTAB 20
//
// which listed as `PRINT ""` until the detokeniser started showing control characters.
//
// Two things to settle. The generator's form feed fills from the base of the page and ignores
// the window entirely, so setting a window on the line before cannot narrow it - the whole page
// goes. And the byte it fills with is `$FF` when 973 is 255 and `$00` when it is not, and
// GALAXY MAP never sets 973 on this path: its own 10000/10010 pair is dead code. So whether the
// map is cleared to black or to white depends on what the program before it left behind.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import { decodeHgr, HGR_W, HGR_H } from './hgr.mjs';
import fs from 'fs';

const disk = openDisk(DISK);
const textOf = (name) => {
  const r = disk.read(disk.files.find((f) => f.name === name));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => `${l.num} ${l.text}`).join('\n');
};
const SIM = textOf('STARSHIP SIMULATOR');
const COM = textOf('COM');
const GMAP = textOf('GALAXY MAP');

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

console.log('waiting for STARSHIP SIMULATOR...');
if (!await waitFor(SIM, 'STARSHIP SIMULATOR')) { await a2.close(); throw new Error('no simulator'); }
await a2.frames(300);

await a2.key('C');
if (!await waitFor(COM, 'COM')) { await a2.close(); throw new Error('no COM'); }
// COM line 120's COMMAND? menu, option 1 for the central computer; then line 260's READY
// prompt, where 265 is `IF C = 3 THEN GOSUB 3000` and 3000 runs GALAXY MAP. The submenu is
// drawn through the character generator a cell at a time, so it needs a moment.
// waitFor returns as soon as COM's program is in memory, which is before line 120 has drawn
// its menu and reached the GET - a key pressed then is simply dropped. Settle first.
for (let i = 0; i < 30; i++) await a2.frames(20);
await a2.key('1');
for (let i = 0; i < 30; i++) await a2.frames(20);
await a2.key('3');
// The recording starts here, while COM is still up. Line 3000 ends with `HTAB 1: VTAB 20`, so
// CURLIN sits at 3000 for a while after the PRINT has already gone - waiting for line 3000 and
// only then watching catches the trailing carriage return and misses the form feed entirely.
console.log('  pressed 3; recording from here, through the load and into GALAXY MAP');

// Step until line 3000 is current, read the state it is about to clear with, then step through
// the form feed and see what the page became.
const r = JSON.parse(await a2.ev(`(() => {
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
  // Record every character the generator is handed, with the line that sent it, from wherever
  // the program currently is. Waiting for line 3000 and only then starting to watch misses the
  // form feed when 3000 is already the current line - which is how the first run of this saw
  // the trailing carriage return and nothing else.
  const chars = [];
  let before = null;
  let sawFormFeed = false;
  for (let n = 0; n < 90000000; n++) {
    const ln = line();
    if (ln === 3000 && before === null) {
      before = { inv: cpu.read(0x3CD), page: cpu.read(0x3CE),
        wnd: [cpu.read(0x20), cpu.read(0x21), cpu.read(0x22), cpu.read(0x23)] };
    }
    if (cpu.getPC() === 0x933C && chars.length < 40) {
      const st = cpu.getState();
      chars.push({ a: st.a, line: ln, inv: cpu.read(0x3CD), page: cpu.read(0x3CE) });
      if (st.a === 0x8C) {
        sawFormFeed = true;
        if (before === null) {
          before = { inv: cpu.read(0x3CD), page: cpu.read(0x3CE),
            wnd: [cpu.read(0x20), cpu.read(0x21), cpu.read(0x22), cpu.read(0x23)] };
        }
        // the fill is 8192 x (STA/INY/BNE); 40000 instructions clears it without
        // running far enough into line 3010's border to muddy the count
        for (let k = 0; k < 40000; k++) tick();
        return JSON.stringify({ reached: true, before, chars, sawFormFeed,
          stopped: 'just after the form feed' });
      }
    }
    tick();
  }
  return JSON.stringify({ reached: before !== null, before, chars, sawFormFeed, stopped: 'ran out' });
})()`));

const nowIn = (await loaded()) === GMAP;
console.log(`  GALAXY MAP ${nowIn ? 'is running' : 'is not the loaded program'}`);
console.log('');
if (!r.reached) {
  console.log('  never reached line 3000');
} else {
  // COM has a line 3000 of its own - `PRINT " ": PRINT "^DRUN GALAXY MAP"` - so the line
  // number alone does not say which program is running, and the first snapshot taken at
  // "line 3000" was COM's. The form feed's own record is the one that means anything.
  const ff = r.chars.find((c) => c.a === 0x8C);
  console.log(`  the form feed itself: 973 = ${ff ? ff.inv : '?'}, 974 = ${ff ? ff.page : '?'}` +
    `${ff ? ` (page $${(ff.page << 8).toString(16).toUpperCase()})` : ''}`);
  console.log(`  (the snapshot on first seeing line 3000 read 973 = ${r.before.inv},` +
    ` window left ${r.before.wnd[0]} width ${r.before.wnd[1]} top ${r.before.wnd[2]}` +
    ` bottom ${r.before.wnd[3]} - COM's, not the map's, for the reason above)`);
  console.log('  characters handed to the generator, with the line that sent each:');
  for (const c of r.chars.slice(-8)) {
    console.log(`    line ${String(c.line).padStart(5)}  A=$${c.a.toString(16).toUpperCase()}` +
      `  973=${c.inv}  974=${c.page}`);
  }
  const on = decodeHgr(await a2.readRange(0x2000, 0x4000));
  console.log(`  ${r.stopped}: ${lit(on)} pixels lit, ${solidRows(on)} of 192 rows solid`);
  console.log('');
  const invAtFF = ff ? ff.inv : r.before.inv;
  console.log(invAtFF === 255
    ? '  973 was 255, so this clear fills the page WHITE'
    : `  973 was ${invAtFF}, so the fill byte is $00 and the page clears to black` +
      ' - which is what hires.hgr() does in the port');
  console.log('  the window set on the same line makes no difference: the fill starts at the' +
    ' page base and runs 8192 bytes, whatever 32-35 say');
}

await a2.close();
fs.mkdirSync('captured/controlchars', { recursive: true });
fs.writeFileSync('captured/controlchars/galaxyclear.json', JSON.stringify({
  source: "GALAXY MAP line 3000's form feed, with the inverse flag and window as it found them",
  result: r,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/controlchars/galaxyclear.json');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
