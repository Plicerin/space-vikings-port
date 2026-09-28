// Derive the projection by asking the original renderer where a single point goes.
//
// The transform inside $6000 has not been read out of the disassembly, but it does not have
// to be: the replay harness will render any state on demand, so the renderer can be asked
// directly. Replace the model at $7879 with one vertex and it answers with one pixel.
//
// The synthetic model is `04 01` - the state DEBRIS uses, whose records are all opcode 0,
// points - then a single opcode-0 record, then $7F to end it.
import { openOracle } from './a2.mjs';
import { decodeHgr, HGR_W, HGR_H } from './hgr.mjs';
import fs from 'fs';

const TRAP = 0x0300;
const PAGE2_LO = 0x4000, PAGE2_HI = 0x6000;
const MODEL = 0x7879;

const meta = JSON.parse(fs.readFileSync('captured/snapshot/flight.json', 'utf8'));
const b64 = fs.readFileSync('captured/snapshot/flight.bin').toString('base64');
const ram = fs.readFileSync('captured/snapshot/flight.bin');
const s16 = (a) => { const v = ram[a] | (ram[a + 1] << 8); return v > 32767 ? v - 65536 : v; };
const CAM = { x: s16(0x731b), y: s16(0x731d), z: s16(0x731f) };
console.log(`camera in the snapshot: X=${CAM.x} Y=${CAM.y} Z=${CAM.z}, ` +
  `pitch=${ram[0x7321]} bank=${ram[0x7322]} heading=${ram[0x7323]}\n`);

const a2 = await openOracle();
await a2.ev(`(() => { window.M.a2.reset(); return 'reset'; })()`);
await a2.frames(10);

const lo = (v) => v & 0xff, hi = (v) => (v >> 8) & 0xff;

/**
 * Render with a model of my choosing, and return the page-2 bits.
 * `model` is a byte array written at $7879; null leaves the real ship in place.
 */
async function render({ model, heading = null, pitch = null, camZ = null }) {
  return JSON.parse(await a2.ev(`(() => {
    const M = window.M, cpu = M.cpu, mach = M.a2;
    const s = atob(${JSON.stringify(b64)});
    for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
    cpu.read(0xC050); cpu.read(0xC052); cpu.read(0xC054); cpu.read(0xC057);
    ${model ? `const m = [${model.join(',')}]; for (let i = 0; i < m.length; i++) cpu.write(${MODEL} + i, m[i]);` : ''}
    ${heading !== null ? `cpu.write(0x7323, ${heading & 0xff});` : ''}
    ${pitch !== null ? `cpu.write(0x7321, ${pitch & 0xff});` : ''}
    ${camZ !== null ? `cpu.write(0x731F, ${lo(camZ)}); cpu.write(0x7320, ${hi(camZ)});` : ''}
    for (let a = ${PAGE2_LO}; a < ${PAGE2_HI}; a++) cpu.write(a, 0);
    const st = cpu.getState();
    st.a = ${meta.cpu.a}; st.x = ${meta.cpu.x}; st.y = ${meta.cpu.y};
    st.s = ${meta.cpu.s}; st.sp = ${meta.cpu.sp}; st.pc = ${meta.pc};
    cpu.setState(st);
    const sp = st.sp;
    cpu.write(0x0100 + ((sp + 1) & 0xff), ${(TRAP - 1) & 0xff});
    cpu.write(0x0100 + ((sp + 2) & 0xff), ${(TRAP - 1) >> 8});
    cpu.write(${TRAP}, 0x4C); cpu.write(${TRAP + 1}, ${TRAP & 0xff}); cpu.write(${TRAP + 2}, ${TRAP >> 8});
    let steps = 0, cyc = 0;
    while (cpu.getPC() !== ${TRAP} && steps < 4000000) {
      const b = cpu.getCycles();
      cpu.stepCycles(1);
      steps++;
      cyc += cpu.getCycles() - b;
      if (cyc >= M.FRAME_CYCLES) {
        cyc = 0;
        const mmu = mach.getMMU && mach.getMMU();
        if (mmu && mmu.resetVB) mmu.resetVB();
        const io = mach.getIO();
        if (io && io.tick) io.tick();
        if (mach.tick) mach.tick();
      }
    }
    let out = '';
    for (let a = ${PAGE2_LO}; a < ${PAGE2_HI}; a++) out += String.fromCharCode(cpu.read(a));
    return JSON.stringify({ steps, returned: cpu.getPC() === ${TRAP}, page: btoa(out) });
  })()`));
}

const bits = (p) => decodeHgr(Buffer.from(p, 'base64'));
const point = (x, y, z) => [0x04, 0x01, 0x00, lo(x), hi(x), lo(y), hi(y), lo(z), hi(z), 0x7f];

// The scene without any model, for each camera it is asked about. It has to be per camera:
// moving the camera moves the planet too, so a baseline taken at one heading subtracts
// nothing useful at another - it leaves the whole scene behind as false 'new' pixels.
const baseCache = new Map();
async function baseline(opts) {
  const key = `${opts.heading ?? ''}/${opts.pitch ?? ''}/${opts.camZ ?? ''}`;
  if (!baseCache.has(key)) baseCache.set(key, bits((await render({ model: [0x7f], ...opts })).page));
  return baseCache.get(key);
}

/** Where does one world point land? Returns the centroid of the pixels it adds. */
async function where(p, opts = {}) {
  const base = await baseline(opts);
  const on = bits((await render({ model: point(p.x, p.y, p.z), ...opts })).page);
  let n = 0, sx = 0, sy = 0, minX = HGR_W, maxX = -1, minY = HGR_H, maxY = -1;
  for (let y = 0; y < HGR_H; y++) for (let x = 0; x < HGR_W; x++) {
    const i = y * HGR_W + x;
    if (!on[i] || base[i]) continue;
    n++; sx += x; sy += y;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return n ? { n, x: sx / n, y: sy / n, minX, maxX, minY, maxY } : null;
}

console.log('One point, swept through the world.');
console.log('');
console.log('  sweep   world (x, y, z)       heading pitch   px   screen (x, y)');
const obs = [];
const CENTRE = { x: 400, y: -100, z: -3500 };

const jobs = [];
// x at a fixed depth, then y, then depth - each wide enough to separate the terms
for (const dx of [-900, -750, -600, -450, -300, -150, 0, 150, 300, 450, 600])
  jobs.push({ sweep: 'x', p: { x: 700 + dx, y: CENTRE.y, z: CENTRE.z } });
for (const dy of [-500, -400, -300, -200, -100, 0, 100, 200, 300])
  jobs.push({ sweep: 'y', p: { x: CENTRE.x, y: 200 + dy, z: CENTRE.z } });
for (const dz of [1200, 1500, 1900, 2400, 2901, 3400, 4000, 4800, 5600])
  jobs.push({ sweep: 'z', p: { x: CENTRE.x, y: CENTRE.y, z: -6401 + dz } });
// and the camera angles, with the point held still
for (const heading of [252, 254, 0, 2, 4, 6, 8])
  jobs.push({ sweep: 'heading', p: CENTRE, heading });
for (const pitch of [252, 254, 0, 2, 4, 6])
  jobs.push({ sweep: 'pitch', p: CENTRE, pitch });

// Large angles, with the point placed so the rotation brings it back into view. If the
// model is right these should all land in about the same place; if the renderer's own
// broken trig is what it uses, real sines will miss here and not at small angles.
const R = (h) => { const a = (h / 256) * 2 * Math.PI; return { c: Math.cos(a), s: Math.sin(a) }; };
for (const heading of [16, 32, 48, 64, 96, 128, 160, 192, 224]) {
  // inverse of the fitted yaw, applied to a target of (-300, -300, 2901)
  const { c, s } = R(heading);
  const tx = -300, tz = 2901;
  const dx = tx * c + tz * s, dz = -tx * s + tz * c;
  jobs.push({ sweep: 'wide-h', p: { x: Math.round(700 + dx), y: 100, z: Math.round(-6401 + dz) }, heading });
}
// heading and pitch together, to tell the rotation order apart
for (const [heading, pitch] of [[16, 8], [32, 8], [16, 248], [48, 250], [64, 6]]) {
  const { c, s } = R(heading);
  const tx = -300, tz = 2901;
  const dx = tx * c + tz * s, dz = -tx * s + tz * c;
  jobs.push({ sweep: 'h+p', p: { x: Math.round(700 + dx), y: 100, z: Math.round(-6401 + dz) }, heading, pitch });
}

// Large pitch. The wide sweep above varies heading all the way round, but pitch was never
// taken past 8 - and the ground wireframe on approach is drawn at pitches well beyond that.
// Same trick: place the point so the rotation should bring it back to the middle.
const RP = (p) => { const a = (p / 256) * 2 * Math.PI; return { c: Math.cos(a), s: Math.sin(a) }; };
for (const pitch of [12, 16, 24, 32, 40, 48, 244, 236, 224, 216]) {
  // inverse of the fitted pitch (sign -1), applied to a target of (-300, -300, 2901)
  const { c, s } = RP(pitch);
  const ty = -300, tz = 2901;
  const dy = ty * c - tz * s, dz = ty * s + tz * c;
  jobs.push({ sweep: 'wide-p', p: { x: 400, y: Math.round(200 + dy), z: Math.round(-6401 + dz) }, pitch });
}


for (const j of jobs) {
  const opts = {};
  if (j.heading !== undefined) opts.heading = j.heading;
  if (j.pitch !== undefined) opts.pitch = j.pitch;
  const r = await where(j.p, opts);
  console.log('  ' + j.sweep.padEnd(7) + ' (' + String(j.p.x).padStart(5) + ', ' + String(j.p.y).padStart(5) +
    ', ' + String(j.p.z).padStart(6) + ')  ' +
    String(j.heading === undefined ? ram[0x7323] : j.heading).padStart(7) + ' ' +
    String(j.pitch === undefined ? ram[0x7321] : j.pitch).padStart(5) + '  ' +
    (r ? String(r.n).padStart(3) + '   (' + r.x.toFixed(1).padStart(6) + ', ' + r.y.toFixed(1).padStart(6) + ')'
       : '  0   (not drawn)'));
  if (r) obs.push({ sweep: j.sweep, p: j.p,
    heading: j.heading === undefined ? ram[0x7323] : j.heading,
    pitch: j.pitch === undefined ? ram[0x7321] : j.pitch,
    sx: r.x, sy: r.y, n: r.n });
}

fs.writeFileSync('captured/projection.json', JSON.stringify({ camera: CAM, observations: obs }, null, 2) + '\n');
console.log(`\n${obs.length} of ${jobs.length} points were drawn; wrote captured/projection.json`);
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
