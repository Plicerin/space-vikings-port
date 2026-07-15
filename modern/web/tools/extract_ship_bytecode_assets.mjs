import fs from 'node:fs/promises';
import path from 'node:path';

const SHIPS = [
  { kind: 1, file: 'SHIP no 1.payload.bin' },
  { kind: 3, file: 'SHIP no 3.payload.bin' },
  { kind: 4, file: 'SHIP no 4.payload.bin' },
];

async function main() {
  const repoRoot = path.resolve(process.cwd(), '..', '..');
  const extractedDir = path.join(repoRoot, 'extracted');
  const outDir = path.join(process.cwd(), 'public', 'data', 'shapes');
  await fs.mkdir(outDir, { recursive: true });

  for (const ship of SHIPS) {
    const inputPath = path.join(extractedDir, ship.file);
    const bytes = [...await fs.readFile(inputPath)];
    const payload = {
      shipKind: ship.kind,
      source: inputPath,
      length: bytes.length,
      bytes,
    };
    const outPath = path.join(outDir, `ship-${ship.kind}-bytecode.json`);
    await fs.writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`);
    process.stdout.write(`wrote ${outPath}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
