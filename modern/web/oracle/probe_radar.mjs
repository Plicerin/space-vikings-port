// RADAR, captured from the original.
//
// Reached from flight by C for COM then 3 - COM line 133's
// `IF COM = 3 THEN POKE 38388,2: PRINT "RUN RADAR"`.
//
// RADAR is the first program that drives the flight renderer rather than drawing everything
// itself. Line 2000 saves the pitch, forces it to 63, moves the ship to Y = 20000 and levels
// the bank; line 2005 then CALLs 24576 ($6000, the renderer) and 37936 ($9430), and draws a
// reticle over the result. Line 2045 puts pitch and bank back and 2055 restores Y, so the
// flight state is untouched afterwards - the whole thing is a borrowed camera.
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
const SIM = textOf('STARSHIP SIMULATOR');
const COM = textOf('COM');
const RADAR = textOf('RADAR');

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
  let which = null;
  for (const f of disk.files) {
    try { if (textOf(f.name) === (await loaded())) { which = f.name; break; } } catch { /* not BASIC */ }
  }
  console.log('  loaded program is:', which || 'unrecognised');
  await a2.close();
  throw new Error(`${label} never started`);
};
const settle = async () => {
  let last = '';
  for (let i = 0; i < 120; i++) {
    await a2.frames(20);
    const h = await a2.ev(`window.M.hash(0x2000, 0x6000)`);
    if (h === last) return;
    last = h;
  }
};

console.log('waiting for STARSHIP SIMULATOR...');
await waitFor(SIM, 'STARSHIP SIMULATOR');

// The camera RADAR borrows is built out of the flight state, so record that first.
const s16 = (lo, hi) => { const v = lo | (hi << 8); return v > 32767 ? v - 65536 : v; };
const before = {
  x: s16(await a2.read(0x731b), await a2.read(0x731c)),
  y: s16(await a2.read(0x731d), await a2.read(0x731e)),
  z: s16(await a2.read(0x731f), await a2.read(0x7320)),
  pitch: await a2.read(0x7321), bank: await a2.read(0x7322), heading: await a2.read(0x7323),
  atmosphere: await a2.read(0x9542), planet: await a2.read(0x9541),
};
console.log(`flight state: X=${before.x} Y=${before.y} Z=${before.z} ` +
  `pitch=${before.pitch} bank=${before.bank} heading=${before.heading} ` +
  `atmosphere=${before.atmosphere} planet=${before.planet}`);

await a2.key('C');
await waitFor(COM, 'COM');
await settle();
console.log('3 for RADAR');
await a2.key('3');
await waitFor(RADAR, 'RADAR');
await a2.frames(900);
await settle();
console.log('RADAR is running and waiting at line 2050\n');

// What the borrowed camera actually is, read while RADAR is holding at the GET.
const during = {
  x: s16(await a2.read(0x731b), await a2.read(0x731c)),
  y: s16(await a2.read(0x731d), await a2.read(0x731e)),
  z: s16(await a2.read(0x731f), await a2.read(0x7320)),
  pitch: await a2.read(0x7321), bank: await a2.read(0x7322), heading: await a2.read(0x7323),
};
console.log(`while RADAR holds: X=${during.x} Y=${during.y} Z=${during.z} ` +
  `pitch=${during.pitch} bank=${during.bank} heading=${during.heading}`);
console.log('  (line 2045 has already put pitch and bank back; 2055 restores Y on the way out)');

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

const p1 = decodeHgr(await a2.readRange(0x2000, 0x4000));
const p2 = decodeHgr(await a2.readRange(0x4000, 0x6000));
const g1 = pointsOf(p1), g2 = pointsOf(p2);
console.log(`\npage1 ${g1.lit} lit, page2 ${g2.lit} lit`);
const which = g1.lit >= g2.lit ? 'page1' : 'page2';
const shown = which === 'page1' ? g1 : g2;
console.log(`taking ${which}: ${shown.lit} lit, x ${shown.bounds.minX}-${shown.bounds.maxX}, ` +
  `y ${shown.bounds.minY}-${shown.bounds.maxY}`);

fs.mkdirSync('captured/radar', { recursive: true });
fs.writeFileSync('captured/radar/page1.png', toPng(p1));
fs.writeFileSync('captured/radar/page2.png', toPng(p2));
fs.writeFileSync('captured/radar/golden.json', JSON.stringify({
  source: 'the original RADAR, reached from flight by C then 3, held at line 2050',
  drawnOn: which, before, during, screen: shown,
}) + String.fromCharCode(10));
console.log('wrote captured/radar/golden.json and both pages');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
