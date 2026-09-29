// The ROM's line routine, disassembled.
//
// `Hires.line()` is fitted to RADAR's reticle and SHIP # 3 and # 4 contradict the fit, so
// the guess has run out. Applesoft's hi-res line is HLIN at $F53A - it draws from the last
// plotted point, which is exactly what HPLOT TO does - with HPOSN at $F411 setting that
// point up. This reads the ROM out of the emulator and disassembles both.
import { openOracle } from './a2.mjs';
import { disasmRange, traverse, hx } from './disasm6502.mjs';
import fs from 'fs';

const LO = 0xf400, HI = 0xf700;

const a2 = await openOracle();
await a2.frames(5);

const bytes = await a2.readRange(LO, HI);
await a2.close();

const mem = {};
for (let i = 0; i < bytes.length; i++) mem[LO + i] = bytes[i];

fs.mkdirSync('captured/rom', { recursive: true });
fs.writeFileSync('captured/rom/f400-f700.bin', Buffer.from(bytes));

// Applesoft's published hi-res entry points, so the listing has names in it.
const SYM = {
  0xf3d8: 'HGR2', 0xf3e2: 'HGR', 0xf3f2: 'HCLR', 0xf3f6: 'BKGND',
  0xf411: 'HPOSN', 0xf457: 'HPLOT', 0xf53a: 'HLIN', 0xf5cb: 'HFIND',
  0xf601: 'DRAW', 0xf65d: 'XDRAW', 0xf6e9: 'SETHCOL', 0xf730: 'SHNUM',
  0x1a: 'HGR_X_LO', 0x1b: 'HGR_X_HI', 0x1c: 'HGR_Y', 0x1d: 'HGR_MASK',
  0x1e: 'HGR_SHAPE', 0x26: 'GBASL', 0x27: 'GBASH', 0xe0: 'HGR_X0L',
  0xe1: 'HGR_X0H', 0xe2: 'HGR_Y0', 0xe4: 'HGR_COLOR', 0xe5: 'HGR_COUNT',
  0xe6: 'HGR_PAGE', 0xe7: 'HGR_SCALE', 0x30: 'HMASK',
};

const { starts } = traverse(mem, [0xf411, 0xf457, 0xf53a], { lo: LO, hi: HI });
const lines = disasmRange(mem, 0xf53a, 0xf5cb, { starts, symbols: SYM });
console.log('HLIN - $F53A, the routine HPLOT TO ends up in:');
console.log('');
for (const l of lines) {
  if (l.addr === undefined) { console.log(l.text || ''); continue; }
  const label = SYM[l.addr] ? `${SYM[l.addr]}:` : '';
  console.log(`${hx(l.addr, 4)}  ${label.padEnd(9)}${l.text || ''}`);
}
console.log('');
console.log('wrote captured/rom/f400-f700.bin');
