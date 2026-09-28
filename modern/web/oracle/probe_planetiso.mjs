// Which byte blanks the planet?
//
// The ship was isolated by writing $7F over its model at $7879. The planet is harder: it
// loads at $7300 and the ship's own state lives at $731B-$7323, inside it, so the file
// cannot simply be blanked.
//
// PLANET # 0 carries several models - `04 01` at offset 12 and `04 00` at 406, 1113 and
// 1253, with $7F terminators at 345 and 1159. Rather than work out which is which from the
// bytes, write $7F at each candidate in turn and see what stops being drawn.
import { openOracle } from './a2.mjs';
import { decodeHgr, HGR_W, HGR_H } from './hgr.mjs';
import fs from 'fs';

const TRAP = 0x0300;
const PAGE2_LO = 0x4000, PAGE2_HI = 0x6000;
const PLANET = 0x7300, MODEL = 0x7879;

const meta = JSON.parse(fs.readFileSync('captured/snapshot/flight.json', 'utf8'));
const b64 = fs.readFileSync('captured/snapshot/flight.bin').toString('base64');

const a2 = await openOracle();
await a2.ev(`(() => { window.M.a2.reset(); return 'reset'; })()`);
await a2.frames(10);

/** Render with a list of {addr, value} pokes applied after the snapshot is restored. */
async function render(pokes) {
  return JSON.parse(await a2.ev(`(() => {
    const M = window.M, cpu = M.cpu, mach = M.a2;
    const s = atob(${JSON.stringify(b64)});
    for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
    cpu.read(0xC050); cpu.read(0xC052); cpu.read(0xC054); cpu.read(0xC057);
    ${pokes.map((p) => `cpu.write(${p.addr}, ${p.value});`).join(' ')}
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
  })()`));
}

const bits = (p) => decodeHgr(Buffer.from(p, 'base64'));
const stats = (on) => {
  let n = 0, minX = HGR_W, maxX = -1, minY = HGR_H, maxY = -1;
  for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) {
    if (!on[y * HGR_W + x]) continue;
    n++;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { n, minX, maxX, minY, maxY };
};

const full = bits((await render([])).page);
const noShip = bits((await render([{ addr: MODEL, value: 0x7f }])).page);
console.log(`the scene draws ${stats(full).n} pixels; without the ship model, ${stats(noShip).n}`);
console.log(`so the ship is ${stats(full).n - stats(noShip).n} of them\n`);

console.log('writing $7F at each candidate offset in PLANET # 0:\n');
console.log('  offset   addr     scene px   ship still there?   what went');
for (const off of [12, 36, 37, 346, 406, 1113, 1160, 1253]) {
  const on = bits((await render([{ addr: PLANET + off, value: 0x7f }])).page);
  const withShip = bits((await render([{ addr: PLANET + off, value: 0x7f }, { addr: MODEL, value: 0x7f }])).page);
  const s = stats(on);
  const shipPx = s.n - stats(withShip).n;
  console.log(`  ${String(off).padStart(6)}   $${(PLANET + off).toString(16)}   ${String(s.n).padStart(8)}   ` +
    `${String(shipPx).padStart(10)} px      ${stats(full).n - s.n} fewer than the full scene`);
}
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
