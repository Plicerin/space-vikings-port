import { openDisk, DISK } from './dsk.mjs';
const d = openDisk(DISK);
for (const nm of ['PLANET FILE-M', 'P/F-M', "SHIP'S DATA-M"]) {
  const f = d.files.find((f) => f.name === nm);
  const r = d.read(f);
  const base = { 'PLANET FILE-M': 0x954c, 'P/F-M': 0x97e1, "SHIP'S DATA-M": 0x9506 }[nm];
  console.log(`\n=== ${nm} — BLOADed to $${base.toString(16)} (${base}), ${r.len} bytes ===`);
  for (let i = 0; i < r.len; i += 16) {
    const row = [...r.data.subarray(i, i + 16)];
    console.log(`$${(base + i).toString(16)} ${String(base + i).padStart(5)} +${String(i).padStart(3)}  ` +
      row.map((b) => b.toString(16).padStart(2, '0')).join(' ').padEnd(48) +
      row.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join(''));
  }
}
