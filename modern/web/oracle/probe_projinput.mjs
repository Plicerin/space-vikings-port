// What the renderer actually hands to $68A1, during a real render.
//
// The transcription of $64B6 and $691E matches the machine on 261 of 261 sampled points, but
// it cannot replace the port's float projection until the inputs are in the same units: the
// port's camera space has positive z forward and a fitted FOCAL_X of 230.9, while $68A1's
// clamp limit is 69, which doubles to 138.
//
// So trap every call: run the renderer from the flight snapshot, stop on entry to $68A1,
// record the six input bytes and the two output bytes, resume, repeat. Then the same world
// points can be put through the port's toCameraSpace and the two spaces compared directly.
import { openOracle } from './a2.mjs';
import fs from 'fs';

const PROJECT = 0x68a1;
const RENDER = 0x6000;
const TRAP = 0x0300;

const meta = JSON.parse(fs.readFileSync('captured/snapshot/flight.json', 'utf8'));
const b64 = fs.readFileSync('captured/snapshot/flight.bin').toString('base64');
const ram = fs.readFileSync('captured/snapshot/flight.bin');
const s16 = (v) => (v > 32767 ? v - 65536 : v);
const camera = {
  x: s16(ram[0x731b] | (ram[0x731c] << 8)),
  y: s16(ram[0x731d] | (ram[0x731e] << 8)),
  z: s16(ram[0x731f] | (ram[0x7320] << 8)),
  pitch: ram[0x7321], bank: ram[0x7322], heading: ram[0x7323],
};
console.log(`camera X=${camera.x} Y=${camera.y} Z=${camera.z} ` +
  `pitch=${camera.pitch} bank=${camera.bank} heading=${camera.heading}`);

const a2 = await openOracle();
await a2.ev(`(() => { window.M.a2.reset(); return 'reset'; })()`);
await a2.frames(10);

// Run the renderer, stopping on each entry to $68A1 and logging its inputs and outputs.
const calls = JSON.parse(await a2.ev(`(() => {
  const M = window.M, cpu = M.cpu;
  const s = atob(${JSON.stringify(b64)});
  for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
  cpu.read(0xC050); cpu.read(0xC052); cpu.read(0xC054); cpu.read(0xC057);
  const st = cpu.getState();
  st.sp = 0xF0; st.pc = ${RENDER};
  cpu.setState(st);
  cpu.write(0x01F1, ${(TRAP - 1) & 0xff});
  cpu.write(0x01F2, ${(TRAP - 1) >> 8});
  cpu.write(${TRAP}, 0x4C); cpu.write(${TRAP + 1}, ${TRAP & 0xff}); cpu.write(${TRAP + 2}, ${TRAP >> 8});

  const out = [];
  let steps = 0;
  let pending = null;
  while (cpu.getPC() !== ${TRAP} && steps < 6000000) {
    const pc = cpu.getPC();
    if (pc === ${PROJECT}) {
      const y = cpu.getState().y, x = cpu.getState().x;
      pending = {
        inAddr: y, outAddr: x,
        raw: [cpu.read(y), cpu.read(y + 1), cpu.read(y + 2), cpu.read(y + 3), cpu.read(y + 4), cpu.read(y + 5)],
      };
    } else if (pending && pc === 0x68E9) {      // the RTS
      const o = pending.outAddr;
      pending.sx = cpu.read(o);
      pending.sy = cpu.read(o + 1);
      out.push(pending);
      pending = null;
      if (out.length >= 400) break;
    }
    cpu.stepCycles(1);
    steps++;
  }
  return JSON.stringify({ steps, calls: out });
})()`));
await a2.close();

const w16 = (lo, hi) => s16(lo | (hi << 8));
const rows = calls.calls.map((c) => ({
  x: w16(c.raw[0], c.raw[1]),
  y: w16(c.raw[2], c.raw[3]),
  z: w16(c.raw[4], c.raw[5]),
  sx: c.sx > 127 ? c.sx - 256 : c.sx,
  sy: c.sy > 127 ? c.sy - 256 : c.sy,
}));
console.log(`\n${rows.length} calls to $68A1 in ${calls.steps.toLocaleString()} instructions`);
console.log('');
console.log('   camera-space x      y      z      sx   sy');
for (const r of rows.slice(0, 14)) {
  console.log(`   ${String(r.x).padStart(14)} ${String(r.y).padStart(6)} ${String(r.z).padStart(6)}   ` +
    `${String(r.sx).padStart(4)} ${String(r.sy).padStart(4)}`);
}

// How big do the renderer's own camera-space values get? That is the scale question.
const mag = (k) => rows.reduce((m, r) => Math.max(m, Math.abs(r[k])), 0);
console.log('');
console.log(`largest |x| ${mag('x')}, |y| ${mag('y')}, |z| ${mag('z')}`);

fs.mkdirSync('captured/project6000', { recursive: true });
fs.writeFileSync('captured/project6000/calls.json', JSON.stringify({
  source: 'every call to $68A1 during one render from the flight snapshot',
  camera, calls: rows,
}) + String.fromCharCode(10));
console.log('wrote captured/project6000/calls.json');
