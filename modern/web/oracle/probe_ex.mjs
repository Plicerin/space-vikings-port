// EX, the enemy ship's explosion, captured from the original.
//
// STARSHIP SIMULATOR line 1560 runs it: `IF DP > PEEK(38204) AND PEEK(38205) < > 0 THEN
// PRINT "RUNEX"`, inside the laser subroutine at 1500 that line 185 calls when the fire
// button is down. DP comes from line 1540 as `PEEK(38152) + (J2 / (TE + 1))`, so the way in
// is to leave the enemy damage accumulator high and its limit low, then fire.
//
// The burst is random - line 20 is `X2 = X1 - (RND(1) * (X1 + X1))` and the same for Y2 - so
// like H/D this cannot be diffed. What can be checked is the origin, the extent, the number
// of lines, and everything lines 30-56 do to the state.
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
const EX = textOf('EX');

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

const READ = [38152, 38204, 38205, 38202, 38186, 38207, 38210];
const before = {};
for (const a of READ) before[a] = await a2.read(a);
console.log('\nbefore: ' + READ.map((a) => `${a}=${before[a]}`).join(' '));
console.log('  38152 is the enemy damage DP is built from, 38204 its limit, 38205 the ship kind,');
console.log('  38202 the missile flag (line 1501 diverts when it is 1), 38186 the laser.');

// Line 1540 only runs out of atmosphere; 1502 needs a working laser; 1501 needs the missile
// flag clear. Then DP just has to beat 38204.
console.log('\nsetting 38152 = 200, 38204 = 1, 38205 = 1, 38202 = 0, 38186 = 100, 38210 = 0');
await a2.ev(`(() => {
  const M = window.M;
  M.wr(38152, 200); M.wr(38204, 1); M.wr(38205, 1);
  M.wr(38202, 0); M.wr(38186, 100); M.wr(38210, 0);
  return 'w';
})()`);

console.log('holding the fire button - line 185 reads PEEK(-16287)');
let started = false;
for (let i = 0; i < 200 && !started; i++) {
  await a2.ev(`(() => { window.M.a2.getIO().buttonDown(0); return 'b'; })()`);
  await a2.frames(6);
  await a2.ev(`(() => { window.M.a2.getIO().buttonUp(0); return 'b'; })()`);
  await a2.ev(`(() => { window.M.wr(38152, 200); window.M.wr(38204, 1); window.M.wr(38205, 1); return 'w'; })()`);
  await a2.frames(3);
  started = (await loaded()) === EX;
}
if (!started) { await a2.close(); throw new Error('EX never started'); }
console.log('EX is running\n');

let best = null;
for (let i = 0; i < 400; i++) {
  await a2.frames(3);
  const on = decodeHgr(await a2.readRange(0x2000, 0x4000));
  const g = pointsOf(on);
  if (!best || g.lit > best.g.lit) best = { g, on };
  if ((await loaded()) !== EX) { console.log(`  EX left after ~${i * 3} frames`); break; }
}
console.log(`busiest page: ${best.g.lit} lit, x ${best.g.bounds.minX}-${best.g.bounds.maxX}, ` +
  `y ${best.g.bounds.minY}-${best.g.bounds.maxY}`);

const on = best.on;
const at = (x, y) => (x >= 0 && x < HGR_W && y >= 0 && y < HGR_H && on[y * HGR_W + x]) ? 1 : 0;
let origin = 0;
for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) origin += at(140 + dx, 60 + dy);
console.log(`  around line 25's origin (140,60): ${origin} of 9 lit`);

const after = {};
for (const a of READ) after[a] = await a2.read(a);
const model = await a2.read(30841);
console.log('');
console.log('after: ' + READ.map((a) => `${a}=${after[a]}`).join(' '));
console.log(`  30841 ($7879, the ship model) = ${model} - line 30 pokes EN,127`);
console.log(`  38205 ${before[38205]} -> ${after[38205]} (line 30 pokes 0)`);
console.log(`  38207 ${before[38207]} -> ${after[38207]} (line 56 halves it)`);

fs.mkdirSync('captured/ex', { recursive: true });
fs.writeFileSync('captured/ex/burst.png', toPng(best.on));
fs.writeFileSync('captured/ex/golden.json', JSON.stringify({
  source: 'the original EX, reached by forcing the laser kill condition and firing',
  before, after, model, origin: { x: 140, y: 60, litAround: origin }, screen: best.g,
}) + String.fromCharCode(10));
console.log('\nwrote captured/ex/golden.json and burst.png');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
