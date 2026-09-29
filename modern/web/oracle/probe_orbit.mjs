// ORBIT, the orbital-insertion screen, captured from the original.
//
// STARSHIP SIMULATOR line 158 runs it: `IF PEEK(38210) = 1 AND Y > 4000 THEN PRINT
// "RUNORBIT"`. That needs the ship in atmosphere and climbing, which from a new game means
// flying to re-entry and then back up. The two conditions are pokeable instead, and line 8
// re-reads X, Y and Z from $731B-$7320 on every pass of the main loop, so setting the
// atmosphere flag and Y takes effect on the next one.
//
// ORBIT is a transition: it draws a screen, repositions the ship, BLOADs PLANET # 0 and a
// ship model and chains straight back to STARSHIP SIMULATOR. So the capture has to be taken
// while it is on screen rather than after it settles - it never settles, it leaves.
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
const ORBIT = textOf('ORBIT');

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
const waitFor = async (wanted, label, tries = 600) => {
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
if (!await waitFor(SIM, 'STARSHIP SIMULATOR')) { await a2.close(); throw new Error('no simulator'); }
await a2.frames(200);

console.log('setting the atmosphere flag, then Y itself');
// Line 8 reads X, Y and Z from $731B-$7320, but only on the pass that runs it - the main
// loop is slow, about a hundred frames a pass, and line 140 writes the BASIC variables back
// over the poke. Setting the Applesoft variable directly avoids the race: VAR_READER gives
// its address, and 5000 as an Applesoft float is 8D 1C 40 00 00 (0.6103515625 x 2^13).
await a2.ev(VAR_READER);
await a2.ev(`(() => { window.M.wr(38210, 1); return 'w'; })()`);
const vars = JSON.parse(await a2.ev(`JSON.stringify(window.M.vars())`));
const yVar = vars.vars.find((v) => v.name === 'Y');
if (!yVar) { await a2.close(); throw new Error('no Y variable in the simulator'); }
console.log(`  Y is at $${yVar.at.toString(16)}, currently ${yVar.value}`);
let started = false;
for (let i = 0; i < 300 && !started; i++) {
  await a2.ev(`(() => {
    const M = window.M, at = ${yVar.at} + 2;
    const b = [0x8D, 0x1C, 0x40, 0x00, 0x00];
    for (let k = 0; k < 5; k++) M.wr(at + k, b[k]);
    M.wr(38210, 1);
    return 'w';
  })()`);
  await a2.frames(3);
  started = (await loaded()) === ORBIT;
}
console.log(started ? '  line 158 took it' : '  line 158 never fired');

if (!started) { await a2.close(); throw new Error('ORBIT never started'); }
console.log('ORBIT is running - it chains straight on, so grab the page now\n');

// Sample until the screen stops growing: ORBIT draws, then BLOADs, then leaves.
let best = null;
for (let i = 0; i < 90; i++) {
  await a2.frames(4);
  const on = decodeHgr(await a2.readRange(0x2000, 0x4000));
  const g = pointsOf(on);
  if (!best || g.lit > best.g.lit) best = { g, on };
  if ((await loaded()) !== ORBIT) { console.log(`  ORBIT left after ~${i * 4} frames`); break; }
}
console.log(`the busiest page seen: ${best.g.lit} lit, x ${best.g.bounds.minX}-${best.g.bounds.maxX}, ` +
  `y ${best.g.bounds.minY}-${best.g.bounds.maxY}`);

const after = {};
const s16 = (lo, hi) => { const v = lo | (hi << 8); return v > 32767 ? v - 65536 : v; };
after.x = s16(await a2.read(0x731b), await a2.read(0x731c));
after.y = s16(await a2.read(0x731d), await a2.read(0x731e));
after.z = s16(await a2.read(0x731f), await a2.read(0x7320));
after.pitch = await a2.read(0x7321);
after.bank = await a2.read(0x7322);
after.heading = await a2.read(0x7323);
after.atmosphere = await a2.read(38210);
console.log(`\nlines 27-37 reposition the ship: X=${after.x} Y=${after.y} Z=${after.z} ` +
  `pitch=${after.pitch} bank=${after.bank} heading=${after.heading}, atmosphere=${after.atmosphere}`);

fs.mkdirSync('captured/orbit', { recursive: true });
fs.writeFileSync('captured/orbit/orbit.png', toPng(best.on));
fs.writeFileSync('captured/orbit/golden.json', JSON.stringify({
  source: 'the original ORBIT, reached by poking 38210 = 1 and Y = 5000 in flight',
  after, screen: best.g,
}) + String.fromCharCode(10));
console.log('wrote captured/orbit/golden.json and orbit.png');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
