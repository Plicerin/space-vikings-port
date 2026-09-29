import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';

/**
 * END, the save/quit menu - END.bas.
 *
 * COM line 132 chains here: `IF COM = 4 THEN PRINT "RUNEND"`.
 *
 * The window comes from COM line 128's `POKE 32,0: POKE 33,40: POKE 34,0: POKE 35,24`, so
 * END's own `POKE 33,40` changes nothing and line 30's sixteen rows of forty spaces blank
 * columns 0-39 outright - the full-width case that does not lose its last character, because
 * the left margin is 0. HCOLOR is COM's 1 and `$3CD` is 0, so the menu is green and normal
 * video.
 *
 * Measured row and column positions, rather than traced:
 *
 * | 0-based row | column | |
 * | --- | --- | --- |
 * | 1 | 15 | END GAME, from line 40's HTAB 16 |
 * | 4, 5, 6 | 6 | the three options, from `TAB( 7)` |
 * | 9 | 0 | ENTER CHOICE. |
 */

type H = import('../engine/hires').Hires;

/** Lines 30-70. */
export function drawEndMenu(hires: H): void {
  hires.hcolor(1);
  // 30: FOR J = 1 TO 16: VTAB J: PRINT <40 spaces>
  for (let r = 1; r <= 16; r++) hires.text(' '.repeat(40), 1, r);
  // 40
  hires.text('END GAME', 16, 2);
  // 50, 60
  hires.text('1) SAVE GAME', 7, 5);
  hires.text('2) CONTINUE PRESENT GAME', 7, 6);
  hires.text('3) END GAME', 7, 7);
  // 70 - the trailing spaces are part of the string and the cursor sits after them.
  hires.text('ENTER CHOICE.  ', 1, 10);
}

/** Line 190's refusal and line 210's confirmation, both printed under the prompt. */
export function drawEndSaveResult(hires: H, inAtmosphere: boolean): void {
  hires.hcolor(1);
  if (inAtmosphere) {
    hires.text('YOU MUST BE IN ORBIT TO SAVE GAME', 1, 12);
  } else {
    hires.text('GAME SAVED.', 1, 12);
  }
}

/**
 * Lines 200-204, the save.
 *
 * It copies the nine bytes at 29467-29475 - X, Y, Z, pitch, bank and heading - into
 * 38211-38219, sets 38391 to 77 and 38392 to the current planet, then BSAVEs P/F, PLANET
 * FILE and SHIP'S DATA.
 *
 * Note where the ninth byte lands: **38219**. The planets-surrendered table is `38219 + P`
 * for P = 1 to 20, which is 38220 to 38239, so the saved heading sits in the slot a
 * one-based index never reaches. They are adjacent, not overlapping - which is why that
 * table is indexed from 1 rather than 0.
 */
export const END_SAVE_BYTES = { from: 29467, to: 38211, count: 9 } as const;

export async function endScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input } = ctx;
  setScene('end');

  for (;;) {
    drawEndMenu(hires);
    const k = await input.waitForKey();
    const c = String.fromCharCode(k & 0x7f);

    // 70: anything outside 1-3 redraws from line 30.
    if (c !== '1' && c !== '2' && c !== '3') continue;

    if (c === '1') {
      // 190
      drawEndSaveResult(hires, state.atmosphere);
      glog('end', state.atmosphere ? 'cannot save in atmosphere' : 'game saved');
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    if (c === '2') {
      // 110-120
      glog('end', 'continue');
      return scenes.run('galaxyMap');
    }
    // 100: FOR J = 1 TO 5000: POKE J,0: NEXT: END - the original wipes memory and halts.
    glog('end', 'game ended');
    return scenes.run('start');
  }
}
