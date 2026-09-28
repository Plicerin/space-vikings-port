// Extract every program on the disk, and check the extraction against the machine.
//
// Reading the image is only trustworthy if it agrees with the disk actually running. START
// and STARSHIP SIMULATOR were listed out of live memory by probe_chain.mjs; if the copies
// taken off the image do not match those byte for byte, the reader is wrong and nothing
// else it produces can be believed.
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import fs from 'fs';

const d = openDisk(DISK);
fs.mkdirSync('captured/disk', { recursive: true });

const listed = [];
for (const f of d.files.filter((f) => f.type === 'APPLESOFT')) {
  const r = d.read(f);
  const lines = listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2);
  const text = lines.map((l) => `${l.num} ${l.text}`).join('\n') + '\n';
  const file = `captured/disk/${f.name.replace(/[^\w.-]+/g, '_').toLowerCase()}.bas`;
  fs.writeFileSync(file, text);
  listed.push({ name: f.name, lines: lines.length, bytes: r.len, file });
}
console.log(`\n${listed.length} Applesoft programs extracted to captured/disk/`);
for (const p of listed) console.log(`  ${p.name.padEnd(22)} ${String(p.lines).padStart(4)} lines  ${String(p.bytes).padStart(5)} bytes`);

// the check
console.log('\nagainst the same programs listed out of the running machine:');
let ok = true;
for (const name of ['start', 'starship_simulator', 're']) {
  const a = fs.readFileSync(`captured/disk/${name}.bas`, 'utf8');
  let b;
  try { b = fs.readFileSync(`captured/live/${name}.bas`, 'utf8'); }
  catch { console.log(`  ${name.padEnd(20)} no live capture to compare against - run probe_chain.mjs`); continue; }
  const same = a === b;
  ok &&= same;
  if (same) { console.log(`  ${name.padEnd(20)} identical to captured/live/${name}.bas`); continue; }
  const al = a.split('\n'), bl = b.split('\n');
  const i = al.findIndex((l, n) => l !== bl[n]);
  console.log(`  ${name.padEnd(20)} DIFFERS at line ${i + 1}:\n    disk: ${al[i]}\n    live: ${bl[i]}`);
}
console.log(ok ? '\nThe disk reader agrees with the machine.' : '\nThe disk reader does NOT agree with the machine — do not trust what it extracted.');
process.exit(ok ? 0 : 1);
