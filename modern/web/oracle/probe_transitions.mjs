// The disk's screen across scene changes, not within them.
//
// Every other capture here is of one screen reached one way, and three bugs in a row have now
// turned out to live in the getting there rather than the arriving:
//
//   - the ground wireframe was never drawn, because the atmosphere branch called something else
//   - the stardate never advanced, because only a jump moves it and nothing did
//   - the galaxy map's caption sat under COM, because the disk goes through INSTRUMENTS and the
//     port went straight there
//
// `com_parity.mjs` matches the disk perfectly and could not have caught the last one: its
// capture is of COM reached from flight. So this walks a route and captures the page **after
// each step**, together with the programs the disk ran on the way, which is the part a
// single-screen capture throws away.
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
const PROGRAMS = ['STARSHIP SIMULATOR', 'COM', 'GALAXY MAP', 'INSTRUMENTS', 'RADAR', 'STATUS',
  'SUPPLY', 'GROUND FORCES', 'SHORE LEAVE'];
const TEXTS = Object.fromEntries(PROGRAMS.map((n) => [n, textOf(n)]));

const a2 = await openOracle();
await a2.boot();
await a2.key('N');
const loaded = async () => {
  const b = await a2.readRange(0x800, 0x2000);
  const m = {};
  for (let k = 0; k < b.length; k++) m[0x800 + k] = b[k];
  try { return listProgram(m, 0x801, 0x2000).map((l) => `${l.num} ${l.text}`).join('\n'); }
  catch { return ''; }
};
const which = async () => {
  const t = await loaded();
  for (const n of PROGRAMS) if (TEXTS[n] === t) return n;
  return '(other)';
};

/**
 * Press a key, follow the programs it sets off, and capture once the screen has settled.
 *
 * The hold matters. STARSHIP SIMULATOR samples the keyboard once a pass at line 200, and a pass
 * is about half a second, so `a2.key`'s default four-frame hold is a race - it works sometimes
 * and the first run of this file lost every key press to it. Forty frames is longer than a
 * pass, so the key is always seen.
 *
 * Settling is on the **program**, not the picture: a flight frame never repeats, so waiting for
 * two equal pixel counts there waits forever. And it has to settle on a program this file
 * recognises - "(other)" is DOS part way through a load, and treating that as settled sends the
 * next key press into a program that is not listening yet. The first run of this did exactly
 * that: the `1` meant for COM's menu went nowhere and the `3` after it reached COM's main menu
 * instead of the computer's, so the route went to RADAR rather than the galaxy map.
 */
// settle: a chain can pass through an intermediate program that runs for a second or so -
// INSTRUMENTS between the galaxy map and COM is the case in point - so "no change" has to
// mean no change for longer than that, or the capture is of the program in the middle.
const step = async (label, key, { settle = 22, tries = 800, settlePixels = true } = {}) => {
  const chain = [];
  if (key !== null) await a2.key(key, { holdFrames: 40, afterFrames: 20 });
  let stable = 0;
  for (let i = 0; i < tries; i++) {
    await a2.frames(10);
    const w = await which();
    if (chain[chain.length - 1] !== w) { chain.push(w); stable = 0; }
    else if (w !== '(other)') stable++;
    if (stable >= settle && chain.length > (key === null ? 0 : 1)) break;
  }
  // and then wait for the drawing itself to stop.
  //
  // Settling on the program is not enough. COM floods 124 hi-res lines from BASIC and then
  // prints its readouts, its box and its menu, which takes far longer than the program has
  // been loaded - the first capture of `galaxy map -> COM` caught it between line 70 and line
  // 90, with the damage grid up and no menu, and that went into the golden as though it were
  // the finished screen. So count the lit pixels until they stop changing. The flight view
  // never repeats, so it passes `settlePixels: false` and keeps the fixed wait.
  if (settlePixels) {
    // Hash the page, do not count anything about it. Counting non-zero **bytes** was the first
    // try and it is blind on exactly the screen that needed it: STATUS floods rows 0-123 and
    // then prints in inverse, so nearly every byte in the region is non-zero from the start and
    // the count barely moves while the text goes down. It settled on a screen that had got as
    // far as "CON" of "CONDITION:" and put that in the golden as the finished page.
    let prev = '', still = 0;
    for (let i = 0; i < 300; i++) {
      await a2.frames(10);
      const h = await a2.ev(`window.M.hash(0x2000, 0x4000)`);
      if (h === prev) still++; else still = 0;
      prev = h;
      if (still >= 12) break;
    }
  } else {
    for (let i = 0; i < 25; i++) await a2.frames(10);
  }
  const page = decodeHgr(await a2.readRange(0x2000, 0x4000));
  const points = [];
  for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) {
    if (page[y * HGR_W + x]) points.push([x, y]);
  }
  let panel = 0;
  for (let y = 124; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) if (page[y * HGR_W + x]) panel++;
  console.log(`  ${label.padEnd(26)} ${chain.join(' -> ').padEnd(46)} ` +
    `${String(points.length).padStart(6)} lit, ${String(panel).padStart(5)} in the panel`);
  return { label, key, chain, lit: points.length, panel, points, page };
};

console.log('waiting for STARSHIP SIMULATOR...');
let ok = false;
for (let i = 0; i < 700; i++) { await a2.frames(20); if ((await which()) === 'STARSHIP SIMULATOR') { ok = true; break; } }
if (!ok) { await a2.close(); throw new Error('no simulator'); }
await a2.frames(300);

console.log('');
console.log('  step                       programs run                                   result');
const steps = [];
// The flight screen never repeats, so it gets a fixed settle rather than a stable one.
for (let i = 0; i < 20; i++) await a2.frames(10);
steps.push(await step('in flight', null, { settle: 1, tries: 2, settlePixels: false }));
steps.push(await step('flight -> COM', 'C'));
steps.push(await step('COM -> computer', '1'));
steps.push(await step('computer -> galaxy map', '3'));
steps.push(await step('galaxy map -> COM', ' '));
steps.push(await step('COM -> computer', '1'));
steps.push(await step('computer -> status', '4'));
steps.push(await step('status -> on', ' '));
await a2.close();

fs.mkdirSync('captured/transitions', { recursive: true });
for (const s of steps) {
  const name = s.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  fs.writeFileSync(`captured/transitions/${name}.png`, toPng(s.page));
}
fs.writeFileSync('captured/transitions/golden.json', JSON.stringify({
  source: 'the disk driven along a route, with the page captured after each step and the programs each step ran',
  steps: steps.map((s) => ({ label: s.label, key: s.key, chain: s.chain, lit: s.lit,
    panel: s.panel, points: s.points })),
}) + String.fromCharCode(10));
console.log('');
console.log(`wrote captured/transitions/golden.json and ${steps.length} PNGs`);
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
