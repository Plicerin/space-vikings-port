// The ship models, and the shape table the instruments are drawn with.
//
// Two different things live under "shapes" on this disk:
//
//   ENEMY I.A24580.L68, BLOADed to $7FFF, is an Applesoft shape table - STARSHIP SIMULATOR
//   line 2 does POKE 232,HL: POKE 233,127, pointing $E8/$E9 at $7FFF, and the panel is
//   drawn with DRAW 13 / DRAW 14 / DRAW 25 / DRAW 26.
//
//   SHIP # 0/1/3/4 and DEBRIS, BLOADed to $7879, are not shape tables at all. They are 3D
//   vector models: a one-byte opcode then three 16-bit little-endian signed coordinates,
//   seven bytes to a record. The coordinates sit around (300..350, -85..-115, -3500) -
//   which is the ship anchor STARSHIP SIMULATOR line 2 sets up as X9=400, Y9=-100,
//   Z9=-3500 - so they are world coordinates, already placed.
import { openDisk, DISK } from './dsk.mjs';
import fs from 'fs';

const d = openDisk(DISK);
const s16 = (b, i) => { const v = b[i] | (b[i + 1] << 8); return v > 32767 ? v - 65536 : v; };

const SHIPS = ['SHIP # 0', 'SHIP # 1', 'SHIP # 3', 'SHIP # 4', 'DEBRIS'];
const REC = 7;

/**
 * Parse a $7879 model as the bytecode stream it is.
 *
 * Opcode 4 takes one operand byte, opcodes 0-3 take three 16-bit little-endian signed
 * coordinates, and 0x7F ends the model - SHIP # 0 is a one-byte file containing exactly
 * 0x7F, which is an empty model and the clearest possible confirmation of the terminator.
 *
 * Reading it as "two header bytes then fixed 7-byte records" happens to work for SHIP # 1
 * and # 4, but desyncs the moment a second opcode 4 appears mid-stream.
 */
function parseModel(data) {
  const ops = [];
  let i = 0, ended = false;
  while (i < data.length) {
    const op = data[i];
    if (op === 0x7f) { ended = true; i++; break; }
    if (op === 4) { ops.push({ op, state: data[i + 1], at: i }); i += 2; continue; }
    if (op > 4) { ops.push({ op, bad: true, at: i }); i += 1; continue; }
    ops.push({ op, x: s16(data, i + 1), y: s16(data, i + 3), z: s16(data, i + 5), at: i });
    i += 7;
  }
  return { ops, ended, trailing: [...data.subarray(i)] };
}

const models = {};
for (const name of SHIPS) {
  const f = d.files.find((x) => x.name === name);
  const r = d.read(f);
  if (r.len < 16) { console.log(`\n=== ${name} === ${r.len} bytes - too short to be a model (${[...r.data].map((b) => b.toString(16)).join(' ')})`); continue; }
  const m = parseModel(r.data);
  models[name] = m;
  const counts = {};
  for (const v of m.ops) counts[v.bad ? `bad:${v.op}` : v.op] = (counts[v.bad ? `bad:${v.op}` : v.op] ?? 0) + 1;
  const pts = m.ops.filter((v) => v.op < 4);
  const rng = (k) => { const vs = pts.map((v) => v[k]); return `${Math.min(...vs)}..${Math.max(...vs)}`; };
  console.log(`
=== ${name} === ${r.len} bytes, ${m.ops.length} ops, ` +
    `${m.ended ? 'ends with $7F' : 'NO $7F TERMINATOR'}, ${m.trailing.length} byte(s) after [${m.trailing.join(' ')}]`);
  console.log(`  opcodes: ${Object.entries(counts).map(([o, n]) => `${o} x${n}`).join('   ')}`);
  console.log(`  x ${rng('x')}   y ${rng('y')}   z ${rng('z')}`);
  console.log(`  first 6: ${m.ops.slice(0, 6).map((v) => v.op === 4 ? `set-state(${v.state})` : `${v.op}(${v.x},${v.y},${v.z})`).join(' ')}`);
}

// --- the Applesoft shape table -----------------------------------------------------------
//
// Format: byte 0 is the shape count, byte 1 is unused, then a 2-byte offset per shape from
// the start of the table. Each shape is a run of bytes holding three 3-bit vectors (bits
// 0-2, 3-5, 6-7 with no plot for the last); 0 ends the shape.
const st = d.read(d.files.find((x) => x.name === 'ENEMY I.A24580.L68'));
const count = st.data[0];
const offsets = [];
for (let i = 0; i < count; i++) offsets.push(st.data[2 + i * 2] | (st.data[3 + i * 2] << 8));
console.log(`\n=== ENEMY I.A24580.L68 (the DRAW shape table at $7FFF) === ${st.len} bytes, ${count} shapes`);

/** Walk a shape's vectors into line segments, the way DRAW does at ROT=0 SCALE=1. */
function shapeToSegments(data, off) {
  const DX = [0, 0, 1, 0, 0, 0, -1, 0], DY = [-1, 0, 0, 1, -1, 0, 0, 1];
  const pts = [[0, 0]];
  let x = 0, y = 0, minX = 0, maxX = 0, minY = 0, maxY = 0, n = 0;
  for (let i = off; i < data.length && n < 4096; i++) {
    const b = data[i];
    if (b === 0) break;
    for (const [v, plot] of [[b & 7, !!(b & 4)], [(b >> 3) & 7, !!(b & 0x20)], [(b >> 6) & 3, false]]) {
      if (v === 0 && !plot) continue;
      x += DX[v & 7]; y += DY[v & 7];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      pts.push([x, y]); n++;
    }
  }
  return { points: n, w: maxX - minX + 1, h: maxY - minY + 1 };
}
for (let i = 0; i < count; i++) {
  const s = shapeToSegments(st.data, offsets[i]);
  console.log(`  shape ${String(i + 1).padStart(2)}  offset $${offsets[i].toString(16).padStart(3, '0')}  ` +
    `${String(s.points).padStart(4)} vectors, about ${s.w}x${s.h}`);
}

// --- emit the port's ship assets, from the disk ------------------------------------------
// The port's tools/extract_ship_bytecode_assets.mjs read ../../extracted/*.payload.bin,
// files of unknown provenance. Their bytes happen to be identical to the disk's for ships
// 1, 3 and 4 - checked - but SHIP # 0 and DEBRIS were never extracted at all, and the disk
// is the source that can be re-derived.
const OUT = '../public/data/shapes';
for (const [name, key] of [['SHIP # 0', 'ship-0'], ['SHIP # 1', 'ship-1'], ['SHIP # 3', 'ship-3'],
                           ['SHIP # 4', 'ship-4'], ['DEBRIS', 'debris']]) {
  const f = d.files.find((x) => x.name === name);
  const r = d.read(f);
  fs.writeFileSync(`${OUT}/${key}-bytecode.json`, JSON.stringify({
    shipKind: key === 'debris' ? null : Number(key.slice(5)),
    source: `${name} on the original disk, BLOADed to $7879`,
    length: r.len,
    bytes: [...r.data],
  }, null, 2) + String.fromCharCode(10));
  console.log(`wrote ${OUT}/${key}-bytecode.json  (${r.len} bytes)`);
}

fs.writeFileSync('captured/ship_models.json', JSON.stringify({
  models: Object.fromEntries(Object.entries(models).map(([k, v]) => [k, { ops: v.ops, ended: v.ended }])),
  shapeTable: { count, offsets },
}, null, 2) + '\n');
console.log('\nwrote captured/ship_models.json');
