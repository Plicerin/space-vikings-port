// DMG, captured from the original. Three lines:
//
//   10 HCOLOR= 5: FOR J = 153 TO 157: HPLOT 262,J TO 271,J: NEXT: PRINT " ":
//      PRINT "RUN STARSHIP SIMULATOR"
//
// It lights one panel lamp orange and chains straight back. 38393 is the ship-damaged flag:
// START line 2030 clears it on a new game, STARSHIP SIMULATOR line 3360 sets it the first
// time damage lands and runs DMG, SHORE LEAVE line 2555 clears it again on repair, and
// GALAXY MAP lines 5140-5150 paint the same lamp green when it is 0 and orange when it is 1.
//
// Reaching it means taking a hit. Line 192 only calls the damage routine when 38208 is 0 and
// the ship is inside a box around the enemy, and the routine itself is gated on RND three
// times over - so the probe clears the surrender flag, puts an enemy there, moves the ship
// into the box and waits.
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
const DMG = textOf('DMG');

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

console.log('waiting for STARSHIP SIMULATOR...');
if (!await waitFor(SIM)) { await a2.close(); throw new Error('no simulator'); }
await a2.frames(200);

console.log(`38393 before: ${await a2.read(38393)} (START line 2030 clears it)`);
console.log('clearing 38208, putting an enemy at 38205, and moving Z inside line 192\'s box');
await a2.ev(VAR_READER);
await a2.ev(`(() => { const M = window.M; M.wr(38208, 0); M.wr(38205, 1); M.wr(38393, 0); return 'w'; })()`);

// Z is a BASIC variable the same way Y is, so set it directly. -3000 is inside line 192's
// -6000 to 2000. As an Applesoft float: -3000 = -0.732421875 x 2^12, so 8C 3B 80 00 00 with
// the sign bit set in the first mantissa byte.
const vars = JSON.parse(await a2.ev(`JSON.stringify(window.M.vars())`));
const z = vars.vars.find((v) => v.name === 'Z');
if (!z) { await a2.close(); throw new Error('no Z variable'); }
console.log(`  Z is at $${z.at.toString(16)}, currently ${z.value}`);

let started = false;
for (let i = 0; i < 600 && !started; i++) {
  await a2.ev(`(() => {
    const M = window.M, at = ${z.at} + 2;
    const b = [0x8C, 0xBB, 0x80, 0x00, 0x00];
    for (let k = 0; k < 5; k++) M.wr(at + k, b[k]);
    M.wr(38208, 0); M.wr(38205, 1);
    return 'w';
  })()`);
  await a2.frames(6);
  started = (await loaded()) === DMG;
}
if (!started) {
  console.log(`  38393 is now ${await a2.read(38393)}, hull ${await a2.read(38193)}`);
  await a2.close();
  throw new Error('DMG never started');
}
console.log('DMG is running\n');

let best = null;
for (let i = 0; i < 300; i++) {
  await a2.frames(3);
  const on = decodeHgr(await a2.readRange(0x2000, 0x4000));
  const g = pointsOf(on);
  if (!best || g.lit > best.g.lit) best = { g, on };
  if ((await loaded()) !== DMG) { console.log(`  DMG left after ~${i * 3} frames`); break; }
}

// The lamp itself: x 262-271, y 153-157, in HCOLOR 5 - odd columns only.
const on = best.on;
const lampPixels = [];
for (let y = 153; y <= 157; y++) for (let x = 262; x <= 271; x++) if (on[y * HGR_W + x]) lampPixels.push([x, y]);
const cols = [...new Set(lampPixels.map(([x]) => x))].sort((a, b) => a - b);
console.log(`the lamp at 262-271, 153-157: ${lampPixels.length} lit`);
console.log(`  columns lit: ${cols.join(', ')}`);
console.log(`  (HCOLOR 5 is orange, which lights the odd columns)`);
console.log(`38393 after: ${await a2.read(38393)}`);

fs.mkdirSync('captured/dmg', { recursive: true });
fs.writeFileSync('captured/dmg/dmg.png', toPng(best.on));
fs.writeFileSync('captured/dmg/golden.json', JSON.stringify({
  source: 'the original DMG, reached by taking a hit in flight',
  flag: await a2.read(38393),
  lamp: { x0: 262, x1: 271, y0: 153, y1: 157, lit: lampPixels.length, columns: cols, points: lampPixels },
  screen: best.g,
}) + String.fromCharCode(10));
console.log('\nwrote captured/dmg/golden.json and dmg.png');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
