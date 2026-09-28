// The starfield, off the disk.
//
// Every PLANET file has the same 36-byte header - including the ship's own state at offsets
// 27-35 ($731B-$7323) - and then a record list in the same bytecode the ship models use.
//
// PLANET # 0's records are all opcode 0, lone points: the star table, fixed, not the random
// field the port generated. The numbered files are opcode 1/2/3 line work with y at 0 - the
// ground wireframe RE BLOADs on approach.
import { openDisk, DISK } from './dsk.mjs';
import fs from 'fs';

const LIST_START = 36;
const d = openDisk(DISK);

// The same header everywhere: 36 bytes, then a record list. PLANET # 0's records are all
// opcode 0 - the stars. The numbered ones are opcode 1/2/3 line work with y at 0, which is
// the ground wireframe RE loads on approach.
function extract(name, out) {
  const r = d.read(d.files.find((f) => f.name === name));
  const bytes = [...r.data.subarray(LIST_START)];
  const s16 = (i) => { const v = bytes[i] | (bytes[i + 1] << 8); return v > 32767 ? v - 65536 : v; };
  const ops = {};
  const pts = [];
  let i = 0, ended = false;
  for (; i < bytes.length; ) {
    const op = bytes[i];
    if (op === 0x7f) { ended = true; break; }
    if (op === 4) { ops['4'] = (ops['4'] ?? 0) + 1; i += 2; continue; }
    if (op > 4) { ops[`bad${op}`] = (ops[`bad${op}`] ?? 0) + 1; i += 1; continue; }
    ops[op] = (ops[op] ?? 0) + 1;
    pts.push([s16(i + 1), s16(i + 3), s16(i + 5)]);
    i += 7;
  }
  const rng = (k) => pts.length ? `${Math.min(...pts.map((p) => p[k]))}..${Math.max(...pts.map((p) => p[k]))}` : '-';
  console.log(`  ${name.padEnd(12)} ${String(r.len).padStart(5)} bytes  ${String(pts.length).padStart(4)} vertices  ` +
    `${ended ? 'ends $7F' : 'runs to the end'}  ops ${JSON.stringify(ops).padEnd(34)} ` +
    `x ${rng(0).padEnd(14)} y ${rng(1).padEnd(10)} z ${rng(2)}`);
  fs.writeFileSync(`../public/data/shapes/${out}`, JSON.stringify({
    source: `${name} on the original disk, BLOADed to $7300; the record list from offset ${LIST_START}`,
    note: 'the same bytecode the ship models use',
    length: bytes.length, vertices: pts.length, bytes,
  }, null, 2) + String.fromCharCode(10));
  return pts.length;
}

console.log('PLANET files, list from offset 36:');
extract('PLANET # 0', 'starfield-bytecode.json');
for (let n = 1; n <= 20; n++) extract(`PLANET # ${n}`, `planet-${n}-ground.json`);
console.log('');
console.log('wrote starfield-bytecode.json and planet-1..20-ground.json to public/data/shapes/');
