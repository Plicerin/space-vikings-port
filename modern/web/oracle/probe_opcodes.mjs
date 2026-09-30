// The five display-list opcodes nothing on the disk uses.
//
// `$6162` reads an opcode, rejects anything `>= $12`, and jumps through the 18-entry table at
// `$6076`. Thirteen of the eighteen have been read, because a display list on the disk uses
// them. These five have not:
//
//   8 -> $6D44    9 -> $7148    12 -> $718A    16 -> $632A    17 -> $6338
//
// They are disassembled here by following the code from each entry rather than decoding
// straight through, which in a module this size would produce confident nonsense wherever a
// table lives. The handlers are all inside LO-HI A2-3D1, so no emulator is needed to read them.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import { disasmRange, traverse, hx } from './disasm6502.mjs';
import fs from 'fs';

const BASE = 0x6000;
const disk = openDisk(DISK);
const mod = disk.read(disk.files.find((f) => f.name === 'LO-HI A2-3D1'));
const HI = BASE + mod.len;
const mem = {};
for (let i = 0; i < mod.len; i++) mem[BASE + i] = mod.data[i];

/** Names this project has already established inside the renderer. */
const SYM = {
  0x60: 'CAM_X', 0x62: 'CAM_Y', 0x64: 'CAM_Z',
  0x70: 'SAVED_X', 0x72: 'SAVED_Y', 0x74: 'SAVED_Z',
  0x7c: 'NOCLIP', 0x7d: 'RECORD',
  0x9b: 'LIST', 0xb2: 'DEST', 0xb3: 'SCRX0', 0xb4: 'SCRY0', 0xb5: 'SCRX1', 0xb6: 'SCRY1',
  0x6076: 'OPTABLE', 0x6162: 'NEXTOP', 0x61a9: 'PLOT_OR_LINE', 0x61b7: 'OP1_LINE',
  0x622e: 'OP0_POINT', 0x654e: 'BUILD_MATRIX', 0x6631: 'SCALE_MATRIX',
  0x6730: 'TO_CAMERA', 0x68a1: 'PROJECT', 0x6dd5: 'DRAW_LINE', 0x67ef: 'OUTCODE',
  0x600e: 'SCALE0', 0x6010: 'SCALE1', 0x6012: 'SCALE2',
};

const HANDLERS = [
  { op: 8, addr: 0x6d44 },
  { op: 9, addr: 0x7148 },
  { op: 12, addr: 0x718a },
  { op: 16, addr: 0x632a },
  { op: 17, addr: 0x6338 },
];

// Check the table really says so, rather than taking the note's word for it.
console.log('the jump table at $6076, as the bytes have it:');
const entries = [];
for (let i = 0; i < 18; i++) {
  const lo = mem[0x6076 + i * 2];
  const hi = mem[0x6076 + i * 2 + 1];
  const target = lo | (hi << 8);
  entries.push(target);
  const known = HANDLERS.find((h) => h.op === i);
  console.log(`  op ${String(i).padStart(2)} -> $${target.toString(16).toUpperCase()}` +
    `${known ? (known.addr === target ? '   (one of the five)' : '   <- NOT where the note says') : ''}`);
}
for (const h of HANDLERS) {
  if (entries[h.op] !== h.addr) {
    console.log(`  WARNING: op ${h.op} points at $${entries[h.op].toString(16).toUpperCase()},` +
      ` not $${h.addr.toString(16).toUpperCase()}`);
  }
}

fs.mkdirSync('captured/opcodes', { recursive: true });
const out = [];
for (const h of HANDLERS) {
  const addr = entries[h.op];
  const { starts } = traverse(mem, [addr], { lo: BASE, hi: HI });
  // Disassemble from the entry to wherever the traversal stops caring, capped so a handler
  // that falls into shared code does not print the rest of the module.
  const reached = [...starts].filter((a) => a >= addr).sort((a, b) => a - b);
  let end = addr;
  for (const a of reached) {
    if (a - end > 32) break;      // a gap this size means the run has ended
    end = a;
  }
  const lines = disasmRange(mem, addr, Math.min(end + 8, HI), { sym: SYM, code: starts });
  console.log('');
  console.log(`opcode ${h.op} -> $${addr.toString(16).toUpperCase()}` +
    `   (${reached.length} addresses reachable from it)`);
  for (const l of lines) {
    console.log(`  $${l.addr.toString(16).toUpperCase()}  ${l.text}`);
  }
  out.push({ op: h.op, addr, lines: lines.map((l) => ({ addr: l.addr, text: l.text })) });
}

fs.writeFileSync('captured/opcodes/handlers.json', JSON.stringify({
  source: 'the five unused display-list handlers, followed from their entries in the $6076 table',
  table: entries, handlers: out,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/opcodes/handlers.json');
void hx;

// ---- and now run them ------------------------------------------------------------------------
//
// Reading a handler is not the same as knowing what it does, so each one is executed on the
// machine with a two-byte list of its own and the bytes it is supposed to patch are read before
// and after. The list is `[op, param, $FF]`: the handler takes the parameter, `JMP $62C3`
// advances the pointer by two, and `$6162` sees `$FF` - bit 7 set - and returns.
const SIM = (() => {
  const r = disk.read(disk.files.find((f) => f.name === 'STARSHIP SIMULATOR'));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => `${l.num} ${l.text}`).join(String.fromCharCode(10));
})();

const a2 = await openOracle();
await a2.boot();
await a2.key('N');
const loadedNow = async () => {
  const b = await a2.readRange(0x800, 0x2000);
  const m = {};
  for (let k = 0; k < b.length; k++) m[0x800 + k] = b[k];
  try { return listProgram(m, 0x801, 0x2000).map((l) => `${l.num} ${l.text}`).join(String.fromCharCode(10)); }
  catch { return ''; }
};
console.log('');
console.log('waiting for STARSHIP SIMULATOR, so the renderer is loaded...');
let up = false;
for (let i = 0; i < 700; i++) { await a2.frames(20); if ((await loadedNow()) === SIM) { up = true; break; } }
if (!up) { await a2.close(); throw new Error('no simulator'); }
await a2.frames(200);

/** Run one handler with one parameter, reading `sites` before and after. */
const runOp = async (addr, param, sites, bytes = 2) => JSON.parse(await a2.ev(`(() => {
  const cpu = window.M.cpu;
  const sites = ${JSON.stringify(sites)};
  const before = sites.map((a) => cpu.read(a));
  const LIST = 0x0320;
  // A two-byte opcode gets [op, param, $FF]; a one-byte one gets [op, $FF]. Giving a one-byte
  // opcode a parameter byte anyway means $6162 reads that byte as the *next* opcode - with 0
  // it runs op 0 and plots a point, which is what made the first attempt at op 16 and op 17
  // unreadable.
  cpu.write(LIST, 0x00);            // the opcode byte, which the handler does not look at
  if (${bytes} === 2) { cpu.write(LIST + 1, ${param}); cpu.write(LIST + 2, 0xFF); }
  else { cpu.write(LIST + 1, 0xFF); }
  cpu.write(0x9B, LIST & 0xff); cpu.write(0x9C, LIST >> 8);
  cpu.write(0x7D, 0);               // not recording, so op 12 leaves ($9D) alone
  const P = 0x0300;
  cpu.write(P, 0xA0); cpu.write(P + 1, 0x00);                       // LDY #$00
  cpu.write(P + 2, 0x20); cpu.write(P + 3, ${addr} & 0xff); cpu.write(P + 4, ${addr} >> 8);
  const stop = P + 5;
  cpu.write(stop, 0x4C); cpu.write(stop + 1, stop & 0xff); cpu.write(stop + 2, (stop >> 8) & 0xff);
  const st = cpu.getState();
  st.pc = P; st.sp = 0xF0;
  cpu.setState(st);
  let steps = 0;
  while (cpu.getPC() !== stop && steps < 2000000) { cpu.stepCycles(1); steps++; }
  return JSON.stringify({ ran: cpu.getPC() === stop, steps,
    before, after: sites.map((a) => cpu.read(a)) });
})()`));

const hex = (v) => '$' + v.toString(16).toUpperCase().padStart(2, '0');
const report = async (label, addr, param, sites, expect, bytes = 2) => {
  const r = await runOp(addr, param, sites, bytes);
  const changed = r.after.filter((v, i) => v !== r.before[i]).length;
  const matches = expect === null ? null : r.after.every((v) => v === expect);
  console.log(`  ${label}`);
  console.log(`    ${r.ran ? r.steps + ' instructions' : 'DID NOT RETURN'}, ` +
    `${changed} of ${sites.length} site(s) changed` +
    (expect === null ? '' : `, all now ${hex(expect)}: ${matches ? 'yes' : 'NO'}`));
  console.log(`    before ${r.before.slice(0, 6).map(hex).join(' ')}` +
    (r.before.length > 6 ? ' ...' : ''));
  console.log(`    after  ${r.after.slice(0, 6).map(hex).join(' ')}` +
    (r.after.length > 6 ? ' ...' : ''));
  return { label, param, sites, ...r, matches };
};

// op 12 patches thirteen line-routine sites between $11 (ORA (zp),Y) and $51 (EOR (zp),Y).
const OP12_SITES = [0x6DA4, 0x6DA9, 0x6DB0, 0x6E95, 0x6F11, 0x6FAA, 0x6FE6,
  0x7056, 0x7080, 0x708B, 0x70D8, 0x7102, 0x710D];
// op 9 patches eight self-modified page bytes, plus the high nibbles of the row table at $6B93.
const OP9_SITES = [0x6FF0, 0x7063, 0x6FF7, 0x709E, 0x701B, 0x70E5, 0x7023, 0x7120];
const ROW_SITES = [0x6B93, 0x6B95, 0x6B97, 0x6BC1];

console.log('');
console.log('running each handler with a list of its own:');
const runs = [];
runs.push(await report('op 12, parameter 1 - EOR, the erase mode', 0x718A, 1, OP12_SITES, 0x51));
runs.push(await report('op 12, parameter 0 - ORA, the draw mode', 0x718A, 0, OP12_SITES, 0x11));
runs.push(await report('op 9, parameter 1 - page 2', 0x7148, 1, OP9_SITES, 0x40));
runs.push(await report('op 9, parameter 1 - the row table high nibbles', 0x7148, 1, ROW_SITES, null));
runs.push(await report('op 9, parameter 0 - page 1', 0x7148, 0, OP9_SITES, 0x20));
runs.push(await report('op 8, parameter 0', 0x6D44, 0, [0x6CDD, 0x6CE0, 0x6CE3, 0x6CE6], null));
runs.push(await report('op 8, parameter 1', 0x6D44, 1, [0x6CDD, 0x6CE0, 0x6CE3, 0x6CE6], null));
// $9B/$9C is the list pointer: a one-byte opcode should leave it one past $0320.
runs.push(await report('op 17 - one byte, no parameter', 0x6338, 0, [0x9B, 0x9C], null, 1));
runs.push(await report('op 16 - one byte, falls into 17', 0x632A, 0, [0x9B, 0x9C], null, 1));

// op 16's four stores are to $C053, $C057, $C050 and $C054 - MIXED, HIRES, GRAPHICS and
// PAGE 1. Soft switches are writes with no readable result, and this emulator exposes no view
// of the video mode, so what is checked here is that those five instructions run: op 16 takes
// 22 instructions where op 17 alone takes 17, and the difference is exactly `LDA #$00` and the
// four `STA`s. Both leave the list pointer one byte on.
const op17 = runs.find((r) => r.label.startsWith('op 17'));
const op16 = runs.find((r) => r.label.startsWith('op 16'));
if (op17 && op16) {
  const extra = op16.steps - op17.steps;
  console.log('');
  console.log(`  op 16 takes ${op16.steps} instructions against op 17's ${op17.steps}` +
    ` - ${extra} more, and the disassembly has exactly ${extra} extra instructions:` +
    ' LDA #$00 and four STA $C0xx');
}

await a2.close();
fs.writeFileSync('captured/opcodes/runs.json', JSON.stringify({
  source: 'each unused handler executed with a two-byte list, with the bytes it patches read either side',
  runs,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/opcodes/runs.json');

