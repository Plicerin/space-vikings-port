// The starfield, off the disk.
//
// PLANET # 0 BLOADs to $7300. Its first 36 bytes are a header - including the ship's own
// state at offsets 27-35 ($731B-$7323) - and from offset 36 it is 195 opcode-0 records,
// exactly filling the file (36 + 195 * 7 = 1401). That is the star table: fixed points, not
// the random field the port generates.
import { openDisk, DISK } from './dsk.mjs';
import fs from 'fs';

const LIST_START = 36;
const d = openDisk(DISK);
const r = d.read(d.files.find((f) => f.name === 'PLANET # 0'));
const bytes = [...r.data.subarray(LIST_START)];
const records = bytes.length / 7;
if (!Number.isInteger(records)) throw new Error(`${bytes.length} bytes from offset ${LIST_START} is not a whole number of 7-byte records`);

const s16 = (i) => { const v = bytes[i] | (bytes[i + 1] << 8); return v > 32767 ? v - 65536 : v; };
let nonPoint = 0;
const pts = [];
for (let i = 0; i + 6 < bytes.length; i += 7) {
  if (bytes[i] !== 0) { nonPoint++; continue; }
  pts.push({ x: s16(i + 1), y: s16(i + 3), z: s16(i + 5) });
}
const rng = (k) => `${Math.min(...pts.map((p) => p[k]))}..${Math.max(...pts.map((p) => p[k]))}`;
console.log(`PLANET # 0: ${r.len} bytes, list from offset ${LIST_START}, ${records} records`);
console.log(`  ${pts.length} points, ${nonPoint} non-point records`);
console.log(`  x ${rng('x')}   y ${rng('y')}   z ${rng('z')}`);

fs.writeFileSync('../public/data/shapes/starfield-bytecode.json', JSON.stringify({
  source: 'PLANET # 0 on the original disk, BLOADed to $7300; the record list from offset 36',
  note: 'the same bytecode the ship models use - all opcode 0, which is a lone point',
  length: bytes.length, points: pts.length, bytes,
}, null, 2) + String.fromCharCode(10));
console.log('wrote ../public/data/shapes/starfield-bytecode.json');
