// The rotation chain that fills $60-$65, captured from a live render.
//
// Watching writes to $60 points at $67E6/$67E8, which is the tail of $67D4:
//
//   $67D4  CLC / ADC $A7 / TAY / TXA / ADC $A8 / TAX     ; + the first product
//   $67DC  TYA / CLC / ADC $A9 / TAY / TXA / ADC $AA     ; + the second
//   $67E4  LDX $B2 / STA $01,X / STY $00,X               ; store through a moving pointer
//   $67EA  INC $B2 / INC $B2
//
// and the caller at $6730 onwards is a translation followed by nine Q15 multiplies:
//
//   $6730  the model point from ($9B),Y minus $90-$95      -> $AB/$AC, $AD/$AE, $AF/$B0
//   $675B  LDX #$AB / LDY #$7E / LDA #$A7 / JSR $633D      ; dx * M0
//   $6764  LDX #$AD / LDY #$84 / LDA #$A9 / JSR $633D      ; dy * M3
//   $676D  dz * $8A/$8B through $635C, then JSR $67D4      ; sum and store
//   ...twice more, with $80/$86/$8C and $82/$88/$8E
//
// So it is `camera = M . (p - origin)` with M nine 16-bit Q15 entries. This reads the matrix
// and the translation out of a running render and records what each triple maps to.
import { openOracle } from './a2.mjs';
import fs from 'fs';

const meta = JSON.parse(fs.readFileSync('captured/snapshot/flight.json', 'utf8'));
const b64 = fs.readFileSync('captured/snapshot/flight.bin').toString('base64');

const a2 = await openOracle();
await a2.ev(`(() => { window.M.a2.reset(); return 'reset'; })()`);
await a2.frames(10);

const runOne = async (heading, pitch) => JSON.parse(await a2.ev(`(() => {
  const cpu = window.M.cpu;
  const s = atob(${JSON.stringify(b64)});
  for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
  cpu.write(0x7321, ${pitch});
  cpu.write(0x7323, ${heading});
  cpu.read(0xC050); cpu.read(0xC052); cpu.read(0xC054); cpu.read(0xC057);
  const st = cpu.getState();
  st.sp = 0xF0; st.pc = 0x6000;
  cpu.setState(st);
  cpu.write(0x01F1, 0xFF); cpu.write(0x01F2, 0x02);
  cpu.write(0x0300, 0x4C); cpu.write(0x0301, 0x00); cpu.write(0x0302, 0x03);

  const w = (a) => cpu.read(a) | (cpu.read(a + 1) << 8);
  const out = [];
  let pending = null;
  let steps = 0;
  while (cpu.getPC() !== 0x0300 && steps < 3000000) {
    const pc = cpu.getPC();
    if (pc === 0x675B) {
      // The translated vector is ready; the matrix is live too.
      pending = {
        d: [w(0xAB), w(0xAD), w(0xAF)],
        origin: [w(0x90), w(0x92), w(0x94)],
        m: [w(0x7E), w(0x84), w(0x8A), w(0x80), w(0x86), w(0x8C), w(0x82), w(0x88), w(0x8E)],
        at: w(0xB2),
      };
    } else if (pending && pc === 0x67D3) {
      // $67D3 is the RTS of the three-axis block; $60-$65 now hold the result.
      pending.cam = [w(0x60), w(0x62), w(0x64)];
      out.push(pending);
      pending = null;
      if (out.length >= 4) break;
    }
    cpu.stepCycles(1);
    steps++;
  }
  return JSON.stringify({ steps, rows: out });
})()`));

const r = await runOne(0, 0);

const s16 = (v) => (v > 32767 ? v - 65536 : v);
const rows = r.rows.map((o) => ({
  d: o.d.map(s16), origin: o.origin.map(s16), m: o.m.map(s16), cam: o.cam.map(s16),
}));
console.log(`${rows.length} transform blocks in ${r.steps.toLocaleString()} instructions`);
if (!rows.length) { console.log('none captured'); process.exit(0); }

const m = rows[0].m;
console.log('');
console.log('the matrix, Q15 (value / 32768):');
console.log(`   dx      dy      dz`);
for (let i = 0; i < 3; i++) {
  const r0 = m[i * 3], r1 = m[i * 3 + 1], r2 = m[i * 3 + 2];
  console.log(`  ${String(r0).padStart(6)} ${String(r1).padStart(6)} ${String(r2).padStart(6)}    ` +
    `${(r0 / 32768).toFixed(4)} ${(r1 / 32768).toFixed(4)} ${(r2 / 32768).toFixed(4)}`);
}
console.log('');
console.log(`origin subtracted: ${rows[0].origin.join(', ')}`);
console.log('');
console.log('   translated d            camera out         M . d / 32768 (float)');
for (const row of rows.slice(0, 10)) {
  const pred = [0, 1, 2].map((i) =>
    Math.trunc((row.d[0] * row.m[i * 3] + row.d[1] * row.m[i * 3 + 1] + row.d[2] * row.m[i * 3 + 2]) / 32768));
  console.log(`  ${row.d.map((v) => String(v).padStart(6)).join(' ')}   ` +
    `${row.cam.map((v) => String(v).padStart(6)).join(' ')}   ` +
    `${pred.map((v) => String(v).padStart(6)).join(' ')}`);
}

// How is the matrix built? Sweep heading and pitch and read it back.
console.log('');
console.log('the matrix across heading and pitch:');
console.log('  heading pitch     m00    m01    m02    m10    m11    m12    m20    m21    m22');
const sweep = [];
for (const [h, p] of [[0,0],[16,0],[32,0],[64,0],[128,0],[192,0],[0,16],[0,32],[0,240],[32,32]]) {
  const rr = await runOne(h, p);
  if (!rr.rows.length) { console.log(`  ${h} ${p}: no transform seen`); continue; }
  const mm = rr.rows[0].m.map(s16);
  sweep.push({ heading: h, pitch: p, m: mm });
  console.log(`  ${String(h).padStart(7)} ${String(p).padStart(5)}  ` + mm.map((v) => String(v).padStart(6)).join(' '));
}
await a2.close();

fs.mkdirSync('captured/rot', { recursive: true });
fs.writeFileSync('captured/rot/golden.json', JSON.stringify({
  source: 'the rotation chain at $6730-$67D3, trapped during one render from the flight snapshot',
  rows, sweep,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/rot/golden.json');
