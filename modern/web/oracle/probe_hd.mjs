// H/D, the hyperdrive jump, captured from the original.
//
// STARSHIP SIMULATOR line 209 runs it: `IF K = 24 THEN PRINT "RUNH/D"`, and K is the key
// code less 176, so 24 is 200 - `H` with the high bit set.
//
// Line 1 bounces straight back unless a destination is set: `IF PEEK(38210) = 1 OR
// PEEK(38209) = PEEK(38163) OR PEEK(38163) = 0 THEN RUN STARSHIP SIMULATOR`. 38163 is what
// COM line 880's SET COURSE pokes, and it is 0 on a new game, so the probe sets it.
//
// The screen itself cannot be compared pixel for pixel - line 20 draws 175 lines from
// (140,63) to `RND(1) * 279, RND(1) * 125` and line 80 runs the same loop again in HCOLOR 0
// to rub them out. What can be checked is the origin, the extent, the clear, and everything
// lines 14-16, 25-26, 50-75 and 90-93 do to the state.
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
const HD = textOf('H/D');

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
const s16 = (lo, hi) => { const v = lo | (hi << 8); return v > 32767 ? v - 65536 : v; };
const shipState = async () => ({
  x: s16(await a2.read(0x731b), await a2.read(0x731c)),
  y: s16(await a2.read(0x731d), await a2.read(0x731e)),
  z: s16(await a2.read(0x731f), await a2.read(0x7320)),
  pitch: await a2.read(0x7321), bank: await a2.read(0x7322), heading: await a2.read(0x7323),
  planet: await a2.read(38209), destination: await a2.read(38163),
  energy: await a2.read(38199), atmosphere: await a2.read(38210),
});

console.log('waiting for STARSHIP SIMULATOR...');
if (!await waitFor(SIM)) { await a2.close(); throw new Error('no simulator'); }
await a2.frames(200);

const DEST = 5;   // LUYTEN - anything that is neither 0 nor the current planet
const before = await shipState();
console.log(`before: planet ${before.planet}, energy ${before.energy}, ` +
  `X=${before.x} Y=${before.y} Z=${before.z} heading=${before.heading}`);
console.log(`setting 38163 = ${DEST}, the way COM line 880 does, then pressing H`);
await a2.ev(`(() => { window.M.wr(38163, ${DEST}); return 'w'; })()`);
await a2.frames(20);
await a2.key('H');

if (!await waitFor(HD, 400)) { await a2.close(); throw new Error('H/D never started'); }
console.log('H/D is running\n');

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

// Sample through the animation and keep the busiest page - the moment before line 80 rubs
// the streaks out again.
let best = null;
for (let i = 0; i < 400; i++) {
  await a2.frames(4);
  const on = decodeHgr(await a2.readRange(0x2000, 0x4000));
  const g = pointsOf(on);
  if (!best || g.lit > best.g.lit) best = { g, on };
  if ((await loaded()) !== HD) { console.log(`  H/D left after ~${i * 4} frames`); break; }
}
console.log(`busiest page: ${best.g.lit} lit, x ${best.g.bounds.minX}-${best.g.bounds.maxX}, ` +
  `y ${best.g.bounds.minY}-${best.g.bounds.maxY}`);

// Line 20's lines all start at C1,C2 = 140,63. Every row that has any lit pixel should have
// one near x 140 if the streaks really do radiate from there.
const on = best.on;
const at = (x, y) => (x >= 0 && x < HGR_W && y >= 0 && y < HGR_H && on[y * HGR_W + x]) ? 1 : 0;
let originLit = 0;
for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) originLit += at(140 + dx, 63 + dy);
console.log(`  around the origin (140,63): ${originLit} of 9 pixels lit`);

const after = await shipState();
console.log('');
console.log(`after: planet ${after.planet}, energy ${after.energy}, ` +
  `X=${after.x} Y=${after.y} Z=${after.z} pitch=${after.pitch} bank=${after.bank} heading=${after.heading}`);
const visited = await a2.read(38240 + DEST);
const sp = await a2.read(38150), tech = await a2.read(38282 + after.planet);
console.log(`  38240+${DEST} (visited) = ${visited}, 38150 = ${sp}, tech of planet ${after.planet} = ${tech}`);

fs.mkdirSync('captured/hd', { recursive: true });
fs.writeFileSync('captured/hd/streaks.png', toPng(best.on));
fs.writeFileSync('captured/hd/golden.json', JSON.stringify({
  source: 'the original H/D, reached by poking 38163 and pressing H in flight',
  destination: DEST, before, after, visited, sp, tech,
  origin: { x: 140, y: 63, litAround: originLit },
  screen: best.g,
}) + String.fromCharCode(10));
console.log('\nwrote captured/hd/golden.json and streaks.png');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
