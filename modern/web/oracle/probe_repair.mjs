// REPAIR/RESTOCK on the machine - one of the two screens DISK_TRUTH listed as never captured.
//
// It is SHORE LEAVE 2500-2620, and it needs a state nothing had ever set up: the ship in the
// atmosphere **and on the deck**, with something broken to pay for.
//
//   2505 R = 7: GOSUB 2080: IF PEEK(38210) = 0 OR PEEK(29469) > 22 THEN
//        VTAB 3: HTAB 3: PRINT "YOU MUST LAND ON": HTAB 3: PRINT "PLANET FIRST.": GOTO 2099
//   2510 PRINT "  REPAIR SHIP": FOR J = 1 TO 12: READ A$: READ LO
//   2520 D = PEEK(LO): IF D < 100 AND J <> 10 AND J <> 2 THEN PRINT A$;":";: HTAB 13:
//        CD = INT((RND(1) * 150) * (100 - ((D / 100) * 100))): PRINT D;: HTAB 17: PRINT "%":
//        P = P + CD: POKE LO,100
//   2525 IF D < 63 AND J = 2 THEN ... CD = INT((RND(1) * 200) * (100 - D1)) ... POKE LO,63
//   2530 IF D < 100 AND J = 10 THEN ... CD = INT((RND(1) * 100) * (100 - PEEK(LO))) ...
//        POKE LO,100
//
// 29469 is YI, the low byte of the ship's Y, and 147 clamps Y to 20 on the ground - so the
// gate is "landed", not "in the air somewhere". The two cells the loop restocks rather than
// repairs are 38199, which is the energy the flight loop reads at line 8, and 38187, which is
// the missile count 1090 decrements - not percentages of anything.
import { openOracle, VAR_READER } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import { decodeHgr, toPng, HGR_W, HGR_H } from './hgr.mjs';
import fs from 'fs';

const ATMOS = 38210, YI = 29469;
// 2500's DATA, in the order 2510 reads it.
const SLOTS = [
  ['SHIELD', 38200], ['ENERGY', 38199], ['# 1 ENGINE', 38198], ['# 2 ENGINE', 38197],
  ['COMPUTER', 38196], ['RADAR', 38195], ['ENV. CONTROL', 38194], ['HULL DMG.', 38193],
  ['HYPERDRIVE', 38190], ['MISSILES', 38187], ['LASER', 38186], ['NAV. COMP.', 38184],
];
// Something broken in each of the three branches, and two left whole.
const BREAK = {
  38200: 40, 38199: 9, 38198: 70, 38197: 100, 38196: 55,
  38195: 100, 38194: 128, 38193: 61, 38190: 88, 38187: 0, 38186: 0, 38184: 100,
};

const disk = openDisk(DISK);
const textOf = (name) => {
  const r = disk.read(disk.files.find((f) => f.name === name));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => l.num + ' ' + l.text).join('\n');
};
const PROGRAMS = ['STARSHIP SIMULATOR', 'COM', 'GROUND FORCES', 'SHORE LEAVE'];
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
  try { t = listProgram(m, 0x801, 0x2000).map((l) => l.num + ' ' + l.text).join('\n'); } catch { /* mid-load */ }
  for (const n of PROGRAMS) if (TEXTS[n] === t) return n;
  return '(other)';
};
const settleOn = async (want, tries = 900) => {
  let stable = 0;
  for (let i = 0; i < tries; i++) {
    await a2.frames(10);
    if ((await which()) === want) { if (++stable >= 12) return true; } else stable = 0;
  }
  return false;
};
const wr = (a, v) => a2.ev('(() => { window.M.wr(' + a + ', ' + (v & 255) + '); return 1; })()');
/** The 5-byte Applesoft float, the inverse of VAR_READER's mflp. */
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
  const vt = JSON.parse(await a2.ev('JSON.stringify(window.M.vars())'));
  slots = Object.fromEntries(vt.vars.map((v) => [v.name, v]));
  return slots;
};
const varOf = (n) => (slots[n] || {}).value;
const setVar = async (name, value) => {
  const v = slots[name];
  if (!v) throw new Error('no variable ' + name + ' in the table');
  const b = mflpBytes(value);
  for (let i = 0; i < 5; i++) await wr(v.at + 2 + i, b[i]);
};
/** Step until BASIC is at `line`, in small pieces so the stop is exact. */
const runTo = (line, budget = 400000) => a2.ev('(() => {'
  + 'const cpu = window.M.cpu;'
  + 'for (let i = 0; i < ' + budget + '; i++) {'
  + '  if (((cpu.read(0x75) | (cpu.read(0x76) << 8))) === ' + line + ') return "at";'
  + '  cpu.stepCycles(200);'
  + '}'
  + 'return "timeout";'
  + '})()');
const shot = async () => decodeHgr(await a2.readRange(0x2000, 0x4000));
const cells = async () => {
  const out = {};
  for (const [, a] of SLOTS) out[a] = (await a2.readRange(a, a + 1))[0];
  return out;
};

console.log('waiting for STARSHIP SIMULATOR...');
if (!await settleOn('STARSHIP SIMULATOR')) { await a2.close(); throw new Error('no simulator'); }
await a2.frames(200);

// On the deck: 147's `IF Y < 20 THEN Y = 20` is what makes 2505's low-byte test work.
if (await runTo(150) !== 'at') { await a2.close(); throw new Error('never reached 150'); }
await readVars();
await setVar('Y', 20); await setVar('S', 0);
await wr(ATMOS, 1);
for (const [, a] of SLOTS) await wr(a, BREAK[a]);
// `runTo` returns at once when it is already there, so let whole passes go by first: 147
// takes Y down by `6 - S / 10` a pass and stops it at 20, and only then does 140 store it.
for (let i = 0; i < 3; i++) { await a2.frames(200); await runTo(150); }
const yiByte = (await a2.readRange(YI, YI + 1))[0];
await readVars();
console.log('  Y is ' + varOf('Y') + ', PEEK(29469) is ' + yiByte + ', so 2505 '
  + (yiByte > 22 ? 'REFUSES' : 'lets us in'));
if (yiByte > 22) { await a2.close(); throw new Error('the ship is not on the deck'); }
const before = await cells();

await a2.key('C', { holdFrames: 40, afterFrames: 20 });
if (!await settleOn('COM')) { await a2.close(); throw new Error('COM never started'); }
for (let i = 0; i < 40; i++) await a2.frames(10);
await a2.key('2', { holdFrames: 40, afterFrames: 20 });
if (!await settleOn('GROUND FORCES')) { await a2.close(); throw new Error('GROUND FORCES never started'); }
for (let i = 0; i < 40; i++) await a2.frames(10);
await a2.key('6', { holdFrames: 40, afterFrames: 20 });
if (!await settleOn('SHORE LEAVE')) { await a2.close(); throw new Error('SHORE LEAVE never started'); }

// 2545 draws the lamp back to green and runs once. 2540 does NOT: its `NEXT` is the FOR
// J = 1 TO 12 loop's own, so stopping there catches the list after a single item - which is
// what the first run of this did, and it read P as one item's cost rather than the bill.
const atList = await runTo(2545, 900000);
const listPage = await shot();
await readVars();
const bill = varOf('P'), credits = varOf('CR');
console.log('  the list stopped at 2540: ' + atList + '; P is ' + bill + ', CR is ' + credits);

// 2580 if the bill can be paid, 2602 if it cannot, 2605 either way after that. Wait for
// whichever comes first rather than guessing, because 2540's delay runs first and a stop
// that guesses wrong spends its whole budget before the right line is ever current.
const runToAny = (lines, budget = 900000) => a2.ev('(() => {'
  + 'const cpu = window.M.cpu; const want = ' + JSON.stringify(lines) + ';'
  + 'for (let i = 0; i < ' + budget + '; i++) {'
  + '  const l = cpu.read(0x75) | (cpu.read(0x76) << 8);'
  + '  if (want.indexOf(l) >= 0) return String(l);'
  + '  cpu.stepCycles(200);'
  + '}'
  + 'return "timeout";'
  + '})()');
// 2615 is where both branches meet, so the page is finished whichever way it went. 2580
// blocks on a GET, so it has to be watched for separately.
// 2600's own `GOSUB 2080` wipes the panel before the refusal is printed, so the bill has to
// be caught while 2600 is still the current line.
const billStop = await runToAny([2580, 2600]);
const billPage = await shot();
const stop = billStop === '2580' ? '2580' : await runToAny([2615]);
const where = billStop === '2580' ? '2580, asking whether to pay'
  : stop === '2615' ? '2615, the bill settled one way or the other'
  : 'timeout';
const summaryPage = await shot();
const after = await cells();
console.log('  the summary stopped at ' + where);
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();

const pts = (p) => {
  const out = [];
  for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) if (p[y * HGR_W + x]) out.push([x, y]);
  return out;
};
console.log('');
console.log('  cell            before  after');
for (const [name, a] of SLOTS) {
  console.log('  ' + name.padEnd(14) + '  ' + String(before[a]).padStart(5)
    + '  ' + String(after[a]).padStart(5)
    + (before[a] !== after[a] ? '   <- the loop put it here' : ''));
}

fs.mkdirSync('captured/repair', { recursive: true });
fs.writeFileSync('captured/repair/list.png', toPng(listPage));
fs.writeFileSync('captured/repair/bill.png', toPng(billPage));
fs.writeFileSync('captured/repair/summary.png', toPng(summaryPage));
fs.writeFileSync('captured/repair/golden.json', JSON.stringify({
  source: 'SHORE LEAVE 2500-2620 on the machine, landed at Y 20 with eight of the twelve broken',
  gate: { yiByte, atmosphere: 1 },
  slots: SLOTS.map(([n, a]) => ({ name: n, addr: a, before: before[a], after: after[a] })),
  billTotal: bill, credits, summaryStoppedAt: where,
  list: { lit: pts(listPage).length, points: pts(listPage) },
  billPage: { lit: pts(billPage).length, points: pts(billPage) },
  summary: { lit: pts(summaryPage).length, points: pts(summaryPage) },
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/repair/golden.json, list.png and summary.png');
