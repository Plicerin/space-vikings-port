// GALAXY MAP, captured from the original.
//
// Reached from flight by C for COM, 1 for CENTRAL COMPUTER, 3 for GALAXY MAP - COM line
// 265's `IF C = 3 THEN GOSUB 3000` and 3000's RUN GALAXY MAP.
//
// The screen never settles. Line 3120 XDRAWs shape 12 at the paddle position and line 3200
// XDRAWs it again to rub it out, so the page alternates between two states forever. XDRAW
// is exclusive-or, so XORing two consecutive samples gives exactly the cursor's pixels, and
// the sample with fewer of them lit is the map without it.
import { openOracle, VAR_READER } from './a2.mjs';
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
const SIM = textOf('STARSHIP SIMULATOR');
const COM = textOf('COM');
const MAP = textOf('GALAXY MAP');

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
  for (let i = 0; i < 600; i++) { await a2.frames(20); if ((await loaded()) === wanted) return; }
  const now = await loaded();
  let which = null;
  for (const f of disk.files) {
    try { if (textOf(f.name) === now) { which = f.name; break; } } catch { /* not BASIC */ }
  }
  console.log('  loaded program is:', which || 'unrecognised');
  console.log('  first lines:', now.split(String.fromCharCode(10)).slice(0, 3).join(' | ').slice(0, 200));
  console.log('  screen:', (await a2.screen()).filter((l) => l.trim()).join(' / ').slice(0, 160));
  await a2.close();
  throw new Error(`${label} never started`);
};

const settle = async () => {
  let last = '';
  for (let i = 0; i < 100; i++) {
    await a2.frames(20);
    const h = await a2.ev(`window.M.hash(0x2000, 0x6000)`);
    if (h === last) return;
    last = h;
  }
};

console.log('waiting for STARSHIP SIMULATOR...');
await waitFor(SIM, 'STARSHIP SIMULATOR');
await a2.key('C');
await waitFor(COM, 'COM');
await settle();
console.log('1 for CENTRAL COMPUTER, 3 for GALAXY MAP');
await a2.key('1');
await a2.frames(150);
await settle();
await a2.key('3');
await waitFor(MAP, 'GALAXY MAP');
await a2.frames(600);
console.log('GALAXY MAP is running\n');

// Line 3020's three tables, and what decides each star's shape and colour.
const s = async (a) => a2.read(a);
const planets = [];
for (let p = 1; p <= 20; p++) {
  planets.push({
    p,
    x: await s(38366 + p),           // 3020: X(P) = PEEK(M + P), M = 38366
    y: await s(38345 + p),           // 3020: Y(P) = PEEK((M + P) - 21)
    z: await s(38324 + p),           // 3020: Z(P) = PEEK((M + P) - 42)
    secured: await s(38219 + p),     // 3066: IF PEEK(38219 + P) = 1 THEN HCOLOR= 2
  });
}
const here = await s(38209);         // 3075: IF P = PEEK(38209) THEN box it

console.log('the star table, and where line 3060/3065 puts each one:');
console.log('   P  x   y   z   sec   shape  screen');
for (const q of planets) {
  const shape = q.z < 12 ? 6 : (q.z < 16 ? 5 : 1);   // 3030-3050
  const sx = q.x * 10 - 35, sy = q.y * 5;            // 3060, 3065
  console.log(`  ${String(q.p).padStart(2)}  ${String(q.x).padStart(3)} ${String(q.y).padStart(3)} ` +
    `${String(q.z).padStart(3)}   ${q.secured}      ${shape}    (${sx}, ${sy})` +
    (q.p === here ? '   <- PEEK(38209), boxed' : ''));
}

await a2.ev(VAR_READER);
const vars = JSON.parse(await a2.ev(`JSON.stringify(window.M.vars())`));
const pick = (n) => { const v = vars.vars.find((x) => x.name === n); return v ? v.value : null; };
console.log(`\nthe paddle cursor: PX = ${pick('PX')}, PY = ${pick('PY')}`);

// The map is static and the cursor toggles, so a pixel lit in every sample is map and a
// pixel that ever goes dark is cursor. Sampling over a spread of loop phases separates them
// without having to guess which phase a single read caught.
const sample = async () => decodeHgr(await a2.readRange(0x2000, 0x4000));
const N = 40;
let all = await sample();
const ever = new Uint8Array(all.length);
for (let i = 0; i < all.length; i++) ever[i] = all[i];
for (let i = 0; i < N; i++) {
  await a2.frames(1);
  const t = await sample();
  for (let k = 0; k < all.length; k++) {
    if (!t[k]) all[k] = 0;      // AND - lit in every sample
    if (t[k]) ever[k] = 1;      // OR
  }
}
const togglePoints = [];
for (let k = 0; k < all.length; k++) {
  if (ever[k] && !all[k]) togglePoints.push([k % HGR_W, (k / HGR_W) | 0]);
}
const toggling = togglePoints.length;
console.log(`over ${N + 1} samples, ${toggling} pixels toggle - that is the cursor`);
const withoutCursor = all;
const withCursor = ever;

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

fs.mkdirSync('captured/galaxymap', { recursive: true });
fs.writeFileSync('captured/galaxymap/map.png', toPng(withoutCursor));
fs.writeFileSync('captured/galaxymap/map-cursor.png', toPng(withCursor));
const g = pointsOf(withoutCursor);
console.log(`\nthe map: ${g.lit} lit, x ${g.bounds.minX}-${g.bounds.maxX}, y ${g.bounds.minY}-${g.bounds.maxY}`);
fs.writeFileSync('captured/galaxymap/golden.json', JSON.stringify({
  source: 'the original GALAXY MAP, reached from flight by C, 1, 3, with the paddle cursor XORed off',
  here, planets,
  cursor: { px: pick('PX'), py: pick('PY'), pixels: toggling, points: togglePoints },
  map: g,
}) + String.fromCharCode(10));
console.log('wrote captured/galaxymap/golden.json, map.png and map-cursor.png');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
