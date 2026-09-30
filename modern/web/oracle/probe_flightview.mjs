// The flight view, with the camera that drew it.
//
// This is the one screen nothing compares. `transition_parity.mjs` reports it and moves on -
// disk 3,697 lit, port 3,577, 404 differing - because it never repeats and the two machines are
// not at the same point in the same flight. But that is a reason not to compare **two live
// runs**, not a reason not to compare the drawing: capture the page and the camera that drew it
// together, and the port can be asked for the same frame.
//
// The camera is line 8's own cells - XI, YI, ZI at 29467, 29469, 29471 - and the three
// orientation bytes line 20 reads, P1, B1 and H1 at 29473, 29474 and 29475. All six are what
// `CALL CA` projects through.
//
// The ship model matters as much as the stars. `CALL CA` walks one display list, the same as
// RADAR's `CALL 24576`: PLANET # 0's star table at A29440 and SHIP # n at A30841. That is what
// the radar's missing sixteen pixels turned out to be, and the flight view has the same shape of
// difference - the disk's capture has a ship in the middle of the star ball and the port's does
// not.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import { decodeHgr, toPng, HGR_W, HGR_H } from './hgr.mjs';
import fs from 'fs';

const XI = 29467, YI = 29469, ZI = 29471, P1 = 29473, B1 = 29474, H1 = 29475;
const SHIP_KIND = 38205;

const disk = openDisk(DISK);
const simText = (() => {
  const r = disk.read(disk.files.find((f) => f.name === 'STARSHIP SIMULATOR'));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => `${l.num} ${l.text}`).join('\n');
})();

const a2 = await openOracle();
await a2.boot();
await a2.key('N');
const inSim = async () => {
  const b = await a2.readRange(0x800, 0x2000);
  const m = {};
  for (let k = 0; k < b.length; k++) m[0x800 + k] = b[k];
  try { return listProgram(m, 0x801, 0x2000).map((l) => `${l.num} ${l.text}`).join('\n') === simText; }
  catch { return false; }
};
console.log('waiting for STARSHIP SIMULATOR...');
let ok = false;
for (let i = 0; i < 900; i++) { await a2.frames(20); if (await inSim()) { ok = true; break; } }
if (!ok) { await a2.close(); throw new Error('the simulator never started'); }
await a2.frames(300);

/** Line 6600: a high byte of 129 or more is negative. */
const signed = (lo, hi) => (hi < 129 ? hi * 256 + lo : (hi - 255) * 256 + (lo - 256));

// Stop where the frame is finished and the page is not being written: line 156 comes right
// after 155's readouts and before 159 starts erasing the needles, so the picture is whole.
// Step in thousand-cycle pieces so the stop is exact rather than a frame wide.
const stopped = await a2.ev(`(() => {
  const cpu = window.M.cpu;
  for (let i = 0; i < 60000; i++) {
    if (((cpu.read(0x75) | (cpu.read(0x76) << 8))) === 156) return 'at 156';
    cpu.stepCycles(1000);
  }
  return 'timeout';
})()`);
if (stopped !== 'at 156') { await a2.close(); throw new Error('the simulator never reached line 156'); }

const b = await a2.readRange(XI, H1 + 1);
const cam = {
  x: signed(b[XI - XI], b[XI - XI + 1]),
  y: signed(b[YI - XI], b[YI - XI + 1]),
  z: signed(b[ZI - XI], b[ZI - XI + 1]),
  pitch: b[P1 - XI], bank: b[B1 - XI], heading: b[H1 - XI],
};
const shipKind = (await a2.readRange(SHIP_KIND, SHIP_KIND + 1))[0];
const page = decodeHgr(await a2.readRange(0x2000, 0x4000));
console.log(`  camera x ${cam.x} y ${cam.y} z ${cam.z}, pitch ${cam.pitch} bank ${cam.bank} heading ${cam.heading}`);
console.log(`  ship kind ${shipKind}`);
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();

const points = [];
let view = 0;
for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) {
  if (page[y * HGR_W + x]) { points.push([x, y]); if (y <= 123) view++; }
}
console.log(`  ${points.length} lit, ${view} of them in the view`);

fs.mkdirSync('captured/flightview', { recursive: true });
fs.writeFileSync('captured/flightview/disk.png', toPng(page));
fs.writeFileSync('captured/flightview/golden.json', JSON.stringify({
  source: 'the flight view on the machine, stopped at line 156, with the camera cells that drew it',
  camera: cam, shipKind, lit: points.length, viewLit: view, points,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/flightview/golden.json and disk.png');
