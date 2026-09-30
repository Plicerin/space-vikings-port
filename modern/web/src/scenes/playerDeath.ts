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
 * Line 5: `HCOLOR= 0: Y1 = 20: POKE 973,255: PRINT "^L"`.
 *
 * The string is not empty. Its bytes are `22 0C 22` - a **form feed** between the quotes - and
 * it only ever listed as `PRINT ""` because control characters inside strings were written out
 * as themselves, which is invisible. (Line 3 is the same: `PRINT "^DBLOAD EXPL"`, the Ctrl-D
 * that starts every DOS command.)
 *
 * With that, the whole page going white is three plain steps:
 *
 * ```
 * $933F  CMP #$8D        ; carriage return? no
 * $9343  CMP #$8C        ; form feed - clear the screen
 * $9347  LDY #$00
 * $9349  STY $2A         ; a pointer at the base of the hi-res page
 * $934B  LDA $3CE        ; 974 is the page's HIGH BYTE - 32 is $2000, 64 is $4000
 * $934E  STA $2B
 * $9350  LDA $3CD        ; 973, the inverse flag
 * $9353  CMP #$FF
 * $9355  BEQ $9358       ; inverse, so the fill byte stays $FF
 * $9358  STA ($2A),Y     ; and 8192 bytes of it go down
 * ```
 *
 * So a form feed clears the page to whatever the inverse flag says: `$00` normally, `$FF` when
 * 973 is 255. Measured both ways in `oracle/probe_printmargin.mjs`'s companion
 * `probe_inverseprint.mjs` - form feed normal leaves 0 pixels lit, form feed inverse leaves
 * 53,760 and all 192 rows solid, and a carriage return changes nothing either way.
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
