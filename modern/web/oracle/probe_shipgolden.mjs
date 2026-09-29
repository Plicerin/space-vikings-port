// A golden set of ship renders, from the original renderer.
//
// The replayed renderer draws the whole scene - planet and ship together - and the port
// draws only a ship, so comparing whole screens would compare the wrong things. This
// isolates the ship by rendering each state twice: once normally, and once with the model
// at $7879 replaced by a single $7F, which is an empty model (SHIP # 0 on the disk is
// exactly that one byte). Every pixel present in the first and absent in the second belongs
// to the ship and nothing else.
import { openOracle } from './a2.mjs';
import { decodeHgr, toPng, HGR_W, HGR_H } from './hgr.mjs';
import fs from 'fs';

const TRAP = 0x0300;
const PAGE2_LO = 0x4000, PAGE2_HI = 0x6000;
const MODEL = 0x7879;

const meta = JSON.parse(fs.readFileSync('captured/snapshot/flight.json', 'utf8'));
const b64 = fs.readFileSync('captured/snapshot/flight.bin').toString('base64');

// A sweep that moves the ship about without leaving the frame entirely.
const STATES = [];
for (const z of [-6401, -5500, -4500, -3600]) STATES.push({ z, heading: 0, pitch: 0, label: `z${z}` });
for (const heading of [4, 8, 12, 250, 246]) STATES.push({ z: -6401, heading, pitch: 0, label: `h${heading}` });
for (const pitch of [4, 8, 250, 246]) STATES.push({ z: -6401, heading: 0, pitch, label: `p${pitch}` });

const a2 = await openOracle();
await a2.ev(`(() => { window.M.a2.reset(); return 'reset'; })()`);
await a2.frames(10);

/**
 * Restore the snapshot, apply a ship state, optionally blank the model, render, and return
 * the page-2 bits. Everything happens in one evaluate: the machine must not be given a
 * chance to run between the restore and the call.
 */
async function render({ z, heading, pitch, blankModel }) {
  return JSON.parse(await a2.ev(`(() => {
    const M = window.M, cpu = M.cpu, mach = M.a2;
    const s = atob(${JSON.stringify(b64)});
    for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
    cpu.read(0xC050); cpu.read(0xC052); cpu.read(0xC054); cpu.read(0xC057);

    cpu.write(0x731F, ${z & 0xff}); cpu.write(0x7320, ${(z >> 8) & 0xff});
    cpu.write(0x7323, ${heading & 0xff});
    cpu.write(0x7321, ${pitch & 0xff});
    ${blankModel ? `cpu.write(${MODEL}, 0x7F);` : ''}
    for (let a = ${PAGE2_LO}; a < ${PAGE2_HI}; a++) cpu.write(a, 0);

    const st = cpu.getState();
    st.a = ${meta.cpu.a}; st.x = ${meta.cpu.x}; st.y = ${meta.cpu.y};
    st.s = ${meta.cpu.s}; st.sp = ${meta.cpu.sp}; st.pc = ${meta.pc};
    cpu.setState(st);

    const sp = st.sp;
    cpu.write(0x0100 + ((sp + 1) & 0xff), ${(TRAP - 1) & 0xff});
    cpu.write(0x0100 + ((sp + 2) & 0xff), ${(TRAP - 1) >> 8});
    cpu.write(${TRAP}, 0x4C); cpu.write(${TRAP + 1}, ${TRAP & 0xff}); cpu.write(${TRAP + 2}, ${TRAP >> 8});

    let steps = 0, cyc = 0;
    while (cpu.getPC() !== ${TRAP} && steps < 4000000) {
      const b = cpu.getCycles();
      cpu.stepCycles(1);
      steps++;
      cyc += cpu.getCycles() - b;
      if (cyc >= M.FRAME_CYCLES) {
        cyc = 0;
        const mmu = mach.getMMU && mach.getMMU();
        if (mmu && mmu.resetVB) mmu.resetVB();
        const io = mach.getIO();
        if (io && io.tick) io.tick();
        if (mach.tick) mach.tick();
      }
    }
    let out = '';
    for (let a = ${PAGE2_LO}; a < ${PAGE2_HI}; a++) out += String.fromCharCode(cpu.read(a));
    return JSON.stringify({ steps, returned: cpu.getPC() === ${TRAP}, page: btoa(out) });
  })()`));
}

const bits = (b64page) => decodeHgr(Buffer.from(b64page, 'base64'));
const bounds = (on) => {
  let n = 0, minX = HGR_W, maxX = -1, minY = HGR_H, maxY = -1;
  for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) {
    if (!on[y * HGR_W + x]) continue;
    n++;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { n, minX, maxX, minY, maxY };
};

fs.mkdirSync('captured/ship', { recursive: true });
const golden = [];
console.log('  state      scene    no-ship    ship-only   extent');
for (const st of STATES) {
  const full = await render({ ...st, blankModel: false });
  const none = await render({ ...st, blankModel: true });
  if (!full.returned || !none.returned) { console.log(`  ${st.label}: render did not return`); continue; }
  const a = bits(full.page), b = bits(none.page);
  const ship = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) ship[i] = a[i] && !b[i] ? 1 : 0;
  const bo = bounds(ship);
  const extra = (() => { let n = 0; for (let i = 0; i < a.length; i++) if (b[i] && !a[i]) n++; return n; })();
  console.log(`  ${st.label.padEnd(8)} ${String(bounds(a).n).padStart(6)} ${String(bounds(b).n).padStart(10)} ` +
    `${String(bo.n).padStart(11)}   ` + (bo.n ? `x ${bo.minX}-${bo.maxX}, y ${bo.minY}-${bo.maxY}` : '(nothing)') +
    (extra ? `   [${extra} px present only without the ship]` : ''));
  fs.writeFileSync(`captured/ship/${st.label}.png`, toPng(ship));
  const pixels = (src) => {
    const pts = [];
    for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) if (src[y * HGR_W + x]) pts.push([x, y]);
    return pts;
  };
  // The background as well. A ship pixel that falls on a star is lit in both renders, so the
  // difference drops it - the disk draws it, this capture cannot see it, and a port that
  // draws it correctly looks wrong. Recording the background lets the comparison mask the
  // port the same way instead of counting those as errors.
  golden.push({ ...st, lit: bo.n, bounds: bo, points: pixels(ship), background: pixels(b) });
}

fs.writeFileSync('captured/ship/golden.json', JSON.stringify({
  source: 'the original renderer at $6000, replayed from captured/snapshot/flight.bin',
  isolation: 'rendered twice per state, the second with $7F written at $7879 (an empty model); the difference is the ship',
  background: 'the no-ship render, per state, so a comparison can mask the port the same way the difference masks the disk',
  page: 'hi-res page 2', states: golden,
}) + '\n');
console.log(`\nwrote captured/ship/golden.json and ${golden.length} PNGs`);
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
