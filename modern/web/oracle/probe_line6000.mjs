// The renderer's own line routine at $6DD5, measured by calling it.
//
// $6000 never touches the ROM - a scan of $6000-$9000 finds no JSR or JMP into $F400-$F7FF -
// so it has its own. The clipper at $622C falls through to `JSR $6DD5` with the two
// endpoints in $B3-$B6, one byte each: $B3/$B4 is the first point, $B5/$B6 the second.
//
// $6DD5 maps them into screen space itself - `ADC #$46` on each x and `EOR #$FF: ADC #$60`
// on each y, so x + 70 and 96 - y - and then dispatches to one of several octant-specialised
// inner loops through a self-modifying JMP at $6FED. Reading that is a poor way to learn what
// it draws; calling it is a better one.
//
// This sets the endpoints, calls it with a trap return, and reads back exactly which pixels
// it lit.
import { openOracle } from './a2.mjs';
import { decodeHgr, HGR_W, HGR_H } from './hgr.mjs';
import fs from 'fs';

const TRAP = 0x0300;
const P2_LO = 0x4000, P2_HI = 0x6000;
const LINE = 0x6dd5;

const meta = JSON.parse(fs.readFileSync('captured/snapshot/flight.json', 'utf8'));
const b64 = fs.readFileSync('captured/snapshot/flight.bin').toString('base64');

const a2 = await openOracle();
await a2.ev(`(() => { window.M.a2.reset(); return 'reset'; })()`);
await a2.frames(10);

// Call $6DD5 with the four bytes set, on a blank page 2, and return the lit pixels.
async function draw(x1, y1, x2, y2) {
  const r = JSON.parse(await a2.ev(`(() => {
    const M = window.M, cpu = M.cpu, mach = M.a2;
    const s = atob(${JSON.stringify(b64)});
    for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
    cpu.read(0xC050); cpu.read(0xC052); cpu.read(0xC054); cpu.read(0xC057);
    for (let a = ${P2_LO}; a < ${P2_HI}; a++) cpu.write(a, 0);
    cpu.write(0xB3, ${x1 & 0xff});
    cpu.write(0xB4, ${y1 & 0xff});
    cpu.write(0xB5, ${x2 & 0xff});
    cpu.write(0xB6, ${y2 & 0xff});
    const st = cpu.getState();
    st.sp = 0xF0; st.pc = ${LINE};
    cpu.setState(st);
    cpu.write(0x01F1, ${(TRAP - 1) & 0xff});
    cpu.write(0x01F2, ${(TRAP - 1) >> 8});
    cpu.write(${TRAP}, 0x4C); cpu.write(${TRAP + 1}, ${TRAP & 0xff}); cpu.write(${TRAP + 2}, ${TRAP >> 8});
    let steps = 0;
    while (cpu.getPC() !== ${TRAP} && steps < 400000) { cpu.stepCycles(1); steps++; }
    let out = '';
    for (let a = ${P2_LO}; a < ${P2_HI}; a++) out += String.fromCharCode(cpu.read(a));
    return JSON.stringify({ returned: cpu.getPC() === ${TRAP}, steps, page: btoa(out) });
  })()`));
  if (!r.returned) return null;
  const on = decodeHgr(Buffer.from(r.page, 'base64'));
  const pts = [];
  for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) if (on[y * HGR_W + x]) pts.push([x, y]);
  return pts;
}

// A spread of slopes and directions in the renderer's own coordinates. $6DD5 adds 70 to x
// and takes 96 - y, so these stay well inside the screen.
const CASES = [
  [-60, 0, 60, 0], [0, -60, 0, 60],            // axis-aligned, both ways
  [-60, -30, 60, 30], [60, 30, -60, -30],      // 1 in 2, forwards and back
  [-30, -30, 30, 30], [30, -30, -30, 30],      // 45 degrees, both diagonals
  [-45, -15, 45, 15],                          // 1 in 3
  [-60, -8, 60, 8],                            // shallow
  [-8, -60, 8, 60],                            // steep
  [0, 0, 64, 21],                              // 1 in 3 from the origin
];

console.log('calling $6DD5 directly, endpoints in $B3-$B6\n');
const results = [];
for (const [x1, y1, x2, y2] of CASES) {
  const pts = await draw(x1, y1, x2, y2);
  if (!pts) { console.log(`  (${x1},${y1})-(${x2},${y2}): did not return`); continue; }
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (const [x, y] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  // How wide is each row, and how tall each column? That separates 4-connected from 8.
  const perRow = new Map();
  for (const [x, y] of pts) perRow.set(y, (perRow.get(y) ?? 0) + 1);
  const widths = [...perRow.values()];
  console.log(`  (${String(x1).padStart(4)},${String(y1).padStart(4)}) - (${String(x2).padStart(4)},${String(y2).padStart(4)})  ` +
    `${String(pts.length).padStart(4)} px   x ${minX}-${maxX}, y ${minY}-${maxY}   ` +
    `rows ${perRow.size}, widths ${Math.min(...widths)}-${Math.max(...widths)}`);
  results.push({ from: [x1, y1], to: [x2, y2], points: pts });
}

fs.mkdirSync('captured/line6000', { recursive: true });
fs.writeFileSync('captured/line6000/golden.json', JSON.stringify({
  source: 'the renderer at $6DD5, called directly from the flight snapshot',
  note: 'endpoints are the renderer\'s own 8-bit coordinates; $6DD5 maps x to x + 70 and y to 96 - y',
  cases: results,
}) + String.fromCharCode(10));
console.log('\nwrote captured/line6000/golden.json');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
