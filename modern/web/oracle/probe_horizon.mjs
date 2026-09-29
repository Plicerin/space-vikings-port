// Where do the pixels at steep pitch come from?
//
// At pitch +32 the original draws 460 pixels of ground across the full width and the port
// draws none. The clipper is unit-tested and the projection is validated to pitch 48, so
// the suspicion is that the renderer draws something there that is not in the planet's
// vertex list at all - a horizon, say.
//
// PLANET # 1's list is 111 records of 7 bytes from $7324, so writing $7F at $7324 + 7k
// truncates it to the first k. Stepping k says exactly which records the visible pixels
// come from - and k = 0 says whether anything survives an empty list.
import { openOracle } from './a2.mjs';
import { decodeHgr, HGR_W, HGR_H } from './hgr.mjs';
import fs from 'fs';

const TRAP = 0x0300;
const PAGE2_LO = 0x4000, PAGE2_HI = 0x6000;
const LIST = 0x7324, MODEL = 0x7879;

const meta = JSON.parse(fs.readFileSync('captured/snapshot/approach.json', 'utf8'));
const b64 = fs.readFileSync('captured/snapshot/approach.bin').toString('base64');

const a2 = await openOracle();
await a2.ev(`(() => { window.M.a2.reset(); return 'reset'; })()`);
await a2.frames(10);

async function render({ pitch, heading = null, truncateAt = null }) {
  return JSON.parse(await a2.ev(`(() => {
    const M = window.M, cpu = M.cpu, mach = M.a2;
    const s = atob(${JSON.stringify(b64)});
    for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
    cpu.read(0xC050); cpu.read(0xC052); cpu.read(0xC054); cpu.read(0xC057);
    cpu.write(0x7321, ${pitch & 0xff});
    ${heading !== null ? `cpu.write(0x7323, ${heading & 0xff});` : ''}
    cpu.write(${MODEL}, 0x7F);                          // no ship
    ${truncateAt !== null ? `cpu.write(${LIST} + 7 * ${truncateAt}, 0x7F);` : ''}
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
  })()`));
}

const stats = (p) => {
  const on = decodeHgr(Buffer.from(p, 'base64'));
  let n = 0, minX = HGR_W, maxX = -1, minY = HGR_H, maxY = -1;
  const rows = new Set();
  for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) {
    if (!on[y * HGR_W + x]) continue;
    n++; rows.add(y);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { n, minX, maxX, minY, maxY, rows: rows.size };
};

// The golden state that fails is heading 0, pitch 32 - the port draws nothing there.
console.log('Truncating the record list at heading 0, pitch 32 (the state the port misses):');
console.log('');
console.log('  records kept    px   rows   extent');
let prev = 0;
const firsts = [];
for (const k of [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 16, 24, 32, 48, 64, 96, 111]) {
  const st = stats((await render({ pitch: 32, heading: 0, truncateAt: k })).page);
  if (st.n !== prev) firsts.push([k, st.n - prev]);
  prev = st.n;
  console.log(`  ${String(k).padStart(12)}  ${String(st.n).padStart(4)}  ${String(st.rows).padStart(5)}   ` +
    (st.n ? `x ${st.minX}-${st.maxX}, y ${st.minY}-${st.maxY}` : '(nothing)'));
}
const full = stats((await render({ pitch: 32, heading: 0 })).page);
console.log(`  ${'all 111'.padStart(12)}  ${String(full.n).padStart(4)}  ${String(full.rows).padStart(5)}   x ${full.minX}-${full.maxX}, y ${full.minY}-${full.maxY}`);
console.log('');
console.log('the count changed after keeping:', firsts.map(([k, d]) => `${k} (${d > 0 ? '+' : ''}${d})`).join(', '));

console.log('');
console.log('And with an empty list, across pitch - is anything drawn without data?');
console.log('');
console.log('   pitch    px   extent');
for (const pitch of [0, 8, 16, 32, 48, 248]) {
  const st = stats((await render({ pitch, heading: 0, truncateAt: 0 })).page);
  console.log(`  ${String(pitch).padStart(6)}  ${String(st.n).padStart(4)}   ` + (st.n ? `x ${st.minX}-${st.maxX}, y ${st.minY}-${st.maxY}` : '(nothing)'));
}

// What are the first records, in world coordinates?
const disk = (await import('./dsk.mjs'));
const d = disk.openDisk(disk.DISK);
const r = d.read(d.files.find((f) => f.name === 'PLANET # 1'));
const s16 = (i) => { const v = r.data[i] | (r.data[i + 1] << 8); return v > 32767 ? v - 65536 : v; };
console.log('');
console.log('the first records of PLANET # 1:');
for (let k = 0; k < 10; k++) {
  const o = 36 + 7 * k;
  console.log(`  ${String(k).padStart(3)}  opcode ${r.data[o]}  (${String(s16(o + 1)).padStart(6)}, ${String(s16(o + 3)).padStart(5)}, ${String(s16(o + 5)).padStart(6)})`);
}

if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
