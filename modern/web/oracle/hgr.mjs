// The Apple II hi-res page, decoded to pixels.
//
// The page is 8192 bytes at $2000 and its rows are interleaved three ways: a row's address
// is base + (y & 7) * $400 + ((y >> 3) & 7) * $80 + (y >> 6) * $28. Each byte holds seven
// pixels in bits 0-6, leftmost in the low bit; bit 7 picks the colour palette and is not a
// pixel. 40 bytes * 7 = 280 pixels across, 192 rows down.
import zlib from 'zlib';

export const HGR_W = 280, HGR_H = 192, HGR_BYTES = 8192;

/** Byte offset within the page of the first byte of row y. */
export function rowOffset(y) {
  return (y & 7) * 0x400 + ((y >> 3) & 7) * 0x80 + (y >> 6) * 0x28;
}

/**
 * Decode a hi-res page into one byte per pixel, 1 where the pixel is lit.
 *
 * This deliberately ignores bit 7 and all colour: comparing lit-or-not is the comparison
 * that does not depend on how either side resolves hi-res colour fringing.
 */
export function decodeHgr(bytes) {
  if (bytes.length < HGR_BYTES) throw new Error(`a hi-res page is ${HGR_BYTES} bytes, got ${bytes.length}`);
  const on = new Uint8Array(HGR_W * HGR_H);
  for (let y = 0; y < HGR_H; y++) {
    const row = rowOffset(y), out = y * HGR_W;
    for (let x = 0; x < HGR_W; x++) {
      on[out + x] = (bytes[row + ((x / 7) | 0)] >> (x % 7)) & 1;
    }
  }
  return on;
}

/** Compare two decoded pages. Returns counts and a per-row breakdown. */
export function compare(a, b) {
  if (a.length !== b.length) throw new Error(`sizes differ: ${a.length} vs ${b.length}`);
  let differing = 0, onlyA = 0, onlyB = 0, litA = 0, litB = 0;
  const perRow = new Uint16Array(HGR_H);
  for (let i = 0; i < a.length; i++) {
    if (a[i]) litA++;
    if (b[i]) litB++;
    if (a[i] === b[i]) continue;
    differing++;
    perRow[(i / HGR_W) | 0]++;
    if (a[i]) onlyA++; else onlyB++;
  }
  return { total: a.length, differing, onlyA, onlyB, litA, litB, perRow,
    agreement: 1 - differing / a.length };
}

/** A monochrome PNG of a decoded page, scaled up, with no dependencies. */
export function toPng(on, { scale = 2, w = HGR_W, h = HGR_H, colour = [255, 255, 255] } = {}) {
  const W = w * scale, H = h * scale;
  const raw = Buffer.alloc(H * (W * 3 + 1));
  let p = 0;
  for (let y = 0; y < H; y++) {
    raw[p++] = 0;                                        // filter: none
    for (let x = 0; x < W; x++) {
      const lit = on[((y / scale) | 0) * w + ((x / scale) | 0)];
      raw[p++] = lit ? colour[0] : 0;
      raw[p++] = lit ? colour[1] : 0;
      raw[p++] = lit ? colour[2] : 0;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}
