// What COM's twelve right-hand readouts are, and when each one is drawn.
//
// Lines 40-70 lay them out in a 3 x 4 grid and print two lines each. The layout falls out
// of the listing, but one thing does not: line 70 calls GOSUB 10000 before every PRINT, and
// that subroutine does nothing but POKE 973 (= $3CD) to either 0 or 255.
//
//   10000 IF J1 = 7 AND PEEK(ST(J1)) < 16 THEN POKE 973,255: RETURN
//   10005 IF T = 0 THEN POKE 973,255: RETURN
//   10010 POKE 973,0: RETURN
//
// $3CD is part of the character generator's vector area, so 255 is either "draw" or "skip"
// and the listing cannot say which. Reading it either way gives an opposite UI: the grid
// either lists the systems that have failed, or lists the ones still working.
//
// So measure it. STARSHIP SIMULATOR is the program COM is reached from, and it does not
// touch these bytes on the way, so poking a system to 0 in flight and then pressing C runs
// COM's loop over the poked value. COM option 5 goes back to flight, which makes a second
// pass possible in one session.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import { decodeHgr, toPng, HGR_W } from './hgr.mjs';
import fs from 'fs';

// ST(1..12) from COM line 15140, paired with the DATA at 15000-15030 in READ order.
const READOUTS = [
  { j: 1, addr: 38198, lines: ['  1  ', ' ENG '], what: '# 1 ENGINE' },
  { j: 2, addr: 38197, lines: ['  2  ', ' ENG '], what: '# 2 ENGINE' },
  { j: 3, addr: 38196, lines: [' COMP', 'NO/GO'], what: 'COMPUTER' },
  { j: 4, addr: 38195, lines: ['RADAR', 'NO/GO'], what: 'RADAR' },
  { j: 5, addr: 38194, lines: [' ENV ', 'NO/GO'], what: 'ENV. CONTROL' },
  { j: 6, addr: 38193, lines: [' HULL', ' DMG '], what: 'HULL DMG.' },
  { j: 7, addr: 38199, lines: ['POWER', ' LOW '], what: 'ENERGY' },
  { j: 8, addr: 38200, lines: [' SHLD', 'NO/GO'], what: 'SHIELD' },
  { j: 9, addr: 38190, lines: ['HYPER', 'DRIVE'], what: 'HYPERDRIVE' },
  { j: 10, addr: 38187, lines: [' MSL ', 'NO/GO'], what: 'MISSILES' },
  { j: 11, addr: 38186, lines: ['LASER', 'NO/GO'], what: 'LASER' },
  { j: 12, addr: 38185, lines: [' COM ', 'NO/GO'], what: 'COMS' },
];
// V(1..12) and H(1..12) from lines 40 and 50, as 0-based cells. HTAB and TAB( ) are
// absolute screen columns here, so H - 1 is the column outright.
for (let i = 0; i < 12; i++) {
  READOUTS[i].col = [23, 29, 35][i % 3] - 1;
  READOUTS[i].row = [2, 5, 8, 11][(i / 3) | 0] - 1;
}

const disk = openDisk(DISK);
const textOf = (name) => {
  const r = disk.read(disk.files.find((f) => f.name === name));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => `${l.num} ${l.text}`).join('\n');
};
const SIM = textOf('STARSHIP SIMULATOR');
const COM = textOf('COM');

const a2 = await openOracle();
await a2.boot();
await a2.key('N');

const loaded = async () => {
  const bytes = await a2.readRange(0x800, 0x2000);
  const mem = {};
  for (let k = 0; k < bytes.length; k++) mem[0x800 + k] = bytes[k];
  try { return listProgram(mem, 0x801, 0x2000).map((l) => `${l.num} ${l.text}`).join('\n'); }
  catch { return ''; }
};
const waitFor = async (wanted, label) => {
  for (let i = 0; i < 500; i++) { await a2.frames(20); if ((await loaded()) === wanted) return; }
  await a2.close();
  throw new Error(`${label} never started`);
};
const settle = async () => {
  let last = '';
  for (let i = 0; i < 80; i++) {
    await a2.frames(20);
    const h = await a2.ev(`window.M.hash(0x2000, 0x6000)`);
    if (h === last) return;
    last = h;
  }
};
const statusBytes = async () => {
  const out = {};
  for (const r of READOUTS) out[r.addr] = await a2.read(r.addr);
  return out;
};
const cells = (on) => {
  const c = (cx, cy) => { let n = 0; for (let y = cy * 8; y < cy * 8 + 8; y++) for (let x = cx * 7; x < cx * 7 + 7; x++) if (on[y * HGR_W + x]) n++; return n; };
  return c;
};
// A readout is "drawn" when its five cells are not plain background. The fill is HCOLOR 6
// across the whole row, so an untouched cell is bright; a printed one is mostly black.
const litOf = (c, r) => { let n = 0; for (let k = 0; k < 5; k++) n += c(r.col + k, r.row); return n; };

async function capture(label) {
  await settle();
  const on = decodeHgr(await a2.readRange(0x2000, 0x4000));
  fs.mkdirSync('captured/com', { recursive: true });
  fs.writeFileSync(`captured/com/readouts-${label}.png`, toPng(on));
  return on;
}

console.log('waiting for STARSHIP SIMULATOR...');
await waitFor(SIM, 'STARSHIP SIMULATOR');
console.log('pressing C for COM');
await a2.key('C');
await waitFor(COM, 'COM');
const baseBytes = await statusBytes();
const baseOn = await capture('healthy');

console.log('\nthe twelve status bytes as COM found them:');
console.log('   J1  addr    what            value   line 1   line 2   row,col   lit/280');
const baseC = cells(baseOn);
for (const r of READOUTS) {
  console.log(`  ${String(r.j).padStart(3)}  ${r.addr}  ${r.what.padEnd(14)}  ${String(baseBytes[r.addr]).padStart(5)}   ` +
    `"${r.lines[0]}"  "${r.lines[1]}"   ${String(r.row).padStart(2)},${String(r.col).padStart(2)}    ${String(litOf(baseC, r)).padStart(3)}`);
}

// Now break three systems and drop the energy below 16, and go round again.
const BREAK = { 38196: 0, 38186: 0, 38200: 0, 38199: 9 };
console.log('\npressing 5 to return to flight, then poking:',
  Object.entries(BREAK).map(([a, v]) => `${a}=${v}`).join(', '));
await a2.key('5');
await waitFor(SIM, 'STARSHIP SIMULATOR (second time)');
for (const [a, v] of Object.entries(BREAK)) await a2.ev(`(() => { window.M.wr(${a}, ${v}); return 'w'; })()`);
const poked = await statusBytes();
await a2.key('C');
await waitFor(COM, 'COM (second time)');
const afterBytes = await statusBytes();
const afterOn = await capture('broken');
const afterC = cells(afterOn);

console.log('\n   J1  what            before  poked  in COM    lit before  lit after   drawn?');
for (const r of READOUTS) {
  const b = litOf(baseC, r), a = litOf(afterC, r);
  const drawn = a === b ? 'same' : (a > b ? 'GONE (now background)' : 'appeared');
  console.log(`  ${String(r.j).padStart(3)}  ${r.what.padEnd(14)}  ${String(baseBytes[r.addr]).padStart(6)}  ` +
    `${String(poked[r.addr]).padStart(5)}  ${String(afterBytes[r.addr]).padStart(6)}    ` +
    `${String(b).padStart(10)}  ${String(a).padStart(9)}   ${drawn}`);
}
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
