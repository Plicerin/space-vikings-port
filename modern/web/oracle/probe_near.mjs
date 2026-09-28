// Where is the near plane?
//
// projectShipWorld() drops vertices with dz <= 1 and lifts the pen, so a segment with one
// end behind the camera disappears completely. That is what costs the ground wireframe at
// steep angles, where much of the grid is behind you. Fixing it means clipping the segment
// at the near plane instead - and the near plane is worth measuring rather than picking.
//
// A single point is placed straight ahead at a decreasing distance until the renderer stops
// drawing it.
import { openOracle } from './a2.mjs';
import { decodeHgr, HGR_W, HGR_H } from './hgr.mjs';
import fs from 'fs';

const TRAP = 0x0300;
const PAGE2_LO = 0x4000, PAGE2_HI = 0x6000;
const MODEL = 0x7879;

const meta = JSON.parse(fs.readFileSync('captured/snapshot/flight.json', 'utf8'));
const b64 = fs.readFileSync('captured/snapshot/flight.bin').toString('base64');
const ram = fs.readFileSync('captured/snapshot/flight.bin');
const s16 = (a) => { const v = ram[a] | (ram[a + 1] << 8); return v > 32767 ? v - 65536 : v; };
const CAM = { x: s16(0x731b), y: s16(0x731d), z: s16(0x731f) };

const a2 = await openOracle();
await a2.ev(`(() => { window.M.a2.reset(); return 'reset'; })()`);
await a2.frames(10);

const lo = (v) => v & 0xff, hi = (v) => (v >> 8) & 0xff;

async function render(model) {
  return JSON.parse(await a2.ev(`(() => {
    const M = window.M, cpu = M.cpu, mach = M.a2;
    const s = atob(${JSON.stringify(b64)});
    for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
    cpu.read(0xC050); cpu.read(0xC052); cpu.read(0xC054); cpu.read(0xC057);
    const m = [${'M'}];
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
    return JSON.stringify({ page: btoa(out) });
  })()`.replace('[M]', '[' + model.join(',') + ']')));
}

const bits = (p) => decodeHgr(Buffer.from(p, 'base64'));
const base = bits((await render([0x7f])).page);
const added = (on) => { let n = 0; for (let i = 0; i < on.length; i++) if (on[i] && !base[i]) n++; return n; };

const point = (x, y, z) => [0x04, 0x01, 0x00, lo(x), hi(x), lo(y), hi(y), lo(z & 0xffff), hi(z & 0xffff), 0x7f];

console.log('a single point straight ahead, at a shrinking distance:\n');
console.log('   dz    pixels');
for (const dz of [4000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0, -50, -500]) {
  const n = added(bits((await render(point(CAM.x, CAM.y, CAM.z + dz))).page));
  console.log(`  ${String(dz).padStart(5)}   ${n ? String(n).padStart(4) : '   -'}`);
}

console.log('\nand a line running from well behind the camera to well in front:\n');
console.log('   from dz   to dz    pixels   what that means');
for (const [a, b] of [[-2000, 4000], [-500, 2000], [-50, 1000], [2000, 4000]]) {
  const m = [0x04, 0x00,
    0x01, lo(CAM.x), hi(CAM.x), lo(CAM.y + 300), hi(CAM.y + 300), lo((CAM.z + a) & 0xffff), hi((CAM.z + a) & 0xffff),
    0x02, lo(CAM.x), hi(CAM.x), lo(CAM.y + 300), hi(CAM.y + 300), lo((CAM.z + b) & 0xffff), hi((CAM.z + b) & 0xffff), 0x7f];
  const n = added(bits((await render(m)).page));
  console.log(`  ${String(a).padStart(8)} ${String(b).padStart(7)}   ${String(n).padStart(6)}   ` +
    (n ? 'drawn - the renderer clips it rather than dropping it' : 'not drawn'));
}
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
