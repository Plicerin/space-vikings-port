// ENLIST TROOPS on the machine - the last screen DISK_TRUTH listed as never captured.
//
//   2200 R = 7: GOSUB 2080: PRINT "ENLIST TROOPS": PRINT
//   2210 IF PEEK(38389) = 1 THEN PRINT "ONE TIME PER TRIP.": GOTO 2099
//   2220 POKE 38389,1
//   2240 IF PEEK(38208) = 0 THEN PRINT "THE PLANET HAS NOT": PRINT "SURRENDERED YET!!": GOTO 2099
//   2250 PRINT "EACH NEW TROOP": PRINT "MUST BE PAID ONE": PRINT "CREDIT IN ADVANCE."
//   2260 PRINT "YOU HAVE ";CR: PRINT "CREDITS, SIR."
//   2270 PRINT "TROOPS= ";TR: VTAB 10: PRINT "HOW MANY TROOPS": PRINT "DO YOU WANT TO":
//        PRINT "ENLIST?";
//   2275 J = 0: V = 13: H = 2: GOSUB 5000: EN = CC: VTAB 13: HTAB 2: PRINT "       "
//   2280 IF EN > CR THEN ...blank 10, 11, 12... VTAB 10: PRINT "YOU DON'T HAVE":
//        PRINT EN;" CREDITS!": FOR J = 1 TO 3000: NEXT
//   2281 IF EN > CR THEN ...blank again... VTAB 9: GOTO 2270
//   2285 IF TR + EN > 20000 THEN VTAB 12: HTAB 2: PRINT "TOO MANY TROOPS.  ":
//        FOR O = 1 TO 2000: NEXT: POKE 38389,0: GOTO 2200
//   2290 TR = TR + EN: CR = CR - EN: GOSUB 3000
//
// Two things here are not a single screen and a single answer, which is how the port had
// read them: 2281 goes **back to 2270** and asks again, and 2285 goes back to **2200** and
// starts the whole screen over with the once-per-trip flag handed back. This drives all of
// it - an unaffordable answer, an impossible one, then one that works - and captures the
// page at each stop, including BUY WEAPONS, which only 2290 can reach.
import { openOracle, VAR_READER } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import { decodeHgr, toPng, HGR_W, HGR_H } from './hgr.mjs';
import fs from 'fs';

const SURRENDERED = 38208, ENLISTED = 38389;

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
const runTo = (line, budget = 600000) => a2.ev('(() => {'
  + 'const cpu = window.M.cpu;'
  + 'for (let i = 0; i < ' + budget + '; i++) {'
  + '  if (((cpu.read(0x75) | (cpu.read(0x76) << 8))) === ' + line + ') return "at";'
  + '  cpu.stepCycles(200);'
  + '}'
  + 'return "timeout";'
  + '})()');
const runToAny = (lines, budget = 600000) => a2.ev('(() => {'
  + 'const cpu = window.M.cpu; const want = ' + JSON.stringify(lines) + ';'
  + 'for (let i = 0; i < ' + budget + '; i++) {'
  + '  const l = cpu.read(0x75) | (cpu.read(0x76) << 8);'
  + '  if (want.indexOf(l) >= 0) return String(l);'
  + '  cpu.stepCycles(200);'
  + '}'
  + 'return "timeout";'
  + '})()');
const shot = async () => decodeHgr(await a2.readRange(0x2000, 0x4000));
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
const setVar = async (name, value) => {
  const vt = JSON.parse(await a2.ev('JSON.stringify(window.M.vars())'));
  const v = vt.vars.find((x) => x.name === name);
  if (!v) throw new Error('no variable ' + name);
  const b = mflpBytes(value);
  for (let i = 0; i < 5; i++) await wr(v.at + 2 + i, b[i]);
};
const vars = async () => {
  const vt = JSON.parse(await a2.ev('JSON.stringify(window.M.vars())'));
  return Object.fromEntries(vt.vars.map((v) => [v.name, v.value]));
};
/** 5000 is one GET a character, so each digit is its own keypress. */
const typeIn = async (s) => {
  for (const ch of s) await a2.key(ch, { holdFrames: 6, afterFrames: 10 });
  await a2.key(String.fromCharCode(13), { holdFrames: 6, afterFrames: 10 });
};
const pts = (p) => {
  const out = [];
  for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) if (p[y * HGR_W + x]) out.push([x, y]);
  return out;
};
const pages = {};
const keep = async (name, note) => {
  const p = await shot();
  pages[name] = { note, lit: pts(p).length, points: pts(p) };
  fs.mkdirSync('captured/enlist', { recursive: true });
  fs.writeFileSync('captured/enlist/' + name + '.png', toPng(p));
  console.log('  kept ' + name + ' (' + pages[name].lit + ' lit) - ' + note);
};

console.log('waiting for STARSHIP SIMULATOR...');
if (!await settleOn('STARSHIP SIMULATOR')) { await a2.close(); throw new Error('no simulator'); }
await a2.frames(200);
await wr(SURRENDERED, 1);     // 2240 wants a planet that has given up
await wr(ENLISTED, 0);        // 2210's flag, so this trip still has its one go

const toShoreLeave = async () => {
  await a2.key('C', { holdFrames: 40, afterFrames: 20 });
  if (!await settleOn('COM')) throw new Error('COM never started');
  for (let i = 0; i < 40; i++) await a2.frames(10);
  await a2.key('2', { holdFrames: 40, afterFrames: 20 });
  if (!await settleOn('GROUND FORCES')) throw new Error('GROUND FORCES never started');
  for (let i = 0; i < 40; i++) await a2.frames(10);
  await a2.key('4', { holdFrames: 40, afterFrames: 20 });
  if (!await settleOn('SHORE LEAVE')) throw new Error('SHORE LEAVE never started');
};
await toShoreLeave();

// --- the prompt ------------------------------------------------------------------------
if (await runTo(2275) !== 'at') { await a2.close(); throw new Error('never reached 2275'); }
const v0 = await vars();
console.log('  CR is ' + v0.CR + ', TR is ' + v0.TR);
await keep('prompt', '2270, the question as it is first asked');

// --- an answer nobody can afford --------------------------------------------------------
await typeIn(String(Math.floor(v0.CR) + 50000));
if (await runTo(2281) !== 'at') { await a2.close(); throw new Error('2280 never printed'); }
await keep('poor', "2280's refusal, before 2281 wipes it");

// 2281 blanks rows 10 to 13 and jumps to 2270, so the question comes back.
if (await runTo(2275, 900000) !== 'at') { await a2.close(); throw new Error('2281 did not re-ask'); }
await keep('reask', '2281 went back to 2270 and asked again');

// --- an answer that would overflow the army ----------------------------------------------
// 2280 is tested before 2285, so the only way to reach 2285 is an answer the purse *can*
// cover: with CR 10000 the army has to already be close to the 20000 ceiling.
await setVar('TR', 19500);
await typeIn('1000');
if (await runTo(2285, 900000) !== 'at') { await a2.close(); throw new Error('2285 never ran'); }
// 2080 leaves `SPEED= 127`, so the message is typed out a character at a time. A short step
// catches it part-written - the first run of this stopped after "TOO", leaving the page
// reading TOOIST? where ENLIST? had been. Step until the page stops changing instead, and
// stay inside 2285's own `FOR O = 1 TO 2000` so it has not jumped back to 2200.
await a2.ev(`(() => {
  const cpu = window.M.cpu;
  let prev = -1, still = 0;
  for (let i = 0; i < 40; i++) {
    cpu.stepCycles(50000);
    let h = 0;
    for (let a = 0x2000; a < 0x4000; a += 7) h = (h * 31 + cpu.read(a)) | 0;
    if (h === prev) { if (++still >= 4) break; } else still = 0;
    prev = h;
  }
  return 'settled';
})()`);
await keep('toomany', "2285's refusal, written out in full inside its own delay");

// 2285 hands the trip's enlistment back and starts the screen again at 2200.
const back = await runToAny([2200, 2275], 900000);
console.log('  after TOO MANY TROOPS the program went to ' + back);
const flagAfter = (await a2.readRange(ENLISTED, ENLISTED + 1))[0];
console.log('  38389 is ' + flagAfter + ' (2285 pokes it back to 0)');

// --- an answer that works -----------------------------------------------------------------
if (await runTo(2275, 900000) !== 'at') { await a2.close(); throw new Error('no second prompt'); }
await typeIn('100');
// 3060 opens with the `NEXT` of 3020's own `FOR J = 0 TO 3`, so stopping there catches the
// page after a single line. 3070 runs once, with all four counts and the price up.
if (await runTo(3070, 900000) !== 'at') { await a2.close(); throw new Error('BUY WEAPONS never drew'); }
// 3070's own PRINT has not happened yet while 3070 is the current line, so go on until the
// input routine is waiting - that is the page a player actually sees.
if (await runTo(5000, 900000) !== 'at') { await a2.close(); throw new Error('5000 never waited'); }
const v1 = await vars();
console.log('  after enlisting 100: CR ' + v1.CR + ', TR ' + v1.TR);
await keep('buyweapons', "3020's first page, which only 2290 can reach");

if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();

fs.writeFileSync('captured/enlist/golden.json', JSON.stringify({
  source: 'SHORE LEAVE 2200-2300 on the machine, with a surrendered planet and the trip unspent',
  before: { credits: v0.CR, troops: v0.TR },
  after: { credits: v1.CR, troops: v1.TR },
  enlistedFlagAfterTooMany: flagAfter,
  wentBackTo: back,
  pages,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/enlist/golden.json and five pages');
