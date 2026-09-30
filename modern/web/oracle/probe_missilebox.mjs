// The missile, on the machine: how far it reaches and what it has to be pointed at.
//
// 1000-1090 is the whole weapon, and it is not a projectile that lives for a while - it is
// sixteen steps taken inside one pass of the main loop:
//
//   1000 M3 = 3: M1 = 140: M2 = 40: X0 = X: Y0 = Y: Z0 = Z: S2 = 160
//        X2 = S2 * (ZP * XH): Z2 = S2 * ZP * ZH: Y2 = S2 * YP: IF PEEK(38187) = 0 THEN 1090
//   1010 CALL SG: FOR M = 124 TO 62 STEP -4: XDRAW ...
//        IF PEEK(38210) = 1 AND Y0 < VV THEN HIT = 1: GOTO 1060
//   1050 IF X0 < X9 + 150 AND X0 > X9 - 150 AND Y0 < Y9 + 60 AND Y0 > Y9 - 20
//        AND Z0 < Z9 + 100 AND Z0 > Z9 - 100 THEN HIT = 1
//   1060 XDRAW ...: X0 = X0 + X2: Z0 = Z0 + Z2: Y0 = Y0 + Y2
//        IF P > 190 OR P < 64 THEN Y0 = Y0 - 2 * Y2: NEXT
//   1085 IF HIT = 1 THEN GOSUB 1200: J1 = 10: J2 = 120: GOSUB 1535: GOTO 1090
//
// So the missile starts at the ship itself, walks 160 units a step along the ship's own
// forward vector, and is tested sixteen times: at the ship, and at +160 through +2400. The
// target never moves - line 2 fixes it at X9 = 400, Y9 = -100, Z9 = -3500 and nothing else
// on the disk writes those - so the reachable set is a fixed box, and the box is NOT
// symmetric in Y: +60 above, but only 20 below.
//
// This drives the paddle button (185's `IF PEEK(-16287) > 127 THEN GOSUB 1500`, which is
// what fires) from nine places around that box, with the speed forced to zero so the ship
// stays where it was put, and reads 38152 - the ship damage cell 1540's POKE writes - to see
// which ones the machine scored as hits.
import { openOracle, VAR_READER } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import fs from 'fs';

const XI = 29467, YI = 29469, ZI = 29471, P1 = 29473, H1 = 29475;
const SPEED = 38157, MISSILE_MODE = 38202, MISSILES = 38187, SHIP_DMG = 38152;
const SHIP_KIND = 38205, ATMOS = 38210, HERE = 38209, DEF_TECH = 38282;

const disk = openDisk(DISK);
const simText = (() => {
  const r = disk.read(disk.files.find((f) => f.name === 'STARSHIP SIMULATOR'));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => `${l.num} ${l.text}`).join('\n');
})();

const a2 = await openOracle();
await a2.boot();
await a2.key('N');
await a2.ev(VAR_READER);
const inSim = async () => {
  const b = await a2.readRange(0x800, 0x2000);
  const m = {};
  for (let k = 0; k < b.length; k++) m[0x800 + k] = b[k];
  try { return listProgram(m, 0x801, 0x2000).map((l) => `${l.num} ${l.text}`).join('\n') === simText; }
  catch { return false; }
};
console.log('waiting for STARSHIP SIMULATOR...');
let ok = false;
for (let i = 0; i < 900; i++) { await a2.frames(20); if (await inSim()) { ok = true; break; } }
if (!ok) { await a2.close(); throw new Error('the simulator never started'); }
await a2.frames(300);

const wr = (a, v) => a2.ev(`(() => { window.M.wr(${a}, ${v & 255}); return 1; })()`);

// Line 8 runs once, at the start - the main loop is 15 to 210 - so the cells at XI, YI and ZI
// are an output, written by 140, not an input. The ship is moved by writing the Applesoft
// variables themselves, which `window.M.vars()` already locates by name.
/** The 5-byte Applesoft float, the inverse of the reader's `mflp`. */
const mflpBytes = (v) => {
  if (v === 0) return [0, 0, 0, 0, 0];
  const neg = v < 0; const a = Math.abs(v);
  const e = Math.floor(Math.log2(a)) + 1;
  let m = Math.round((a / Math.pow(2, e)) * 4294967296);
  if (m > 4294967295) m = 4294967295;
  const b = [(m >>> 24) & 255, (m >>> 16) & 255, (m >>> 8) & 255, m & 255];
  return [e + 128, (b[0] & 127) | (neg ? 128 : 0), b[1], b[2], b[3]];
};
let slots = {};
const readVars = async () => {
  const vt = JSON.parse(await a2.ev(`JSON.stringify(window.M.vars())`));
  slots = Object.fromEntries(vt.vars.map((v) => [v.name, v]));
  return slots;
};
const setVar = async (name, value) => {
  const v = slots[name];
  if (!v) throw new Error(`no variable ${name} in the table`);
  const b = mflpBytes(value);
  for (let i = 0; i < 5; i++) await wr(v.at + 2 + i, b[i]);
};
/** Step until BASIC is at `line`, in thousand-cycle pieces so the stop is exact. */
const runTo = (line, budget = 400000) => a2.ev(`(() => {
  const cpu = window.M.cpu;
  for (let i = 0; i < ${budget}; i++) {
    if (((cpu.read(0x75) | (cpu.read(0x76) << 8))) === ${line}) return 'at';
    cpu.stepCycles(200);
  }
  return 'timeout';
})()`);

const here = (await a2.readRange(HERE, HERE + 1))[0];
const te = (await a2.readRange(DEF_TECH + here, DEF_TECH + here + 1))[0];
const kind = (await a2.readRange(SHIP_KIND, SHIP_KIND + 1))[0];
console.log(`  here is planet ${here}, TE ${te}, ship kind ${kind}`);
console.log(`  a hit is worth INT(120 / (TE + 1)) = ${Math.trunc(120 / (te + 1))} on 38152`);
console.log('');

// X9 = 400, Y9 = -100, Z9 = -3500. Each shot starts 800 short in Z so step 5 lands on the
// target; only Z advances, because heading 0 and pitch 0 make X2 and Y2 zero.
const TRIALS = [
  { name: 'dead on, 800 short', x: 400, y: -100, z: -4300, want: true },
  { name: '50 below the box', x: 400, y: -150, z: -4300, want: false },
  { name: 'just inside the top', x: 400, y: -45, z: -4300, want: true },
  { name: 'just above the box', x: 400, y: -30, z: -4300, want: false },
  { name: 'out of reach in Z', x: 400, y: -100, z: -8000, want: false },
  { name: 'already past it', x: 400, y: -100, z: -3400, want: false },
  { name: '300 off in X', x: 700, y: -100, z: -4300, want: false },
  // The last step tested is the sixteenth, at +2400, and the box reaches 100 further, so
  // 2500 short is the furthest shot that can land and 2600 short cannot.
  { name: '2400 short, last step', x: 400, y: -100, z: -5900, want: true },
  { name: '2600 short, one too far', x: 400, y: -100, z: -6100, want: false },
];

const results = [];
for (const t of TRIALS) {
  // 150 is after 129 has moved the ship and 140 has stored it, and before 185 tests the
  // button, so what is written here is exactly what 1000 takes as the missile's start.
  if (await runTo(150) !== 'at') { await a2.close(); throw new Error('never reached line 150'); }
  await readVars();
  await setVar('X', t.x); await setVar('Y', t.y); await setVar('Z', t.z);
  await setVar('S', 0);        // standing still, so the shot is from where it was put
  await wr(SPEED, 0);          // 210's POKE 38157,S, so the next pass agrees
  await wr(MISSILE_MODE, 1);   // 1501: the button goes to 1000 rather than to the laser
  await wr(MISSILES, 60);
  await wr(SHIP_DMG, 0);
  await a2.ev(`(() => { window.M.a2.getIO().buttonDown(0); return 'down'; })()`);
  const reached = await runTo(1090);
  await a2.ev(`(() => { window.M.a2.getIO().buttonUp(0); return 'up'; })()`);
  const dmg = (await a2.readRange(SHIP_DMG, SHIP_DMG + 1))[0];
  const left = (await a2.readRange(MISSILES, MISSILES + 1))[0];
  await readVars();
  const varOf = (n) => (slots[n] || {}).value;
  const hit = dmg > 0;
  const agree = hit === t.want;
  results.push({ ...t, hit, dmg, missilesLeft: left, reached,
    firedFrom: { x: varOf('X'), y: varOf('Y'), z: varOf('Z') },
    heading: varOf('H'), pitch: varOf('P'),
    dir: { xh: varOf('XH'), zh: varOf('ZH'), zp: varOf('ZP'), yp: varOf('YP') } });
  console.log(`  ${agree ? 'as read ' : 'DIFFERS '} ${t.name.padEnd(22)} ` +
    `(${t.x}, ${t.y}, ${t.z}) -> ${hit ? 'hit' : 'miss'}, 38152 = ${dmg}, missiles ${left}`);
  await wr(SHIP_DMG, 0);
}
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();

fs.mkdirSync('captured/missilebox', { recursive: true });
fs.writeFileSync('captured/missilebox/golden.json', JSON.stringify({
  source: 'missiles fired on the machine from nine places around the target at X9 400, Y9 -100, Z9 -3500',
  target: { x: 400, y: -100, z: -3500 },
  box: { xLo: 250, xHi: 550, yLo: -120, yHi: -40, zLo: -3600, zHi: -3400 },
  step: 160, steps: 16, reach: 2400, te, hitValue: Math.trunc(120 / (te + 1)),
  results,
}) + String.fromCharCode(10));
console.log('');
const wrong = results.filter((r) => r.hit !== r.want).length;
console.log(wrong === 0 ? `the machine agrees with 1050 on all ${results.length}`
  : `${wrong} of ${results.length} did not come out as 1050 reads`);
console.log('wrote captured/missilebox/golden.json');
