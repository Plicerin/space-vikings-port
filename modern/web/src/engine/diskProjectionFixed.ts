/**
 * The renderer's projection arithmetic, transcribed from $6000.
 *
 * `diskProjection.ts` projects in floating point with constants fitted to captures. This is
 * the machine's own version: `$68A1`, which is what `$6274`'s `LDY #$60: LDX #$9F: JSR $68A1`
 * calls to turn a camera-space point into two screen bytes.
 *
 *     $68A1  STX $A7 / STY $A8
 *     $68A5  LDA $0004,Y / STA $7A / LDA $0005,Y / STA $7B   ; z
 *     $68AF  LDX $00,Y / LDA $0001,Y / JSR $6468             ; x / z
 *     $68B7  LDA $79 / LDX #$45 / JSR $691E                  ; scale the quotient by 69
 *     $68BE  CLC / ADC #$00 / STA $0000,Y                    ; plus the x offset
 *     $68C8  ...the same for y, with #$3E and #$22
 *
 * All four operands are **patched from the model stream** - `$68EA` reads them and writes
 * them into `$68BA`, `$68C0`, `$68DD` and `$68E3` - so the clamp limits and offsets are
 * per-object, not constants. In the flight snapshot they are 69/0 and 62/34.
 *
 * `$6DD5` then maps the results to the screen as `x + 70` (doubled when plotted) and
 * `95 - y`, which is where the fitted `SCREEN_CENTRE_Y` of 61.74 comes from: 95 - 34 = 61.
 *
 * Verified against the machine on **261 of 261** sampled points by
 * `oracle/probe_project6000.mjs` and `oracle/project6000_parity.mjs`, including points
 * behind the camera.
 */

/** The four operands $68EA patches, and the flight snapshot's values. */
export interface ProjectionOperands {
  /** $68BA - the x clamp limit. */
  xLimit: number;
  /** $68C0 - added after scaling. */
  xOffset: number;
  /** $68DD - the y clamp limit. */
  yLimit: number;
  /** $68E3. */
  yOffset: number;
}

export const SNAPSHOT_OPERANDS: ProjectionOperands = {
  xLimit: 69, xOffset: 0, yLimit: 62, yOffset: 34,
};

/** $6DD5's own mapping, applied after $68A1 returns. */
export const SCREEN_X_BIAS = 70;
export const SCREEN_Y_FLIP = 95;

/**
 * $64B6 - the unsigned 16-bit divide, sixteen non-restoring steps.
 *
 * The quotient accumulates in $78/$79 and the caller takes the **high** byte. The trailing
 * `ASL $78 / ROL $79 / BPL / DEC $78 / DEC $79` is part of it, and so is the carry it leaves,
 * because $691E's first `ROR $78` shifts that carry in.
 */
export function divide64B6(hi: number, lo: number, zLo: number, zHi: number): {
  q78: number; q79: number; carry: number;
} {
  let y = 0x0f;
  let a5 = lo & 0xff;
  let A = hi & 0xff;
  let X = A;
  let s78 = 0;
  let s79 = 0;
  let C = 0;

  const shiftIn = (bit: number): void => {
    const c78 = (s78 & 0x80) ? 1 : 0;
    s78 = ((s78 << 1) | bit) & 0xff;
    const c79 = (s79 & 0x80) ? 1 : 0;
    s79 = ((s79 << 1) | c78) & 0xff;
    C = c79;
    const c5 = (a5 & 0x80) ? 1 : 0;
    a5 = (a5 << 1) & 0xff;
    A = ((A << 1) | c5) & 0xff;
  };

  for (;;) {
    // $64BB-$64C5: subtract the divisor from the running remainder.
    const borrow = (a5 - zLo) < 0 ? 1 : 0;
    a5 = (a5 - zLo) & 0xff;
    A = (X - zHi - borrow) & 0xff;

    if (!(A & 0x80)) {
      shiftIn(1);                       // $64C7 SEC then the rolls
      if (--y === 0) break;
      X = A;
      continue;
    }

    // $64D4: the restoring branch.
    let done = false;
    for (;;) {
      shiftIn(0);
      if (--y === 0) { done = true; break; }
      X = A;
      const sum = a5 + zLo;
      const cc = sum > 0xff ? 1 : 0;
      a5 = sum & 0xff;
      A = (X + zHi + cc) & 0xff;
      if (A & 0x80) continue;           // $64E9 BMI - restore again
      shiftIn(1);                       // $64EB BPL $64C7
      if (--y === 0) { done = true; break; }
      X = A;
      break;
    }
    if (done) break;
  }

  // $64ED
  const c78 = (s78 & 0x80) ? 1 : 0;
  s78 = (s78 << 1) & 0xff;
  const top = (s79 & 0x80) ? 1 : 0;
  s79 = ((s79 << 1) | c78) & 0xff;
  C = top;
  if (s79 & 0x80) { s78 = (s78 - 1) & 0xff; s79 = (s79 - 1) & 0xff; }
  return { q78: s78, q79: s79, carry: C };
}

/**
 * $691E - multiply the quotient byte by the clamp limit, eight shift-and-add rounds.
 *
 * `EOR #$FF` first, so a clear carry out of each `ROR $78` means the original bit was set.
 * The first round loads rather than adds (`TXA`), and the last one subtracts once for the
 * sign. The carry the divide left is shifted in by the opening `ROR $78`.
 */
export function scale691E(quotient: number, limit: number, carryIn: number): number {
  let s78 = (quotient ^ 0xff) & 0xff;
  const s7b = limit & 0xff;
  let A = 0;
  let C = carryIn & 1;

  const ror78 = (): void => { const b0 = s78 & 1; s78 = ((s78 >> 1) | (C << 7)) & 0xff; C = b0; };
  const lsrA = (): void => { const b0 = A & 1; A = (A >> 1) & 0xff; C = b0; };
  const adc = (v: number): void => { const s = A + v + C; C = s > 0xff ? 1 : 0; A = s & 0xff; };

  ror78();
  if (!C) A = s7b;                      // $692A TXA
  for (let i = 0; i < 6; i++) { lsrA(); ror78(); if (!C) adc(s7b); }
  lsrA();
  ror78();
  if (!C) { const s = A - s7b; C = s >= 0 ? 1 : 0; A = s & 0xff; }
  return A;
}

/** $6468 - sign handling around the divide. Returns the quotient byte and the carry. */
function signedDivide(v: number, z: number): { q: number; carry: number } {
  let lo = v & 0xff;
  let hi = (v >> 8) & 0xff;
  let zLo = z & 0xff;
  let zHi = (z >> 8) & 0xff;
  let negate = false;
  if (hi & 0x80) { const n = (-v) & 0xffff; lo = n & 0xff; hi = (n >> 8) & 0xff; negate = !negate; }
  if (zHi & 0x80) { const n = (-z) & 0xffff; zLo = n & 0xff; zHi = (n >> 8) & 0xff; negate = !negate; }
  const d = divide64B6(hi, lo, zLo, zHi);
  if (!negate) return { q: d.q79, carry: d.carry };
  const n16 = (-(((d.q79 << 8) | d.q78))) & 0xffff;
  return { q: (n16 >> 8) & 0xff, carry: d.carry };
}

/** $68A1. Camera-space x, y, z in; the two screen bytes out, as the machine writes them. */
export function project68A1(
  x: number,
  y: number,
  z: number,
  ops: ProjectionOperands = SNAPSHOT_OPERANDS,
): { sx: number; sy: number } {
  const rx = signedDivide(x, z);
  const ry = signedDivide(y, z);
  return {
    sx: (scale691E(rx.q, ops.xLimit, rx.carry) + ops.xOffset) & 0xff,
    sy: (scale691E(ry.q, ops.yLimit, ry.carry) + ops.yOffset) & 0xff,
  };
}

/** The same, mapped to the screen the way $6DD5 does. x is the half-width column. */
export function project68A1ToScreen(
  x: number,
  y: number,
  z: number,
  ops: ProjectionOperands = SNAPSHOT_OPERANDS,
): { x: number; y: number } {
  const { sx, sy } = project68A1(x, y, z, ops);
  const signed = (b: number): number => (b > 127 ? b - 256 : b);
  return {
    x: (signed(sx) + SCREEN_X_BIAS) * 2,
    y: SCREEN_Y_FLIP - signed(sy),
  };
}
