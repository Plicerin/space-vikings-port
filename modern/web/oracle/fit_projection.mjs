// Fit a projection to what the original renderer actually did.
//
// captured/projection.json holds, for 40 states, where the renderer put a single world
// point on screen. This fits
//
//     d  = P - C                       (world point relative to the camera)
//     d' = rotate d by heading, then pitch
//     sx = cx + fx * d'x / d'z
//     sy = cy - fy * d'y / d'z
//
// solving cx/fx and cy/fy by least squares - they enter linearly - and searching the few
// sign and order conventions the rotation could use. Whichever convention leaves the
// smallest residual is the one the renderer uses.
//
// It also fits twice: once with real sin and cos, and once with the machine's own - which
// is wrong outside the first quadrant by up to 1.48% (see "The renderer" in DISK_TRUTH).
// If the original's geometry is built on its own broken trig, the second should fit better.
import fs from 'fs';

const data = JSON.parse(fs.readFileSync('captured/projection.json', 'utf8'));
const C = data.camera;
const CAM_X = C.x, CAM_Y = C.y;
const obs = data.observations;

// The machine's own sine and cosine, measured over all 256 inputs.
const trig = JSON.parse(fs.readFileSync('captured/trig.json', 'utf8')).rows;
const S16 = (v) => (v > 32767 ? v - 65536 : v);
const DISK_SIN = trig.map((r) => S16(r.cos) / 32767);   // $6006 is the sine
const DISK_COS = trig.map((r) => S16(r.sin) / 32767);   // $6009 is the cosine

const REAL = { sin: (b) => Math.sin((b / 256) * 2 * Math.PI), cos: (b) => Math.cos((b / 256) * 2 * Math.PI) };
const DISK = { sin: (b) => DISK_SIN[b & 255], cos: (b) => DISK_COS[b & 255] };

/** Solve s = a + b*u by least squares. */
function lsq(pairs) {
  const n = pairs.length;
  const mu = pairs.reduce((t, p) => t + p[0], 0) / n;
  const ms = pairs.reduce((t, p) => t + p[1], 0) / n;
  let num = 0, den = 0;
  for (const [u, s] of pairs) { num += (u - mu) * (s - ms); den += (u - mu) * (u - mu); }
  const b = den ? num / den : 0;
  const a = ms - b * mu;
  let ss = 0;
  for (const [u, s] of pairs) { const e = s - (a + b * u); ss += e * e; }
  return { a, b, rms: Math.sqrt(ss / n) };
}

function evaluate(T, hs, ps, order) {
  const xs = [], ys = [];
  for (const o of obs) {
    let dx = o.p.x - C.x, dy = o.p.y - C.y, dz = o.p.z - C.z;
    const ah = o.heading & 255, ap = o.pitch & 255;
    const yaw = () => {
      const c = T.cos(ah), s = T.sin(ah) * hs;
      const nx = dx * c - dz * s, nz = dx * s + dz * c;
      dx = nx; dz = nz;
    };
    const pit = () => {
      const c = T.cos(ap), s = T.sin(ap) * ps;
      const ny = dy * c - dz * s, nz = dy * s + dz * c;
      dy = ny; dz = nz;
    };
    if (order === 'yaw-pitch') { yaw(); pit(); } else { pit(); yaw(); }
    if (dz <= 1) return null;                       // behind the camera: not this convention
    xs.push([dx / dz, o.sx]);
    ys.push([dy / dz, o.sy]);
  }
  const fx = lsq(xs), fy = lsq(ys);
  return { fx, fy, rms: Math.sqrt((fx.rms ** 2 + fy.rms ** 2) / 2) };
}

const results = [];
for (const [tn, T] of [['real trig', REAL], ['the disk trig', DISK]]) {
  for (const hs of [1, -1]) for (const ps of [1, -1]) for (const order of ['yaw-pitch', 'pitch-yaw']) {
    const r = evaluate(T, hs, ps, order);
    if (r) results.push({ tn, hs, ps, order, ...r });
  }
}
results.sort((a, b) => a.rms - b.rms);

console.log('conventions, best first:\n');
console.log('  trig           yaw  pitch  order        cx       fx        cy       fy     rms px');
for (const r of results.slice(0, 8)) {
  console.log(`  ${r.tn.padEnd(14)} ${String(r.hs).padStart(3)} ${String(r.ps).padStart(6)}  ${r.order.padEnd(11)} ` +
    `${r.fx.a.toFixed(1).padStart(6)} ${r.fx.b.toFixed(1).padStart(8)}  ${r.fy.a.toFixed(1).padStart(6)} ` +
    `${(-r.fy.b).toFixed(1).padStart(8)} ${r.rms.toFixed(2).padStart(9)}`);
}

const best = results[0];
console.log(`\nbest fit: ${best.tn}, yaw sign ${best.hs}, pitch sign ${best.ps}, ${best.order}`);
console.log(`  sx = ${best.fx.a.toFixed(1)} + ${best.fx.b.toFixed(1)} * dx' / dz'`);
console.log(`  sy = ${best.fy.a.toFixed(1)} - ${(-best.fy.b).toFixed(1)} * dy' / dz'`);
console.log(`  rms residual ${best.rms.toFixed(2)} px  (x ${best.fx.rms.toFixed(2)}, y ${best.fy.rms.toFixed(2)})`);

// Per-observation residuals for the winner, so nothing hides in an average.
const T = best.tn === 'real trig' ? REAL : DISK;
console.log('\n  sweep   heading pitch   screen      predicted     error');
let worst = 0;
for (const o of obs) {
  let dx = o.p.x - C.x, dy = o.p.y - C.y, dz = o.p.z - C.z;
  const ah = o.heading & 255, ap = o.pitch & 255;
  const yaw = () => { const c = T.cos(ah), s = T.sin(ah) * best.hs; const nx = dx * c - dz * s, nz = dx * s + dz * c; dx = nx; dz = nz; };
  const pit = () => { const c = T.cos(ap), s = T.sin(ap) * best.ps; const ny = dy * c - dz * s, nz = dy * s + dz * c; dy = ny; dz = nz; };
  if (best.order === 'yaw-pitch') { yaw(); pit(); } else { pit(); yaw(); }
  const px = best.fx.a + best.fx.b * (dx / dz);
  const py = best.fy.a + best.fy.b * (dy / dz);
  const e = Math.hypot(px - o.sx, py - o.sy);
  worst = Math.max(worst, e);
  console.log(`  ${o.sweep.padEnd(7)} ${String(o.heading).padStart(7)} ${String(o.pitch).padStart(5)}   ` +
    `(${o.sx.toFixed(1).padStart(6)},${o.sy.toFixed(1).padStart(6)})  ` +
    `(${px.toFixed(1).padStart(6)},${py.toFixed(1).padStart(6)})  ${e.toFixed(2).padStart(6)}`);
}
console.log(`\nworst single-point error ${worst.toFixed(2)} px over ${obs.length} observations`);

fs.writeFileSync('captured/projection_fit.json', JSON.stringify({
  camera: C, convention: { trig: best.tn, yawSign: best.hs, pitchSign: best.ps, order: best.order },
  cx: best.fx.a, fx: best.fx.b, cy: best.fy.a, fy: -best.fy.b,
  rms: best.rms, worst,
}, null, 2) + '\n');
console.log('wrote captured/projection_fit.json');

// --- does the trig bug show where it should? ------------------------------------------
// The wide-heading states put the camera all the way round the circle, which is where the
// renderer's own sine is wrong by up to 1.48%. If it used that table, real sines should
// miss there and nowhere else.
const wide = obs.filter((o) => o.sweep === 'wide-h' || o.sweep === 'h+p');
for (const [name, TT] of [['real trig', REAL], ['the disk trig', DISK]]) {
  let ss = 0;
  for (const o of wide) {
    let dx = o.p.x - C.x, dy = o.p.y - C.y, dz = o.p.z - C.z;
    const ch = TT.cos(o.heading & 255), sh = TT.sin(o.heading & 255) * best.hs;
    let nx = dx * ch - dz * sh, nz = dx * sh + dz * ch; dx = nx; dz = nz;
    const cp = TT.cos(o.pitch & 255), sp2 = TT.sin(o.pitch & 255) * best.ps;
    const ny = dy * cp - dz * sp2; nz = dy * sp2 + dz * cp; dy = ny; dz = nz;
    const px = best.fx.a + best.fx.b * (dx / dz), py = best.fy.a + best.fy.b * (dy / dz);
    ss += (px - o.sx) ** 2 + (py - o.sy) ** 2;
  }
  console.log(`  ${name.padEnd(14)} on the ${wide.length} wide-angle states: rms ${Math.sqrt(ss / (2 * wide.length)).toFixed(2)} px`);
}

// --- does it reproduce a whole ship? ----------------------------------------------------
// Single points fitted well; the real test is whether the same formula puts SHIP # 3 where
// the original put it, across the golden set.
const golden = JSON.parse(fs.readFileSync('captured/ship/golden.json', 'utf8'));
const shipBytes = JSON.parse(fs.readFileSync('../public/data/shapes/ship-3-bytecode.json', 'utf8')).bytes;
const verts = [];
for (let i = 0; i < shipBytes.length; ) {
  const op = shipBytes[i];
  if (op === 0x7f) break;
  if (op === 4) { i += 2; continue; }
  if (op > 4) { i += 1; continue; }
  const s = (a) => { const v = shipBytes[a] | (shipBytes[a + 1] << 8); return v > 32767 ? v - 65536 : v; };
  verts.push({ x: s(i + 1), y: s(i + 3), z: s(i + 5) });
  i += 7;
}

const project = (p, cam, heading, pitch) => {
  let dx = p.x - cam.x, dy = p.y - cam.y, dz = p.z - cam.z;
  const ch = T.cos(heading & 255), sh = T.sin(heading & 255) * best.hs;
  let nx = dx * ch - dz * sh, nz = dx * sh + dz * ch; dx = nx; dz = nz;
  const cp = T.cos(pitch & 255), sp2 = T.sin(pitch & 255) * best.ps;
  const ny = dy * cp - dz * sp2; nz = dy * sp2 + dz * cp; dy = ny; dz = nz;
  if (dz <= 1) return null;
  return { x: best.fx.a + best.fx.b * (dx / dz), y: best.fy.a + best.fy.b * (dy / dz) };
};

console.log(`\nprojecting SHIP # 3's ${verts.length} vertices with the fitted formula:\n`);
console.log('  state      disk box                 predicted box            error (px)');
let worstBox = 0, nBox = 0, sumBox = 0;
for (const st of golden.states.filter((s) => s.lit > 0)) {
  const cam = { x: CAM_X, y: CAM_Y, z: st.z };
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, seen = 0;
  for (const v of verts) {
    const q = project(v, cam, st.heading, st.pitch);
    if (!q) continue;
    seen++;
    minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x);
    minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y);
  }
  if (!seen) { console.log(`  ${st.label.padEnd(9)} (nothing projected)`); continue; }
  const e = Math.max(Math.abs(minX - st.bounds.minX), Math.abs(maxX - st.bounds.maxX),
    Math.abs(minY - st.bounds.minY), Math.abs(maxY - st.bounds.maxY));
  worstBox = Math.max(worstBox, e); sumBox += e; nBox++;
  console.log(`  ${st.label.padEnd(9)} x${String(st.bounds.minX).padStart(4)}-${String(st.bounds.maxX).padStart(4)}` +
    ` y${String(st.bounds.minY).padStart(4)}-${String(st.bounds.maxY).padStart(4)}` +
    `       x${minX.toFixed(0).padStart(4)}-${maxX.toFixed(0).padStart(4)} y${minY.toFixed(0).padStart(4)}-${maxY.toFixed(0).padStart(4)}` +
    `       ${e.toFixed(1).padStart(6)}`);
}
console.log(`\nworst bounding-box edge error ${worstBox.toFixed(1)} px, mean ${(sumBox / nBox).toFixed(1)} px, over ${nBox} states`);

// --- emit it for the port ---------------------------------------------------------------
// The clip rectangle, measured by probe_clip.mjs. Optional, so the fit still runs without it.
let clip = null;
try { clip = JSON.parse(fs.readFileSync('captured/clip.json', 'utf8')); } catch { /* not measured yet */ }

const clipTs = clip ? `
/**
 * The view the original clips lines against, measured by oracle/probe_clip.mjs: long lines
 * were drawn through the real renderer and cut at these edges. The panel starts at y 128,
 * so the renderer keeps a few rows of margin above it.
 */
export const CLIP_MIN_X = ${clip.minX};
export const CLIP_MAX_X = ${clip.maxX};
export const CLIP_MIN_Y = ${clip.minY};
export const CLIP_MAX_Y = ${clip.maxY};

const LEFT = 1, RIGHT = 2, BELOW = 4, ABOVE = 8;
const outcode = (x: number, y: number): number =>
  (x < CLIP_MIN_X ? LEFT : x > CLIP_MAX_X ? RIGHT : 0) |
  (y < CLIP_MIN_Y ? ABOVE : y > CLIP_MAX_Y ? BELOW : 0);

/**
 * Cohen-Sutherland, the algorithm the original uses at $61A9-$620F: compute an outcode per
 * endpoint, reject when they share a bit (both outside the same edge), otherwise pull
 * whichever endpoint is outside onto the boundary and try again.
 *
 * Returns null when the segment is wholly outside.
 */
export function clipSegment(
  ax: number, ay: number, bx: number, by: number,
): { ax: number; ay: number; bx: number; by: number } | null {
  let oa = outcode(ax, ay), ob = outcode(bx, by);
  for (let guard = 0; guard < 8; guard++) {
    if (!(oa | ob)) return { ax, ay, bx, by };     // both inside
    if (oa & ob) return null;                      // both outside the same edge
    const out = oa || ob;
    let x = 0, y = 0;
    if (out & BELOW) { x = ax + (bx - ax) * (CLIP_MAX_Y - ay) / (by - ay); y = CLIP_MAX_Y; }
    else if (out & ABOVE) { x = ax + (bx - ax) * (CLIP_MIN_Y - ay) / (by - ay); y = CLIP_MIN_Y; }
    else if (out & RIGHT) { y = ay + (by - ay) * (CLIP_MAX_X - ax) / (bx - ax); x = CLIP_MAX_X; }
    else { y = ay + (by - ay) * (CLIP_MIN_X - ax) / (bx - ax); x = CLIP_MIN_X; }
    if (out === oa) { ax = x; ay = y; oa = outcode(ax, ay); } else { bx = x; by = y; ob = outcode(bx, by); }
  }
  return null;
}

/** Is a lone point inside the view? */
export const insideClip = (x: number, y: number): boolean => outcode(x, y) === 0;
` : '';

const ts = `// GENERATED by modern/web/oracle/fit_projection.mjs - do not edit by hand.
//
// The original's world-to-screen projection, derived by measurement rather than read out of
// the disassembly. probe_project.mjs replaced the ship model at $7879 with a single vertex
// and asked the renderer where it went, for ${obs.length} camera and world positions;
// fit_projection.mjs solved for the constants and searched the rotation conventions.
//
// Fit: ${best.rms.toFixed(2)} px rms, worst single point ${worst.toFixed(2)} px.
// Projecting all of SHIP # 3's vertices reproduces the original's bounding box to within
// about 1.5 px, except at closest approach where the renderer clips and this does not.

/** Byte angles: 256 units to a full turn, as the ship state at $7321-$7323 stores them. */
export const ANGLE_UNITS = 256;

/**
 * The machine's own sine and cosine, measured from $6006 and $6009 over all 256 inputs.
 *
 * These are NOT Math.sin and Math.cos. The original builds the second, third and fourth
 * quadrants by negating a quarter-wave table, and its negation never applies the borrow to
 * the high byte, so everything outside the first quadrant is wrong by up to 1.48% of full
 * scale. Using real sines here misses the original's geometry at negative angles - measured,
 * it costs about a third of the pixel agreement at pitch -6.
 *
 * Stored as the machine stores them: signed, over 32767.
 */
export const DISK_SIN_Q15: readonly number[] = [
${(() => { const rows = []; for (let i = 0; i < 256; i += 16) rows.push('  ' + trig.slice(i, i + 16).map((r) => S16(r.cos)).join(', ') + ','); return rows.join(String.fromCharCode(10)); })()}
];
export const DISK_COS_Q15: readonly number[] = [
${(() => { const rows = []; for (let i = 0; i < 256; i += 16) rows.push('  ' + trig.slice(i, i + 16).map((r) => S16(r.sin)).join(', ') + ','); return rows.join(String.fromCharCode(10)); })()}
];

const Q15 = 1 / 32767;
/** The original's sine of a byte angle. */
export const diskSin = (byte: number): number => DISK_SIN_Q15[byte & 255] * Q15;
/** The original's cosine of a byte angle. */
export const diskCos = (byte: number): number => DISK_COS_Q15[byte & 255] * Q15;

/** sx = ${best.fx.a.toFixed(1)} + ${best.fx.b.toFixed(1)} * dx / dz */
export const SCREEN_CENTRE_X = ${best.fx.a.toFixed(2)};
export const FOCAL_X = ${best.fx.b.toFixed(2)};

/**
 * sy = ${best.fy.a.toFixed(1)} - ${(-best.fy.b).toFixed(1)} * dy / dz
 *
 * FOCAL_Y / FOCAL_X is ${(-best.fy.b / best.fx.b).toFixed(3)}, and a 280x192 frame on a 4:3
 * display has a pixel aspect of ${((4 / 3) / (280 / 192)).toFixed(3)} - so this is one focal
 * length with the Apple's non-square pixels corrected for, not two independent constants.
 */
export const SCREEN_CENTRE_Y = ${best.fy.a.toFixed(2)};
export const FOCAL_Y = ${(-best.fy.b).toFixed(2)};

export interface Vec3 { x: number; y: number; z: number; }

/**
 * The near plane, measured by oracle/probe_near.mjs: a point straight ahead is still drawn
 * at dz 0 and not at dz -50, and a line running from behind the camera to in front of it
 * IS drawn - the original clips it at the near plane rather than dropping it. Anything at
 * or behind this is not in front of you.
 */
export const NEAR_Z = 1;

/**
 * World point into camera space: translate to the camera, yaw by heading, then pitch.
 *
 * Kept separate from the divide so that segments can be clipped against the near plane in
 * three dimensions, where it is meaningful. Projecting first and dropping whatever landed
 * behind the camera loses any segment that straddles it, which is most of a ground plane
 * once you are flying over one.
 */
export function toCameraSpace(p: Vec3, camera: Vec3, heading: number, pitch: number): Vec3 {
  let dx = p.x - camera.x;
  let dy = p.y - camera.y;
  let dz = p.z - camera.z;

  const ch = diskCos(heading), sh = diskSin(heading);
  const nx = dx * ch - dz * sh;
  dz = dx * sh + dz * ch;
  dx = nx;

  // pitch turns the other way round from heading
  const cp = diskCos(pitch), sp = -diskSin(pitch);
  const ny = dy * cp - dz * sp;
  dz = dy * sp + dz * cp;
  dy = ny;

  return { x: dx, y: dy, z: dz };
}

/** Camera space to screen. Returns null at or behind the near plane. */
export function projectCameraSpace(d: Vec3): { x: number; y: number } | null {
  if (d.z <= NEAR_Z) return null;
  return {
    x: SCREEN_CENTRE_X + FOCAL_X * (d.x / d.z),
    y: SCREEN_CENTRE_Y - FOCAL_Y * (d.y / d.z),
  };
}

/**
 * Clip a camera-space segment against the near plane.
 *
 * Returns null when both ends are behind it, otherwise the segment with whichever end was
 * behind pulled forward onto the plane.
 */
export function clipNear(a: Vec3, b: Vec3): { a: Vec3; b: Vec3 } | null {
  const aIn = a.z > NEAR_Z, bIn = b.z > NEAR_Z;
  if (!aIn && !bIn) return null;
  if (aIn && bIn) return { a, b };
  const t = (NEAR_Z - a.z) / (b.z - a.z);
  const at = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: NEAR_Z };
  return aIn ? { a, b: at } : { a: at, b };
}

/**
 * World point to screen, the way the original does it: translate to the camera, yaw by
 * heading, then pitch, then divide.
 *
 * Rotation order is yaw-then-pitch; the fit is unambiguous about it (${best.rms.toFixed(2)} px
 * against 3.11 px the other way round). Returns null for points at or behind the near
 * plane - use toCameraSpace() and clipNear() for anything that is part of a line.
 */
export function projectWorldPoint(p: Vec3, camera: Vec3, heading: number, pitch: number): { x: number; y: number } | null {
  return projectCameraSpace(toCameraSpace(p, camera, heading, pitch));
}
${clipTs}`;
fs.writeFileSync('../src/engine/diskProjection.ts', ts);
console.log('\nwrote ../src/engine/diskProjection.ts');
