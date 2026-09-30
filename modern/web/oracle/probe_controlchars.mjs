// Every control character hidden inside a string on this disk.
//
// `detokenise.mjs` used to write control characters out as themselves, which a terminal does
// not show, so `PRINT "^L"` listed as `PRINT ""` and `PRINT "^DBLOAD EXPL"` listed as
// `PRINT "BLOAD EXPL"`. That hid a form feed that clears the hi-res page and the Ctrl-D that
// starts every DOS command - in S/X. This sweeps all twenty-one Applesoft programs for the
// rest of them, because a listing that silently drops bytes is not evidence and every quoted
// listing in DISK_TRUTH came through it.
//
// Nothing is emulated here: it reads the tokenised bytes straight off the disk image.
import { openDisk, DISK } from './dsk.mjs';
import fs from 'fs';

const NAMES = {
  0x00: 'NUL', 0x01: '^A', 0x02: '^B', 0x03: '^C', 0x04: '^D  DOS command',
  0x05: '^E', 0x06: '^F', 0x07: '^G  bell', 0x08: '^H  backspace',
  0x09: '^I  tab', 0x0A: '^J  line feed', 0x0B: '^K', 0x0C: '^L  form feed, clears the page',
  0x0D: '^M  carriage return', 0x0E: '^N', 0x0F: '^O', 0x10: '^P', 0x11: '^Q',
  0x12: '^R', 0x13: '^S', 0x14: '^T', 0x15: '^U', 0x16: '^V', 0x17: '^W',
  0x18: '^X', 0x19: '^Y', 0x1A: '^Z', 0x1B: '^[  escape', 0x1C: '^\\', 0x1D: '^]',
  0x1E: '^^', 0x1F: '^_', 0x7F: '^?  delete',
};

const disk = openDisk(DISK);
const findings = [];

for (const f of disk.files) {
  if (!/APPLESOFT/i.test(f.type)) continue;
  const name = f.name.trim();
  let r;
  try { r = disk.read(f); } catch { continue; }
  const d = r.data;

  // Walk the line list: two bytes of next-line pointer, two of line number, then the
  // tokenised text ending in a zero.
  let p = 0;
  while (p + 4 <= d.length) {
    const next = d[p] | (d[p + 1] << 8);
    const num = d[p + 2] | (d[p + 3] << 8);
    let q = p + 4;
    const bytes = [];
    while (q < d.length && d[q] !== 0) { bytes.push(d[q]); q++; }

    // Only what is inside quotes counts. Outside them a low byte is punctuation or a digit.
    let quoted = false;
    bytes.forEach((b, i) => {
      if (b === 0x22) { quoted = !quoted; return; }
      if (!quoted) return;
      const c = b & 0x7f;
      if (c >= 0x20 && c !== 0x7f) return;
      // a little context either side, with the control byte marked
      const from = Math.max(0, i - 12);
      const to = Math.min(bytes.length, i + 14);
      const ctx = bytes.slice(from, to).map((x, k) => {
        const v = x & 0x7f;
        if (from + k === i) return `[${(NAMES[c] || '^?').split(' ')[0]}]`;
        return v >= 0x20 && v !== 0x7f ? String.fromCharCode(v) : '.';
      }).join('');
      // whether it opens its string, which is what makes a Ctrl-D unremarkable
      const opensString = i > 0 && bytes[i - 1] === 0x22;
      findings.push({ file: name, line: num, byte: c, at: i, opensString, context: ctx });
    });

    if (next === 0) break;
    p = q + 1;
  }
}

console.log(`${findings.length} control character(s) inside strings, across the disk`);
console.log('');

const byByte = new Map();
for (const x of findings) {
  if (!byByte.has(x.byte)) byByte.set(x.byte, []);
  byByte.get(x.byte).push(x);
}
for (const [b, list] of [...byByte.entries()].sort((a, c) => c[1].length - a[1].length)) {
  const files = [...new Set(list.map((x) => x.file))];
  console.log(`  $${b.toString(16).padStart(2, '0').toUpperCase()}  ${(NAMES[b] || '?').padEnd(30)}` +
    ` ${String(list.length).padStart(4)} time(s) in ${files.length} program(s)`);
}

// The Ctrl-D that opens a DOS command is expected everywhere and says nothing. Anything else
// is a character the machine acts on that no listing has ever shown.
console.log('');
const notDos = findings.filter((x) => x.byte !== 0x04);
console.log(`of those, ${notDos.length} are not the DOS Ctrl-D:`);
console.log('');
for (const x of notDos) {
  console.log(`  ${x.file.padEnd(20)} ${String(x.line).padStart(5)}  ` +
    `$${x.byte.toString(16).padStart(2, '0').toUpperCase()}  ${x.context}`);
}

// And where a Ctrl-D sits somewhere other than the start of its string, because that is the
// one thing about them that would not be routine.
console.log('');
// A Ctrl-D is only interesting if it is NOT opening its string: DOS reads one at the start of
// a PRINT and treats the rest as a command, so that is every one of them doing its job.
const oddDos = findings.filter((x) => x.byte === 0x04 && !x.opensString);
console.log(`Ctrl-D somewhere other than the first byte of its string: ${oddDos.length}`);
for (const x of oddDos.slice(0, 20)) {
  console.log(`  ${x.file.padEnd(20)} ${String(x.line).padStart(5)}  ${x.context}`);
}

fs.mkdirSync('captured/controlchars', { recursive: true });
fs.writeFileSync('captured/controlchars/findings.json', JSON.stringify({
  source: 'every control byte inside a quoted string, read from the tokenised bytes on the disk',
  findings,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/controlchars/findings.json');
