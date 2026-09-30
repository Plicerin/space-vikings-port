// GROUND FORCES' combat, recorded so it can be replayed.
//
// Lines 550-680 draw sixteen or seventeen values a round, in a fixed order:
//
//   550  VIC                                               1
//        T2, T3, X   (either branch)                        3
//   560  T, P, M each RND*(RND*5)                           6
//        TP  RND*1                                          1
//        TR  RND*(RND*(TECH*(RND*T2)))                      3
//   570  ET  RND*(RND*(3*(RND*T3)))                         3
//        X   RND*1, only when PEEK(38205) > 0               0 or 1
//
// and 600 pokes P, TP, T and M back as bytes while 4000 truncates the variables, so at a round
// boundary the byte and the variable agree. That makes the whole round predictable from the seed
// at its first draw - which is what this records, along with the bytes and the live variables.
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
const morale = 4;
console.log(`  planet ${planet}, tech ${tech}, morale forced to ${morale}`);

// Stock the weapons and come back through the menu, because line 13 reads them when the menu
// is drawn and only M is re-read at 500. Then a surrender point to climb to.
await a2.ev(`(() => { const w = window.M.wr; w(38153, 200); w(38154, 200); w(38155, 60); w(38156, 200); return 'w'; })()`);
await a2.key('9');
if (!await waitFor(COM, 'COM (to redraw the menu)')) { await a2.close(); throw new Error('no COM'); }
await a2.key('2');
if (!await waitFor(GF, 'GROUND FORCES (menu redrawn)')) { await a2.close(); throw new Error('no GF'); }
for (let i = 0; i < 30; i++) await a2.frames(20);
await a2.ev(`(() => {
  const w = window.M.wr;
  w(38158, ${planet}); w(38150, 200); w(38160, 0); w(38208, 0); w(38203, ${morale});
  w(38151, 0); w(38205, 3); w(38206, 100);
  return 'w';
})()`);
await a2.frames(20);
console.log('pressing 1 to attack, and recording every draw');
await a2.key('1');

const r = JSON.parse(await a2.ev(`(() => {
  const cpu = window.M.cpu;
  const out = [];
  const w = (a) => cpu.read(a) | (cpu.read(a + 1) << 8);
  let n = 0;
  while (n < 60000000 && out.length < 700) {
    if (cpu.getPC() === 0xEFAE) {
      const v = window.M.vars();
      const g = (nm) => {
        const x = (v.vars || []).find((y) => y.name === nm && y.type === 'real');
        return x ? x.value : null;
      };
      out.push({
        seed: [cpu.read(0xC9), cpu.read(0xCA), cpu.read(0xCB), cpu.read(0xCC), cpu.read(0xCD)],
        a4: cpu.read(0xA4),
        bytes: [cpu.read(38153), cpu.read(38154), cpu.read(38155), cpu.read(38156), cpu.read(38160)],
        vars: { T: g('T'), P: g('P'), TP: g('TP'), M: g('M'), TR: g('TR'), VP: g('VP'), X: g('X') },
      });
    }
    cpu.stepCycles(1);
    n++;
  }
  return JSON.stringify({ steps: n, calls: out });
})()`));
await a2.close();

console.log(`  ${r.calls.length} calls to $EFAE in ${r.steps.toLocaleString()} instructions`);
const a4s = [...new Set(r.calls.map((c) => c.a4))];
console.log(`  $A4: ${a4s.map((v) => '$' + v.toString(16)).join(', ')}`);
const withVars = r.calls.filter((c) => c.vars.TR !== null).length;
console.log(`  ${withVars} of them with the battle variables live`);

fs.mkdirSync('captured/replay', { recursive: true });
fs.writeFileSync('captured/replay/combat.json', JSON.stringify({
  source: 'every entry to $EFAE during a real assault, with the seed before the call, the four weapon bytes, 38160, and the live Applesoft variables',
  planet, tech, morale, calls: r.calls,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/replay/combat.json');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
