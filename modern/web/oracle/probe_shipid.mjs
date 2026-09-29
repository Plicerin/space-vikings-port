// The four SHIP # n I.D. programs, captured from the original - and their DATA extracted.
//
// RADAR line 2056 sends any key but X to line 5000, and 5005 is
// `J = PEEK(38205): POKE 38151,5: PRINT "RUN SHIP # ";J;" I.D."`, so the ship kind byte
// picks the program. Line 5002 maps kind 2 to SHIP # 3.
//
// Each one draws a grid, then a wireframe from its own DATA statements, then a description.
// The drawing loop is the same in all four:
//
//   1000 READ C
//   1003 IF C = 77 THEN Y1 = <second view's Y>: GOTO 1000
//   1005 IF C = 127 THEN 1060
//   1010 READ X,Y
//   1020 X = X1 - (X * 2):Y = Y1 - (Y * 2)
//   1030 IF C = 1 THEN HPLOT X,Y
//   1040 IF C = 2 THEN HPLOT TO X,Y
//
// so 1 is a move, 2 a draw, 77 switches to the lower view and 127 ends. The DATA is pulled
// straight out of the listing rather than transcribed.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import { decodeHgr, toPng, HGR_W, HGR_H } from './hgr.mjs';
import fs from 'fs';

const disk = openDisk(DISK);
const textOf = (name) => {
  const r = disk.read(disk.files.find((f) => f.name === name));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => `${l.num} ${l.text}`).join('\n');
};
const linesOf = (name) => {
  const r = disk.read(disk.files.find((f) => f.name === name));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2);
};
const SIM = textOf('STARSHIP SIMULATOR');
const COM = textOf('COM');
const RADAR = textOf('RADAR');

const KINDS = [0, 1, 3, 4];
const NAME = (n) => `SHIP # ${n} I.D.`;

// Pull the DATA out of each listing, in line order, and the second view's Y1 from line 1003.
const extract = (n) => {
  const prog = linesOf(NAME(n));
  const nums = [];
  for (const l of prog) {
    const m = /^\s*DATA\s+(.*)$/.exec(l.text);
    if (!m) continue;
    for (const tok of m[1].split(',')) {
      const t = tok.trim();
      if (t !== '') nums.push(Number(t));
    }
  }
  let secondY = null;
  for (const l of prog) {
    const m = /IF C = 77 THEN Y1 = ([0-9.]+)/.exec(l.text);
    if (m) secondY = Number(m[1]);
  }
  return { numbers: nums, secondY };
};

const data = {};
for (const n of KINDS) {
  const d = extract(n);
  data[n] = d;
  console.log(`SHIP # ${n} I.D.: ${d.numbers.length} DATA values, second view Y1 = ${d.secondY ?? '(none)'}`);
}

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
const waitFor = async (wanted, tries = 600) => {
  for (let i = 0; i < tries; i++) { await a2.frames(20); if ((await loaded()) === wanted) return true; }
  return false;
};
const settle = async () => {
  let last = '';
  for (let i = 0; i < 150; i++) {
    await a2.frames(20);
    const h = await a2.ev(`window.M.hash(0x2000, 0x6000)`);
    if (h === last) return;
    last = h;
  }
};
const pointsOf = (on) => {
  const pts = [];
  let minX = HGR_W, maxX = -1, minY = HGR_H, maxY = -1;
  for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) {
    if (!on[y * HGR_W + x]) continue;
    pts.push([x, y]);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { lit: pts.length, bounds: { minX, maxX, minY, maxY }, points: pts };
};

console.log('\nwaiting for STARSHIP SIMULATOR...');
if (!await waitFor(SIM)) { await a2.close(); throw new Error('no simulator'); }
await a2.key('C');
if (!await waitFor(COM)) { await a2.close(); throw new Error('no COM'); }
await settle();
await a2.key('3');
if (!await waitFor(RADAR)) { await a2.close(); throw new Error('no RADAR'); }
await a2.frames(400);
await settle();
console.log('RADAR is up\n');

fs.mkdirSync('captured/shipid', { recursive: true });
const screens = {};
for (const n of KINDS) {
  const want = textOf(NAME(n));
  console.log(`poking 38205 = ${n} and pressing a key`);
  await a2.ev(`(() => { window.M.wr(38205, ${n}); return 'w'; })()`);
  await a2.frames(20);
  await a2.key(' ');
  if (!await waitFor(want, 400)) {
    console.log(`  SHIP # ${n} I.D. never started`);
    continue;
  }
  await a2.frames(500);
  await settle();
  const on = decodeHgr(await a2.readRange(0x2000, 0x4000));
  const g = pointsOf(on);
  screens[n] = g;
  fs.writeFileSync(`captured/shipid/ship${n}.png`, toPng(on));
  console.log(`  SHIP # ${n} I.D.: ${g.lit} lit, x ${g.bounds.minX}-${g.bounds.maxX}, ` +
    `y ${g.bounds.minY}-${g.bounds.maxY}`);
  const win = {};
  for (const a of [0x20, 0x21, 973, 0xe4]) win[a] = await a2.read(a);
  if (n === KINDS[0]) console.log(`  window left ${win[0x20]} width ${win[0x21]}, $3CD ${win[973]}, HCOLOR byte ${win[0xe4]}`);
  // Line 1070's GET, then back to RADAR.
  await a2.key(' ');
  if (!await waitFor(RADAR, 400)) { console.log('  did not return to RADAR'); break; }
  await a2.frames(300);
  await settle();
}

fs.writeFileSync('captured/shipid/golden.json', JSON.stringify({
  source: 'the original SHIP # n I.D. programs, reached from RADAR with 38205 poked',
  data, screens,
}) + String.fromCharCode(10));
console.log('\nwrote captured/shipid/golden.json and the PNGs');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
