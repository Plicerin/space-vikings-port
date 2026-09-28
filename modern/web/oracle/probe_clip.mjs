// Where does the renderer clip?
//
// The original clips lines against the view with the Cohen-Sutherland code at
// $61A9-$620F. Rather than read the bounds out of it, draw a line that runs well off the
// screen and measure where it was cut.
//
// The model is `04 00` then opcode 1 (start a run) at one end, opcode 2 (line to) at the
// other, then $7F. World coordinates for the two ends are computed by inverting the
// projection derived in fit_projection.mjs, so each test line lands where intended.
import { openOracle } from './a2.mjs';
import { decodeHgr, HGR_W, HGR_H } from './hgr.mjs';
import fs from 'fs';

const TRAP = 0x0300;
const PAGE2_LO = 0x4000, PAGE2_HI = 0x6000;
const MODEL = 0x7879;

const meta = JSON.parse(fs.readFileSync('captured/snapshot/flight.json', 'utf8'));
const fit = JSON.parse(fs.readFileSync('captured/projection_fit.json', 'utf8'));
const b64 = fs.readFileSync('captured/snapshot/flight.bin').toString('base64');
const CAM = fit.camera;
const DZ = 2901;                                  // keep every test line at one depth

/** Screen point -> world point, at depth DZ, with the camera unrotated. */
const world = (sx, sy) => ({
  x: Math.round(CAM.x + (sx - fit.cx) * DZ / fit.fx),
  y: Math.round(CAM.y + (fit.cy - sy) * DZ / fit.fy),
  z: CAM.z + DZ,
});

const lo = (v) => v & 0xff, hi = (v) => (v >> 8) & 0xff;
const line = (a, b) => [0x04, 0x00,
  0x01, lo(a.x), hi(a.x), lo(a.y), hi(a.y), lo(a.z), hi(a.z),
  0x02, lo(b.x), hi(b.x), lo(b.y), hi(b.y), lo(b.z), hi(b.z), 0x7f];

const a2 = await openOracle();
await a2.ev(`(() => { window.M.a2.reset(); return 'reset'; })()`);
await a2.frames(10);

async function render(model) {
  return JSON.parse(await a2.ev(`(() => {
    const M = window.M, cpu = M.cpu, mach = M.a2;
    const s = atob(${JSON.stringify(b64)});
    for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
    cpu.read(0xC050); cpu.read(0xC052); cpu.read(0xC054); cpu.read(0xC057);
    const m = [${'MODELBYTES'}];
    for (let i = 0; i < m.length; i++) cpu.write(${MODEL} + i, m[i]);
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
    return JSON.stringify({ returned: cpu.getPC() === ${TRAP}, page: btoa(out) });
  })()`.replace('MODELBYTES', model.join(','))));
}

const bits = (p) => decodeHgr(Buffer.from(p, 'base64'));
const base = bits((await render([0x7f])).page);

async function extent(model) {
  const on = bits((await render(model)).page);
  let n = 0, minX = HGR_W, maxX = -1, minY = HGR_H, maxY = -1;
  for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) {
    const i = y * HGR_W + x;
    if (!on[i] || base[i]) continue;
    n++;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return n ? { n, minX, maxX, minY, maxY } : null;
}

console.log('Finding the edges exactly.');
console.log('');

// A long line along one axis, stepped across the other, to find where it stops being drawn.
async function edge(kind, values) {
  const out = [];
  for (const v of values) {
    const r = kind === 'row'
      ? await extent(line(world(-250, v), world(520, v)))
      : await extent(line(world(v, -150), world(v, 340)));
    out.push({ v, r });
  }
  return out;
}

const rows = await edge('row', [-4, -2, -1, 0, 1, 2, 120, 121, 122, 123, 124, 125, 126]);
console.log('  horizontal line at y:   drawn / rejected');
for (const { v, r } of rows) console.log(`    y ${String(v).padStart(4)}   ${r ? 'drawn, x ' + r.minX + '-' + r.maxX : 'rejected'}`);

const cols = await edge('col', [0, 1, 2, 3, 4, 5, 274, 275, 276, 277, 278, 279]);
console.log('');
console.log('  vertical line at x:     drawn / rejected');
for (const { v, r } of cols) console.log(`    x ${String(v).padStart(4)}   ${r ? 'drawn, y ' + r.minY + '-' + r.maxY : 'rejected'}`);

const yIn = rows.filter((o) => o.r).map((o) => o.v);
const xIn = cols.filter((o) => o.r).map((o) => o.v);
console.log('');
console.log(`  a line is kept for y in ${Math.min(...yIn)}..${Math.max(...yIn)} and x in ${Math.min(...xIn)}..${Math.max(...xIn)}`);
const anyRow = rows.find((o) => o.r);
const anyCol = cols.find((o) => o.r);
console.log(`  and once kept it is cut to x ${anyRow.r.minX}-${anyRow.r.maxX}, y ${anyCol.r.minY}-${anyCol.r.maxY}`);

// The cut extent is the reliable number: it is read off drawn pixels, where the kept/
// rejected boundary depends on how exactly a nominal screen x maps back through the fitted
// projection, which is good to about a pixel.
fs.writeFileSync('captured/clip.json', JSON.stringify({
  source: 'probe_clip.mjs - long lines drawn through the original renderer and measured where they were cut',
  minX: anyRow.r.minX, maxX: anyRow.r.maxX, minY: anyCol.r.minY, maxY: anyCol.r.maxY,
  keptForY: [Math.min(...yIn), Math.max(...yIn)], keptForX: [Math.min(...xIn), Math.max(...xIn)],
}, null, 2) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/clip.json');

if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
