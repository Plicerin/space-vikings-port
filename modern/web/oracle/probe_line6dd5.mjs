// $6DD5, the renderer's line, called directly on a sweep of endpoints.
//
// $6DD5 takes two projected points as $B3/$B4 and $B5/$B6 - the bytes $68A1 produced - maps
// them with `x + 70` and `95 - y`, and draws. There is no clipping anywhere in it: it goes
// from the mapping straight into its own plotter, which works a horizontal run at a time and
// ORs a mask into each screen byte.
//
// So the question this answers is what Hires.segment6DD5() has to reproduce, given the same
// two points, with nothing in between.
import { openOracle } from './a2.mjs';
import { HGR_W, HGR_H } from './hgr.mjs';
import fs from 'fs';

const meta = JSON.parse(fs.readFileSync('captured/snapshot/flight.json', 'utf8'));
const b64 = fs.readFileSync('captured/snapshot/flight.bin').toString('base64');

// Endpoint pairs in $68A1's own units: sx in -69..69, sy in -28..96, which is everything the
// frustum can produce. Shallow, steep, exactly diagonal, horizontal, vertical, and reversed.
const pairs = [];
for (const [ax, ay] of [[-69, 0], [-40, -28], [0, 34], [30, 60], [68, 96]]) {
  for (const [bx, by] of [
    [69, 0], [-69, 0], [0, 96], [0, -28], [69, 96], [-69, -28], [69, -28], [-69, 96],
    [ax + 1, ay], [ax, ay + 1], [ax + 7, ay + 1], [ax + 1, ay + 7], [ax, ay], [ax + 14, ay + 14],
  ]) pairs.push([ax, ay, bx, by]);
}
let seed = 20260929;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const rx = () => Math.round(rnd() * 138) - 69;
const ry = () => Math.round(rnd() * 124) - 28;
for (let i = 0; i < 300; i++) pairs.push([rx(), ry(), rx(), ry()]);

const a2 = await openOracle();
await a2.ev(`(() => { window.M.a2.reset(); return 'reset'; })()`);
await a2.frames(10);
const rows = JSON.parse(await a2.ev(`(() => {
  const cpu = window.M.cpu;
  const s = atob(${JSON.stringify(b64)});
  for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
  cpu.read(0xC050); cpu.read(0xC052); cpu.read(0xC054); cpu.read(0xC057);
  cpu.write(0x0300, 0x4C); cpu.write(0x0301, 0x00); cpu.write(0x0302, 0x03);
  // $70E4's CMP #$60 puts the page limit at $6000, so the renderer draws to page 2.
  const BASE = 0x4000;
  const out = [];
  for (const [ax, ay, bx, by] of ${JSON.stringify(pairs)}) {
    for (let i = 0; i < 0x2000; i++) cpu.write(BASE + i, 0);
    cpu.write(0xB3, ax & 0xff); cpu.write(0xB4, ay & 0xff);
    cpu.write(0xB5, bx & 0xff); cpu.write(0xB6, by & 0xff);
    const st = cpu.getState();
    st.sp = 0xF0; st.pc = 0x6DD5;
    cpu.setState(st);
    cpu.write(0x01F1, 0xFF); cpu.write(0x01F2, 0x02);
    let n = 0;
    while (cpu.getPC() !== 0x0300 && n < 400000) { cpu.stepCycles(1); n++; }
    const lit = [];
    if (n < 400000) {
      for (let a = 0; a < 0x2000; a++) {
        const v = cpu.read(BASE + a);
        if (v) lit.push([a, v]);
      }
    }
    out.push({ ok: n < 400000, lit });
  }
  return JSON.stringify(out);
})()`));
await a2.close();

// Turn each page into a pixel list, the way hgr.mjs lays the rows out.
const rowBase = [];
for (let y = 0; y < HGR_H; y++) {
  rowBase.push(((y & 7) << 10) | (((y >> 3) & 7) << 7) | (((y >> 6) & 3) * 40));
}
const toPixels = (lit) => {
  const m = new Map(lit);
  const px = [];
  for (let y = 0; y < HGR_H; y++) {
    for (let b = 0; b < 40; b++) {
      const v = m.get(rowBase[y] + b);
      if (!v) continue;
      for (let bit = 0; bit < 7; bit++) if (v & (1 << bit)) px.push([b * 7 + bit, y]);
    }
  }
  return px;
};

const out = pairs.map((p, i) => ({
  a: [p[0], p[1]], b: [p[2], p[3]], ok: rows[i].ok, pixels: toPixels(rows[i].lit),
}));
const drawn = out.filter((o) => o.ok && o.pixels.length);
console.log(`${pairs.length} endpoint pairs, ${drawn.length} drew something`);
console.log('');
console.log('   $68A1 bytes         screen span                  pixels');
for (const o of drawn.slice(0, 8)) {
  const xs = o.pixels.map((q) => q[0]), ys = o.pixels.map((q) => q[1]);
  console.log(`   ${JSON.stringify(o.a).padEnd(10)}->${JSON.stringify(o.b).padEnd(11)} ` +
    `x ${Math.min(...xs)}-${Math.max(...xs)}, y ${Math.min(...ys)}-${Math.max(...ys)}`.padEnd(28) +
    ` ${o.pixels.length}`);
}
fs.mkdirSync('captured/line6dd5', { recursive: true });
fs.writeFileSync('captured/line6dd5/golden.json', JSON.stringify({
  source: '$6DD5 called directly from the flight snapshot on a cleared page 1',
  lines: out,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/line6dd5/golden.json');
