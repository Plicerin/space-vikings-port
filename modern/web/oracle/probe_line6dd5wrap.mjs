// The one endpoint pair where the port's line and $6DD5's disagree.
//
// `line6dd5_parity.mjs` sweeps 370 pairs. 369 come out identical, and of the 366 that `$68A1`
// can actually produce, all 366 do. The one left is `[68,96] -> [82,110]`, where the disk lights
// 26 pixels, the port 27, and **none of them are shared** - not a near miss but a different line
// altogether.
//
// It is unreachable: `$691E` clamps x to +/-69 and y to +/-62 before `$68A1` adds its offsets,
// so nothing the renderer produces has sx 82 or sy 110. The sweep made it up. That is a reason
// to leave it alone, not a reason not to understand it, and a pair that is off the page in both
// coordinates at once is the only place the address arithmetic is exercised that far out.
//
// `$6DD5` maps with `x + 70` and `95 - y`, so this pair is rows 255 and 241 - far past the 24
// entries of the row table at `$6B92` - and columns 138 and 152, and 152 is past the 140 the
// half-column tables hold. Both indexes run off the end at once.
//
// This records the bytes of page 2 before and after, so the addresses the machine actually
// touches can be compared with the port's instead of only the pixels.
import { openOracle } from './a2.mjs';
import fs from 'fs';

const meta = JSON.parse(fs.readFileSync('captured/snapshot/flight.json', 'utf8'));
const b64 = fs.readFileSync('captured/snapshot/flight.bin').toString('base64');

const PAIRS = [
  { label: 'the one that differs', a: [68, 96], b: [82, 110] },
  { label: 'the same line, in reach', a: [68, 96], b: [69, 96] },
  { label: 'off the bottom, x in reach', a: [0, 34], b: [0, 96] },
  // and three the renderer really can ask for, which the sweep below finds leaking
  { label: 'reachable, leaks', a: [0, 34], b: [-69, 96] },
  { label: 'reachable, leaks', a: [30, 60], b: [0, 96] },
  { label: 'reachable, leaks', a: [-40, -28], b: [-69, 96] },
];

const a2 = await openOracle();
await a2.ev(`(() => { window.M.a2.reset(); return 'reset'; })()`);
await a2.frames(10);

const run = async (ax, ay, bx, by) => JSON.parse(await a2.ev(`(() => {
  const cpu = window.M.cpu;
  const s = atob(${JSON.stringify(b64)});
  for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
  cpu.read(0xC050); cpu.read(0xC052); cpu.read(0xC054); cpu.read(0xC057);
  // a clean page 2 to draw on, and a snapshot of everything else so a store that lands
  // outside the page is seen rather than missed. The first run of this only scanned
  // $4000-$5FFF and reported "0 bytes written" for a line whose stores went elsewhere.
  for (let a = 0x4000; a < 0x6000; a++) cpu.write(a, 0);
  const LO = 0x0800, HI = 0xC000;
  const snap = new Uint8Array(HI - LO);
  for (let a = LO; a < HI; a++) snap[a - LO] = cpu.read(a);
  // $6DD5 takes the two points as $B3/$B4 and $B5/$B6, in $68A1's own units
  cpu.write(0xB3, ${ax} & 0xff); cpu.write(0xB4, ${ay} & 0xff);
  cpu.write(0xB5, ${bx} & 0xff); cpu.write(0xB6, ${by} & 0xff);
  // call it with a return address that lands on a JMP-to-self, so stepping stops on return
  const TRAP = 0x0300;
  cpu.write(TRAP, 0x4C); cpu.write(TRAP + 1, 0x00); cpu.write(TRAP + 2, 0x03);
  const P = 0x0310;
  cpu.write(P, 0x20); cpu.write(P + 1, 0xD5); cpu.write(P + 2, 0x6D);   // JSR $6DD5
  cpu.write(P + 3, 0x4C); cpu.write(P + 4, 0x00); cpu.write(P + 5, 0x03);
  const st = cpu.getState();
  st.pc = P; st.sp = 0xF0;
  cpu.setState(st);
  let steps = 0;
  while (cpu.getPC() !== TRAP && steps < 4000000) { cpu.stepCycles(1); steps++; }
  const touched = [];
  for (let a = LO; a < HI; a++) {
    const v = cpu.read(a);
    if (v !== snap[a - LO]) touched.push([a, v]);
  }
  return JSON.stringify({ ran: cpu.getPC() === TRAP, steps, touched,
    zp: { a: cpu.read(0x99), b: cpu.read(0x9A) } });
})()`));

const out = [];
for (const p of PAIRS) {
  const r = await run(p.a[0], p.a[1], p.b[0], p.b[1]);
  // $6DD5's own mapping, so the rows and columns it is really working in are visible
  const row = (y) => (95 - y) & 0xff;
  const col = (x) => (x + 70) & 0xff;
  console.log('');
  console.log(`${p.label}: [${p.a}] -> [${p.b}]`);
  console.log(`  which is columns ${col(p.a[0])} and ${col(p.b[0])}, rows ${row(p.a[1])} and ${row(p.b[1])}` +
    `  (the tables hold 140 columns and 24 rows)`);
  console.log(`  ${r.ran ? r.steps + ' instructions' : 'DID NOT RETURN'}, ${r.touched.length} byte(s) written`);
  const addrs = r.touched.map(([a]) => a);
  if (addrs.length) {
    const lo = Math.min(...addrs);
    const hi = Math.max(...addrs);
    const inPage2 = addrs.filter((a) => a >= 0x4000 && a < 0x6000).length;
    console.log(`  addresses $${lo.toString(16).toUpperCase()}..$${hi.toString(16).toUpperCase()}` +
      `   ${inPage2} inside page 2, ${addrs.length - inPage2} outside it`);
    console.log('  ' + r.touched.slice(0, 14)
      .map(([a, v]) => `$${a.toString(16).toUpperCase()}=${v.toString(2).padStart(8, '0')}`).join(' '));
    if (r.touched.length > 14) console.log(`  ...and ${r.touched.length - 14} more`);
  }
  out.push({ ...p, ...r });
}

// ---- and the bound that makes the port's single page legitimate ------------------------------
//
// The port's `Hires` holds one page. That is only defensible if no line the renderer can
// actually ask for ever stores outside it, which has been an assumption. This sweeps the same
// 370 endpoint pairs `probe_line6dd5.mjs` uses and, for each, checks whether anything landed in
// hi-res page 1 - the page being displayed while the renderer draws into page 2.
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

/** What $691E can hand $68A1: x clamped to +/-69, y to +/-62, before the offsets. */
const reachable = (x, y) => x >= -69 && x <= 69 && y >= -28 && y <= 96;

console.log('');
console.log(`sweeping ${pairs.length} pairs for stores outside page 2...`);
const sweep = JSON.parse(await a2.ev(`(() => {
  const cpu = window.M.cpu;
  const s = atob(${JSON.stringify(b64)});
  const pairs = ${JSON.stringify(pairs)};
  const out = [];
  for (const [ax, ay, bx, by] of pairs) {
    for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
    cpu.read(0xC050); cpu.read(0xC052); cpu.read(0xC054); cpu.read(0xC057);
    for (let a = 0x4000; a < 0x6000; a++) cpu.write(a, 0);
    // a cheap fingerprint of page 1, which nothing should touch
    let before = 0;
    for (let a = 0x2000; a < 0x4000; a++) before = (before + cpu.read(a) * (a & 31)) | 0;
    cpu.write(0xB3, ax & 0xff); cpu.write(0xB4, ay & 0xff);
    cpu.write(0xB5, bx & 0xff); cpu.write(0xB6, by & 0xff);
    const TRAP = 0x0300;
    cpu.write(TRAP, 0x4C); cpu.write(TRAP + 1, 0x00); cpu.write(TRAP + 2, 0x03);
    const P = 0x0310;
    cpu.write(P, 0x20); cpu.write(P + 1, 0xD5); cpu.write(P + 2, 0x6D);
    cpu.write(P + 3, 0x4C); cpu.write(P + 4, 0x00); cpu.write(P + 5, 0x03);
    const st = cpu.getState();
    st.pc = P; st.sp = 0xF0;
    cpu.setState(st);
    let steps = 0;
    while (cpu.getPC() !== TRAP && steps < 4000000) { cpu.stepCycles(1); steps++; }
    let after = 0;
    for (let a = 0x2000; a < 0x4000; a++) after = (after + cpu.read(a) * (a & 31)) | 0;
    out.push({ ax, ay, bx, by, leaked: before !== after });
  }
  return JSON.stringify({ out });
})()`));

const leaks = sweep.out.filter((r) => r.leaked);
const reachableLeaks = leaks.filter((r) => reachable(r.ax, r.ay) && reachable(r.bx, r.by));
console.log(`  ${leaks.length} of ${pairs.length} pairs wrote into page 1`);
console.log(`  of those, ${reachableLeaks.length} are pairs $68A1 can produce`);
for (const r of leaks.slice(0, 8)) {
  console.log(`    [${r.ax},${r.ay}] -> [${r.bx},${r.by}]` +
    `${reachable(r.ax, r.ay) && reachable(r.bx, r.by) ? '   REACHABLE' : '   (out of reach)'}`);
}
console.log('');
console.log(reachableLeaks.length === 0
  ? '  nothing the renderer can ask for leaves page 2, so one page is all the port needs'
  : '  a reachable line leaves page 2 - the port needs both pages');

await a2.close();
fs.mkdirSync('captured/line6dd5wrap', { recursive: true });
fs.writeFileSync('captured/line6dd5wrap/golden.json', JSON.stringify({
  source: '$6DD5 called directly on three endpoint pairs, with every non-zero byte of page 2 after',
  pairs: out, sweep: sweep.out, leaks, reachableLeaks,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/line6dd5wrap/golden.json');
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
