// Picking a star on the galaxy map, on the machine.
//
// `galaxymap_parity.mjs` has the map itself exact - 1,514 lit, 0 of 53,760 differing - and the
// cursor's two draws at two positions. What it does not reach is what happens when the button
// goes down over a star: lines 3210 to 3260, the only part of the page that is state-dependent.
//
//   3130 IF PEEK(- 16287) > 127 THEN 3210
//   3210 HCOLOR= 0: DRAW 12 AT PX,PY
//   3215 PX = PX + 35
//   3230 IF INT(PX / 10) < = X(P) + 1 AND ... AND INT(PY / 5) > = Y(P) - 1 THEN GOTO 3250
//   3250 VTAB 21: PRINT <39 spaces>: VTAB 21: PRINT "STAR SYSTEM : ";S$(P):
//        PRINT "LOC. : ";X(P);" ";Y(P);" ";Z(P);
//   3320 PRINT " : DISTANCE = "; INT(D1);" L/Y"
//   3260 PRINT "DO YOU WISH FURTHER INFORMATION?";: GET AN$
//
// The cursor is the paddles - `3110 PX = PDL(0) * 1.19: PY = PDL(1)` - and the pick is the
// paddle button, so this drives both rather than pressing keys. Where to put it comes from the
// map's own data: 3060 and 3065 draw star P at `X(P) * 10 - 35`, `Y(P) * 5`, and 3215 adds the
// 35 back before the test, so the drawn position is exactly the position that hits.
import { openOracle, VAR_READER } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import { decodeHgr, toPng, HGR_W, HGR_H } from './hgr.mjs';
import fs from 'fs';

const XS = 38366, YS = 38345, ZS = 38324;   // 3020: X(P) = PEEK(38366 + P), and so on
const HERE = 38209;

const disk = openDisk(DISK);
const textOf = (name) => {
  const r = disk.read(disk.files.find((f) => f.name === name));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => `${l.num} ${l.text}`).join('\n');
};
const PROGRAMS = ['STARSHIP SIMULATOR', 'COM', 'GALAXY MAP'];
const TEXTS = Object.fromEntries(PROGRAMS.map((n) => [n, textOf(n)]));

const a2 = await openOracle();
await a2.boot();
await a2.key('N');
await a2.ev(VAR_READER);
const which = async () => {
  const b = await a2.readRange(0x800, 0x2000);
  const m = {};
  for (let k = 0; k < b.length; k++) m[0x800 + k] = b[k];
  let t = '';
  try { t = listProgram(m, 0x801, 0x2000).map((l) => `${l.num} ${l.text}`).join('\n'); } catch { /* mid-load */ }
  for (const n of PROGRAMS) if (TEXTS[n] === t) return n;
  return '(other)';
};
const settleOn = async (want, tries = 900) => {
  let stable = 0;
  for (let i = 0; i < tries; i++) {
    await a2.frames(10);
    if ((await which()) === want) { if (++stable >= 18) return true; } else stable = 0;
  }
  return false;
};
const settlePage = async () => {
  let prev = '', still = 0;
  for (let i = 0; i < 300; i++) {
    await a2.frames(10);
    const h = await a2.ev(`window.M.hash(0x2000, 0x4000)`);
    if (h === prev) { if (++still >= 10) break; } else still = 0;
    prev = h;
  }
  return decodeHgr(await a2.readRange(0x2000, 0x4000));
};

console.log('waiting for STARSHIP SIMULATOR...');
for (let i = 0; i < 900; i++) { await a2.frames(20); if ((await which()) === 'STARSHIP SIMULATOR') break; }
await a2.frames(300);
await a2.key('C', { holdFrames: 40, afterFrames: 20 });
if (!await settleOn('COM')) { await a2.close(); throw new Error('COM never started'); }
await a2.key('1', { holdFrames: 40, afterFrames: 20 });
for (let i = 0; i < 40; i++) await a2.frames(10);
await a2.key('3', { holdFrames: 40, afterFrames: 20 });
if (!await settleOn('GALAXY MAP')) { await a2.close(); throw new Error('the map never came up'); }
for (let i = 0; i < 40; i++) await a2.frames(10);

const xs = await a2.readRange(XS + 1, XS + 21);
const ys = await a2.readRange(YS + 1, YS + 21);
const zs = await a2.readRange(ZS + 1, ZS + 21);
const secured = await a2.readRange(38219 + 1, 38219 + 21);   // 3066's PEEK(38219 + P)
const here = (await a2.readRange(HERE, HERE + 1))[0];
console.log(`  here is planet ${here}`);

// A star that is not the one we are at, and far enough inside the clamps to be reachable.
let pick = 0;
for (let p = 1; p <= 20; p++) {
  const px = xs[p - 1] * 10 - 35;
  const py = ys[p - 1] * 5;
  if (p !== here && px >= 12 && px <= 268 && py >= 12 && py <= 143) { pick = p; break; }
}
if (!pick) { await a2.close(); throw new Error('no reachable star'); }
const px = xs[pick - 1] * 10 - 35;
const py = ys[pick - 1] * 5;
console.log(`  aiming at star ${pick}: X ${xs[pick - 1]} Y ${ys[pick - 1]} Z ${zs[pick - 1]} -> PX ${px}, PY ${py}`);

// 3110: PX = PDL(0) * 1.19, PY = PDL(1). The paddles are 0-255, so PX/1.19 has to fit.
const pdl0 = Math.round(px / 1.19);
const pdl1 = py;
await a2.ev(`(() => { const io = window.M.a2.getIO(); io.paddle(0, ${pdl0} / 255); io.paddle(1, ${pdl1} / 255); return 'set'; })()`);
for (let i = 0; i < 40; i++) await a2.frames(10);

// 3130's paddle button
await a2.ev(`(() => { window.M.a2.getIO().buttonDown(0); return 'down'; })()`);
for (let i = 0; i < 30; i++) await a2.frames(10);
await a2.ev(`(() => { window.M.a2.getIO().buttonUp(0); return 'up'; })()`);
const page = await settlePage();

// What the machine actually used, not what the paddle was asked for. PDL readings are timing
// based and come back a count or two either side of the value set, and `PX = PDL(0) * 1.19` is
// fractional anyway - the first run of this assumed PX 95, PY 65 and left two pixels of the
// cursor's hole in the wrong place. 3215 has already added 35 to PX by now.
const vt = JSON.parse(await a2.ev(`JSON.stringify(window.M.vars())`));
const varOf = (n) => (vt.vars.find((v) => v.name === n) || {}).value;
const pxUsed = varOf('PX') - 35;
const pyUsed = varOf('PY');
console.log(`  the machine drew the cursor at PX ${pxUsed}, PY ${pyUsed}`);

// What the readout should say, so the port can be given the same numbers.
const d = Math.trunc(Math.sqrt(
  Math.pow(Math.abs(xs[here - 1] - xs[pick - 1]), 2) +
  Math.pow(Math.abs(ys[here - 1] - ys[pick - 1]), 2) +
  Math.pow(Math.abs(zs[here - 1] - zs[pick - 1]), 2)));
console.log(`  distance from ${here} to ${pick}: ${d} L/Y`);
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();

const points = [];
for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) if (page[y * HGR_W + x]) points.push([x, y]);
fs.mkdirSync('captured/mappick', { recursive: true });
fs.writeFileSync('captured/mappick/disk.png', toPng(page));
fs.writeFileSync('captured/mappick/golden.json', JSON.stringify({
  source: 'the galaxy map on the machine with the paddle cursor on a star and the button pressed',
  here, pick, px: pxUsed, py: pyUsed, asked: { px, py }, pdl0, pdl1, distance: d,
  stars: Array.from({ length: 20 }, (_, i) => ({ x: xs[i], y: ys[i], z: zs[i], secured: secured[i] })),
  lit: points.length, points,
}) + String.fromCharCode(10));
console.log('');
console.log(`wrote captured/mappick/golden.json and disk.png (${points.length} lit)`);
