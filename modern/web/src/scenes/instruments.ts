import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';

/**
 * The cockpit panel, exactly INSTRUMENTS.bas lines 10-200.
 *
 * Exported because it is a pure draw with no state and no RNG, which makes it the one
 * screen that can be compared against the original pixel for pixel. oracle/frame_parity.mjs
 * calls it on a fresh Hires and diffs the result against the disk's hi-res page.
 */
export function drawInstruments(hires: import('../engine/hires').Hires): void {
  // All instruments drawn instantly — no artificial delays.
  hires.hcolor(1);

  hires.line(123, 145, 1, 145);
  hires.line(1, 145, 1, 128);
  hires.line(1, 128, 279, 128);
  hires.line(279, 128, 279, 145);
  hires.line(279, 145, 157, 145);

  hires.line(123, 128, 123, 183);
  hires.line(123, 183, 133, 183);
  hires.line(133, 183, 133, 189);
  hires.line(133, 189, 147, 189);
  hires.line(147, 189, 147, 183);
  hires.line(147, 183, 157, 183);
  hires.line(157, 183, 157, 128);

  hires.line(13, 131, 13, 130);
  hires.line(13, 130, 77, 130);
  hires.line(77, 130, 77, 131);
  hires.line(45, 131, 45, 131);
  hires.line(261, 131, 261, 130);
  hires.line(261, 130, 199, 130);
  hires.line(199, 130, 199, 131);
  hires.line(231, 131, 231, 131);
  hires.line(129, 131, 129, 130);
  hires.line(129, 130, 151, 130);
  hires.line(151, 130, 151, 131);
  hires.line(139, 131, 141, 131);
  hires.line(139, 152, 141, 152);
  hires.line(141, 152, 141, 184);
  hires.line(141, 184, 139, 184);
  hires.line(139, 167, 139, 167);

  hires.hcolor(5);
  hires.line(5, 177, 117, 177);
  hires.line(163, 177, 277, 177);

  hires.hcolor(3);
  for (const [x, y] of [[6, 152], [71, 152], [6, 160], [71, 160], [200, 152], [261, 152], [200, 160], [261, 160], [6, 168], [71, 168]] as Array<[number, number]>) {
    hires.line(x, y, x + 11, y);
    hires.line(x + 11, y, x + 11, y + 5);
    hires.line(x + 11, y + 5, x, y + 5);
    hires.line(x, y + 5, x, y);
  }

  hires.hcolor(1);
  hires.text(' SPEED ', 4, 18);
  hires.text('TURN', 19, 18);
  hires.text(' ENERGY ', 30, 18);

  hires.text('V', 22, 20);
  hires.text('E', 22, 21);
  hires.text('R', 22, 22);
  hires.text('T', 22, 23);
  hires.text('C', 19, 20);
  hires.text('D', 19, 23);
  hires.text('MANUAL', 4, 20);
  hires.text('AUTO', 13, 20);
  hires.text('ORBIT', 24, 20);
  hires.text('DAMAGE', 32, 20);
  hires.text('MISSILE', 4, 21);
  hires.text('LASER', 13, 21);
  hires.text('COND', 24, 21);
  hires.text('SHIELD', 32, 21);
  hires.text('X', 3, 23);
  hires.text('Y', 9, 23);
  hires.text('Z', 15, 23);
  hires.text('XHDNG', 25, 23);
  hires.text('YHDNG', 34, 23);
}

export async function instrumentsScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state } = ctx;
  setScene('instruments');

  hires.hgr();

  drawInstruments(hires);

  glog('instruments', `transition to ${state.savedGameSentinel !== 77 ? 'starshipSimulator' : 'galaxyMap'}`);

  if (state.savedGameSentinel !== 77) {
    return scenes.run('starshipSimulator');
  }
  return scenes.run('galaxyMap');
}
