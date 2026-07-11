// Cockpit HUD frame — port of INSTRUMENTS.bas.
//
// Draws the static cockpit instruments: the SPEED bar, TURN strip, and
// ENERGY bar boxes; plus the indicator-light positions for MANUAL/AUTO,
// MISSILE/LASER, ORBIT/COND, DAMAGE/SHIELD; plus the X/Y/Z and XHDNG/YHDNG
// labels along the bottom row.
//
// In the original this scene runs once before STARSHIP SIMULATOR (or
// GALAXY MAP for an old game). The dynamic per-frame HUD updates (speed
// bar fill, indicator glyphs from CHARACTER TABLE, X/Y/Z numbers) belong
// to the cockpit scene itself in Phase 3.

import type { SceneContext, SceneManager } from '../engine/sceneManager';

const OPENING_HOLD_MS = 2200;

export async function instrumentsScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state } = ctx;

  hires.hgr();
  hires.hcolor(1);

  // Top frame around the SPEED / TURN / ENERGY meters.
  // Coordinates from INSTRUMENTS.bas:10-20.
  hires.line(123, 145, 1, 145);
  hires.line(1, 145, 1, 128);
  hires.line(1, 128, 279, 128);
  hires.line(279, 128, 279, 145);
  hires.line(279, 145, 157, 145);
  // Center pillar of the TURN indicator
  hires.line(123, 128, 123, 183);
  hires.line(123, 183, 133, 183);
  hires.line(133, 183, 133, 189);
  hires.line(133, 189, 147, 189);
  hires.line(147, 189, 147, 183);
  hires.line(147, 183, 157, 183);
  hires.line(157, 183, 157, 128);

  // Tick marks on the SPEED bar (left), ENERGY bar (right), TURN strip (centre).
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

  // Underline strips below the indicators
  hires.hcolor(5);
  hires.line(5, 177, 117, 177);
  hires.line(163, 177, 277, 177);

  // Indicator pill outlines (manual/auto/missile/laser/orbit/cond/damage/shield)
  hires.hcolor(3);
  for (const [x, y] of [[6, 152], [71, 152], [6, 160], [71, 160], [200, 152], [261, 152], [200, 160], [261, 160], [6, 168], [71, 168]] as Array<[number, number]>) {
    hires.line(x, y, x + 11, y);
    hires.line(x + 11, y, x + 11, y + 5);
    hires.line(x + 11, y + 5, x, y + 5);
    hires.line(x, y + 5, x, y);
  }

  // Labels — text grid coords (col, row) match VTAB/HTAB from INSTRUMENTS.bas:170-200.
  hires.hcolor(1);
  hires.text(' SPEED ', 4, 18);
  hires.text('TURN', 19, 18);
  hires.text(' ENERGY ', 30, 18);
  hires.text('MANUAL', 4, 20);
  hires.text('AUTO', 13, 20);
  hires.text('ORBIT', 24, 20);
  hires.text('DAMAGE', 32, 20);
  hires.text('MISSILE', 4, 21);
  hires.text('LASER', 13, 21);
  hires.text('COND', 24, 21);
  hires.text('SHIELD', 32, 21);
hires.text('RADAR', 4, 22);
hires.text('H/DRIVE', 13, 22);
  hires.text('X', 3, 23);
  hires.text('Y', 9, 23);
  hires.text('Z', 15, 23);
  hires.text('XHDNG', 25, 23);
  hires.text('YHDNG', 34, 23);

  // INSTRUMENTS.bas:210-220 routing decision.
  await new Promise((resolve) => setTimeout(resolve, OPENING_HOLD_MS));
  if (state.savedGameSentinel !== 77) {
    // START.bas:260 runs INSTRUMENTS directly into STARSHIP SIMULATOR after
    // writing the new-game opening coordinates at line 190. ORBIT.bas is only
    // reached later from STARSHIP SIMULATOR.bas:158 after atmospheric climb.
    return scenes.run('starshipSimulator');
  }
  return scenes.run('galaxyMap');
}
