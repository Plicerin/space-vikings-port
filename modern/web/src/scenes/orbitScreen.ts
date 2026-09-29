import type { Hires } from '../engine/hires';
import type { ShapeTable } from '../engine/shapeTable';
import { eraseComNeedleTracks } from './com';

/**
 * ORBIT's screen - ORBIT.bas lines 1-22.
 *
 * STARSHIP SIMULATOR line 158 runs it: `IF PEEK(38210) = 1 AND Y > 4000 THEN PRINT
 * "RUNORBIT"`. ORBIT is a transition rather than a destination - it draws this, repositions
 * the ship (X 700, Y 200, Z 2000, heading 190), BLOADs PLANET # 0 and a ship model, and
 * chains straight back to the simulator. It never waits for a key.
 *
 * Drawn on top of whatever flight left: line 10 floods only rows 0-125, so the instrument
 * panel below is untouched except for line 2.
 *
 * Line 5 pokes 973,255 before any of the text, so the three lines at 20 are inverse - a
 * solid band with the message in black through the middle of it. Line 26 puts the flag back
 * afterwards.
 *
 * This lives apart from orbit.ts because that file is carrying another agent's uncommitted
 * work.
 */
export function drawOrbitScreen(hires: Hires, shapes: ShapeTable | null): void {
  // 1, 2: the same needle-track erase COM does on its line 8.
  if (shapes) eraseComNeedleTracks(hires, shapes);

  // 10
  hires.hcolor(6);
  for (let y = 0; y <= 125; y++) hires.hlin(0, 279, y);

  // 20. VTAB 7 is 0-based row 6 and HTAB 10 is 0-based column 9; the blank line above the
  // message, the message, and the blank line below are three consecutive PRINTs.
  const INVERSE = { invert: true } as const;
  hires.text(' '.repeat(23), 10, 7, INVERSE);
  hires.text('ORBITAL INSERTION START', 10, 8, INVERSE);
  hires.text(' '.repeat(23), 10, 9, INVERSE);

  // 21, 22: one of the panel lamps, painted as a solid bar the way GALAXY MAP's 5500 does
  // rather than through CALL 38402.
  hires.hcolor(1);
  for (let y = 153; y <= 157; y++) hires.hlin(200, 209, y);
}

/** Lines 27-37: where ORBIT leaves the ship before chaining to the simulator. */
export const ORBIT_EXIT_STATE = {
  /** X1 = 188, X2 = 2 */
  x: 188 + 2 * 256,
  /** Y1 = 200, Y2 = 0 */
  y: 200,
  /** Z1 = 208, Z2 = 7 */
  z: 208 + 7 * 256,
  /** Line 29 overrides the heading it just read. */
  heading: 190,
  /** Line 25. */
  atmosphere: 0,
} as const;
