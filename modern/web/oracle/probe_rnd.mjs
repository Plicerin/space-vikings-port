// Applesoft's RND, called on the machine, with the seed read back every time.
//
// `$EFAE` is the only thing standing between the port and replaying any RND-driven routine
// exactly, so what is wanted is the sequence itself: set the seed at `$00C9`, call `$EFAE` with
// a positive FAC, and read the five bytes it leaves behind. Repeat.
//
// `$EFAE` expects an argument in FAC, so FAC is set up as 1.0 - exponent $81, mantissa
// $80000000 - before each call. A positive argument is what `RND(1)` passes, and only its sign
// matters: zero returns the last value and negative reseeds.
import { openOracle } from './a2.mjs';
import fs from 'fs';

const N = Number(process.env.RND_N || 4000);
const SEEDS = [
  [0xff, 0x00, 0x00, 0xff, 0xff],     // what $00C9 holds after a cold start
  [0x80, 0x00, 0x00, 0x00, 0x00],     // 0.5
  [0x81, 0x49, 0x0f, 0xda, 0xa2],     // pi / 2, a mantissa with bits all over it
  [0x01, 0x00, 0x00, 0x00, 0x01],     // the smallest exponent, to exercise underflow
  [0xfe, 0x7f, 0xff, 0xff, 0xff],     // nearly the largest, to exercise overflow
];

const a2 = await openOracle();
await a2.ev(`(() => { window.M.a2.reset(); return 'reset'; })()`);
await a2.frames(10);

const runs = [];
for (const seed of SEEDS) {
  const r = JSON.parse(await a2.ev(`(() => {
    const cpu = window.M.cpu;
    cpu.write(0x0300, 0x4C); cpu.write(0x0301, 0x00); cpu.write(0x0302, 0x03);
    const seed = ${JSON.stringify(seed)};
    for (let i = 0; i < 5; i++) cpu.write(0x00C9 + i, seed[i]);
    const out = []; let shiftIn = null;
    for (let n = 0; n < ${N}; n++) {
      // FAC = 1.0, so SIGN comes back positive and $EFAE takes the ordinary path.
      cpu.write(0x9D, 0x81); cpu.write(0x9E, 0x80);
      cpu.write(0x9F, 0x00); cpu.write(0xA0, 0x00); cpu.write(0xA1, 0x00);
      cpu.write(0xA2, 0x00); cpu.write(0xAC, 0x00);
      // $A4 is what $E8DA shifts into the accumulator when a multiplier byte is zero, and
      // nothing in FMULT sets it - so record it, because the answer depends on it.
      if (n === 0) shiftIn = cpu.read(0xA4);
      const st = cpu.getState();
      st.sp = 0xF0; st.pc = 0xEFAE;
      cpu.setState(st);
      cpu.write(0x01F1, 0xFF); cpu.write(0x01F2, 0x02);
      let k = 0;
      while (cpu.getPC() !== 0x0300 && k < 200000) { cpu.stepCycles(1); k++; }
      if (k >= 200000) return JSON.stringify({ failedAt: n, values: out });
      out.push([cpu.read(0x00C9), cpu.read(0x00CA), cpu.read(0x00CB),
        cpu.read(0x00CC), cpu.read(0x00CD)]);
    }
    return JSON.stringify({ values: out, shiftIn });
  })()`));
  if (r.failedAt !== undefined) {
    console.log(`  seed ${seed.map((b) => b.toString(16).padStart(2, '0')).join(' ')}: ` +
      `did not return on call ${r.failedAt}`);
    runs.push({ seed, values: r.values, failedAt: r.failedAt });
    continue;
  }
  const val = (b) => {
    if (b[0] === 0) return 0;
    const s = (b[1] & 0x80) ? -1 : 1;
    const m = ((b[1] | 0x80) * 0x1000000 + b[2] * 0x10000 + b[3] * 0x100 + b[4]) / 0x100000000;
    return s * m * Math.pow(2, b[0] - 128);
  };
  const vs = r.values.map(val);
  const inRange = vs.every((v) => v >= 0 && v < 1);
  const mean = vs.reduce((a, b) => a + b, 0) / vs.length;
  console.log(`  seed ${seed.map((b) => b.toString(16).padStart(2, '0')).join(' ')}: ` +
    `${r.values.length} values, ${inRange ? 'all in [0,1)' : 'SOME OUT OF [0,1)'}, ` +
    `mean ${mean.toFixed(5)}, $A4 = $${(r.shiftIn ?? 0).toString(16)}`);
  console.log(`    first three: ${vs.slice(0, 3).map((v) => v.toFixed(9)).join('  ')}`);
  runs.push({ seed, values: r.values, shiftIn: r.shiftIn });
}
await a2.close();

// How long before it repeats, from the cold-start seed?
const first = runs[0];
if (first && first.values.length) {
  const seen = new Map();
  let period = null;
  first.values.forEach((b, i) => {
    const k = b.join(',');
    if (seen.has(k) && period === null) period = i - seen.get(k);
    if (!seen.has(k)) seen.set(k, i);
  });
  console.log('');
  console.log(period === null
    ? `no repeat in ${first.values.length} calls from the cold-start seed`
    : `the cold-start sequence repeats after ${period} calls`);
}

fs.mkdirSync('captured/rnd', { recursive: true });
fs.writeFileSync('captured/rnd/golden.json', JSON.stringify({
  source: '$EFAE called directly with FAC set to 1.0, the seed at $00C9 read back after each call',
  calls: N, runs,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/rnd/golden.json');
