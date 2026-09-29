// What CALL 38402 ($9602) draws on the instrument panel.
//
// STARSHIP SIMULATOR line 500 calls it every pass of the main loop, and INSTRUMENTS line
// 210 calls it once with POKE 38189,10 first. $9602 reads $952D (38189): 10 means draw all
// six, anything else means update the one $9517 selects.
//
// Each of the six is a lamp with two appearances, chosen by its own flag byte, and each
// call flips that flag - so they blink. The drawing is done by $9754, which is
// self-modifying: $9773 and $9774 are the low and high operand bytes of the STA at $9772.
// The high byte comes from $9789 (25 29 2d 31 35) or $978E (26 2a 2e 32 36) depending on
// $9601, so a lamp is five consecutive rows; the low byte starts at whatever the caller put
// in $9773 and is bumped once, so it is two byte-columns wide. The byte written is
// $9793,X - one value per column, repeated down all five rows.
//
// Rather than trust that reading, run it: blank page 1, call $9602, and see what lands.
import { openOracle } from './a2.mjs';
import fs from 'fs';

const TRAP = 0x0300;
const P1_LO = 0x2000, P1_HI = 0x4000;
const REDRAW_ALL = 0x952d;                 // 38189
// The flag byte each lamp keys off, in the order $9602 calls them.
const LAMPS = [
  { at: 0x9643, flag: 0x9539, what: 'lamp A' },
  { at: 0x966a, flag: 0x953a, what: 'lamp B' },
  { at: 0x96a5, flag: 0x9515, what: 'lamp C (three-way)' },
  { at: 0x96df, flag: 0x9514, what: 'lamp D' },
  { at: 0x971a, flag: 0x9542, what: 'lamp E (atmosphere)' },
  { at: 0x9737, flag: 0x95f9, what: 'lamp F' },
];

const meta = JSON.parse(fs.readFileSync('captured/snapshot/flight.json', 'utf8'));
const b64 = fs.readFileSync('captured/snapshot/flight.bin').toString('base64');

// Apple II hi-res row bases, so a screen address can be named as (row, byte column).
const rowBase = (r) => 0x2000 + 0x400 * (r & 7) + 0x80 * ((r >> 3) & 7) + 0x28 * (r >> 6);
const WHERE = new Map();
for (let r = 0; r < 192; r++) for (let c = 0; c < 40; c++) WHERE.set(rowBase(r) + c, [r, c]);

const a2 = await openOracle();
await a2.ev(`(() => { window.M.a2.reset(); return 'reset'; })()`);
await a2.frames(10);

async function run(flags) {
  const sets = Object.entries(flags).map(([a, v]) => `cpu.write(${a}, ${v});`).join(' ');
  return JSON.parse(await a2.ev(`(() => {
    const M = window.M, cpu = M.cpu;
    const s = atob(${JSON.stringify(b64)});
    for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
    for (let a = ${P1_LO}; a < ${P1_HI}; a++) cpu.write(a, 0);
    cpu.write(${REDRAW_ALL}, 0x0A);
    ${sets}
    const st = cpu.getState();
    st.sp = 0xF0; st.pc = 0x9602;
    cpu.setState(st);
    cpu.write(0x01F1, ${(TRAP - 1) & 0xff});
    cpu.write(0x01F2, ${(TRAP - 1) >> 8});
    cpu.write(${TRAP}, 0x4C); cpu.write(${TRAP + 1}, ${TRAP & 0xff}); cpu.write(${TRAP + 2}, ${TRAP >> 8});
    let steps = 0;
    while (cpu.getPC() !== ${TRAP} && steps < 200000) { cpu.stepCycles(1); steps++; }
    const w = [];
    for (let a = ${P1_LO}; a < ${P1_HI}; a++) { const v = cpu.read(a); if (v) w.push([a, v]); }
    return JSON.stringify({ returned: cpu.getPC() === ${TRAP}, steps, writes: w });
  })()`));
}

function report(label, r) {
  if (!r.returned) { console.log(`  ${label}: did not return`); return null; }
  const byRow = new Map();
  for (const [a, v] of r.writes) {
    const w = WHERE.get(a);
    if (!w) { console.log(`  write outside the screen grid at $${a.toString(16)}`); continue; }
    const [row, col] = w;
    if (!byRow.has(row)) byRow.set(row, new Map());
    byRow.get(row).set(col, v);
  }
  const rows = [...byRow.keys()].sort((a, b) => a - b);
  console.log(`  ${label}: ${r.writes.length} bytes on rows ${rows.join(', ')}`);
  const cols = [...new Set(r.writes.map(([a]) => WHERE.get(a)[1]))].sort((a, b) => a - b);
  console.log(`     row |` + cols.map((c) => ` c${String(c).padStart(2)} x${String(c * 7).padStart(3)}`).join(''));
  for (const row of rows) {
    console.log(`     ${String(row).padStart(3)} |` +
      cols.map((c) => { const v = byRow.get(row).get(c); return v === undefined ? '        ' : `     $${v.toString(16).padStart(2, '0')}`; }).join(''));
  }
  return byRow;
}

console.log('CALL 38402 with every lamp flag at 0:');
const off = await run(Object.fromEntries(LAMPS.map((l) => [l.flag, 0])));
report('flags 0', off);

console.log('\nwith every flag at 1:');
const on = await run(Object.fromEntries(LAMPS.map((l) => [l.flag, 1])));
report('flags 1', on);

console.log('\nlamp C is three-way ($9515 compared against 2 and 3):');
for (const v of [1, 2, 3]) {
  const r = await run({ ...Object.fromEntries(LAMPS.map((l) => [l.flag, 0])), 0x9515: v });
  const g = report(`$9515 = ${v}`, r);
  void g;
}

// And what the flags are left at, which is what decides the appearance a capture shows.
console.log('\nthe flag bytes in the flight snapshot:');
const ram = fs.readFileSync('captured/snapshot/flight.bin');
for (const l of LAMPS) console.log(`  $${l.flag.toString(16)}  ${l.what.padEnd(20)} ${ram[l.flag]}`);
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
