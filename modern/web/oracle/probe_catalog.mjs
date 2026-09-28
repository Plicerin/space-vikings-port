// Everything on the disk: the catalog, and where each binary loads.
import { openDisk, DISK } from './dsk.mjs';
const d = openDisk(DISK);
console.log(`${d.files.length} files\n`);
console.log('TYPE       SEC  NAME                            LOADS AT   LENGTH');
for (const f of d.files) {
  let where = '';
  try { const r = d.read(f); where = r.addr === null ? '' : `$${r.addr.toString(16).toUpperCase().padStart(4, '0')}`.padEnd(10) + `$${r.len.toString(16).toUpperCase()} (${r.len})`; }
  catch (e) { where = '(unreadable: ' + e.message + ')'; }
  console.log(`${f.type.padEnd(10)} ${String(f.sectors).padStart(3)}  ${(f.locked ? '*' : ' ') + f.name.padEnd(30)} ${where}`);
}
