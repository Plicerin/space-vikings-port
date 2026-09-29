// The renderer's sine/cosine table and its Q15 multiply, measured by calling them.
//
// $654E builds the nine matrix entries at $7E-$8F from three angle bytes at $96/$97/$98
// (pitch, bank, heading - copied out of the display list at $62CB). It needs two primitives:
//
//   $64FB  cos: A = angle byte -> 16-bit in A (low) / X (high), from the table at $609A
//   $64F8  sin: SEC / SBC #$40, then fall into $64FB
//   $635C  a 16-bit signed multiply of $78/$79 by $7A/$7B, returning A (low) / X (high)
//
// Reading the shift-and-add at $635C off the page is error-prone, so measure instead: call it
// on the machine with chosen operand pairs and check a closed form against every answer.
import { openOracle } from './a2.mjs';
import fs from 'fs';

const TRAP = 0x0300;
const meta = JSON.parse(fs.readFileSync('captured/snapshot/flight.json', 'utf8'));
const b64 = fs.readFileSync('captured/snapshot/flight.bin').toString('base64');
const s16 = (v) => (v > 32767 ? v - 65536 : v);

const a2 = await openOracle();
await a2.ev(`(() => { window.M.a2.reset(); return 'reset'; })()`);
await a2.frames(10);

const PRELUDE = `
  const cpu = window.M.cpu;
  const s = atob(${JSON.stringify(b64)});
  for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
  cpu.write(${TRAP}, 0x4C); cpu.write(${TRAP + 1}, ${TRAP & 0xff}); cpu.write(${TRAP + 2}, ${TRAP >> 8});
  const call = (pc, a, x, y) => {
    const st = cpu.getState();
    st.sp = 0xF0; st.pc = pc; st.a = a & 0xff; st.x = x & 0xff; st.y = y & 0xff;
    cpu.setState(st);
    cpu.write(0x01F1, ${(TRAP - 1) & 0xff}); cpu.write(0x01F2, ${(TRAP - 1) >> 8});
    let n = 0;
    while (cpu.getPC() !== ${TRAP} && n < 40000) { cpu.stepCycles(1); n++; }
    const e = cpu.getState();
    return { a: e.a, x: e.x, ok: n < 40000 };
  };
`;

// --- the table, for every one of the 256 angle bytes ---
const trig = JSON.parse(await a2.ev(`(() => {
  ${PRELUDE}
  const cos = [], sin = [];
  for (let i = 0; i < 256; i++) {
    let r = call(0x64FB, i, 0, 0);
    cos.push(r.a | (r.x << 8));
    r = call(0x64F8, i, 0, 0);
    sin.push(r.a | (r.x << 8));
  }
  return JSON.stringify({ cos, sin });
})()`));

const cos = trig.cos.map(s16);
const sin = trig.sin.map(s16);
console.log('the table at $609A, read through $64FB (cos) and $64F8 (sin):');
console.log('  angle   cos     sin      cos/32768   sin/32768    cos(2pi a/256)');
for (const a of [0, 16, 32, 48, 64, 96, 128, 160, 192, 224, 255]) {
  console.log(`  ${String(a).padStart(5)} ${String(cos[a]).padStart(6)} ${String(sin[a]).padStart(7)}    ` +
    `${(cos[a] / 32768).toFixed(5).padStart(9)} ${(sin[a] / 32768).toFixed(5).padStart(10)}    ` +
    `${Math.cos((2 * Math.PI * a) / 256).toFixed(5).padStart(9)}`);
}
let worst = 0, worstAt = 0;
for (let a = 0; a < 256; a++) {
  const e = Math.abs(cos[a] / 32768 - Math.cos((2 * Math.PI * a) / 256));
  if (e > worst) { worst = e; worstAt = a; }
}
console.log(`\nlargest gap from a true cosine: ${worst.toFixed(5)} at angle ${worstAt}`);
console.log(`is sin[a] == cos[a-64] for all 256?  ` +
  `${sin.every((v, a) => v === cos[(a - 64) & 0xff]) ? 'yes' : 'NO'}`);

// --- the multiply ---
const pairs = [];
for (const a of [0, 1, -1, 2, 100, -100, 32767, -32768, 16384, -16384, 32765, 255, 256, -256]) {
  for (const b of [0, 1, -1, 32767, -32768, 16384, -16384, 32765, 1000, -1000, 7, -7]) pairs.push([a, b]);
}
let seed = 987654321;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
for (let i = 0; i < 600; i++) {
  pairs.push([Math.round((rnd() * 2 - 1) * 32767), Math.round((rnd() * 2 - 1) * 32767)]);
}

const mul = JSON.parse(await a2.ev(`(() => {
  ${PRELUDE}
  const pairs = ${JSON.stringify(pairs)};
  const out = [];
  for (const [a, b] of pairs) {
    const u = a & 0xffff, v = b & 0xffff;
    cpu.write(0x78, u & 0xff); cpu.write(0x79, (u >> 8) & 0xff);
    cpu.write(0x7A, v & 0xff); cpu.write(0x7B, (v >> 8) & 0xff);
    const r = call(0x635C, 0, 0, 0);
    out.push(r.ok ? (r.a | (r.x << 8)) : null);
  }
  return JSON.stringify(out);
})()`));
await a2.close();

const got = mul.map((v) => (v === null ? null : s16(v)));
console.log(`\n${got.length} calls to $635C`);

const forms = {
  'trunc(a*b/32768)': (a, b) => Math.trunc((a * b) / 32768),
  'floor(a*b/32768)': (a, b) => Math.floor((a * b) / 32768),
  '(a*b)>>15 (arith)': (a, b) => Math.floor((a * b) / 32768),
  'round(a*b/32768)': (a, b) => Math.round((a * b) / 32768),
};
for (const [name, f] of Object.entries(forms)) {
  let bad = 0, first = null;
  for (let i = 0; i < pairs.length; i++) {
    const [a, b] = pairs[i];
    const want = s16(f(a, b) & 0xffff);
    if (got[i] !== want) { bad++; if (!first) first = { a, b, got: got[i], want }; }
  }
  console.log(`  ${name.padEnd(20)} ${bad === 0 ? 'matches all' : `${bad} mismatches, first ${first.a} * ${first.b} -> machine ${first.got}, formula ${first.want}`}`);
}

fs.mkdirSync('captured/rot', { recursive: true });
fs.writeFileSync('captured/rot/trig.json', JSON.stringify({
  source: 'the table at $609A through $64FB/$64F8, and $635C called directly, from the flight snapshot',
  cos, sin,
  multiply: pairs.map((p, i) => ({ a: p[0], b: p[1], r: got[i] })),
}) + String.fromCharCode(10));
console.log('\nwrote captured/rot/trig.json');
