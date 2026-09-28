// Disassemble LO-HI A2-3D1, the renderer, at $6000.
//
// 4864 bytes, BLOADed by START line 90. $9023 hands off to it at $921E (JSR $6000), and its
// cosine and sine live at $6006 and $6009 - the entry points STARSHIP SIMULATOR calls as
// CSN and SN.
//
// Code is found by following it from the entry points rather than decoding straight
// through, and, where a trace is available, lines seen executing on the real machine are
// marked. A module this size is certain to contain tables, and decoding a table produces
// confident nonsense.
import { openDisk, DISK } from './dsk.mjs';
import { disasmRange, traverse, hx } from './disasm6502.mjs';
import { APPLESOFT_TOKENS as TOKENS } from './detokenise.mjs';
import fs from 'fs';

const BASE = 0x6000;
const disk = openDisk(DISK);
const mod = disk.read(disk.files.find((f) => f.name === 'LO-HI A2-3D1'));
const HI = BASE + mod.len;

const mem = {};
for (let i = 0; i < mod.len; i++) mem[BASE + i] = mod.data[i];

const SYM = {
  0x6000: 'RENDER', 0x6006: 'CSN', 0x6009: 'SN', 0x600c: 'M1', 0x600d: 'M2',
  0x731b: 'SHIP_X', 0x731d: 'SHIP_Y', 0x731f: 'SHIP_Z',
  0x7321: 'PITCH', 0x7322: 'BANK', 0x7323: 'HEADING',
  0x7300: 'PLANET', 0x7879: 'MODEL', 0x9023: 'CONTROLS',
  0x1a: 'HGR_X', 0x1c: 'HGR_Y', 0x1d: 'HGR_XH', 0x26: 'GBASL', 0x27: 'GBASH',
  0xe0: 'HGR_XL', 0xe2: 'HGR_YL', 0xe4: 'HGR_COLOR', 0xe6: 'HGR_PAGE',
  0xf3ea: 'HPLOT_ROM', 0xf457: 'HLINE_ROM', 0xf411: 'HPOSN_ROM',
  0xc050: 'TXTCLR', 0xc052: 'MIXCLR', 0xc054: 'PAGE1', 0xc055: 'PAGE2', 0xc057: 'HIRES',
};

let ran = new Set();
try {
  const t = JSON.parse(fs.readFileSync('captured/trace_6000.json', 'utf8'));
  for (let i = 0; i < t.exec.length; i++) if (t.exec[i]) ran.add(t.lo + i);
} catch { /* no trace yet */ }

const entries = [BASE, 0x6006, 0x6009, ...ran];
const { starts, calls } = traverse(mem, entries, { lo: BASE, hi: HI });

const lines = disasmRange(mem, BASE, HI, { sym: SYM, code: starts });
const out = [];
out.push('; LO-HI A2-3D1 - the renderer. BLOADed to $6000 by START line 90, 4864 bytes.');
out.push('; $9023 (the flight controls) hands off to it at $921E: JSR $6000.');
out.push('; CSN and SN, the cosine and sine STARSHIP SIMULATOR calls, are at $6006/$6009.');
out.push(';');
out.push(`; ${starts.size} of ${mod.len} bytes are reachable code by traversal from the entry`);
out.push(`; points${ran.size ? `; ${ran.size} were additionally seen executing and are marked *` : ' (no execution trace loaded)'}.`);
out.push('; Unreachable bytes are left as data rather than decoded.');
out.push(';');
const targets = [...calls.entries()].filter(([a]) => a >= BASE && a < HI).sort((x, y) => y[1] - x[1]);
out.push(`; most-called targets: ${targets.slice(0, 14).map(([a, n]) => `${hx(a, 4)} x${n}`).join(', ')}`);
out.push(';');
for (const l of lines) {
  const wasRun = !l.data && ran.has(l.addr);
  const bytes = l.bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
  const asText = l.data ? '   ; ' + l.bytes.map((b) => b >= 0x80 && b - 0x80 < TOKENS.length
    ? ' ' + TOKENS[b - 0x80] + ' '
    : (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('') : '';
  out.push(`${wasRun ? '*' : ' '} ${hx(l.addr, 4)}  ${bytes.padEnd(23)}  ${l.text}${asText}`);
}
fs.writeFileSync('captured/renderer_6000.asm', out.join('\n') + '\n');
console.log(out.slice(0, 10).join('\n'));
console.log(`\n${starts.size} code bytes, ${mod.len - starts.size} left as data`);
console.log('wrote captured/renderer_6000.asm');
