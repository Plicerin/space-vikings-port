// Ship models, straight off the original disk.
//
// This used to read ../../extracted/SHIP no N.payload.bin - files of unknown provenance.
// Their bytes turn out to be identical to the disk's for ships 1, 3 and 4, but SHIP # 0 and
// DEBRIS were never extracted at all, and a source that can be re-derived beats one that
// happens to be right.
//
// The models are not Applesoft shape tables. They are 3D vector bytecode, BLOADed to $7879
// and walked by the machine code at $9023: opcode 4 takes one operand byte, opcodes 0-3
// take three 16-bit little-endian signed coordinates, and $7F ends the model. SHIP # 0 is a
// one-byte file containing exactly $7F - an empty model.
//
// The shape table the game DRAWs from is a different file entirely: ENEMY I.A24580.L68,
// BLOADed to $7FFF. oracle/probe_shapetable.mjs extracts that one.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDisk, DISK } from '../oracle/dsk.mjs';

const MODELS = [
  { key: 'ship-0', file: 'SHIP # 0', shipKind: 0 },
  { key: 'ship-1', file: 'SHIP # 1', shipKind: 1 },
  { key: 'ship-3', file: 'SHIP # 3', shipKind: 3 },
  { key: 'ship-4', file: 'SHIP # 4', shipKind: 4 },
  { key: 'debris', file: 'DEBRIS', shipKind: null },
];

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const outDir = path.join(here, '..', 'public', 'data', 'shapes');
  await fs.mkdir(outDir, { recursive: true });

  const disk = openDisk(DISK);
  for (const m of MODELS) {
    const entry = disk.files.find((f) => f.name === m.file);
    if (!entry) throw new Error(`${m.file} is not on the disk`);
    const r = disk.read(entry);
    const outPath = path.join(outDir, `${m.key}-bytecode.json`);
    await fs.writeFile(outPath, `${JSON.stringify({
      shipKind: m.shipKind,
      source: `${m.file} on the original disk, BLOADed to $7879`,
      length: r.len,
      bytes: [...r.data],
    }, null, 2)}\n`);
    process.stdout.write(`wrote ${outPath} (${r.len} bytes)\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
