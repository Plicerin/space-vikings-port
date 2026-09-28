// Disassemble SPACE SIMULATOR ASSEMBLY, marking what actually ran.
//
// Bytes the 6502 was seen executing (captured/trace_9023.json) are disassembled as code;
// everything else is left as data, because decoding a table produces confident nonsense.
// Lines that ran are marked with a bullet so the listing never implies more than was seen.
import { disasmRange, traverse, hx } from './disasm6502.mjs';
import { APPLESOFT_TOKENS as TOKENS } from './detokenise.mjs';
import fs from 'fs';

const t = JSON.parse(fs.readFileSync('captured/trace_9023.json', 'utf8'));
const mem = {};
for (let i = 0; i < t.image.length; i++) mem[t.lo + i] = t.image[i];

// Names the BASIC gives these addresses, from captured/disk/*.bas.
const SYM = {
  0x6006: 'CSN', 0x6009: 'SN', 0x600c: 'M1', 0x600d: 'M2',
  0x731b: 'SHIP_X', 0x731d: 'SHIP_Y', 0x731f: 'SHIP_Z',
  0x7321: 'PITCH', 0x7322: 'BANK', 0x7323: 'HEADING',
  0x7879: 'MODEL', 0x9023: 'SIM_ENTRY', 0x9276: 'SOUND_GEN', 0x92d1: 'LASER',
  0x9300: 'CHARGEN', 0x9400: 'MEM_XFER', 0x8800: 'CHAR_TABLE', 0x8bec: 'MEM_DATA',
  0xe6: 'HGR_COLOR', 0xe8: 'SHAPE_PTR', 0x1c: 'MON_TEMP',
  0xc050: 'TXTCLR', 0xc051: 'TXTSET', 0xc052: 'MIXCLR', 0xc053: 'MIXSET',
  0xc054: 'PAGE1', 0xc055: 'PAGE2', 0xc056: 'LORES', 0xc057: 'HIRES',
  0xc000: 'KBD', 0xc010: 'KBDSTRB', 0xc030: 'SPKR',
};

// Bytes the 6502 was actually seen executing.
const ran = new Set();
for (let i = 0; i < t.exec.length; i++) if (t.exec[i]) ran.add(t.lo + i);

// Code found by following the routine from its entry points. A trace only sees the
// branches that happened to be taken - two passes through flight left 93% of this blob
// looking like data, when most of it is code on paths the paddles never selected.
const entries = [t.lo, ...t.entries.map(([a]) => a)];
const { starts, calls } = traverse(mem, entries, { lo: t.lo, hi: t.hi });
const code = starts;

const lines = disasmRange(mem, t.lo, t.hi, { sym: SYM, code });
const out = [];
out.push('; SPACE SIMULATOR ASSEMBLY, BLOADed to $9023 by START line 110.');
out.push('; STARSHIP SIMULATOR line 150 calls it as CALL CA, CA = 36899 = $9023.');
out.push(';');
out.push(`; ${t.instructions.toLocaleString()} instructions were traced during flight;`);
out.push(`; ${t.inside.toLocaleString()} of them were inside this routine, touching`);
out.push(`; ${ran.size} of its ${t.hi - t.lo} bytes, over 2 passes of the main loop.`);
out.push(';');
out.push('; Code below is found by following the routine from its entry points, not by');
out.push('; decoding straight through - bytes nothing can reach are left as data. A line');
out.push('; marked * was additionally seen executing on the real machine; an unmarked');
out.push('; instruction is on a path the paddles did not select during the trace.');
out.push(';');
const targets = [...calls.entries()].filter(([a]) => a >= t.lo && a < t.hi).sort((x, y) => x[0] - y[0]);
out.push(`; call/jump targets inside the routine: ${targets.map(([a, n]) => `${hx(a, 4)} x${n}`).join(', ')}`);
out.push(';');
for (const l of lines) {
  const wasRun = !l.data && ran.has(l.addr);
  const bytes = l.bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  // Data runs also get an Applesoft rendering. The tail of this file is not tables at all:
  // it is leftover BASIC program text, caught when the module was BSAVEd over a region
  // wider than the code, and showing it says so far better than a wall of hex.
  const asText = l.data ? '   ; ' + l.bytes.map((b) => b >= 0x80 && b - 0x80 < TOKENS.length
    ? ' ' + TOKENS[b - 0x80] + ' '
    : (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('') : '';
  out.push(`${wasRun ? '*' : ' '} ${hx(l.addr, 4)}  ${bytes.padEnd(23)}  ${l.text}${asText}`);
}
fs.writeFileSync('captured/space_simulator.asm', out.join('\n') + '\n');
console.log(out.join('\n'));
