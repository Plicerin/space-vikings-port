// The economy, checked on the machine instead of read off the listing.
//
// SHORE LEAVE line 2400-2406 prices thirteen cargo counters at 38171-38183 and doubles the
// total; 2170 prices a base; 3060 prices a weapon. This file has quoted those numbers for a
// while without ever running them.
//
// Twelve of the thirteen rates are constants, so the whole sum is deterministic **if the
// first counter is zero** - 38171 is the one priced at `300 * RND(1)`. So set 38171 to 0,
// give the other twelve known counts, sell, and the answer is a number this probe can predict
// exactly. Then do it again with 38171 set, and the extra has to land in `0 .. 300 * count`.
//
// Reaching SELL LOOT needs a base on the planet, because GROUND FORCES line 65 refuses
// options 3 to 6 without one. ESTABLISH BASE (option 7) needs the opposite, and tech of at
// least 2, and it can only be done once a trip.
//
// The answers come out of Applesoft's own variable table rather than off the screen: SHORE
// LEAVE prints through the hi-res character generator, so the numbers are pixels by the time
// they are visible, but `L` and `CR` are sitting in memory with their names on them.
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
const GF = textOf('GROUND FORCES');
const SL = textOf('SHORE LEAVE');

/** 2400-2405, in order from 38171. The first is `300 * RND(1)`; the rest are constants. */
const RATES = [null, 150, 100, 200, 200, 200, 300, 15, 5, 25, 20 * 75, 10 * 100, 10 * 200];
/** 3000: MU(1..4) against FIGHTERS, TRANSPORTS, TANKS, MISSILES at 38156 down to 38153. */
const WEAPON_UNIT = { FIGHTERS: 50, TRANSPORTS: 75, TANKS: 40, MISSILES: 30 };

const a2 = await openOracle();
await a2.ev(VAR_READER);
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
  for (let i = 0; i < 150; i++) {
    await a2.frames(20);
    const h = await a2.ev(`window.M.hash(0x2000, 0x6000)`);
    if (h === last) return;
    last = h;
  }
};
const vars = async () => {
  const r = JSON.parse(await a2.ev(`JSON.stringify(window.M.vars())`));
  const m = {};
  for (const v of r.vars ?? []) m[v.name] = v.value;
  if (r.refused) m.__refused = r.refused;
  return m;
};
// SHORE LEAVE's sub-screens finish by themselves: 2099 waits and then RUNs GROUND FORCES,
// and a RUN clears the variable table. So the window is narrow at one end - but the first
// sight of a name is no good either, because 2080 uses C as a FOR counter before 2170 makes
// it the price, and 2400-2406 build L a term at a time. Wait for the value to stop moving.
const varsWhile = async (wanted, name, tries = 500) => {
  let last;
  let stable = 0;
  for (let i = 0; i < tries; i++) {
    const v = await vars();
    if (v[name] !== undefined) {
      if (v[name] === last) { if (++stable >= 6) return v; } else { stable = 0; last = v[name]; }
    }
    await a2.frames(2);
  }
  return { __missed: `${name} never settled while ${wanted} was running` };
};
const poke = async (pairs) => {
  const js = pairs.map(([a, v]) => `window.M.wr(${a}, ${v});`).join(' ');
  await a2.ev(`(() => { ${js} return 'w'; })()`);
};

console.log('waiting for STARSHIP SIMULATOR...');
await waitFor(SIM, 'STARSHIP SIMULATOR');
await a2.key('C');
await waitFor(COM, 'COM');
await a2.key('2');
await waitFor(GF, 'GROUND FORCES');
await settle();

let bytes = await a2.readRange(0x9500, 0x9600);
const at = (a) => bytes[a - 0x9500];
const planet = at(38209);
const tech = at(38282 + planet);
console.log(`  planet ${planet}, tech ${tech}, base on it = ${at(38303 + planet)}`);

const out = { planet, tech, runs: [] };

// ---- ESTABLISH BASE, option 7: the cost, and the gates -----------------------------------
console.log('');
console.log('7 for ESTABLISH BASE - 2170 is C = 20000 + ((RND * 5000) * (RND * 10))');
await poke([[38303 + planet, 0], [38149, 0], [38282 + planet, Math.max(2, tech)]]);
await a2.key('7');
await waitFor(SL, 'SHORE LEAVE (establish base)');
{
  const v = await varsWhile('SHORE LEAVE', 'C');
  if (v.__missed || v.__refused) console.log('  ' + (v.__missed ?? v.__refused));
  const inRange = v.C >= 20000 && v.C <= 70000;
  console.log(`  C = ${v.C}, CR = ${v.CR}   ${inRange ? 'inside 20000..70000, as 2170 says' : 'OUT OF RANGE'}`);
  out.runs.push({ what: 'establish base', C: v.C, CR: v.CR, inRange });
  const on = decodeHgr(await a2.readRange(0x2000, 0x4000));
  fs.mkdirSync('captured/economy', { recursive: true });
  fs.writeFileSync('captured/economy/establish-base.png', toPng(on));
}
await a2.key('N');
await waitFor(GF, 'GROUND FORCES (back from establish base)');
await settle();

// ---- SELL LOOT, option 5, with the random counter emptied ---------------------------------
const COUNTS = [0, 3, 7, 2, 1, 4, 5, 9, 11, 6, 2, 3, 1];
const expected = COUNTS.reduce((n, c, i) => n + (RATES[i] === null ? 0 : c * RATES[i]), 0) * 2;
console.log('');
console.log('5 for SELL LOOT, with 38171 (the RND-priced one) emptied');
console.log(`  counts ${COUNTS.join(',')} at 38171-38183`);
console.log(`  2400-2406 therefore say L = ${expected}`);
await poke([[38303 + planet, 1], ...COUNTS.map((c, i) => [38171 + i, c])]);
await a2.key('5');
await waitFor(SL, 'SHORE LEAVE (sell loot)');
{
  const v = await varsWhile('SHORE LEAVE', 'L');
  if (v.__missed || v.__refused) console.log('  ' + (v.__missed ?? v.__refused));
  // 2460 zeroes the counters after it has printed the total, so the value settles first.
  let cleared = false;
  for (let i = 0; i < 300 && !cleared; i++) {
    bytes = await a2.readRange(0x9500, 0x9600);
    cleared = COUNTS.every((_, k) => at(38171 + k) === 0);
    if (!cleared) await a2.frames(2);
  }
  console.log(`  L = ${v.L}   ${v.L === expected ? 'exact' : `DIFFERS - expected ${expected}`}`);
  console.log(`  CR = ${v.CR}, and the thirteen counters are ${cleared ? 'all zero, as 2460 says' : 'NOT all zero'}`);
  out.runs.push({ what: 'sell loot, no random term', counts: COUNTS, expected, L: v.L, CR: v.CR, cleared });
  const on = decodeHgr(await a2.readRange(0x2000, 0x4000));
  fs.writeFileSync('captured/economy/sell-loot.png', toPng(on));
}
await a2.key('N');
await waitFor(GF, 'GROUND FORCES (back from sell loot)');
await settle();

// ---- and again with the random counter set, to bound its term -----------------------------
const N71 = 4;
console.log('');
console.log(`5 again, with 38171 = ${N71} - its term is 300 * RND(1) * ${N71}, so 0..${300 * N71}`);
await poke([[38303 + planet, 1], [38171, N71], ...COUNTS.slice(1).map((c, i) => [38172 + i, c])]);
await a2.key('5');
await waitFor(SL, 'SHORE LEAVE (sell loot, random term)');
{
  const v = await varsWhile('SHORE LEAVE', 'L');
  if (v.__missed || v.__refused) console.log('  ' + (v.__missed ?? v.__refused));
  const extra = v.L - expected;
  const ok = extra >= 0 && extra <= 300 * N71 * 2;
  console.log(`  L = ${v.L}, which is ${extra} over the deterministic ${expected}` +
    `   ${ok ? `inside 0..${300 * N71 * 2} after the doubling` : 'OUT OF RANGE'}`);
  out.runs.push({ what: 'sell loot, random term', n38171: N71, expected, L: v.L, extra, ok });
}
await a2.close();

out.rates = RATES;
out.weaponUnit = WEAPON_UNIT;
fs.writeFileSync('captured/economy/golden.json', JSON.stringify({
  source: 'SHORE LEAVE 2100-2170 and 2400-2460, run on the disk and read out of Applesoft\'s variable table',
  ...out,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/economy/golden.json and two PNGs');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
