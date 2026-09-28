// Render every shape in the disk's shape table on the real Applesoft ROM.
//
// ENEMY I.A24580.L68 is BLOADed to $7FFF and STARSHIP SIMULATOR line 2 does
// POKE 232,HL: POKE 233,127, pointing Applesoft's shape-table vector ($E8/$E9) at it. The
// panel is drawn from it with DRAW 13 / DRAW 14 / DRAW 25 / DRAW 26.
//
// The port has its own shape-table interpreter, and a shape table is fiddly enough - three
// vectors per byte, a plot bit that moves as well as plots, and a direction encoding that
// is easy to get a quarter turn wrong - that agreeing with the Apple II Reference Manual is
// not the same as agreeing with the machine. So this renders all 26 on the ROM and writes
// what it drew, for the port to be compared against.
//
// No disk and no DOS: the table is written straight into memory, which is simpler than
// booting the game and getting back to a prompt.
import { openOracle } from './a2.mjs';
import { openDisk, DISK } from './dsk.mjs';
import { decodeHgr, HGR_W, HGR_H } from './hgr.mjs';
import fs from 'fs';

const TABLE_ADDR = 0x7fff;
const AT_X = 140, AT_Y = 96;
const FLAG = 6;                                   // a spare zero-page byte for the handshake

const disk = openDisk(DISK);
const table = disk.read(disk.files.find((f) => f.name === 'ENEMY I.A24580.L68'));
const count = table.data[0];
console.log(`ENEMY I.A24580.L68: ${table.len} bytes, ${count} shapes\n`);

const a2 = await openOracle();
await a2.ev(`(() => {
  window.M.a2.reset();
  const st = window.M.cpu.getState(); st.pc = 0xE000; window.M.cpu.setState(st);
  return 'Applesoft cold start';
})()`);
for (let i = 0; i < 40 && !(await a2.screen()).some((l) => l.trim().endsWith(']')); i++) await a2.frames(30);
if (!(await a2.screen()).some((l) => l.trim().endsWith(']'))) { await a2.close(); throw new Error('no ] prompt'); }

const type = async (line) => {
  for (const ch of line) await a2.key(ch, { holdFrames: 2, afterFrames: 3 });
  await a2.key(13, { holdFrames: 2, afterFrames: 20 });
};

// Keep Applesoft's strings well below the table so nothing walks over it.
await type('HIMEM: 32767');

// Write the table in, and point $E8/$E9 at it.
await a2.ev(`(() => {
  const b = [${[...table.data].join(',')}];
  for (let i = 0; i < b.length; i++) window.M.wr(${TABLE_ADDR} + i, b[i]);
  window.M.wr(0xE8, ${TABLE_ADDR & 0xff});
  window.M.wr(0xE9, ${TABLE_ADDR >> 8});
  return 'table in place';
})()`);

// A tiny driver, so each shape costs a memory poke rather than thirty keystrokes.
// HCOLOR is deliberate: DRAW uses whatever colour is current, and a non-white one lights
// alternate columns, which would make this a test of colour phase rather than of shape
// geometry. White lights them all.
await type('10 ROT= 0: SCALE= 1: HCOLOR= 3');
await type(`20 N =  PEEK(${FLAG}): IF N = 0 THEN 20`);
await type('30 HGR');
await type(`40 DRAW N AT ${AT_X},${AT_Y}`);
await type(`50 POKE ${FLAG},0: GOTO 20`);
await type('RUN');
await a2.frames(60);

const shapes = [];
for (let n = 1; n <= count; n++) {
  await a2.ev(`(() => { window.M.wr(${FLAG}, ${n}); return 'go'; })()`);
  let done = false;
  for (let i = 0; i < 60 && !done; i++) {
    await a2.frames(10);
    done = JSON.parse(await a2.ev(`window.M.rd(${FLAG})`)) === 0;
  }
  const on = decodeHgr(await a2.readRange(0x2000, 0x4000));
  const pts = [];
  let minX = HGR_W, maxX = -1, minY = HGR_H, maxY = -1;
  for (let y = 0; y < HGR_H; y++) {
    for (let x = 0; x < HGR_W; x++) {
      if (!on[y * HGR_W + x]) continue;
      pts.push([x, y]);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  shapes.push({ shape: n, lit: pts.length, minX, maxX, minY, maxY, points: pts, drawn: done });
  console.log(`shape ${String(n).padStart(2)}  ${String(pts.length).padStart(4)} px  ` +
    `x ${String(minX).padStart(3)}-${String(maxX).padStart(3)}  y ${String(minY).padStart(3)}-${String(maxY).padStart(3)}` +
    (done ? '' : '   (DRAW never finished)'));
}

const failed = shapes.filter((s) => !s.drawn || s.lit === 0);
console.log('');
console.log(failed.length
  ? `${failed.length} shape(s) drew nothing or never finished: ${failed.map((s) => s.shape).join(', ')}`
  : `All ${count} shapes drew on the ROM.`);

// The table in the shape the port's decodeShapeTableJson() reads, so it can be compared
// against what the ROM just drew. Each shape runs from its offset to its terminating 0.
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const offsets = [];
for (let i = 0; i < count; i++) offsets.push(table.data[2 + i * 2] | (table.data[3 + i * 2] << 8));
const tableJson = { num_shapes: count, offsets, shapes: offsets.map((off, i) => {
  let end = off;
  while (end < table.data.length && table.data[end] !== 0) end++;
  return { index: i, offset: off, raw_bytes: hex(table.data.subarray(off, end + 1)) };
}) };
fs.writeFileSync('../public/data/shapes/shape-table.json', JSON.stringify(tableJson, null, 2) + String.fromCharCode(10));
console.log('wrote ../public/data/shapes/shape-table.json');

fs.writeFileSync('captured/shape_renders.json', JSON.stringify({
  source: 'ENEMY I.A24580.L68', addr: TABLE_ADDR, at: [AT_X, AT_Y], rot: 0, scale: 1,
  count, shapes,
}) + '\n');
console.log('wrote captured/shape_renders.json');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
