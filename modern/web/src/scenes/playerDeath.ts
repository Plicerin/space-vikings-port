import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';
import { drawExBurst } from './ex';

/**
 * S/X, the player's death - S/X.bas, sixteen lines.
 *
 * Two programs run it: H/D line 4, when its line 2 finds the energy at 0, and STARSHIP
 * SIMULATOR line 3350 when the hull reaches 0.
 *
 * It is EX with the colour inverted. Lines 7-30 are the same sixteen steps of fifteen
 * segments from (140,60) - `drawExBurst` is shared - but line 5 sets `HCOLOR= 0`, so the
 * burst cuts black channels out of the screen instead of painting white ones onto it.
 */

/**
 * Line 5: `HCOLOR= 0: Y1 = 20: POKE 973,255: PRINT ""`.
 *
 * That single inverse `PRINT` leaves the **whole page solid white** - measured, watching the
 * lit count go 3,909 to 16,872 to 53,760 of 53,760 over about twenty-five frames while
 * `$3CD` read 255 and `$E4` read 0. One empty PRINT blanking an entire 24-row window is not
 * what a newline does on its own, so something in the hi-res character generator's scroll or
 * window handling is doing it; that part is not derived, only the result is.
 */
export function drawPlayerDeathBackground(hires: import('../engine/hires').Hires): void {
  hires.hcolor(3);
  for (let y = 0; y < 192; y++) hires.hlin(0, 279, y);
}

/** Line 40: `VTAB 22: HTAB 5: SPEED= 127: PRINT "YOUR SHIP HAS BEEN DESTROYED!!"`. */
export function drawPlayerDeathMessage(hires: import('../engine/hires').Hires): void {
  hires.text('YOUR SHIP HAS BEEN DESTROYED!!', 5, 22, { invert: true });
}

export async function playerDeathScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, input, audio } = ctx;
  setScene('playerDeath');
  glog('destroy', 'player ship destroyed (S/X)');

  // 5
  drawPlayerDeathBackground(hires);
  // 6: 500 calls to the EXPL routine before anything is drawn.
  audio.beep(50, 400);
  await new Promise((r) => setTimeout(r, 400));

  // 7-30, the same burst as EX in HCOLOR 0.
  drawExBurst(hires, Math.random, 0);

  // 40
  drawPlayerDeathMessage(hires);

  // 50: GET A$ twice, then PR#6 - the disk reboots. The port goes back to the title.
  await input.waitForKey();
  await input.waitForKey();
  return scenes.run('start');
}
