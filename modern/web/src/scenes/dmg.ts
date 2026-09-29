import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';

/**
 * DMG, from DMG.bas - all three lines of it:
 *
 *     10 HCOLOR= 5: FOR J = 153 TO 157: HPLOT 262,J TO 271,J: NEXT:
 *        PRINT " ": PRINT "RUN STARSHIP SIMULATOR"
 *
 * It lights one panel lamp orange and chains straight back. No clear, no text, no pause.
 *
 * STARSHIP SIMULATOR line 3360 runs it once: `IF PEEK(38393) = 0 THEN POKE 38393,1: PRINT
 * "RUNDMG"`. 38393 is the ship-damaged flag - START line 2030 clears it on a new game and
 * SHORE LEAVE line 2555 clears it again on repair, so the light comes on the first time
 * anything hits and stays on until the ship is fixed.
 */

/** The lamp DMG lights. Ten pixels by five, at the right-hand end of the panel's upper row. */
export const DAMAGE_LAMP = { x0: 262, x1: 271, y0: 153, y1: 157 } as const;

/**
 * Three programs paint this same lamp in three ways, which is how its meaning is pinned
 * down: DMG in HCOLOR 5 when damage lands, SHORE LEAVE line 2545 in HCOLOR 1 when the
 * repairs are done, and GALAXY MAP lines 5140-5160 in whichever of the two 38393 calls for.
 *
 * Measured from DMG: 25 lit pixels, on columns 263, 265, 267, 269 and 271 - HCOLOR 5 lights
 * the odd columns.
 */
export function drawDamageLamp(hires: import('../engine/hires').Hires, colour: number): void {
  hires.hcolor(colour);
  for (let y = DAMAGE_LAMP.y0; y <= DAMAGE_LAMP.y1; y++) {
    hires.hlin(DAMAGE_LAMP.x0, DAMAGE_LAMP.x1, y);
  }
}

export async function dmgScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state } = ctx;
  setScene('dmg');

  drawDamageLamp(hires, 5);
  state.shipDamaged = true;          // line 3360's POKE 38393,1
  state.damage.pendingUpdate = false;
  glog('damage', `damage lamp on, hull=${state.damage.hullPct.toFixed(0)}`);

  return scenes.run('starshipSimulator');
}
