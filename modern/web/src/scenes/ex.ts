import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';
import { ShapeRenderer, decodeShapeTableJson } from '../engine/shapeTable';
import type { ShapeTable } from '../engine/shapeTable';

/**
 * EX, the enemy ship's explosion - EX.bas, sixteen lines.
 *
 * STARSHIP SIMULATOR line 1560 runs it from inside the laser subroutine:
 * `IF DP > PEEK(38204) AND PEEK(38205) < > 0 THEN PRINT "RUNEX"`.
 *
 * It never clears the screen. The burst is drawn straight over the flight view in the
 * HCOLOR 3 line 5 sets, and the only thing that follows is a chain back to the simulator -
 * no caption.
 */

/** Line 25 plots every segment from here. Line 6's flash is two pixels lower, at 140,65. */
export const EX_ORIGIN = { x: 140, y: 60 } as const;
export const EX_FLASH_AT = { x: 140, y: 65 } as const;
/** Line 6, at SCALE= 2. BASIC shape numbers. */
export const EX_FLASH_SHAPES = [2, 15, 16, 17, 18] as const;

type H = import('../engine/hires').Hires;

/**
 * Line 6's flash.
 *
 * The original XDRAWs these, so over the flight view they invert rather than paint. The port
 * draws them, which is the same thing over empty space and not the same over a star - a
 * known simplification, not something measured.
 */
export function drawExFlash(hires: H, shapes: ShapeTable): void {
  const r = new ShapeRenderer(hires);
  r.rot = 0;
  r.scale = 2;
  hires.hcolor(3);
  for (const n of EX_FLASH_SHAPES) r.draw(shapes, n - 1, EX_FLASH_AT.x, EX_FLASH_AT.y);
}

/**
 * Lines 7-30, the burst.
 *
 *     7  FOR X1 = 5 TO 130 STEP 8: Y1 = Y1 + 4.8: FOR J = 1 TO 15
 *     20 X2 = X1 - (RND(1) * (X1 + X1)): Y2 = Y1 - (RND(1) * (Y1 + Y1))
 *     21 IF Y2 > 65 THEN Y2 = 65
 *     22 IF Y2 < - 60 THEN Y2 = - 60
 *     25 HPLOT 140,60 TO 140 + X2,60 + Y2: NEXT
 *
 * Sixteen steps of fifteen segments - 240 in all - with the spread growing as X1 and Y1 do,
 * which is why the middle is dense and the edges are sparse. Y1 starts at 20 (line 5) and is
 * bumped before the first inner loop, so it runs 24.8 to 96.8.
 *
 * HPLOT truncates its coordinates, and every one here is positive.
 */
export function drawExBurst(hires: H, rnd: () => number = Math.random, colour = 3): number {
  // S/X runs the identical loop with HCOLOR 0, so the colour is a parameter.
  hires.hcolor(colour);
  let y1 = 20;
  let drawn = 0;
  for (let x1 = 5; x1 <= 130; x1 += 8) {
    y1 += 4.8;
    for (let j = 0; j < 15; j++) {
      const x2 = x1 - rnd() * (x1 + x1);
      let y2 = y1 - rnd() * (y1 + y1);
      if (y2 > 65) y2 = 65;
      if (y2 < -60) y2 = -60;
      hires.line(EX_ORIGIN.x, EX_ORIGIN.y, Math.trunc(140 + x2), Math.trunc(60 + y2));
      drawn++;
    }
  }
  return drawn;
}

export async function exScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, audio, loader } = ctx;
  setScene('ex');

  let shapes: ShapeTable | null = null;
  try {
    shapes = decodeShapeTableJson(await loader.json('data/shapes/shape-table.json'));
  } catch { /* the flash is skipped */ }

  // 6, then 50 calls to the EXPL routine.
  if (shapes) drawExFlash(hires, shapes);
  audio.beep(60, 120);
  await new Promise((r) => setTimeout(r, 120));

  // 7-30
  drawExBurst(hires);
  audio.beep(90, 200);

  // 30: the enemy is gone and its model is blanked - though line 40's BLOAD DEBRIS writes
  // over that same address immediately, so the 127 never survives to be read.
  state.shipKind = 0;
  state.shipVitality = 0;
  // 56: F = PEEK(38207) / 2: POKE 38207,F - POKE truncates.
  state.enemyShips = Math.trunc(state.enemyShips / 2);
  if (state.enemyShips === 0) state.planets[state.planetIndex].defender = 0;
  glog('destroy', `enemy destroyed, ships left ${state.enemyShips}`);

  await new Promise((r) => setTimeout(r, 900));
  return scenes.run('starshipSimulator');
}
