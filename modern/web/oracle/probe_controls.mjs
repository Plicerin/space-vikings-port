// The flight controls at $9023, measured rather than read.
//
// Disassembly says the routine turns the two paddle bytes into pitch and bank changes
// through a stepped response with a dead zone, and lets bank drive heading. This checks
// that by running it on the real 6502 with inputs I choose.
//
// It is a controlled experiment, and two things about it are deliberate:
//
//   The module is written straight into memory at $9023 from the disk, with no DOS and no
//   game, so nothing else can be moving the values.
//
//   $921E (JSR $6000, the renderer) is patched to RTS. The control logic is what is being
//   measured; letting the renderer run would need state this harness does not set up, and
//   its drawing is not part of the question.
import { openOracle } from './a2.mjs';
import { openDisk, DISK } from './dsk.mjs';

const SIM = 0x9023;
const PITCH = 0x7321, BANK = 0x7322, HEADING = 0x7323;
const PDL1 = 0x95fd, PDL0 = 0x95fe, LATCH = 0x952f;
const FLAG = 6;

const disk = openDisk(DISK);
const sim = disk.read(disk.files.find((f) => f.name === 'SPACE SIMULATOR ASSEMBLY'));

const a2 = await openOracle();
await a2.ev(`(() => {
  window.M.a2.reset();
  const st = window.M.cpu.getState(); st.pc = 0xE000; window.M.cpu.setState(st);
  return 'cold start';
})()`);
for (let i = 0; i < 40 && !(await a2.screen()).some((l) => l.trim().endsWith(']')); i++) await a2.frames(30);
if (!(await a2.screen()).some((l) => l.trim().endsWith(']'))) { await a2.close(); throw new Error('no ] prompt'); }

await a2.ev(`(() => {
  const b = [${[...sim.data].join(',')}];
  for (let i = 0; i < b.length; i++) window.M.wr(${SIM} + i, b[i]);
  window.M.wr(0x921E, 0x60);          // JSR $6000 -> RTS: isolate the controls
  return 'module in place';
})()`);

const type = async (line) => {
  for (const ch of line) await a2.key(ch, { holdFrames: 2, afterFrames: 3 });
  await a2.key(13, { holdFrames: 2, afterFrames: 20 });
};
await type('HIMEM: 28672');
await type(`10 IF PEEK(${FLAG}) = 0 THEN 10`);
await type(`20 CALL ${SIM}`);
await type(`30 POKE ${FLAG},0: GOTO 10`);
await type('RUN');
await a2.frames(60);

/** Set the inputs, run one CALL, read the outputs back. */
async function once({ pdl1 = 128, pdl0 = 128, pitch = 0, bank = 0, heading = 0, latch = 0 }) {
  await a2.ev(`(() => {
    const w = window.M.wr;
    w(${PITCH}, ${pitch}); w(${BANK}, ${bank}); w(${HEADING}, ${heading});
    w(${PDL1}, ${pdl1}); w(${PDL0}, ${pdl0}); w(${LATCH}, ${latch});
    w(${FLAG}, 1);
    return 'go';
  })()`);
  for (let i = 0; i < 40; i++) {
    await a2.frames(4);
    if (JSON.parse(await a2.ev(`window.M.rd(${FLAG})`)) === 0) break;
  }
  return JSON.parse(await a2.ev(`JSON.stringify({
    pitch: window.M.rd(${PITCH}), bank: window.M.rd(${BANK}),
    heading: window.M.rd(${HEADING}), latch: window.M.rd(${LATCH})
  })`));
}

const s8 = (v) => (v > 127 ? v - 256 : v);

console.log('Paddle 1 ($95FD) against pitch, starting from pitch 0, bank 0:\n');
console.log(' paddle   pitch after   step');
let prev = null;
for (const p of [0, 25, 31, 40, 50, 60, 70, 80, 89, 90, 128, 169, 170, 171, 189, 190, 209, 210, 229, 230, 255]) {
  const r = await once({ pdl1: p });
  const step = s8(r.pitch);
  const mark = prev !== null && step !== prev ? '  <-' : '';
  console.log(`   ${String(p).padStart(3)}      ${String(step).padStart(4)}       ${step >= 0 ? '+' : ''}${step}${mark}`);
  prev = step;
}

console.log('\nPaddle 0 ($95FE) against bank, starting from bank 0:\n');
console.log(' paddle   bank after');
for (const p of [0, 25, 30, 40, 50, 60, 70, 80, 89, 90, 128, 169, 170, 190, 210, 230, 255]) {
  const r = await once({ pdl0: p });
  console.log(`   ${String(p).padStart(3)}      ${String(s8(r.bank)).padStart(4)}`);
}

console.log('\nBank against heading (paddles centred, so only $912E acts):\n');
console.log('  bank   heading after');
for (const b of [0, 4, 5, 16, 17, 32, 33, 47, 48, 49, 0xd0, 0xe0, 0xf0, 0xfb, 0xff]) {
  const r = await once({ bank: b, heading: 100 });
  console.log(`  ${String(s8(b)).padStart(4)}       ${String(r.heading - 100).padStart(4)}`);
}

console.log('\nThe steep-pitch heading flip ($90F2), heading 100:\n');
console.log('  pitch  latch in   heading after   latch out');
for (const [pitch, latch] of [[0x00, 0], [0x3f, 0], [0x40, 0], [0x80, 0], [0xbf, 0], [0xc0, 0], [0x40, 1], [0x00, 1]]) {
  const r = await once({ pitch, heading: 100, latch });
  console.log(`   $${pitch.toString(16).padStart(2, '0')}       ${latch}          ${String(r.heading).padStart(4)}          ${r.latch}`);
}

console.log('\nBank clamp - repeated full deflection on paddle 0:\n');
let bank = 0;
for (let i = 1; i <= 16; i++) {
  const r = await once({ pdl0: 255, bank });
  bank = r.bank;
  process.stdout.write(`${s8(bank)} `);
}
console.log('\n(bank after each of 16 calls at full deflection)');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
