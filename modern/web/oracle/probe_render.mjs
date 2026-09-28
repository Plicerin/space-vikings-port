// Does $6000 draw? Set the machine up by hand and call it.
//
// The trace says 64% of all CPU time during flight is inside this module, and $6140 sets
// $9C to $73 - the page PLANET # 0 and the ship model live on. If it is the renderer, then
// loading what START loads, placing the ship, and calling it should put something on the
// hi-res page.
//
// Getting this to work is worth more than the disassembly: it makes ship rendering testable
// the same way the cockpit panel and the shape table already are.
import { openOracle } from './a2.mjs';
import { openDisk, DISK } from './dsk.mjs';
import { decodeHgr, toPng, HGR_W, HGR_H } from './hgr.mjs';
import fs from 'fs';

// Every BLOAD START does, at the address START gives it.
const LOADS = [
  ['LO-HI A2-3D1', 0x6000], ['PLANET # 0', 0x7300], ['SHIP # 3', 0x7879],
  ['ENEMY I.A24580.L68', 0x7fff], ['CHARACTER TABLE', 0x8800], ['MEM DATA', 0x8bec],
  ['SPACE SIMULATOR ASSEMBLY', 0x9023], ['SOUND GEN', 0x9276], ['LASER', 0x92d1],
  ['HI-RES CHARACTER GENERATOR', 0x9300], ['MEM TRANSFER A', 0x9400],
  ["SHIP'S DATA-M", 0x9506], ['PLANET FILE-M', 0x954c], ['TRANLIT.OBJ0', 0x9600],
  ['P/F-M', 0x97e1],
];

const SHIP = { X: 700, Y: 200, Z: -7000, pitch: 0, bank: 0, heading: 0 };
const FLAG = 6;

const disk = openDisk(DISK);
const a2 = await openOracle();
await a2.ev(`(() => {
  window.M.a2.reset();
  const st = window.M.cpu.getState(); st.pc = 0xE000; window.M.cpu.setState(st);
  return 'cold start';
})()`);
for (let i = 0; i < 40 && !(await a2.screen()).some((l) => l.trim().endsWith(']')); i++) await a2.frames(30);
if (!(await a2.screen()).some((l) => l.trim().endsWith(']'))) { await a2.close(); throw new Error('no ] prompt'); }

for (const [name, addr] of LOADS) {
  const f = disk.files.find((x) => x.name === name);
  if (!f) throw new Error(`${name} is not on the disk`);
  const r = disk.read(f);
  await a2.ev(`(() => {
    const b = [${[...r.data].join(',')}];
    for (let i = 0; i < b.length; i++) window.M.wr(${addr} + i, b[i]);
    return 'ok';
  })()`);
}
console.log(`${LOADS.length} binaries written into memory\n`);

const lo = (v) => v & 0xff, hi = (v) => (v >> 8) & 0xff;
await a2.ev(`(() => {
  const w = window.M.wr;
  w(0x731B, ${lo(SHIP.X)}); w(0x731C, ${hi(SHIP.X)});
  w(0x731D, ${lo(SHIP.Y)}); w(0x731E, ${hi(SHIP.Y)});
  w(0x731F, ${lo(SHIP.Z & 0xffff)}); w(0x7320, ${hi(SHIP.Z & 0xffff)});
  w(0x7321, ${SHIP.pitch}); w(0x7322, ${SHIP.bank}); w(0x7323, ${SHIP.heading});
  return 'ship placed';
})()`);

const type = async (line) => {
  for (const ch of line) await a2.key(ch, { holdFrames: 2, afterFrames: 3 });
  await a2.key(13, { holdFrames: 2, afterFrames: 20 });
};
await type('HIMEM: 24576');
await type('10 HGR: POKE - 16302,0: HCOLOR= 3');
await type('20 POKE 232,255: POKE 233,127');
await type(`30 IF PEEK(${FLAG}) = 0 THEN 30`);
await type('40 CALL 24576');
await type(`50 POKE ${FLAG},0: GOTO 30`);
await type('RUN');
await a2.frames(90);

const before = decodeHgr(await a2.readRange(0x2000, 0x4000));
console.log(`hi-res page before the call: ${before.reduce((s, v) => s + v, 0)} lit pixels`);

await a2.ev(`(() => { window.M.wr(${FLAG}, 1); return 'go'; })()`);
let done = false;
for (let i = 0; i < 120 && !done; i++) {
  await a2.frames(5);
  done = JSON.parse(await a2.ev(`window.M.rd(${FLAG})`)) === 0;
}
const after = decodeHgr(await a2.readRange(0x2000, 0x4000));
const lit = after.reduce((s, v) => s + v, 0);
console.log(`the call ${done ? 'returned' : 'DID NOT RETURN'}; after: ${lit} lit pixels`);

if (lit) {
  let minX = HGR_W, maxX = -1, minY = HGR_H, maxY = -1;
  for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) {
    if (!after[y * HGR_W + x]) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  console.log(`drawn within x ${minX}-${maxX}, y ${minY}-${maxY}`);
  fs.mkdirSync('captured/render', { recursive: true });
  fs.writeFileSync('captured/render/ship3.png', toPng(after));
  console.log('wrote captured/render/ship3.png');
}
console.log('\nscreen:');
console.log((await a2.screen()).filter((l) => l.trim()).join('\n') || '(graphics)');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
