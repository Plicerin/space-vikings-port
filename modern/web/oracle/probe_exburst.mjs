// EX's debris burst, replayed rather than bounded.
//
// `ex_parity.mjs` has line 6's flash exact and checks lines 7-30 only by their extent, because
// the burst is 240 segments drawn from 480 RND draws and nothing was replaying them. The extent
// is a weak test: the disk's run spanned x 16-259 and the port's x 19-248, and both are inside
// the range line 20 allows, so the numbers say nothing either way.
//
//     7  FOR X1 = 5 TO 130 STEP 8: Y1 = Y1 + 4.8: FOR J = 1 TO 15
//     20 X2 = X1 - (RND(1) * (X1 + X1)): Y2 = Y1 - (RND(1) * (Y1 + Y1))
//     21 IF Y2 > 65 THEN Y2 = 65
//     22 IF Y2 < - 60 THEN Y2 = - 60
//     25 HPLOT 140,60 TO 140 + X2,60 + Y2: NEXT
//
// The port's RND is bit-exact, so the whole burst can be predicted from one seed. This captures
// the seed at `$00C9` the moment EX reaches line 7, the page as it stands then, and the page
// again once line 30 has run - and `ex_burst_parity.mjs` draws the burst over the first with
// that seed and compares against the second.
//
// Getting EX to run at all is the fiddly part. Line 1560 is
// `IF DP > PEEK(38204) AND PEEK(38205) < > 0 THEN PRINT "^DRUNEX"`, inside the laser routine at
// 1500, so the enemy has to be shot to pieces. Poking 38204 - its vitality limit - to 0 makes
// the first hit enough, and the trigger is the paddle button at line 185, not a key.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import { decodeHgr, toPng, HGR_W, HGR_H } from './hgr.mjs';
import fs from 'fs';

const SEED = 0x00c9;
const VITALITY_LIMIT = 38204;   // the enemy's, which 1560 compares DP against
const SHIP_KIND = 38205;        // must be non-zero for 1560 to fire
// 1501 is `IF PEEK(38202) = 1 THEN 1000`, and 1000 is the missile routine - 1090 spends 38187
// there. So 38202 = 1 selects **missiles**, and only the laser at 1502 onwards reaches 1560.
// A new game starts at 1, which is why the first run of this probe never got near EX.
const WEAPON = 38202;

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
  const b = await a2.readRange(0x800, 0x2000);
  const m = {};
  for (let k = 0; k < b.length; k++) m[0x800 + k] = b[k];
  let t = '';
  try { t = listProgram(m, 0x801, 0x2000).map((l) => `${l.num} ${l.text}`).join('\n'); } catch { /* mid-load */ }
  if (t === SIM) return 'STARSHIP SIMULATOR';
  if (t === EX) return 'EX';
  return '(other)';
};
const curlin = async () => JSON.parse(await a2.ev('window.M.rd(0x75) | (window.M.rd(0x76) << 8)'));

console.log('waiting for STARSHIP SIMULATOR...');
let ok = false;
for (let i = 0; i < 900; i++) { await a2.frames(20); if ((await loaded()) === 'STARSHIP SIMULATOR') { ok = true; break; } }
if (!ok) { await a2.close(); throw new Error('the simulator never started'); }
await a2.frames(300);

// A ship to shoot at, and one that falls apart on the first shot.
console.log(`  38205 is ${(await a2.readRange(SHIP_KIND, SHIP_KIND + 1))[0]}`);
await a2.ev(`(() => { window.M.wr(${VITALITY_LIMIT}, 0); window.M.wr(${WEAPON}, 0); return 'poked'; })()`);

// Line 185: `IF PEEK(- 16287) > 127 THEN GOSUB 1500`. Hold the button until EX loads.
await a2.ev(`(() => { window.M.a2.getIO().buttonDown(0); return 'down'; })()`);
let inEx = false;
for (let i = 0; i < 900; i++) {
  await a2.frames(10);
  await a2.ev(`(() => { window.M.wr(${VITALITY_LIMIT}, 0); window.M.wr(${WEAPON}, 0); return 0; })()`);
  if ((await loaded()) === 'EX') { inEx = true; break; }
}
await a2.ev(`(() => { window.M.a2.getIO().buttonUp(0); return 'up'; })()`);
if (!inEx) { await a2.close(); throw new Error('EX never ran - the laser never destroyed anything'); }
console.log('  EX is running');

// Step until line 7 is the current line, then take the seed and the page.
let before = null, seed = null;
for (let i = 0; i < 4000; i++) {
  const l = await curlin();
  if (l === 7) {
    seed = await a2.readRange(SEED, SEED + 5);
    before = decodeHgr(await a2.readRange(0x2000, 0x4000));
    break;
  }
  await a2.frames(1);
}
if (!before) { await a2.close(); throw new Error('EX never reached line 7'); }
console.log(`  at line 7 the seed is ${[...seed].map((b) => b.toString(16).padStart(2, '0')).join(' ')}`);

// And on until the burst is finished.
//
// Not line 30: line 30 is the **outer** `NEXT`, so it comes round once per X1 step, sixteen
// times. Stopping at the first of them caught fifteen segments of the two hundred and forty -
// 852 pixels against the full burst's 6,775 - and the replay then looked as though the port
// were drawing eight times too much. Line 40 is the first thing after the loops.
let after = null;
for (let i = 0; i < 20000; i++) {
  const l = await curlin();
  if (l >= 40) { after = decodeHgr(await a2.readRange(0x2000, 0x4000)); break; }
  await a2.frames(1);
}
if (!after) { await a2.close(); throw new Error('EX never got past the burst'); }

let on = 0, off = 0;
for (let k = 0; k < before.length; k++) {
  if (!before[k] && after[k]) on++;
  if (before[k] && !after[k]) off++;
}
console.log(`  the burst turned ${on} pixels on and ${off} off`);
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();

const points = (p) => {
  const out = [];
  for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) if (p[y * HGR_W + x]) out.push([x, y]);
  return out;
};
fs.mkdirSync('captured/exburst', { recursive: true });
fs.writeFileSync('captured/exburst/before.png', toPng(before));
fs.writeFileSync('captured/exburst/after.png', toPng(after));
fs.writeFileSync('captured/exburst/golden.json', JSON.stringify({
  source: "EX lines 7-30 on the machine: the seed at $00C9 on entry, and the page either side",
  seed: [...seed], turnedOn: on, turnedOff: off,
  before: points(before), after: points(after),
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/exburst/golden.json, before.png and after.png');
