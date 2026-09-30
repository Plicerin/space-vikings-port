import type { Hires } from '../engine/hires';
import type { ShapeTable } from '../engine/shapeTable';
import { eraseComNeedleTracks } from './com';

/**
 * RE's screen - RE.bas lines 1-22, and where it leaves the ship.
 *
 * STARSHIP SIMULATOR line 156 runs it: `IF ABS(X) < 900 AND ABS(Y) < 900 AND ABS(Z) < 900 AND
 * PEEK(38210) = 0 THEN PRINT "RUNRE"`. Like ORBIT it is a transition rather than a destination -
 * it draws this, repositions the ship, BLOADs the planet's own display list and chains straight
 * back to the simulator without waiting for a key. The two programs are line-for-line mirrors of
 * each other, so this file mirrors `orbitScreen.ts`.
 *
 * It lives apart from `reentry.ts` because that file is carrying another agent's uncommitted
 * work, the same reason `orbitScreen.ts` sits apart from `orbit.ts`.
 */

/** Line 5's `POKE 973,255`, which line 26 puts back. */
const INVERSE = { invert: true } as const;

export function drawReentryScreen(hires: Hires, shapes: ShapeTable | null): void {
  // 2: the needle-track erase, and then the five readouts on row 24 are blanked - `VTAB 24:
  // HTAB 1: PRINT <17 spaces>;: HTAB 24: PRINT <16 spaces>`. That takes out X, Y and Z and the
  // two headings while leaving INSTRUMENTS' labels on row 23 standing.
  if (shapes) eraseComNeedleTracks(hires, shapes);
  hires.hcolor(0);
  hires.text(' '.repeat(17), 1, 24);
  hires.text(' '.repeat(16), 24, 24);

  // 10. Orange, where ORBIT's line 10 is blue. Rows 0-125 only, so the panel below stands.
  hires.hcolor(5);
  for (let y = 0; y <= 125; y++) hires.hlin(0, 279, y);

  // 20. VTAB 7 is 0-based row 6 and HTAB 10 is 0-based column 9; the blank line above the
  // message, the message and the blank line below are three consecutive PRINTs, all inverse.
  hires.text(' '.repeat(22), 10, 7, INVERSE);
  hires.text('REENTRY SEQUENCE START', 10, 8, INVERSE);
  hires.text(' '.repeat(22), 10, 9, INVERSE);

  // 21, 22: the ORBIT gauge at (200,153), painted white here because line 25 sets 38210 to 1 -
  // exactly what GALAXY MAP's 5120 would choose for it. ORBIT's line 21 paints the same bar
  // green after setting 38210 back to 0.
  hires.hcolor(3);
  for (let y = 153; y <= 157; y++) hires.hlin(200, 209, y);
}

/**
 * Lines 27-35: where RE leaves the ship.
 *
 * The bytes go through line 6600's decode, which the port has to apply and which is easy to
 * miss: `Z1 = 168: Z2 = 228` is not 58,536 but **-7,000**, because a high byte of 128 or more is
 * negative. Taking it as unsigned put the ship past the 20,000-unit wrap at line 133, and every
 * re-entry threw it to the edge of the map.
 *
 * X is the odd one. Line 27 reads the high byte off XI + 1 and line 29 only replaces the low
 * one, so the ship keeps whichever 256-unit band of X it re-entered in.
 */
export const REENTRY_EXIT_STATE = {
  /** Y1 = 0, Y2 = 4. */
  y: 4 * 256,
  /** Z1 = 168, Z2 = 228, signed. */
  z: (228 - 255) * 256 + (168 - 256),
  /** Line 28 sets H itself rather than reading it. */
  heading: 20,
  /** Line 25. 38210 is $9542, the byte ORBIT clears again on the way out. */
  atmosphere: 1 as number,
};

/** Line 29's `X1 = 188` over line 27's high byte, decoded the way line 6600 decodes it. */
export function reentryX(previousX: number): number {
  const hi = (Math.round(previousX) >> 8) & 0xff;
  return hi < 129 ? hi * 256 + 188 : (hi - 255) * 256 + (188 - 256);
}
