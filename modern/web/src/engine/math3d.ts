// 3D math primitives for the cockpit / flight loop.
//
// The original game's STARSHIP SIMULATOR.bas:129 computes velocity as:
//   vx = S * cos(P) * sin(H)
//   vy = S * sin(P)
//   vz = S * cos(P) * cos(H)
// where S is speed, H is heading byte (0..255 → 0..2π), P is pitch byte
// (clamped to the front-facing range, 59..127 ∪ 195..255). The cos/sin
// tables ($6006/$6009 entries) return 16-bit fixed-point values that BASIC
// then divides by 32768 to get a [-1, 1] float.
//
// We work in radians here. Helpers are provided to translate from the
// game's paddle-byte form to radians for compatibility with the original
// code paths. World axes follow the BASIC convention:
//   +X right, +Y up, +Z forward (deeper into the screen)
// In Apple II screen coords, +Y is down; the projection function inverts.

export interface Vec3 { x: number; y: number; z: number; }

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const v3add = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const v3sub = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const v3scale = (a: Vec3, k: number): Vec3 => v3(a.x * k, a.y * k, a.z * k);
export const v3dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const v3len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);

export const v3cross = (a: Vec3, b: Vec3): Vec3 => v3(
  a.y * b.z - a.z * b.y,
  a.z * b.x - a.x * b.z,
  a.x * b.y - a.y * b.x,
);

export function v3normalize(a: Vec3): Vec3 {
  const len = v3len(a) || 1;
  return v3scale(a, 1 / len);
}

// Paddle byte conversions. Apple II paddles report 0..255; 128 is centre.
// The original game uses ranges [59, 127] ∪ [195, 255] for pitch (avoiding
// the dead zone where Y motion flips), and the full 0..255 for heading.
// For our modern angle math we treat the byte as (byte / 256) * 2π.
export const headingByteToRad = (byte: number): number => (byte / 256) * 2 * Math.PI;

/** Pitch byte to radians, with the wrap-around fix from STARSHIP_SIM:129
 *  ('IF P > 190 OR P < 64 THEN Y = Y - 2 * Y1' negates the Y component
 *  for those ranges). We bake that into the sign here. */
export function pitchByteToRad(byte: number): number {
  const a = (byte / 256) * 2 * Math.PI;
  return a;
}

/** Forward unit vector for a ship at given orientation (radians).
 *  Mirrors STARSHIP_SIM:129 — the XYZ velocity components when speed=1. */
export function forwardVector(pitchRad: number, headingRad: number): Vec3 {
  const cosP = Math.cos(pitchRad);
  const sinP = Math.sin(pitchRad);
  const cosH = Math.cos(headingRad);
  const sinH = Math.sin(headingRad);
  return v3(cosP * sinH, sinP, cosP * cosH);
}

// ---------------------------------------------------------------------
// Camera / projection
// ---------------------------------------------------------------------

/** Camera state — position in world coords plus a forward direction.
 *  The "up" basis vector is derived from heading (no roll for now). */
export interface Camera {
  pos: Vec3;
  pitch: number; // radians
  heading: number; // radians
}

/** Project a world-space point through the camera. Returns screen coords
 *  (in the 280x192 logical Apple II hi-res space) plus the camera-space Z
 *  for depth tests / dot scaling. visible=false when behind the camera. */
export function project(
  cam: Camera,
  world: Vec3,
  screenW = 280,
  screenH = 192,
  focal = 280, // ~one screen-width focal length (FOV ≈ 53° horizontal)
): { x: number; y: number; depth: number; visible: boolean } {
  // Translate so camera is at origin.
  const tx = world.x - cam.pos.x;
  const ty = world.y - cam.pos.y;
  const tz = world.z - cam.pos.z;

  // Rotate around Y axis (heading), then around X axis (pitch).
  // Standard camera rotation: turn right by H => rotate points by -H around Y.
  // Standard camera rotation: turn up by P => rotate points by -P around X.
  const cosH = Math.cos(cam.heading);
  const sinH = Math.sin(cam.heading);
  const x1 = tx * cosH - tz * sinH;
  const z1 = tx * sinH + tz * cosH;

  const cosP = Math.cos(cam.pitch);
  const sinP = Math.sin(cam.pitch);
  const y2 = ty * cosP - z1 * sinP;
  const z2 = ty * sinP + z1 * cosP;

  if (z2 <= 0.1) return { x: 0, y: 0, depth: z2, visible: false };
  const sx = screenW / 2 + (x1 * focal) / z2;
  const sy = screenH / 2 - (y2 * focal) / z2; // invert Y for screen
  return { x: sx, y: sy, depth: z2, visible: true };
}

// ---------------------------------------------------------------------
// Starfield (random points in a large bounded box around the player)
// ---------------------------------------------------------------------

export interface Star { pos: Vec3; brightness: number; }

export function makeStarfield(count = 200, halfExtent = 30000, seed = 1): Star[] {
  // Reproducible pseudo-random so the field doesn't shimmer on hot reloads.
  let s = seed | 0;
  const rand = (): number => {
    s = (s * 1103515245 + 12345) | 0;
    return ((s >>> 16) & 0x7fff) / 0x7fff;
  };
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      pos: v3(
        (rand() * 2 - 1) * halfExtent,
        (rand() * 2 - 1) * halfExtent,
        (rand() * 2 - 1) * halfExtent,
      ),
      brightness: 0.4 + rand() * 0.6,
    });
  }
  return stars;
}
