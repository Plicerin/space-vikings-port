// STATUS, the ship status report, captured from the original.
//
// Reached from flight: C for COM, 1 for CENTRAL COMPUTER, 4 for SHIP STATUS, which is
// COM line 270's `ON C GOTO 800,900,30,1200,20000` landing on 1200's RUN STATUS.
//
// It is two screens. Line 1315's GET I$ holds the first, then line 1230 blanks rows 1-15
// and the troop report is drawn; line 1390's GET A$ holds that one before RUN COM.
//
// Worth capturing carefully because of line 30. STATUS pokes 973,255 and leaves it there
// for the whole report, resetting it to 0 only at line 1396. In COM the same location is
// poked to 255 to make a readout vanish, so on that reading STATUS would draw nothing at
// all. One of those two readings has to be wrong, and only the machine can say which.
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
const COM = textOf('COM');
const STATUS = textOf('STATUS');

// Every byte STATUS peeks, with the line that peeks it.
const BYTES = [
  [38209, 'current planet, line 5 / 1235'],
  [38199, 'energy, 1255'],
  [38200, 'shields, 1270'],
  [38165, 'condition 1 GREEN 2 BLUE 3 RED, 1280'],
  [38193, 'hull health - printed as 100 - it, 1300'],
  [38187, 'missiles, 1300'],
  [38196, 'computer, 5100'],
  [38190, 'hyperdrive, 5100'],
  [38195, 'radar, 5110'],
  [38186, 'laser, 5120'],
  [38198, 'engine 1, 1310'],
  [38197, 'engine 2, 1310'],
  [38203, 'troop morale 1-6, 1340'],
  [38166, 'troop location 0-3, 1370'],
  [38156, 'fighters, 5200'],
  [38155, 'transports, 5200'],
  [38154, 'tanks, 5210'],
  [38153, 'ground missiles, 5210'],
  [38167, 'troops high byte, 1386'],
  [38159, 'troops low byte, 1386'],
  [38157, 'speed - not STATUS, but the flight needle the panel still shows'],
  [29473, 'pitch $7321'],
  [29474, 'bank $7322'],
  [973, '$3CD - 255 for the whole report, the inverse flag'],
  [974, '$3CE'],
];

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
  await a2.close();
  throw new Error(`${label} never started`);
};
const settle = async () => {
  let last = '';
  for (let i = 0; i < 100; i++) {
    await a2.frames(20);
    const h = await a2.ev(`window.M.hash(0x2000, 0x6000)`);
    if (h === last) return;
    last = h;
  }
};

console.log('waiting for STARSHIP SIMULATOR...');
await waitFor(SIM, 'STARSHIP SIMULATOR');
console.log('C for COM');
await a2.key('C');
await waitFor(COM, 'COM');
await settle();
console.log('1 for CENTRAL COMPUTER, then 4 for SHIP STATUS');
await a2.key('1');
await a2.frames(120);
await a2.key('4');
await waitFor(STATUS, 'STATUS');
console.log('STATUS is running\n');

fs.mkdirSync('captured/status', { recursive: true });
// Line 50's GOSUB 5000 reads the MISC file off the disk before anything is printed, and
// the screen sits still for the whole of it - settling alone catches the bare fill. So
// wait the read out first.
const grab = async (label, minFrames = 0) => {
  if (minFrames) await a2.frames(minFrames);
  await settle();
  const p1 = decodeHgr(await a2.readRange(0x2000, 0x4000));
  const p2 = decodeHgr(await a2.readRange(0x4000, 0x6000));
  const count = (on) => { let n = 0; for (let i = 0; i < on.length; i++) if (on[i]) n++; return n; };
  const which = count(p1) >= count(p2) ? 'page1' : 'page2';
  const on = which === 'page1' ? p1 : p2;
  const pts = [];
  let minX = HGR_W, maxX = -1, minY = HGR_H, maxY = -1;
  for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) {
    if (!on[y * HGR_W + x]) continue;
    pts.push([x, y]);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  fs.writeFileSync(`captured/status/${label}.png`, toPng(on));
  console.log(`  ${label}: page1 ${count(p1)} lit, page2 ${count(p2)} lit -> ${which}, ` +
    `${pts.length} lit, x ${minX}-${maxX}, y ${minY}-${maxY}`);
  return { drawnOn: which, lit: pts.length, bounds: { minX, maxX, minY, maxY }, points: pts };
};

const screen1 = await grab('screen1', 900);

// SD, TR and CR are not bytes - line 50's GOSUB 5000 INPUTs them from the MISC file, so
// they only exist as Applesoft variables.
await a2.ev(VAR_READER);
const vars = JSON.parse(await a2.ev(`JSON.stringify(window.M.vars())`));
const pick = (n) => { const v = vars.vars.find((x) => x.name === n); return v ? v.value : null; };
const misc = { SD: pick('SD'), TR: pick('TR'), CR: pick('CR') };
console.log('');
console.log('from the MISC file: SD =', misc.SD, ' TR =', misc.TR, ' CR =', misc.CR);
const state = {};
for (const [addr, what] of BYTES) state[addr] = { value: await a2.read(addr), what };

console.log('\nthe bytes STATUS reads:');
for (const [addr, what] of BYTES) {
  console.log(`  ${String(addr).padStart(5)}  ${String(state[addr].value).padStart(3)}   ${what}`);
}

console.log('\nkey for the troop report');
await a2.key(' ');
await a2.frames(120);
const screen2 = await grab('screen2', 300);

fs.writeFileSync('captured/status/golden.json', JSON.stringify({
  source: 'the original STATUS, reached from flight by C, 1, 4',
  bytes: Object.fromEntries(Object.entries(state).map(([a, v]) => [a, v.value])),
  misc,
  screen1, screen2,
}) + '\n');
console.log('\nwrote captured/status/golden.json and both PNGs');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
