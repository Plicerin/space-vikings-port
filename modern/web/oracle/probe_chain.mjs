// Capture the BASIC programs the game runs, as it runs them.
//
// The game is a chain of Applesoft programs, not one. This follows the chain live, which
// is what proves the disk reader honest: a program listed out of the running machine and
// the same program taken off the disk image must agree byte for byte.
//
// The stepping loop runs inside the page. Stepping 30 frames per round trip took minutes
// of wall clock to cover a single disk load; in-page it is one call.
import { openOracle } from './a2.mjs';
import { listProgram } from './detokenise.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import fs from 'fs';

const render = (lines) => lines.map((l) => `${l.num} ${l.text}`).join('\n') + '\n';

// Name each capture by matching it against the catalog rather than guessing from the
// previous program's RUN. Guessing got it wrong: the boot program runs INSTRUMENTS, but
// INSTRUMENTS chains on so quickly that the next settled image is already STARSHIP
// SIMULATOR — which then got filed under the wrong name.
const disk = openDisk(DISK);
const BY_TEXT = new Map();
for (const f of disk.files.filter((f) => f.type === 'APPLESOFT')) {
  const r = disk.read(f);
  BY_TEXT.set(render(listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)), f.name);
}

// Line 30 of the boot program does HIMEM: 8192, so no Applesoft program on this disk can
// reach past $2000 — read that whole window every time. Keying on VARTAB instead listed
// the same program three times over, because VARTAB drifts while binaries load.
const PROG_TOP = 0x2000;

const a2 = await openOracle();
await a2.boot();
console.log('at the title prompt; answering (N)EW\n');
await a2.key('N');

const seen = new Set();
const programs = [];

for (let round = 0; round < 40; round++) {
  // Step until the program image stops changing: during a BLOAD it is still being written.
  const r = JSON.parse(await a2.ev(`(() => {
    const M = window.M;
    let stable = 0, prev = '';
    for (let i = 0; i < 60; i++) {
      M.frames(30);
      const sig = M.hash(0x800, ${PROG_TOP});
      stable = (sig === prev) ? stable + 1 : 0;
      prev = sig;
      if (stable === 4) return JSON.stringify({ frames: (i + 1) * 30, settled: true });
    }
    return JSON.stringify({ frames: 1800, settled: false });
  })()`));

  const bytes = await a2.readRange(0x800, PROG_TOP);
  const mem = {};
  for (let i = 0; i < bytes.length; i++) mem[0x800 + i] = bytes[i];

  let lines;
  try { lines = listProgram(mem, 0x801, PROG_TOP); }
  catch (e) { console.log(`  (not an Applesoft program: ${e.message})`); continue; }
  if (!lines.length) continue;

  const text = render(lines);
  if (seen.has(text)) continue;                  // the same program, still running
  seen.add(text);

  const known = BY_TEXT.get(text);
  const name = known ?? `UNKNOWN ${programs.length}`;
  const file = `captured/live/${name.replace(/[^\w.-]+/g, '_').toLowerCase()}.bas`;
  fs.mkdirSync('captured/live', { recursive: true });
  fs.writeFileSync(file, text);
  programs.push({ name, file, lines, known: !!known });
  console.log(`${String(lines.length).padStart(4)} lines  after ${String(r.frames).padStart(4)} more frames` +
    `${r.settled ? '' : ' (NOT settled)'}  ->  ${known ? name : name + ' — no file on the disk matches this'}`);
}

const unknown = programs.filter((p) => !p.known).length;
console.log(`\n${programs.length} program(s) seen live, ${programs.length - unknown} matched to the catalog.`);
console.log(unknown
  ? `${unknown} did NOT match any file on the disk — the disk reader and the machine disagree.`
  : 'Every program seen running was found on the disk image, byte for byte.');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
process.exit(unknown ? 1 : 0);
