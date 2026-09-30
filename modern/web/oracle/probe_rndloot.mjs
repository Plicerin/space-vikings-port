// COLLECT's loot rolls, recorded so they can be replayed.
//
// `805 ON TECH + 1 GOSUB 820,840,910,1070,1090` picks the path. 910, 1070 and 1090 set the two
// rates and all three call 920, which draws thirteen values in a fixed order:
//
//   925 gold J2, 940 silver J2, 950 platinum J2, 960 titanium J2, 970 collapsium J1,
//   980 steel J2, 990 fissionables J2, 1000 electronics J1, 1010 weapons J1,
//   1020 fighter parts J2, 1030 luxury food 20, 1040 wine J2, 1050 art J1
//
// each `J = PEEK(addr) + (RND(1) * rate): GOSUB 915: POKE addr,J` with `915 IF J > 255 THEN
// J = 255`, so the POKE truncates and the fraction is gone. Two of the thirteen do not land
// where they look:
//
//   960  POKE 31180,J   - a typo for 38180, so titanium is never awarded
//   920  IF PEEK(301) = 1 THEN J1 = J1 * .6: J2 = J2 * .6   - a second collection is worth 60%
//
// Reaching COLLECT needs a won assault: GROUND FORCES 660 surrenders the planet and 690 falls
// into 800. So the surrender point goes low and morale high, and the first round takes it.
import { openOracle, VAR_READER } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
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

/** 38171-38183, low to high, so the replay can name them. */
const LOOT = [
  ['art', 38171], ['wine', 38172], ['luxuryFood', 38173], ['fighterParts', 38174],
  ['weapons', 38175], ['electronics', 38176], ['fissionables', 38177], ['steel', 38178],
  ['collapsium', 38179], ['titanium', 38180], ['platinum', 38181], ['silver', 38182],
  ['gold', 38183],
];

const a2 = await openOracle();
await a2.ev(VAR_READER);
await a2.boot();
await a2.key('N');
const loaded = async () => {
  const b = await a2.readRange(0x800, 0x2000);
  const m = {};
  for (let k = 0; k < b.length; k++) m[0x800 + k] = b[k];
  try { return listProgram(m, 0x801, 0x2000).map((l) => `${l.num} ${l.text}`).join('\n'); }
  catch { return ''; }
};
const waitFor = async (w, label) => {
  for (let i = 0; i < 600; i++) { await a2.frames(20); if ((await loaded()) === w) return true; }
  console.log('  ' + label + ' never started');
  return false;
};

console.log('waiting for STARSHIP SIMULATOR...');
if (!await waitFor(SIM, 'STARSHIP SIMULATOR')) { await a2.close(); throw new Error('no simulator'); }
await a2.frames(200);
await a2.key('C');
if (!await waitFor(COM, 'COM')) { await a2.close(); throw new Error('no COM'); }
await a2.key('2');
if (!await waitFor(GF, 'GROUND FORCES')) { await a2.close(); throw new Error('no GROUND FORCES'); }
for (let i = 0; i < 30; i++) await a2.frames(20);

const planet = await a2.read(38209);
const tech = (await a2.readRange(0x9500, 0x9600))[38282 + planet - 0x9500];
console.log(`  planet ${planet}, tech ${tech} - so 805 takes the ` +
  `${tech === 1 ? '840' : tech === 2 ? '910' : tech === 3 ? '1070' : '1090'} path`);

console.log('a surrender point of 2 and morale 6, so the first round wins and 690 runs COLLECT');
await a2.ev(`(() => {
  const w = window.M.wr;
  w(38158, ${planet}); w(38150, 2); w(38160, 0); w(38208, 0); w(38203, 6);
  w(38151, 0); w(38205, 3); w(38206, 100); w(301, 0);
  for (const a of [38171, 38172, 38173, 38174, 38175, 38176, 38177, 38178, 38179, 38180,
    38181, 38182, 38183]) w(a, 0);
  return 'w';
})()`);
await a2.frames(20);
await a2.key('1');

const r = JSON.parse(await a2.ev(`(() => {
  const cpu = window.M.cpu;
  const loot = ${JSON.stringify(LOOT.map((l) => l[1]))};
  const out = [];
  let n = 0;
  while (n < 80000000 && out.length < 900) {
    if (cpu.getPC() === 0xEFAE) {
      const v = window.M.vars();
      const g = (nm) => {
        const x = (v.vars || []).find((y) => y.name === nm && y.type === 'real');
        return x ? x.value : null;
      };
      out.push({
        seed: [cpu.read(0xC9), cpu.read(0xCA), cpu.read(0xCB), cpu.read(0xCC), cpu.read(0xCD)],
        a4: cpu.read(0xA4),
        loot: loot.map((a) => cpu.read(a)),
        flag301: cpu.read(301),
        stray: cpu.read(31180),
        // the rates are Applesoft variables, so read them rather than infer them
        rates: { J1: g('J1'), J2: g('J2'), J: g('J') },
      });
    }
    cpu.stepCycles(1);
    n++;
  }
  return JSON.stringify({
    steps: n,
    calls: out,
    // the thirteenth draw is only visible in the counters after the loop has finished
    final: loot.map((a) => cpu.read(a)),
    finalStray: cpu.read(31180),
    final301: cpu.read(301),
  });
})()`));
await a2.close();

const calls = r.calls;
console.log(`  ${calls.length} calls to $EFAE in ${r.steps.toLocaleString()} instructions`);
// The first loot draw is the one after which gold (38183) first moves.
const goldIdx = LOOT.findIndex(([n]) => n === 'gold');
let start = -1;
for (let i = 0; i + 1 < calls.length; i++) {
  if (calls[i].loot[goldIdx] !== calls[i + 1].loot[goldIdx]) { start = i; break; }
}
console.log(start < 0
  ? '  gold never moved - COLLECT did not run'
  : `  gold first moves after draw ${start}, so 925 is that draw and 920's thirteen start there`);
if (start >= 0) {
  console.log(`  301 was ${calls[start].flag301} going in, so ${calls[start].flag301 === 1 ? 'the 60% rates apply' : 'the full rates apply'}`);
  console.log(`  31180 was ${calls[start].stray} before and ${r.finalStray} after`);
  const rr = calls[start].rates;
  console.log(`  at the first draw J1 = ${rr.J1} and J2 = ${rr.J2}` +
    `, so 920's 60% ${rr.J1 !== null && rr.J1 < 10 ? 'did' : 'did not'} apply`);
}

fs.mkdirSync('captured/replay', { recursive: true });
fs.writeFileSync('captured/replay/loot.json', JSON.stringify({
  source: 'every entry to $EFAE from the winning assault into COLLECT, with the seed before the call and the thirteen cargo counters',
  planet, tech, loot: LOOT, start, calls,
  final: r.final, finalStray: r.finalStray, final301: r.final301,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/replay/loot.json');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
