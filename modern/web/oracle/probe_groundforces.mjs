// GROUND FORCES' menu screen, captured from the original.
//
// Reached from COM by 2 - COM line 127's `IF COM = 2 THEN PRINT " ": PRINT "RUN GROUND
// FORCES"`.
//
// It never clears the screen. Line 12 blanks rows 1-12 with printed spaces and line 13
// draws the same box COM does, so what is on the page is COM's screen with a hole punched
// in the left-hand column - COM's twelve readouts down the right are still there, and so is
// the HCOLOR 6 flood behind everything.
//
// HCOLOR carries over too. It lives in the hi-res routines' zero page, not in a BASIC
// variable, so RUN does not reset it: line 13's HPLOT is drawn in whatever COM last set,
// which is the HCOLOR 1 of COM's own line 90.
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
const GF = textOf('GROUND FORCES');

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
await a2.key('C');
await waitFor(COM, 'COM');
await settle();
console.log('2 for GROUND FORCES');
await a2.key('2');
await waitFor(GF, 'GROUND FORCES');
await a2.frames(900);
await settle();
console.log('GROUND FORCES is holding at line 60\n');

// What the menu reads, and the window and video flags it inherited from COM.
const BYTES = [
  [38153, 'M - ground missiles, line 13'],
  [38156, 'P - fighters'],
  [38155, 'TP - transports'],
  [38154, 'T - tanks'],
  [38209, 'current planet'],
  [38158, 'the planet the troops are on - line 67 compares it with 38209'],
  [38303 + 1, 'base on planet 1 - line 65'],
  [0x20, 'WNDLFT'], [0x21, 'WNDWDTH'], [0x22, 'WNDTOP'], [0x23, 'WNDBTM'],
  [973, '$3CD, the inverse flag'],
  [974, '$3CE'],
  [0xe4, 'HCOLOR as the hi-res routines hold it'],
];
const state = {};
for (const [a, what] of BYTES) {
  state[a] = await a2.read(a);
  console.log(`  ${String(a).padStart(5)}  ${String(state[a]).padStart(3)}   ${what}`);
}

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
const which = g1.lit >= g2.lit ? 'page1' : 'page2';
const shown = which === 'page1' ? g1 : g2;
console.log(`\npage1 ${g1.lit} lit, page2 ${g2.lit} lit -> ${which}`);
console.log(`the menu: ${shown.lit} lit, x ${shown.bounds.minX}-${shown.bounds.maxX}, y ${shown.bounds.minY}-${shown.bounds.maxY}`);

fs.mkdirSync('captured/groundforces', { recursive: true });
fs.writeFileSync('captured/groundforces/menu.png', toPng(which === 'page1' ? p1 : p2));
fs.writeFileSync('captured/groundforces/golden.json', JSON.stringify({
  source: 'the original GROUND FORCES, reached from flight by C then 2, held at line 60',
  drawnOn: which, bytes: state, menu: shown,
}) + String.fromCharCode(10));
// The battle screen, lines 100-150. Line 67 lets the attack through because 38158 and
// 38209 agree, and there are transports, so 1 goes straight to line 100.
console.log('');
console.log('1 for ATTACK PLANET');
await a2.key('1');
await a2.frames(400);
const bp1 = decodeHgr(await a2.readRange(0x2000, 0x4000));
const bp2 = decodeHgr(await a2.readRange(0x4000, 0x6000));
const bg1 = pointsOf(bp1), bg2 = pointsOf(bp2);
const bwhich = bg1.lit >= bg2.lit ? 'page1' : 'page2';
const battle = bwhich === 'page1' ? bg1 : bg2;
console.log(`battle screen on ${bwhich}: ${battle.lit} lit, x ${battle.bounds.minX}-${battle.bounds.maxX}, y ${battle.bounds.minY}-${battle.bounds.maxY}`);
const w2 = {};
for (const a of [0x20, 0x21, 0x22, 0x23, 973, 974]) w2[a] = await a2.read(a);
console.log(`  window left ${w2[0x20]} width ${w2[0x21]} top ${w2[0x22]} bottom ${w2[0x23]}, $3CD ${w2[973]}, $3CE ${w2[974]}`);
fs.writeFileSync('captured/groundforces/battle.png', toPng(bwhich === 'page1' ? bp1 : bp2));

fs.writeFileSync('captured/groundforces/golden.json', JSON.stringify({
  source: 'the original GROUND FORCES, reached from flight by C then 2, held at line 60',
  drawnOn: which, bytes: state, menu: shown,
  battle: { drawnOn: bwhich, window: w2, ...battle },
}) + String.fromCharCode(10));
console.log('wrote captured/groundforces/golden.json, menu.png and battle.png');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
