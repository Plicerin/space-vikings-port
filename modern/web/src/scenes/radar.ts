// Radar overlay — port of RADAR.bas.
//
// Replaces the forward view with a violet-bordered grid showing the
// surrounding space, with a small green crosshair at center. Pressing
// SPACE triggers a Ship ID display (delegated to a dedicated scene in
// the original — RUN SHIP # J I.D.). Pressing X cancels and returns
// to the cockpit.

import type { SceneContext, SceneManager } from '../engine/sceneManager';

export async function radarScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input } = ctx;

  if (state.damage.radarPct === 0) {
    // RADAR.bas:10 — bail back to the cockpit if radar is offline.
    return scenes.run('starshipSimulator');
  }

  hires.hgr();

  // Outer frame (violet) — RADAR.bas:2005-2032.
  hires.hcolor(2);
  hires.line(0, 0, 0, 123);
  hires.line(0, 123, 278, 123);
  hires.line(278, 123, 278, 0);
  hires.line(278, 0, 0, 0);
  hires.line(277, 0, 277, 123);
  // Diagonal sweep guides — RADAR.bas:2033.
  hires.line(1, 0, 131, 59);
  hires.line(279, 0, 151, 59);
  hires.line(151, 67, 279, 123);
  hires.line(1, 123, 131, 67);
  // Center axes — RADAR.bas:2040.
  hires.line(140, 1, 140, 55);
  hires.line(140, 71, 140, 123);
  hires.line(1, 63, 131, 63);
  hires.line(151, 63, 279, 63);

  // Center crosshair box (green) — RADAR.bas:2042.
  hires.hcolor(1);
  hires.line(137, 60, 137, 66);
  hires.line(137, 66, 145, 66);
  hires.line(145, 66, 145, 60);
  hires.line(145, 60, 137, 60);
  hires.line(141, 63, 141, 63);

  // Manual: SPACE BAR scans and identifies Starships in orbit.
  // SPACE again returns to radar. X cancels radar mode.
  for (;;) {
    const k = await input.waitForKey();
    const ch = String.fromCharCode(k & 0x7f).toUpperCase();
    if (ch === 'X') {
      return scenes.run('starshipSimulator');
    }
    if (ch === ' ') {
      // Scan for ships — show Ship ID, then return to radar display
      await scenes.run('shipId');
      // Redraw radar after returning from ship ID
      hires.hgr();
      hires.hcolor(2);
      hires.line(0, 0, 0, 123);
      hires.line(0, 123, 278, 123);
      hires.line(278, 123, 278, 0);
      hires.line(278, 0, 0, 0);
      hires.line(277, 0, 277, 123);
      hires.line(1, 0, 131, 59);
      hires.line(279, 0, 151, 59);
      hires.line(151, 67, 279, 123);
      hires.line(1, 123, 131, 67);
      hires.line(140, 1, 140, 55);
      hires.line(140, 71, 140, 123);
      hires.line(1, 63, 131, 63);
      hires.line(151, 63, 279, 63);
      hires.hcolor(1);
      hires.line(137, 60, 137, 66);
      hires.line(137, 66, 145, 66);
      hires.line(145, 66, 145, 60);
      hires.line(145, 60, 137, 60);
      hires.line(141, 63, 141, 63);
      continue;
    }
  }
}
