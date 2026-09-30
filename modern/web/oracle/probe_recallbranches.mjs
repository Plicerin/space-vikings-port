// All five of RECALL's branches, run on the disk.
//
// RECALL is five ordered tests and nothing else:
//
//   2000  IF PEEK(38209) <> PEEK(38158) AND PEEK(38166) > 0 AND PEEK(38166) < 3
//         -> "TROOPS ARE NOT ON" / "" / "THIS PLANET, SIR!"
//   2005  IF TR = 0            -> "WE HAVE NO TROOPS" / "LEFT, SIR!"      and POKE 38166,0
//   2010  IF PEEK(38166) = 1 OR PEEK(38166) = 2
//         -> "TROOPS ARE BEING" / "RECALLED, SIR!"                        and POKE 38166,0
//   2020  IF PEEK(38166) = 3   -> "TROOPS ARE IN" / "CRYOGENIC SLEEP!"
//   2030  IF PEEK(38166) = 0   -> "TROOPS ARE ALREADY" / "ON BOARD, SIR!"
//
// Only 2020 had ever been run, because a new game always has the troops asleep. Four of the
// five are a matter of setting 38158 and 38166 before pressing 2.
//
// The fifth is not, because `TR` is read off the MISC FILE at line 11 and there is no poking a
// DOS file. So it is done by taking the CPU over for a moment: press 2, then step the machine
// by hand until `TR` appears in Applesoft's variable table, zero its exponent byte - which is
// how a five-byte Applesoft float says zero - and let it run on into 2005. The window is line
// 12 and line 20's four HPLOTs, a few thousand cycles, which is not something a frame-level
// poll can hit but a stepping loop can.
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
const RECALL = textOf('RECALL');

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
const waitFor = async (wanted, label, tries = 600) => {
  for (let i = 0; i < tries; i++) { await a2.frames(20); if ((await loaded()) === wanted) return true; }
  console.log(`  ${label} never started`);
  return false;
};
// Line 2050 is `POKE 974,64: PRINT D$;"RUN GROUND FORCES"`, and by the time that echo lands on
// the bottom text rows RECALL has finished. Picking the busiest frame over the whole page
// therefore picks a frame of the transition, 231 pixels of command echo at rows 184-190
// included. Score the frame on what RECALL actually draws into - rows 0 to 175 - and keep the
// whole page in the capture.
const RECALL_ROWS = 176;
const pointsOf = (on) => {
  const pts = [];
  let minX = HGR_W, maxX = -1, minY = HGR_H, maxY = -1, own = 0;
  for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) {
    if (!on[y * HGR_W + x]) continue;
    pts.push([x, y]);
    if (y < RECALL_ROWS) own++;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { lit: pts.length, own, bounds: { minX, maxX, minY, maxY }, points: pts };
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
console.log(`  planet is ${planet}`);

// Zero TR by hand, inside RECALL's own startup. Returns what it managed to do.
// Zero TR by hand, inside RECALL's own startup.
//
// The catch is that GROUND FORCES has a TR of its own, read from the same file at its line 11,
// and pressing 2 does not clear it until DOS actually runs RECALL. Zeroing the one that is
// there when the key is pressed changes nothing, because the RUN wipes the variable table and
// RECALL reads TR back off the file. So wait for that wipe first - VARTAB == ARYTAB is what an
// empty table looks like - and only then go looking for TR.
const ZERO_TR = `(() => {
  const cpu = window.M.cpu;
  const w = (a) => cpu.read(a) | (cpu.read(a + 1) << 8);
  let cleared = false;
  for (let n = 0; n < 8000000; n++) {
    if (!cleared) {
      if (w(0x69) === w(0x6b)) cleared = true;          // the RUN emptied the table
    } else {
      const v = window.M.vars();
      if (!v.refused) {
        // Wait for a NON-zero TR. Applesoft creates the slot at zero when INPUT names it and
        // fills it a moment later, so accepting zero means zeroing something that is about to
        // be overwritten - which is exactly what happened the first time.
        const tr = (v.vars || []).find((x) => x.name === 'TR' && x.type === 'real' && x.value !== 0);
        if (tr) {
          cpu.write(tr.at + 2, 0);                      // a zero exponent is how a float says 0
          return JSON.stringify({ done: true, steps: n, was: tr.value });
        }
      }
    }
    cpu.stepCycles(100);
  }
  return JSON.stringify({ done: false, cleared });
})()`;

const CASES = [
  { line: 2000, why: 'troops on another planet', set: { 38158: (planet + 1) & 0xff, 38166: 1 } },
  { line: 2005, why: 'no troops left', set: { 38158: planet, 38166: 0 }, zeroTR: true },
  { line: 2010, why: 'troops being recalled, and here', set: { 38158: planet, 38166: 1 } },
  { line: 2020, why: 'troops in cryogenic sleep', set: { 38158: planet, 38166: 3 } },
  { line: 2030, why: 'troops already on board', set: { 38158: planet, 38166: 0 } },
];

const out = [];
for (const c of CASES) {
  console.log('');
  console.log(`line ${c.line} - ${c.why}`);
  const js = Object.entries(c.set).map(([a, v]) => `window.M.wr(${a}, ${v});`).join(' ');
  await a2.ev(`(() => { ${js} return 'w'; })()`);
  await a2.frames(20);
  const before = {};
  for (const a of [38209, 38158, 38166]) before[a] = await a2.read(a);
  console.log(`  38209 ${before[38209]}, 38158 ${before[38158]}, 38166 ${before[38166]}`);

  await a2.key('2');
  let zeroed = null;
  if (c.zeroTR) {
    zeroed = JSON.parse(await a2.ev(ZERO_TR));
    console.log(`  TR: ${zeroed.done ? `was ${zeroed.was}, zeroed after ${zeroed.steps} steps` : 'never appeared'}`);
  }
  if (!await waitFor(RECALL, 'RECALL', 400)) { out.push({ ...c, failed: 'RECALL never started' }); continue; }

  // The message goes up over GROUND FORCES' page, so take the busiest frame while it is there.
  let best = null;
  for (let i = 0; i < 300; i++) {
    await a2.frames(4);
    const on = decodeHgr(await a2.readRange(0x2000, 0x4000));
    const g = pointsOf(on);
    if (!best || g.own > best.g.own) best = { g, on };
    if ((await loaded()) !== RECALL) break;
  }
  const after = await a2.read(38166);
  console.log(`  ${best.g.lit} lit (${best.g.own} above row ${RECALL_ROWS}), ` +
    `x ${best.g.bounds.minX}-${best.g.bounds.maxX}, ` +
    `y ${best.g.bounds.minY}-${best.g.bounds.maxY};  38166 after: ${after}`);
  fs.mkdirSync('captured/recall', { recursive: true });
  fs.writeFileSync(`captured/recall/branch-${c.line}.png`, toPng(best.on));
  out.push({ line: c.line, why: c.why, before, after, zeroed, screen: best.g });

  if (!await waitFor(GF, 'GROUND FORCES (back)', 400)) break;
  for (let i = 0; i < 20; i++) await a2.frames(20);
}
await a2.close();

// 2005 and 2030 are both reached with 38166 at 0, so the only thing separating them is TR.
// If the screens come out identical, TR was not zeroed in time and 2005 was never reached.
const key = (r) => r.screen ? r.screen.points.map((p) => p.join(',')).join(' ') : null;
const b2005 = out.find((r) => r.line === 2005);
const b2030 = out.find((r) => r.line === 2030);
const distinct = b2005 && b2030 && key(b2005) !== key(b2030);
console.log('');
console.log(`2005 and 2030 differ on screen: ${distinct ? 'yes - TR was zeroed in time and 2005 really ran'
  : 'NO - the two are the same page, so 2005 was not reached'}`);

console.log('');
console.log('  line   38166 before -> after   what the listing says it should do');
for (const r of out) {
  if (r.failed) { console.log(`  ${r.line}   ${r.failed}`); continue; }
  const pokes = r.line === 2005 || r.line === 2010;
  const ok = pokes ? r.after === 0 : r.after === r.before[38166];
  console.log(`  ${r.line}   ${String(r.before[38166]).padStart(6)} -> ${String(r.after).padEnd(6)}   ` +
    `${pokes ? 'POKE 38166,0' : 'leaves it alone'}   ${ok ? 'as expected' : 'NOT as expected'}`);
}

fs.writeFileSync('captured/recall/branches.json', JSON.stringify({
  source: 'all five of RECALL\'s branches, reached from GROUND FORCES by 2 with 38158 and 38166 set, and TR zeroed in the variable table for 2005',
  planet, branches: out,
}) + String.fromCharCode(10));
console.log('');
console.log(`wrote captured/recall/branches.json and ${out.filter((r) => !r.failed).length} PNGs`);
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
