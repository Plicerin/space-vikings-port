// Does $9754 store the lamp byte, or merge it with what is already there?
//
// `probe_gauges.mjs` answered what $9602 draws by clearing hi-res page 1 to zero first, so
// it could not tell a store from an OR - every byte under the lamp was $00 either way.
//
// It matters. `transition_parity.mjs` reports the same 63 differing pixels in rows 124-191 on
// four separate screens, and they are the **vertical edges of the gauge boxes**: x 17, 71, 82,
// 261 and 272, all of them inside the two byte columns a lamp writes. The disk has them; the
// port, which stores the lamp byte over them, does not. If $9754 ORs, the box survives under
// the lamp and that is the whole of the 63.
//
// So: fill page 1 with $7F, call $9602, and read the lamp columns back. A store leaves the
// lamp byte; an OR leaves $7F.
import { openOracle } from './a2.mjs';
import fs from 'fs';

const TRAP = 0x0300;
const P1_LO = 0x2000, P1_HI = 0x4000;
const REDRAW_ALL = 0x952d;
const FLAGS = [0x9539, 0x953a, 0x9515, 0x9514, 0x9542, 0x95f9];

const meta = JSON.parse(fs.readFileSync('captured/snapshot/flight.json', 'utf8'));
const b64 = fs.readFileSync('captured/snapshot/flight.bin').toString('base64');
const rowBase = (r) => 0x2000 + 0x400 * (r & 7) + 0x80 * ((r >> 3) & 7) + 0x28 * (r >> 6);

const a2 = await openOracle();
await a2.ev(`(() => { window.M.a2.reset(); return 'reset'; })()`);
await a2.frames(10);

/** Prefill every byte of page 1 with `fill`, run $9602, and read the lamp rows back. */
async function run(fill) {
  return JSON.parse(await a2.ev(`(() => {
    const M = window.M, cpu = M.cpu;
    const s = atob(${JSON.stringify(b64)});
    for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
    for (let a = ${P1_LO}; a < ${P1_HI}; a++) cpu.write(a, ${fill});
    cpu.write(${REDRAW_ALL}, 0x0A);
    ${FLAGS.map((f) => `cpu.write(${f}, 0);`).join(' ')}
    const st = cpu.getState(); st.sp = 0xF0; st.pc = 0x9602; cpu.setState(st);
    cpu.write(0x01F1, ${(TRAP - 1) & 0xff}); cpu.write(0x01F2, ${(TRAP - 1) >> 8});
    cpu.write(${TRAP}, 0x4C); cpu.write(${TRAP + 1}, ${TRAP & 0xff}); cpu.write(${TRAP + 2}, ${TRAP >> 8});
    let steps = 0;
    while (cpu.getPC() !== ${TRAP} && steps < 200000) { cpu.stepCycles(1); steps++; }
    const out = {};
    for (const row of [153, 161]) for (const col of [1, 2, 10, 11, 28, 29, 37, 38]) {
      out[row + ':' + col] = cpu.read(${'${'}0${'}'});
    }
    return JSON.stringify({ returned: cpu.getPC() === ${TRAP}, steps });
  })()`));
}
void run;

// The template dance above is more trouble than it is worth - read the rows out separately.
async function lampRows(fill) {
  const r = JSON.parse(await a2.ev(`(() => {
    const M = window.M, cpu = M.cpu;
    const s = atob(${JSON.stringify(b64)});
    for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
    for (let a = ${P1_LO}; a < ${P1_HI}; a++) cpu.write(a, ${fill});
    cpu.write(${REDRAW_ALL}, 0x0A);
    ${FLAGS.map((f) => `cpu.write(${f}, 0);`).join(' ')}
    const st = cpu.getState(); st.sp = 0xF0; st.pc = 0x9602; cpu.setState(st);
    cpu.write(0x01F1, ${(TRAP - 1) & 0xff}); cpu.write(0x01F2, ${(TRAP - 1) >> 8});
    cpu.write(${TRAP}, 0x4C); cpu.write(${TRAP + 1}, ${TRAP & 0xff}); cpu.write(${TRAP + 2}, ${TRAP >> 8});
    let steps = 0;
    while (cpu.getPC() !== ${TRAP} && steps < 200000) { cpu.stepCycles(1); steps++; }
    const page = [];
    for (let a = ${P1_LO}; a < ${P1_HI}; a++) page.push(cpu.read(a));
    return JSON.stringify({ returned: cpu.getPC() === ${TRAP}, steps, page });
  })()`));
  return r;
}

const COLS = [1, 2, 10, 11, 28, 29, 37, 38];
const hex = (n) => '$' + n.toString(16).padStart(2, '0');
for (const fill of [0x00, 0x7f]) {
  const r = await lampRows(fill);
  if (!r.returned) { console.log(`fill ${hex(fill)}: did not return`); continue; }
  console.log(`page 1 prefilled with ${hex(fill)}, then CALL 38402:`);
  for (const row of [153, 161]) {
    const base = rowBase(row) - P1_LO;
    console.log(`  row ${row}: ` + COLS.map((c) => `c${c}=${hex(r.page[base + c])}`).join(' '));
  }
}
console.log('');
console.log('A store leaves the same bytes under both fills. An OR leaves $7f under the second.');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
