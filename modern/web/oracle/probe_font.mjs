// The game's character set, taken off the disk and proved against the screen.
//
// CHARACTER TABLE is BLOADed to $8800 and is 1024 bytes: 128 glyphs of 8 rows. What is not
// written down anywhere is how HI-RES CHARACTER GENERATOR ($9300) indexes it, or which way
// round the bits go - and guessing either would put every letter subtly wrong.
//
// So this does not guess. It captures the panel the disk actually drew, lifts the 7x8 cells
// under labels whose text and position are known from INSTRUMENTS (MANUAL at HTAB 4 VTAB
// 20, and so on), and searches for the (index mapping, bit order) that reproduces them. A
// decoding that renders the real screen is the right one by construction.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import { decodeHgr, HGR_W } from './hgr.mjs';
import fs from 'fs';

const CELL_W = 7, CELL_H = 8, GLYPHS = 128;

// INSTRUMENTS 180/190/200, printed after POKE 973,0 so they are not inverse.
const LABELS = [
  ['MANUAL', 4, 20], ['AUTO', 13, 20], ['ORBIT', 24, 20], ['DAMAGE', 32, 20],
  ['MISSILE', 4, 21], ['LASER', 13, 21], ['COND', 24, 21], ['SHIELD', 32, 21],
];

// --- the table -------------------------------------------------------------------------
const disk = openDisk(DISK);
const ct = disk.read(disk.files.find((f) => f.name === 'CHARACTER TABLE'));
console.log(`CHARACTER TABLE: ${ct.len} bytes = ${ct.len / CELL_H} glyphs of ${CELL_H} rows`);
if (ct.len !== GLYPHS * CELL_H) throw new Error(`expected ${GLYPHS * CELL_H} bytes`);

// --- the screen the disk drew ------------------------------------------------------------
const f = disk.files.find((x) => x.name === 'INSTRUMENTS');
const r = disk.read(f);
const wanted = listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
  .map((l) => `${l.num} ${l.text}`).join('\n');

const a2 = await openOracle();
await a2.boot();
await a2.key('N');
let page = null, saw = false;
for (let i = 0; i < 200; i++) {
  await a2.frames(30);
  const bytes = await a2.readRange(0x800, 0x2000);
  const mem = {};
  for (let k = 0; k < bytes.length; k++) mem[0x800 + k] = bytes[k];
  let text = '';
  try { text = listProgram(mem, 0x801, 0x2000).map((l) => `${l.num} ${l.text}`).join('\n'); } catch { /* mid-load */ }
  if (text === wanted) { saw = true; page = await a2.readRange(0x2000, 0x4000); } else if (saw) break;
}
await a2.close();
if (!page) throw new Error('never caught INSTRUMENTS running');
const screen = decodeHgr(page);

/** The 7x8 cell the screen shows at a text column and row, as 8 rows of 7 bits. */
function cellOnScreen(col, row, index) {
  const px = (col - 1) * CELL_W + index * CELL_W;
  const py = (row - 1) * CELL_H;
  const out = [];
  for (let y = 0; y < CELL_H; y++) {
    let bits = 0;
    for (let x = 0; x < CELL_W; x++) if (screen[(py + y) * HGR_W + px + x]) bits |= 1 << x;
    out.push(bits);
  }
  return out;
}

/** A table glyph, under one bit order. `lsbLeft` matches how hi-res bytes are laid out. */
function glyphFromTable(idx, lsbLeft) {
  const out = [];
  for (let y = 0; y < CELL_H; y++) {
    const b = ct.data[idx * CELL_H + y] & 0x7f;
    if (lsbLeft) { out.push(b); continue; }
    let rev = 0;
    for (let i = 0; i < CELL_W; i++) if (b & (1 << i)) rev |= 1 << (CELL_W - 1 - i);
    out.push(rev);
  }
  return out;
}

const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// --- find the decoding -------------------------------------------------------------------
// Try every index mapping of the form (charCode & mask) - offset, both bit orders, and keep
// whichever reproduces every cell of every label.
const wantCells = [];
for (const [s, col, row] of LABELS) {
  for (let i = 0; i < s.length; i++) wantCells.push({ ch: s[i], cell: cellOnScreen(col, row, i) });
}
console.log(`${wantCells.length} character cells lifted from the screen\n`);

const candidates = [];
for (const lsbLeft of [true, false]) {
  for (const mask of [0x7f, 0x3f]) {
    for (let offset = -64; offset <= 64; offset++) {
      const ok = wantCells.every(({ ch, cell }) => {
        const idx = ((ch.charCodeAt(0) & mask) - offset) & (GLYPHS - 1);
        return same(glyphFromTable(idx, lsbLeft), cell);
      });
      if (ok) candidates.push({ lsbLeft, mask, offset });
    }
  }
}

if (!candidates.length) {
  console.log('No (bit order, index mapping) reproduces the screen. Best near-misses:');
  let best = [];
  for (const lsbLeft of [true, false]) {
    for (const mask of [0x7f, 0x3f]) {
      for (let offset = -64; offset <= 64; offset++) {
        const hits = wantCells.filter(({ ch, cell }) =>
          same(glyphFromTable(((ch.charCodeAt(0) & mask) - offset) & (GLYPHS - 1), lsbLeft), cell)).length;
        best.push({ lsbLeft, mask, offset, hits });
      }
    }
  }
  best.sort((a, b) => b.hits - a.hits);
  for (const b of best.slice(0, 5)) {
    console.log(`  lsbLeft=${b.lsbLeft} mask=$${b.mask.toString(16)} offset=${b.offset}: ${b.hits}/${wantCells.length}`);
  }
  const m = wantCells.find((c) => c.ch === 'M');
  console.log('\nwhat the screen shows for "M":');
  for (const b of m.cell) console.log('   ' + [...Array(CELL_W)].map((_, i) => (b >> i) & 1 ? '#' : '.').join(''));
  process.exit(1);
}

const pick = candidates[0];
console.log(`reproduces all ${wantCells.length} cells: ` +
  `bit 0 is ${pick.lsbLeft ? 'the LEFT' : 'the RIGHT'} pixel, index = (charCode & $${pick.mask.toString(16)})` +
  `${pick.offset ? ` - ${pick.offset}` : ''}`);
if (candidates.length > 1) console.log(`(${candidates.length} equivalent mappings; they agree on every character used)`);

console.log('');
for (const ch of ['M', 'A', 'S', '0']) {
  const idx = ((ch.charCodeAt(0) & pick.mask) - pick.offset) & (GLYPHS - 1);
  console.log(`'${ch}' -> glyph ${idx}`);
  for (const b of glyphFromTable(idx, pick.lsbLeft)) {
    console.log('   ' + [...Array(CELL_W)].map((_, i) => (b >> i) & 1 ? '#' : '.').join(''));
  }
}

// --- emit --------------------------------------------------------------------------------
const rows = [];
for (let i = 0; i < GLYPHS; i++) rows.push(glyphFromTable(i, pick.lsbLeft));
const ts = `// GENERATED by modern/web/oracle/probe_font.mjs - do not edit by hand.
//
// The game's character set, read from CHARACTER TABLE on the original disk (BLOADed to
// $8800, 1024 bytes: 128 glyphs of 8 rows) and driven by HI-RES CHARACTER GENERATOR at
// $9300.
//
// Each row is 7 bits wide, **bit 0 is the leftmost pixel** - the same order hi-res bytes
// use. The index is (charCode & $${pick.mask.toString(16)})${pick.offset ? ` - ${pick.offset}` : ''}.
//
// Neither of those was assumed: probe_font.mjs lifted the 7x8 cells under labels the disk
// had actually drawn (MANUAL, AUTO, ORBIT, DAMAGE, MISSILE, LASER, COND, SHIELD) and
// searched for the decoding that reproduces all ${wantCells.length} of them.

/** Glyph rows, 8 per character, 7 bits each with bit 0 leftmost. */
export const DISK_FONT: readonly (readonly number[])[] = [
${rows.map((g, i) => `  [${g.map((b) => '0x' + b.toString(16).padStart(2, '0')).join(', ')}], // ${i}`).join('\n')}
];

export const FONT_CELL_W = ${CELL_W};
export const FONT_CELL_H = ${CELL_H};
export const FONT_INDEX_MASK = 0x${pick.mask.toString(16)};
export const FONT_INDEX_OFFSET = ${pick.offset};

/** The glyph for a character, or the one for a space if it is outside the set. */
export function glyphFor(ch: string): readonly number[] {
  const idx = ((ch.charCodeAt(0) & FONT_INDEX_MASK) - FONT_INDEX_OFFSET) & ${GLYPHS - 1};
  return DISK_FONT[idx] ?? DISK_FONT[((0x20 & FONT_INDEX_MASK) - FONT_INDEX_OFFSET) & ${GLYPHS - 1}];
}
`;
fs.writeFileSync('../src/engine/diskFont.ts', ts);
console.log('\nwrote ../src/engine/diskFont.ts');
