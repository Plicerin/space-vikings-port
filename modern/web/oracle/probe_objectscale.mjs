// The per-object scale at $600E-$6012, in every view that draws through $6000.
//
// `$690F` is `INY / LDA ($9B),Y / STA $600D,Y / CPY #$06 / BNE $690F` - six bytes copied out of
// the model stream into $600D-$6013 - and `$6631` reads three of them back as 16-bit factors
// that scale the three rows of the rotation matrix, skipping the multiply when a factor is
// $7FFF. So the scale belongs to the object being drawn, not to the renderer.
//
// The port carries one triple, `SNAPSHOT_SCALE = [16000, 32767, 9541]`, taken from the single
// object in the flight snapshot `probe_pipeline.mjs` captured, and hands it to the cockpit and
// the radar alike. That is an assumption in two directions: that a flight frame with more than
// one object uses the same scale for all of them, and that the other views use it too.
//
// This measures it. $6631 runs once per object, so trapping it and reading the three words says
// what each object in each view actually got. Views:
//
//   flight       STARSHIP SIMULATOR, with a ship out there so more than one object is drawn
//   radar        COM option 3
//   ship I.D.    RADAR 2056 `IF A$ <> "X" THEN 5000`, and 5005 runs SHIP # n I.D.
import { openOracle } from './a2.mjs';
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
const RADAR = textOf('RADAR');
const SHIPID3 = textOf('SHIP # 3 I.D.');

let a2 = await openOracle();
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
  for (let i = 0; i < 700; i++) { await a2.frames(20); if ((await loaded()) === w) return true; }
  console.log('  ' + label + ' never started');
  return false;
};

/**
 * Every $6631 in the next `steps` instructions, with the scale block as it stood.
 *
 * The frame tick matters. Stepping the CPU raw for tens of millions of instructions without
 * ticking the emulator's I/O leaves the keyboard unserviced, and the next key press is simply
 * never seen - which showed up here as COM refusing to start after three long recordings.
 */
const record = async (steps) => JSON.parse(await a2.ev(`(() => {
  const M = window.M, cpu = M.cpu, mach = M.a2;
  let cyc = 0;
  const w = (a) => cpu.read(a) | (cpu.read(a + 1) << 8);
  const out = [];
  let n = 0, frame = 0;
  while (n < ${steps} && out.length < 400) {
    // $6000 is one whole scene; $6631 is one object inside it. Counting the calls tells the
    // two apart, which matters: 31 hits is a very different fact if it is 31 frames of one
    // object rather than one frame of 31.
    if (cpu.getPC() === 0x6000) frame++;
    if (cpu.getPC() === 0x6631) {
      out.push({
        frame,
        scale: [w(0x600E), w(0x6010), w(0x6012)],
        // $9B/$9C is the model stream pointer $690F read the block from
        stream: w(0x9B),
        block: [cpu.read(0x600C), cpu.read(0x600D), cpu.read(0x6013)],
      });
    }
    const before = cpu.getCycles();
    cpu.stepCycles(1);
    cyc += cpu.getCycles() - before;
    if (cyc >= M.FRAME_CYCLES) {
      cyc = 0;
      const mmu = mach.getMMU && mach.getMMU();
      if (mmu && mmu.resetVB) mmu.resetVB();
      const io = mach.getIO();
      if (io && io.tick) io.tick();
      if (mach.tick) mach.tick();
    }
    n++;
  }
  return JSON.stringify({ hits: out, frames: frame });
})()`));

const summarise = (label, hits, frames) => {
  if (frames !== undefined) {
    const per = {};
    for (const h of hits) per[h.frame] = (per[h.frame] || 0) + 1;
    const counts = [...new Set(Object.values(per))].sort((a, b) => a - b);
    console.log(`  ${label}: ${frames} call(s) to $6000, ` +
      `${counts.length ? counts.join(' or ') : 0} object(s) per call`);
  }
  const seen = new Map();
  for (const h of hits) {
    const k = h.scale.join(',');
    if (!seen.has(k)) seen.set(k, { scale: h.scale, n: 0, streams: new Set() });
    const e = seen.get(k);
    e.n++;
    e.streams.add(h.stream);
  }
  console.log(`  ${label}: ${hits.length} object(s) drawn, ${seen.size} distinct scale(s)`);
  for (const e of seen.values()) {
    console.log(`     [${e.scale.join(', ')}]  x${e.n}  from ${e.streams.size} model stream(s)` +
      ` (${[...e.streams].map((v) => '$' + v.toString(16).toUpperCase()).join(', ')})`);
  }
  return [...seen.values()].map((e) => ({ scale: e.scale, count: e.n, streams: [...e.streams] }));
};

console.log('waiting for STARSHIP SIMULATOR...');
if (!await waitFor(SIM, 'STARSHIP SIMULATOR')) { await a2.close(); throw new Error('no simulator'); }
await a2.frames(300);

const out = {};

// ---- flight, with a ship out there so the frame has more than one object -------------------
await a2.ev(`(() => {
  const w = window.M.wr;
  w(38205, 3); w(38208, 0); w(38210, 0); w(38195, 100);
  return 'w';
})()`);
await a2.frames(60);
const fl = await record(40000000);
out.flight = summarise('flight', fl.hits, fl.frames);

// ---- in atmosphere, which draws the ground rather than the starfield -----------------------
// $6000 turns out to draw one object per call, so a view is only as good a test as the objects
// it happens to put on screen. Flying in air swaps the object being drawn.
await a2.ev(`(() => {
  const w = window.M.wr;
  w(38210, 1); w(38208, 0);
  w(29469, 10); w(29470, 0);
  return 'w';
})()`);
await a2.frames(80);
const at = await record(40000000);
out.atmosphere = summarise('atmosphere', at.hits, at.frames);

// ---- far out, where the starfield is what there is to draw ---------------------------------
await a2.ev(`(() => {
  const w = window.M.wr;
  w(38210, 0); w(38205, 0);
  w(29471, 0x00); w(29472, 0x80);
  return 'w';
})()`);
await a2.frames(80);
const st = await record(40000000);
out.stars = summarise('stars', st.hits, st.frames);

// ---- a second machine for the menu-driven views --------------------------------------------
// The flight variants above get there by poking position and mode bytes, and after three of
// those the game will not come back through COM: the state left behind is not one the menus
// expect. Rather than guess which byte to put back, the radar and the ship I.D. are measured
// on a machine booted fresh for them.
await a2.close();
const a2b = await openOracle();
await a2b.boot();
await a2b.key('N');
a2 = a2b;
console.log('');
console.log('second machine, booted fresh for the menu views...');
if (!await waitFor(SIM, 'STARSHIP SIMULATOR (second machine)')) {
  await a2.close(); throw new Error('no simulator on the second machine');
}
await a2.frames(300);
await a2.ev(`(() => {
  const w = window.M.wr;
  w(38205, 3); w(38208, 0); w(38210, 0); w(38195, 100);
  return 'w';
})()`);
await a2.frames(60);

// ---- RADAR, COM option 3 -------------------------------------------------------------------
await a2.key('C');
if (!await waitFor(COM, 'COM')) { await a2.close(); throw new Error('no COM'); }
await a2.key('3');
if (!await waitFor(RADAR, 'RADAR')) { await a2.close(); throw new Error('no RADAR'); }
const rd = await record(30000000);
out.radar = summarise('radar', rd.hits, rd.frames);

// ---- the ship I.D. view, which RADAR 2056 reaches on any key but X -------------------------
// Recorded straight through the transition rather than after it: the drawing may happen while
// the program is still loading, which a wait-for-the-listing would step past.
await a2.key('I');
const idRun = JSON.parse(await a2.ev(`(() => {
  const cpu = window.M.cpu;
  const w = (a) => cpu.read(a) | (cpu.read(a + 1) << 8);
  const out = [];
  let n = 0, in6000 = 0, minPc = 0xffff, maxPc = 0;
  while (n < 120000000) {
    const pc = cpu.getPC();
    if (pc >= 0x6000 && pc < 0x7000) {
      in6000++;
      if (pc < minPc) minPc = pc;
      if (pc > maxPc) maxPc = pc;
    }
    if (pc === 0x6631) {
      out.push({ scale: [w(0x600E), w(0x6010), w(0x6012)], stream: w(0x9B),
        block: [cpu.read(0x600C), cpu.read(0x600D), cpu.read(0x6013)] });
    }
    cpu.stepCycles(1);
    n++;
  }
  return JSON.stringify({ hits: out, in6000, minPc, maxPc });
})()`));
const nowLoaded = (await loaded()) === SHIPID3;
console.log(`  ship I.D. loaded: ${nowLoaded ? 'yes' : 'no'};` +
  ` instructions executed in $6000-$6FFF: ${idRun.in6000.toLocaleString()}` +
  (idRun.in6000 ? `, PC $${idRun.minPc.toString(16).toUpperCase()}-$${idRun.maxPc.toString(16).toUpperCase()}` : ''));
out.shipId = summarise('ship I.D.', idRun.hits);
out.shipIdRegion = { in6000: idRun.in6000, minPc: idRun.minPc, maxPc: idRun.maxPc, loaded: nowLoaded };

await a2.close();

console.log('');
const all = [...out.flight, ...out.atmosphere, ...out.stars, ...out.radar, ...out.shipId]
  .map((e) => e.scale.join(','));
const distinct = [...new Set(all)];
console.log(`across the views: ${distinct.length} distinct scale(s) in all`);
for (const d of distinct) console.log(`   [${d}]`);
console.log('');
console.log(distinct.length === 1
  ? '  one scale everywhere, so the port passing the snapshot triple to all three is right'
  : '  the views do NOT share a scale - the port passes one triple to all three, which is wrong');

fs.mkdirSync('captured/scale', { recursive: true });
fs.writeFileSync('captured/scale/objectscale.json', JSON.stringify({
  source: 'every $6631 in a flight frame, a radar frame and a ship I.D. frame, with $600E-$6012',
  views: out,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/scale/objectscale.json');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
