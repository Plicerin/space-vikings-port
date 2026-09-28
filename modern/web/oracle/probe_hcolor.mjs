// Which pixel columns does each HCOLOR actually light?
//
// Parity measured green (HCOLOR= 1) and orange (HCOLOR= 5) from the game's own panel: both
// light odd columns only. The other six were going to be assumed from the hardware rule,
// which is exactly the kind of assumption this project does not make.
//
// It does not need the game, or even a disk: HGR, HCOLOR and HPLOT are all Applesoft ROM.
// Resetting with an empty drive leaves the Autostart ROM scanning slot 6 for ever, so this
// enters Applesoft's cold start at $E000 instead, which comes up at a bare `]` prompt.
import { openOracle } from './a2.mjs';
import { decodeHgr, HGR_W } from './hgr.mjs';

const ROW = 100;

const a2 = await openOracle();
await a2.ev(`(() => {
  window.M.a2.reset();
  const st = window.M.cpu.getState(); st.pc = 0xE000; window.M.cpu.setState(st);
  return 'Applesoft cold start';
})()`);

// Let the Autostart ROM settle at the prompt.
for (let i = 0; i < 40 && !(await a2.screen()).some((l) => l.trim().endsWith(']')); i++) await a2.frames(30);
const atPrompt = (await a2.screen()).some((l) => l.trim().endsWith(']'));
if (!atPrompt) {
  console.log((await a2.screen()).filter((l) => l.trim()).join('\n'));
  await a2.close();
  throw new Error('never reached the ] prompt - cannot type anything');
}
console.log('at the ] prompt\n');

const type = async (line) => {
  for (const ch of line) await a2.key(ch, { holdFrames: 2, afterFrames: 3 });
  await a2.key(13, { holdFrames: 2, afterFrames: 30 });
};

const NAMES = ['black1', 'green', 'violet', 'white1', 'black2', 'orange', 'blue', 'white2'];
const results = [];

for (let c = 0; c <= 7; c++) {
  // HGR clears the page; the line spans the full width so every column gets a chance.
  await type(`HGR:HCOLOR=${c}:HPLOT 0,${ROW} TO 279,${ROW}`);
  await a2.frames(60);
  const on = decodeHgr(await a2.readRange(0x2000, 0x4000));
  const row = on.slice(ROW * HGR_W, (ROW + 1) * HGR_W);
  let lit = 0, even = 0, odd = 0;
  for (let x = 0; x < HGR_W; x++) if (row[x]) { lit++; if (x % 2) odd++; else even++; }
  const pattern = lit === 0 ? 'none' : even && odd ? 'all' : odd ? 'odd columns' : 'even columns';
  results.push({ c, name: NAMES[c], lit, even, odd, pattern });
  console.log(`HCOLOR= ${c}  ${NAMES[c].padEnd(7)}  ${String(lit).padStart(3)} lit  ` +
    `(even ${String(even).padStart(3)}, odd ${String(odd).padStart(3)})  ${pattern}`);
  console.log(`            x0-39  ${Array.from(row.slice(0, 40)).join('')}`);
}

// The palette bit: HPLOT also sets bit 7 of every byte it touches, which is what picks
// between the two colour sets. Read it so the port knows which colours set it.
await type(`HGR:HCOLOR=1:HPLOT 0,${ROW} TO 279,${ROW}`);
await a2.frames(60);
const pg1 = await a2.readRange(0x2000, 0x4000);
await type(`HGR:HCOLOR=5:HPLOT 0,${ROW} TO 279,${ROW}`);
await a2.frames(60);
const pg5 = await a2.readRange(0x2000, 0x4000);
const rowOff = (ROW & 7) * 0x400 + ((ROW >> 3) & 7) * 0x80 + (ROW >> 6) * 0x28;
const hiBits = (pg) => [...Array(40)].map((_, i) => (pg[rowOff + i] >> 7) & 1).join('');
console.log('');
console.log(`bit 7 across the row, HCOLOR= 1 (green):  ${hiBits(pg1)}`);
console.log(`bit 7 across the row, HCOLOR= 5 (orange): ${hiBits(pg5)}`);

// INSTRUMENTS 70 draws its orange rules as HPLOT 5,177 TO 117,177 rather than across the
// whole width, and frame parity showed the disk lighting a few even columns there. A
// full-width line did not. Draw the game's actual line and look.
console.log('');
console.log('INSTRUMENTS 70, drawn exactly as the game draws it:');
await type(`HGR:HCOLOR=5:HPLOT 5,${ROW} TO 117,${ROW}`);
await a2.frames(60);
{
  const on = decodeHgr(await a2.readRange(0x2000, 0x4000));
  const row = on.slice(ROW * HGR_W, (ROW + 1) * HGR_W);
  let even = 0, odd = 0;
  for (let x = 0; x < HGR_W; x++) if (row[x]) { if (x % 2) odd++; else even++; }
  console.log(`  HPLOT 5,y TO 117,y   even ${even}, odd ${odd}`);
  console.log(`  x0-39   ${Array.from(row.slice(0, 40)).join('')}`);
  console.log(`  x40-79  ${Array.from(row.slice(40, 80)).join('')}`);
}
// and the same span starting on a byte boundary, for comparison
await type(`HGR:HCOLOR=5:HPLOT 7,${ROW} TO 117,${ROW}`);
await a2.frames(60);
{
  const on = decodeHgr(await a2.readRange(0x2000, 0x4000));
  const row = on.slice(ROW * HGR_W, (ROW + 1) * HGR_W);
  let even = 0, odd = 0;
  for (let x = 0; x < HGR_W; x++) if (row[x]) { if (x % 2) odd++; else even++; }
  console.log(`  HPLOT 7,y TO 117,y   even ${even}, odd ${odd}`);
  console.log(`  x0-39   ${Array.from(row.slice(0, 40)).join('')}`);
}

console.log('');
console.log('summary:');
for (const r of results) console.log(`  ${r.c} ${r.name.padEnd(7)} -> ${r.pattern}`);
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
