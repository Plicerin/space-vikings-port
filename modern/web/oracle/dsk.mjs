// Read a DOS 3.3 disk image.
//
// Following the chain of programs by reaching each game state only ever finds the branches
// you manage to trigger. The catalog has all of them, so this reads the image directly:
// every file, its type, and for a binary its real load address.
//
// Layout: 35 tracks of 16 sectors of 256 bytes, sector n of track t at (t * 16 + n) * 256.
// The VTOC is track 17 sector 0 and points at the first catalog sector; catalog sectors
// are a linked list, each holding 7 file entries of 35 bytes.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/** The original disk image, wherever this module happens to live. */
export const DISK = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
  '..', 'public', 'data', 'spacevikings.dsk');

export const TRACKS = 35, SECTORS = 16, SECTOR_SIZE = 256;
export const DISK_BYTES = TRACKS * SECTORS * SECTOR_SIZE;      // 143,360

const TYPES = { 0: 'TEXT', 1: 'INTEGER', 2: 'APPLESOFT', 4: 'BINARY', 8: 'S', 16: 'RELOC', 32: 'A', 64: 'B' };

export function openDisk(pathOrBuffer) {
  const buf = Buffer.isBuffer(pathOrBuffer) ? pathOrBuffer : fs.readFileSync(pathOrBuffer);
  if (buf.length !== DISK_BYTES) throw new Error(`not a 35-track DOS 3.3 image: ${buf.length} bytes, expected ${DISK_BYTES}`);
  const sector = (t, s) => buf.subarray((t * SECTORS + s) * SECTOR_SIZE, (t * SECTORS + s + 1) * SECTOR_SIZE);

  const vtoc = sector(17, 0);
  if (vtoc[3] !== 3) throw new Error(`VTOC says DOS version ${vtoc[3]}, not 3 — this reader only understands DOS 3.3`);

  const files = [];
  let [ct, cs] = [vtoc[1], vtoc[2]];
  const visited = new Set();
  while (ct !== 0 && !visited.has(ct * 16 + cs)) {
    visited.add(ct * 16 + cs);
    const cat = sector(ct, cs);
    for (let i = 0; i < 7; i++) {
      const e = cat.subarray(11 + i * 35, 11 + (i + 1) * 35);
      if (e[0] === 0 || e[0] === 0xff) continue;           // never used, or deleted
      // 30 name bytes, high bit set, space padded
      const name = [...e.subarray(3, 33)].map((b) => String.fromCharCode(b & 0x7f)).join('').trimEnd();
      files.push({
        name,
        locked: !!(e[2] & 0x80),
        type: TYPES[e[2] & 0x7f] ?? `type ${e[2] & 0x7f}`,
        sectors: e[33] | (e[34] << 8),
        tsList: [e[0], e[1]],
      });
    }
    [ct, cs] = [cat[1], cat[2]];
  }

  /** The file's data sectors, concatenated, exactly as stored. */
  const rawData = (f) => {
    const out = [];
    let [t, s] = f.tsList;
    const seen = new Set();
    while (t !== 0 && !seen.has(t * 16 + s)) {
      seen.add(t * 16 + s);
      const ts = sector(t, s);
      for (let i = 12; i < SECTOR_SIZE; i += 2) {
        if (ts[i] === 0 && ts[i + 1] === 0) continue;       // a hole, or past the end
        out.push(sector(ts[i], ts[i + 1]));
      }
      [t, s] = [ts[1], ts[2]];
    }
    return Buffer.concat(out);
  };

  /**
   * The file's contents with its DOS header stripped, and what the header said.
   *
   * An Applesoft or Integer file starts with a 2-byte length; a binary starts with a
   * 2-byte load address then a 2-byte length. A text file has no header at all.
   */
  const read = (f) => {
    const raw = rawData(f);
    if (f.type === 'BINARY') {
      const addr = raw[0] | (raw[1] << 8), len = raw[2] | (raw[3] << 8);
      return { addr, len, data: raw.subarray(4, 4 + len), raw };
    }
    if (f.type === 'APPLESOFT' || f.type === 'INTEGER') {
      const len = raw[0] | (raw[1] << 8);
      return { addr: 0x801, len, data: raw.subarray(2, 2 + len), raw };
    }
    return { addr: null, len: raw.length, data: raw, raw };
  };

  return { buf, sector, files, read, rawData };
}

/** A byte array indexed by absolute address, for a file loaded where DOS would put it. */
export function asMemory({ addr, data }, base = addr) {
  const mem = {};
  for (let i = 0; i < data.length; i++) mem[base + i] = data[i];
  return mem;
}
