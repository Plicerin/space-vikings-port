// A golden set of star renders, from the original renderer.
//
// PLANET # 0 is BLOADed to $7300 by START line 100, and it is not a planet: it is 195
// opcode-0 points scattered across +/-10000 in all three axes - the starfield. (The
// numbered planet files are a different thing: opcode 1/2/3 line work with y at 0, ground
// wireframes for approach.)
//
// Isolating it is the reverse of the ship. Writing $7F over the object list at $7324 blanks
// the whole scene, because the renderer walks one list and an empty one makes it bail
// before it reaches the ship at $7879. So the stars are simply what is drawn with the ship
// model blanked.
import { openOracle } from './a2.mjs';
import { decodeHgr, toPng, HGR_W, HGR_H } from './hgr.mjs';
import fs from 'fs';

const TRAP = 0x0300;
const PAGE2_LO = 0x4000, PAGE2_HI = 0x6000;
const MODEL = 0x7879;

const meta = JSON.parse(fs.readFileSync('captured/snapshot/flight.json', 'utf8'));
const b64 = fs.readFileSync('captured/snapshot/flight.bin').toString('base64');

const STATES = [];
for (const z of [-6401, -5000, -3000, 0, 3000]) STATES.push({ z, heading: 0, pitch: 0, label: `z${z}` });
for (const heading of [8, 32, 64, 128, 248]) STATES.push({ z: -6401, heading, pitch: 0, label: `h${heading}` });
for (const pitch of [8, 32, 248]) STATES.push({ z: -6401, heading: 0, pitch, label: `p${pitch}` });

const a2 = await openOracle();
await a2.ev(`(() => { window.M.a2.reset(); return 'reset'; })()`);
await a2.frames(10);

async function render({ z, heading, pitch }) {
  return JSON.parse(await a2.ev(`(() => {
    const M = window.M, cpu = M.cpu, mach = M.a2;
    const s = atob(${JSON.stringify(b64)});
    for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
    cpu.read(0xC050); cpu.read(0xC052); cpu.read(0xC054); cpu.read(0xC057);
    cpu.write(0x731F, ${z & 0xff}); cpu.write(0x7320, ${(z >> 8) & 0xff});
    cpu.write(0x7323, ${heading & 0xff});
    cpu.write(0x7321, ${pitch & 0xff});
    cpu.write(${MODEL}, 0x7F);                       // no ship: what is left is the stars
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

fs.mkdirSync('captured/stars', { recursive: true });
const golden = [];
console.log('  state        px   extent');
for (const st of STATES) {
  const r = await render(st);
  if (!r.returned) { console.log(`  ${st.label}: did not return`); continue; }
  const on = decodeHgr(Buffer.from(r.page, 'base64'));
  const pts = [];
  let minX = HGR_W, maxX = -1, minY = HGR_H, maxY = -1;
  for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) {
    if (!on[y * HGR_W + x]) continue;
    pts.push([x, y]);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  console.log(`  ${st.label.padEnd(9)} ${String(pts.length).padStart(5)}   ` +
    (pts.length ? `x ${minX}-${maxX}, y ${minY}-${maxY}` : '(nothing)'));
  fs.writeFileSync(`captured/stars/${st.label}.png`, toPng(on));
  golden.push({ ...st, lit: pts.length, bounds: { minX, maxX, minY, maxY }, points: pts });
}
fs.writeFileSync('captured/stars/golden.json', JSON.stringify({
  source: 'the original renderer at $6000, replayed, with the ship model at $7879 blanked',
  page: 'hi-res page 2', states: golden,
}) + '\n');
console.log(`\nwrote captured/stars/golden.json and ${golden.length} PNGs`);
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
