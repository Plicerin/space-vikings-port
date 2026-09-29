// The renderer's projection at $68A1, measured by calling it.
//
// $6274 is `LDY #$60: LDX #$9F: JSR $68A1` - project the camera-space point at zero page $60
// into the two screen bytes at $9F. The point is six bytes: x, y, z as 16-bit little-endian.
//
//   $68A1  STX $A7 / STY $A8
//   $68A5  LDA $0004,Y / STA $7A / LDA $0005,Y / STA $7B     ; z
//   $68AF  LDX $00,Y / LDA $0001,Y / JSR $6468               ; x / z
//   $68B7  LDA $79 / LDX #$45 / JSR $691E                    ; scale by the clamp limit
//   $68BE  CLC / ADC #$00 / STA $0000,Y                      ; plus the x offset
//   $68C8  ... the same for y with #$3E and #$22
//
// $6468 sorts out the signs and calls the sixteen-step restoring divide at $64B6; $691E is a
// shift-and-add multiply of the resulting fraction by the limit in X. The four operands -
// $68BA, $68C0, $68DD, $68E3 - are patched from the model stream, so they are read here
// rather than assumed.
import { openOracle } from './a2.mjs';
import fs from 'fs';

const TRAP = 0x0300;
const PROJECT = 0x68a1;
const PT = 0x60;      // where the input point goes
const OUT = 0x9f;     // where the two screen bytes come back

const meta = JSON.parse(fs.readFileSync('captured/snapshot/flight.json', 'utf8'));
const b64 = fs.readFileSync('captured/snapshot/flight.bin').toString('base64');

const a2 = await openOracle();
await a2.ev(`(() => { window.M.a2.reset(); return 'reset'; })()`);
await a2.frames(10);

// Load the snapshot once and read the patched operands.
await a2.ev(`(() => {
  const cpu = window.M.cpu;
  const s = atob(${JSON.stringify(b64)});
  for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
  return 'loaded';
})()`);
const ops = {
  xLimit: await a2.read(0x68ba),
  xOffset: await a2.read(0x68c0),
  yLimit: await a2.read(0x68dd),
  yOffset: await a2.read(0x68e3),
};
console.log(`the patched operands: x limit ${ops.xLimit}, x offset ${ops.xOffset}, ` +
  `y limit ${ops.yLimit}, y offset ${ops.yOffset}`);
console.log('$6DD5 then adds 70 to x and takes 95 - y, so x lands in ' +
  `${ops.xOffset + 70 - ops.xLimit}..${ops.xOffset + 70 + ops.xLimit} and ` +
  `y in ${95 - ops.yOffset - ops.yLimit}..${95 - ops.yOffset + ops.yLimit}`);
console.log('');

const s16 = (v) => (v > 32767 ? v - 65536 : v);
const lo = (v) => v & 0xff;
const hi = (v) => (v >> 8) & 0xff;

async function project(x, y, z) {
  const r = JSON.parse(await a2.ev(`(() => {
    const cpu = window.M.cpu;
    const s = atob(${JSON.stringify(b64)});
    for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
    cpu.write(${PT} + 0, ${lo(x)}); cpu.write(${PT} + 1, ${hi(x)});
    cpu.write(${PT} + 2, ${lo(y)}); cpu.write(${PT} + 3, ${hi(y)});
    cpu.write(${PT} + 4, ${lo(z)}); cpu.write(${PT} + 5, ${hi(z)});
    const st = cpu.getState();
    st.sp = 0xF0; st.pc = ${PROJECT};
    st.x = ${OUT}; st.y = ${PT};
    cpu.setState(st);
    cpu.write(0x01F1, ${(TRAP - 1) & 0xff});
    cpu.write(0x01F2, ${(TRAP - 1) >> 8});
    cpu.write(${TRAP}, 0x4C); cpu.write(${TRAP + 1}, ${TRAP & 0xff}); cpu.write(${TRAP + 2}, ${TRAP >> 8});
    let steps = 0;
    while (cpu.getPC() !== ${TRAP} && steps < 200000) { cpu.stepCycles(1); steps++; }
    return JSON.stringify({ returned: cpu.getPC() === ${TRAP}, sx: cpu.read(${OUT}), sy: cpu.read(${OUT} + 1) });
  })()`));
  return r.returned ? r : null;
}

// A sweep: the same z at a range of x, then a range of z at fixed x, then some y.
const rows = [];
console.log('   x      y      z     sx   sy    x/z     sx from x/z*limit+off');
for (const [x, y, z] of [
  [0, 0, -1000], [100, 0, -1000], [200, 0, -1000], [500, 0, -1000], [1000, 0, -1000],
  [-100, 0, -1000], [-500, 0, -1000], [-1000, 0, -1000],
  [100, 0, -2000], [100, 0, -4000], [100, 0, -8000],
  [1000, 0, -4000], [2000, 0, -4000], [4000, 0, -4000],
  [0, 100, -1000], [0, 500, -1000], [0, -500, -1000], [0, 1000, -1000],
  [0, 0, -100], [0, 0, -30000], [3000, 1500, -6000],
]) {
  const r = await project(x, y, z);
  if (!r) { console.log(`  ${x},${y},${z}: did not return`); continue; }
  const ratio = x / z;
  const predicted = Math.trunc(ratio * ops.xLimit) + ops.xOffset;
  rows.push({ x, y, z, sx: r.sx, sy: r.sy });
  console.log(`  ${String(x).padStart(5)} ${String(y).padStart(6)} ${String(z).padStart(6)}   ` +
    `${String(s16(r.sx << 8) >> 8).padStart(4)} ${String(s16(r.sy << 8) >> 8).padStart(4)}  ` +
    `${ratio.toFixed(4).padStart(8)}   ${String(predicted).padStart(5)}`);
}

// A wider sweep, to check a transcription against rather than curve-fit to.
console.log('');
console.log('sweeping 240 more points...');
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
for (let i = 0; i < 240; i++) {
  const x = Math.round((rnd() * 2 - 1) * 9000);
  const y = Math.round((rnd() * 2 - 1) * 9000);
  let z = -Math.round(200 + rnd() * 12000);
  if (rnd() < 0.15) z = Math.round((rnd() * 2 - 1) * 9000) || -500;
  const r = await project(x, y, z);
  if (r) rows.push({ x, y, z, sx: r.sx, sy: r.sy });
}
console.log(`  ${rows.length} samples in all`);

fs.mkdirSync('captured/project6000', { recursive: true });
fs.writeFileSync('captured/project6000/golden.json', JSON.stringify({
  source: 'the renderer at $68A1, called directly from the flight snapshot',
  operands: ops, samples: rows,
}) + String.fromCharCode(10));
console.log('\nwrote captured/project6000/golden.json');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
