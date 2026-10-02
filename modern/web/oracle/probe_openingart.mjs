// The opening sequence - START lines 1000-1029, 8000-9090 and the DATA at 10000-10140.
//
// There are two openings on this disk and only the first was ever ported. Line 40's GOSUB 7500
// is the asterisk card, which the port has. This is the other one: line 80's GOSUB 1000, drawn
// *after* you answer (N)EW or (O)LD, while the game BLOADs its modules.
//
//   1000  HGR2:HGR: HCOLOR=5: X1=80: Y1=40: GOSUB 8000      the grid and the stars
//   1001  VTAB 11: HTAB 12: PRINT "SUBLOGIC PRESENTS:"
//   1010  VTAB 11: HTAB 2:  PRINT "A SIMULATION GAME BY MITCHELL ROBBINS"
//   1020  SPEED=255: Y1=85: X1=140                          then the vector logo
//   8000  stars below the horizon, 8010 stars above
//   8020  horizontal lines from y=100 down, spacing accelerating by C=.4
//   9000  verticals fanning from the horizon to the bottom, plus a centre line
//
// The stars are RND-driven, so a pixel comparison can only ever be about the parts that are
// not: the grid, the text and the logo. This records the whole screen anyway - the port has an
// Applesoft RND and may yet match it - but it also counts the stars by band so the port can be
// checked on the thing that is reproducible about them.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import { decodeHgr, toPng, HGR_W, HGR_H } from './hgr.mjs';
import fs from 'fs';

const disk = openDisk(DISK);
const textOf = (name) => {
  const r = disk.read(disk.files.find((f) => f.name === name));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => `${l.num} ${l.text}`).join('\n');
};
const SIM = textOf('STARSHIP SIMULATOR');

const a2 = await openOracle();
await a2.boot();

const loaded = async () => {
  const bytes = await a2.readRange(0x800, 0x2000);
  const mem = {};
  for (let k = 0; k < bytes.length; k++) mem[0x800 + k] = bytes[k];
  try { return listProgram(mem, 0x801, 0x2000).map((l) => `${l.num} ${l.text}`).join('\n'); }
  catch { return ''; }
};

// Wait for START to be sitting at the (N)EW or (O)LD prompt, then answer.
console.log('booting to the title card...');
for (let i = 0; i < 400; i++) {
  await a2.frames(20);
  if ((await a2.screen()).some((l) => l.includes('(N)EW GAME'))) break;
}
console.log('answering N, and watching page 1 while it loads\n');
await a2.key('N');

/**
 * Poll the hi-res page and keep every distinct picture.
 *
 * The opening lives for as long as the BLOADs take, which is several seconds of emulated disk,
 * and then STARSHIP SIMULATOR takes the screen. So: sample until the simulator is in memory.
 */
const seen = new Map();
const order = [];
let sawSim = false;
for (let i = 0; i < 1100; i++) {
  const page = await a2.readRange(0x2000, 0x4000);
  let h = 0;
  for (let k = 0; k < page.length; k += 7) h = (h * 31 + page[k]) | 0;
  if (!seen.has(h)) {
    const lit = decodeHgr(page).reduce((n, v) => n + (v ? 1 : 0), 0);
    seen.set(h, { frame: i, lit, page: Uint8Array.from(page) });
    order.push(h);
  }
  if ((await loaded()) === SIM) { sawSim = true; break; }
  await a2.frames(8);
}
console.log(`${order.length} distinct pictures${sawSim ? ', then the simulator took over' : ''}`);

fs.mkdirSync('captured/openingart', { recursive: true });

/**
 * When each stage of the sequence appears.
 *
 * Each sample advances the machine by 8 frames, so a sample index is `i * 8 / 60` seconds of
 * emulated time from the moment N was pressed. The three stages - the grid under
 * `SUBLOGIC PRESENTS:`, the credit line, and the logo - are told apart by where the lit pixels
 * are: the text sits on rows 80-95, the logo on rows 130-190 above the horizon.
 */
const steps = order.map((h, i) => {
  const r = seen.get(h);
  const px = decodeHgr(r.page);
  const band = (y0, y1) => {
    let n = 0;
    for (let y = y0; y <= y1; y++) for (let x = 0; x < HGR_W; x++) if (px[y * HGR_W + x]) n++;
    return n;
  };
  return {
    step: i,
    sample: r.frame,
    seconds: +((r.frame * 8) / 60).toFixed(2),
    lit: r.lit,
    textBand: band(80, 95),
    logoBand: band(60, 99),
  };
});
const last = steps[steps.length - 1];
console.log('');
console.log(`the sequence runs for ${last.seconds}s of emulated time, in ${steps.length} pictures`);

/** The fullest picture, which is the finished opening. */
let best = null;
for (const h of order) {
  const r = seen.get(h);
  if (!best || r.lit > best.lit) best = r;
}
if (!best) { await a2.close(); throw new Error('nothing drawn'); }

const px = decodeHgr(best.page);
fs.writeFileSync('captured/openingart/disk.png', toPng(px));
console.log(`fullest picture: ${best.lit} lit pixels, at sample ${best.frame}`);

/**
 * The parts that are not random, measured so the port can be held to them.
 *
 * The grid is the thing to pin: a horizon row, then horizontal lines whose spacing grows, and
 * verticals that fan out from the middle. Counting lit pixels per row finds the horizontals -
 * a drawn line fills nearly the whole width - and the rest is star and vector noise.
 */
const rowCounts = [];
for (let y = 0; y < HGR_H; y++) {
  let n = 0;
  for (let x = 0; x < HGR_W; x++) if (px[y * HGR_W + x]) n++;
  rowCounts.push(n);
}
const horizontals = rowCounts
  .map((n, y) => ({ y, n }))
  // HCOLOR 1 lights alternate columns, so a full-width line is about half the row.
  .filter((r) => r.n > HGR_W * 0.38)
  .map((r) => r.y);

/** Stars, by the two bands 8000 and 8010 plot into: y 96-176 and y 2-71. */
const bandCount = (y0, y1) => {
  let n = 0;
  for (let y = y0; y <= y1; y++) for (let x = 0; x < HGR_W; x++) if (px[y * HGR_W + x]) n++;
  return n;
};

console.log('');
console.log('horizontal grid lines, by row:');
console.log(`  ${horizontals.join(', ')}`);
const gaps = horizontals.slice(1).map((v, i) => v - horizontals[i]);
console.log(`  gaps: ${gaps.join(', ')}`);
console.log('');
console.log(`lit pixels above the horizon (y 0-99):  ${bandCount(0, 99)}`);
console.log(`lit pixels below the horizon (y 100-191): ${bandCount(100, 191)}`);

// The text, read off the machine's own text screen, so the port's strings can be compared to
// what the disk actually prints rather than to the listing.
const textLines = (await a2.screen()).map((l) => l.trimEnd()).filter((l) => l.trim());

fs.writeFileSync('captured/openingart/golden.json', JSON.stringify({
  source: 'START 1000-1029 and 8000-9090 on the machine, answered N and sampled until the '
    + 'simulator loaded',
  distinctPictures: order.length,
  fullest: { lit: best.lit, sample: best.frame },
  steps,
  horizontals,
  horizontalGaps: gaps,
  litAboveHorizon: bandCount(0, 99),
  litBelowHorizon: bandCount(100, 191),
  rowCounts,
  textAtEnd: textLines,
}, null, 1) + String.fromCharCode(10));

// Every distinct picture, so the order of the sequence can be read off later.
order.forEach((h, i) => {
  const r = seen.get(h);
  fs.writeFileSync(`captured/openingart/step-${String(i).padStart(2, '0')}.png`,
    toPng(decodeHgr(r.page)));
});

console.log('');
console.log(`wrote captured/openingart/disk.png, golden.json and ${order.length} steps`);
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
