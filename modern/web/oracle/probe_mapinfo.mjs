// What answering Y on the galaxy map actually puts on the screen.
//
// `3260 PRINT "DO YOU WISH FURTHER INFORMATION?";: GET AN$:
//  IF AN$ = "Y" THEN POKE 38388,P: POKE 38149,8: PRINT " ": PRINT "^DRUN COM"`
//
// Unlike 3125, which goes out through INSTRUMENTS and lets it repaint the bottom of the
// screen, this runs COM directly. COM therefore prints into the text window GALAXY MAP left
// behind - 3000's `POKE 34,19: POKE 35,23` - and the port shows `READY` landing on top of the
// map's own caption, reading `READYGALAXY MAP`, with the star readout still underneath.
//
// That is what an inherited window should do and it is the same reasoning that explained the
// caption surviving on the other path, but it had never been captured, so it was recorded as
// plausible rather than checked. This checks it.
//
// Getting there is `probe_mappick.mjs`'s route: the paddle cursor onto a star drawn at
// `X(P) * 10 - 35, Y(P) * 5`, the paddle button, and then Y.
import { openOracle, VAR_READER } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import { decodeHgr, toPng, HGR_W, HGR_H } from './hgr.mjs';
import fs from 'fs';

const XS = 38366, YS = 38345, ZS = 38324;   // 3020: X(P) = PEEK(38366 + P), and so on
const HERE = 38209, INFO_PLANET = 38388;

const disk = openDisk(DISK);
const textOf = (name) => {
  const r = disk.read(disk.files.find((f) => f.name === name));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => l.num + ' ' + l.text).join('\n');
};
const PROGRAMS = ['STARSHIP SIMULATOR', 'COM', 'GALAXY MAP'];
const TEXTS = Object.fromEntries(PROGRAMS.map((n) => [n, textOf(n)]));

const a2 = await openOracle();
await a2.boot();
await a2.key('N');
await a2.ev(VAR_READER);
const which = async () => {
  const b = await a2.readRange(0x800, 0x2000);
  const m = {};
  for (let k = 0; k < b.length; k++) m[0x800 + k] = b[k];
  let t = '';
  try { t = listProgram(m, 0x801, 0x2000).map((l) => l.num + ' ' + l.text).join('\n'); } catch { /* mid-load */ }
  for (const n of PROGRAMS) if (TEXTS[n] === t) return n;
  return '(other)';
};
const settleOn = async (want, tries = 900) => {
  let stable = 0;
  for (let i = 0; i < tries; i++) {
    await a2.frames(10);
    if ((await which()) === want) { if (++stable >= 14) return true; } else stable = 0;
  }
  return false;
};
const settlePage = async () => {
  let prev = '', still = 0;
  for (let i = 0; i < 400; i++) {
    await a2.frames(10);
    const h = await a2.ev('window.M.hash(0x2000, 0x4000)');
    if (h === prev) { if (++still >= 12) break; } else still = 0;
    prev = h;
  }
  return decodeHgr(await a2.readRange(0x2000, 0x4000));
};
const pts = (p) => {
  const out = [];
  for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) if (p[y * HGR_W + x]) out.push([x, y]);
  return out;
};

console.log('waiting for STARSHIP SIMULATOR...');
if (!await settleOn('STARSHIP SIMULATOR')) { await a2.close(); throw new Error('no simulator'); }
await a2.frames(300);
await a2.key('C', { holdFrames: 40, afterFrames: 20 });
if (!await settleOn('COM')) { await a2.close(); throw new Error('COM never started'); }
await a2.key('1', { holdFrames: 40, afterFrames: 20 });
for (let i = 0; i < 40; i++) await a2.frames(10);
await a2.key('3', { holdFrames: 40, afterFrames: 20 });
if (!await settleOn('GALAXY MAP')) { await a2.close(); throw new Error('the map never came up'); }
for (let i = 0; i < 40; i++) await a2.frames(10);

const xs = await a2.readRange(XS + 1, XS + 21);
const ys = await a2.readRange(YS + 1, YS + 21);
const zs = await a2.readRange(ZS + 1, ZS + 21);
const here = (await a2.readRange(HERE, HERE + 1))[0];

// 3060 and 3065 draw star P at `X(P) * 10 - 35, Y(P) * 5`, and 3215 adds the 35 back before
// the test, so where it is drawn is where it is hit.
let pick = 0;
for (let p = 1; p <= 20; p++) {
  const px = xs[p - 1] * 10 - 35;
  const py = ys[p - 1] * 5;
  if (p !== here && px >= 12 && px <= 268 && py >= 12 && py <= 143) { pick = p; break; }
}
if (!pick) { await a2.close(); throw new Error('no reachable star'); }
const px = xs[pick - 1] * 10 - 35;
const py = ys[pick - 1] * 5;
console.log(`  here is planet ${here}; aiming at ${pick} at PX ${px}, PY ${py}`);

await a2.ev(`(() => { const io = window.M.a2.getIO(); io.paddle(0, ${Math.round(px / 1.19)} / 255); `
  + `io.paddle(1, ${py} / 255); return 'set'; })()`);
for (let i = 0; i < 40; i++) await a2.frames(10);
await a2.ev('(() => { window.M.a2.getIO().buttonDown(0); return 1; })()');
for (let i = 0; i < 30; i++) await a2.frames(10);
await a2.ev('(() => { window.M.a2.getIO().buttonUp(0); return 1; })()');

const readoutPage = await settlePage();
console.log(`  the readout is up: ${pts(readoutPage).length} lit`);

// 3260's GET, and the Y that runs COM.
await a2.key('Y', { holdFrames: 40, afterFrames: 20 });
if (!await settleOn('COM')) { await a2.close(); throw new Error('COM never started after Y'); }
const infoPage = await settlePage();
const infoPlanet = (await a2.readRange(INFO_PLANET, INFO_PLANET + 1))[0];
console.log(`  COM is up with 38388 = ${infoPlanet}; ${pts(infoPage).length} lit`);

// The band the map's caption used, so the overlap can be stated as a number.
const bandLit = (p, from, to) => {
  let n = 0;
  for (let y = from; y <= to; y++) for (let x = 0; x < HGR_W; x++) if (p[y * HGR_W + x]) n++;
  return n;
};
console.log(`  rows 152-191: readout page ${bandLit(readoutPage, 152, 191)} lit, `
  + `COM page ${bandLit(infoPage, 152, 191)}`);
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();

fs.mkdirSync('captured/mapinfo', { recursive: true });
fs.writeFileSync('captured/mapinfo/readout.png', toPng(readoutPage));
fs.writeFileSync('captured/mapinfo/info.png', toPng(infoPage));
fs.writeFileSync('captured/mapinfo/golden.json', JSON.stringify({
  source: "the galaxy map's Y answer on the machine, which runs COM without going through INSTRUMENTS",
  here, pick, px, py, infoPlanet,
  readout: { lit: pts(readoutPage).length, points: pts(readoutPage) },
  info: { lit: pts(infoPage).length, points: pts(infoPage) },
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/mapinfo/golden.json, readout.png and info.png');
