// SHORE LEAVE, captured from the original.
//
// It is a dispatcher. Line 20 is `J = PEEK(38388): POKE 38388,0: ON J GOTO
// 2200,2400,2500,2100,4000`, and 38388 is set by the GROUND FORCES option that chained here:
// 4 ENLIST sets 1, 5 SELL LOOT sets 2, 6 REPAIR sets 3, 7 ESTABLISH BASE sets 4, 8
// CRYOGENICS sets 5. Option 3 leaves it 0, so `ON J GOTO` falls through to 2080 and the
// shore-leave pay screen.
//
// Every one of the six clears the same way - `GOSUB 2080`, which blanks rows 1-12 with
// eighteen printed spaces - over the box line 14 draws and over whatever GROUND FORCES and
// COM left on the page. Like GROUND FORCES, it never clears or fills the screen.
//
// Two are captured here. CRYOGENICS goes through line 4, which skips line 5's surrender
// check, so it needs no setting up. The pay screen does not, so 38208 is poked first - the
// same technique probe_comreadouts uses to reach a state the opening game is not in.
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
const SL = textOf('SHORE LEAVE');

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
const grab = async (label) => {
  await settle();
  const p1 = decodeHgr(await a2.readRange(0x2000, 0x4000));
  const p2 = decodeHgr(await a2.readRange(0x4000, 0x6000));
  const g1 = pointsOf(p1), g2 = pointsOf(p2);
  const which = g1.lit >= g2.lit ? 'page1' : 'page2';
  const g = which === 'page1' ? g1 : g2;
  fs.mkdirSync('captured/shoreleave', { recursive: true });
  fs.writeFileSync(`captured/shoreleave/${label}.png`, toPng(which === 'page1' ? p1 : p2));
  console.log(`  ${label}: ${which}, ${g.lit} lit, x ${g.bounds.minX}-${g.bounds.maxX}, y ${g.bounds.minY}-${g.bounds.maxY}`);
  return { drawnOn: which, ...g };
};

console.log('waiting for STARSHIP SIMULATOR...');
await waitFor(SIM, 'STARSHIP SIMULATOR');
await a2.key('C');
await waitFor(COM, 'COM');
await settle();
await a2.key('2');
await waitFor(GF, 'GROUND FORCES');
await a2.frames(600);
await settle();

const bytes = {};
for (const a of [38208, 38166, 38203, 38209, 38304, 38210, 38389, 38149]) bytes[a] = await a2.read(a);
console.log('\nstate at the GROUND FORCES menu:');
console.log(`  38208 planet surrendered = ${bytes[38208]}   38166 troop location = ${bytes[38166]}`);
console.log(`  38203 morale = ${bytes[38203]}   38209 planet = ${bytes[38209]}   38210 atmosphere = ${bytes[38210]}`);

console.log('\n8 for CRYOGENICS - line 4 sends it past the surrender check');
await a2.key('8');
await waitFor(SL, 'SHORE LEAVE');
await a2.frames(600);
const cryo = await grab('cryogenics');
const troopLoc = await a2.read(38166);
console.log(`  38166 is now ${troopLoc} - line 4010 revives them and pokes 0`);

// 2099 chains back to GROUND FORCES.
await waitFor(GF, 'GROUND FORCES (back from cryogenics)');
await a2.frames(600);
await settle();

console.log('');
console.log('poking 38208 = 1 so line 5 lets the pay screen through, then 3');
await a2.ev(`(() => { window.M.wr(38208, 1); return 'w'; })()`);
await a2.key('3');
await waitFor(SL, 'SHORE LEAVE (pay screen)');
await a2.frames(900);
const pay = await grab('pay');
const misc = {};
for (const a of [0x20, 0x21, 973, 974, 0xe4]) misc[a] = await a2.read(a);
console.log(`  WNDLFT ${misc[0x20]} WNDWDTH ${misc[0x21]}, $3CD ${misc[973]}, $3CE ${misc[974]}, HCOLOR byte ${misc[0xe4]}`);

fs.writeFileSync('captured/shoreleave/golden.json', JSON.stringify({
  source: 'the original SHORE LEAVE, reached from GROUND FORCES by 8 and by 3',
  bytes, misc, troopLocationAfterCryo: troopLoc,
  cryogenics: cryo, pay,
}) + String.fromCharCode(10));
console.log('\nwrote captured/shoreleave/golden.json and both PNGs');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
