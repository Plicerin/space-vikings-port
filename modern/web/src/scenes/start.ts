import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';
import { OPENING_NEW_GAME_STATE } from '../engine/extractedOriginalData';
import { GameState } from '../engine/gameState';
import { applySave, readSave, clearSave, clearGap } from '../engine/diskSave';

export async function startScene(
  ctx: SceneContext,
  scenes: SceneManager,
): Promise<void> {
  const { hires, state, input } = ctx;

  // START.bas:60 — (N)ew or (O)ld game prompt
  // Original: HGR → GOSUB 7500 (title) → show prompt → wait for input
  hires.hgr();
  hires.hcolor(3);

  hires.text('*****************', 12, 8);
  hires.text('*               *', 12, 9);
  hires.text('* SPACE VIKINGS *', 12, 10);
  hires.text('*               *', 12, 11);
  hires.text('* COPYRIGHT1982 *', 12, 12);
  hires.text('*      BY:      *', 12, 13);
  hires.text('* G.M. ROBBINS  *', 12, 14);
  hires.text('*               *', 12, 15);
  hires.text('*****************', 12, 16);

  hires.hcolor(1);
  hires.text('(N)EW GAME OR (O)LD GAME?', 8, 20);
  for (;;) {
    const k = await input.waitForKey();
    const ch = String.fromCharCode(k & 0x7f).toUpperCase();

 if (ch === 'N') {
      glog('start', 'new game');
      Object.assign(state, new GameState());
      Object.assign(state, OPENING_NEW_GAME_STATE);
      state.planets[state.planetIndex].defender = OPENING_NEW_GAME_STATE.shipKind;
      state.planets[state.planetIndex].surrendered = OPENING_NEW_GAME_STATE.planetSurrendered;
      state.enemyShapeLoaded = true;
      const surrCount = state.planets.filter(p => p.surrendered).length;
      glog('start', `planets surrendered: ${surrCount}/${state.planets.length}`);
      // 2000-2050: the -M masters back over the live files, and MISC FILE reset
      // to 100.3, 2000, 10000. Nothing of the old game survives it.
      clearSave();
      clearGap();
      return scenes.run('instruments');
    }


    if (ch === 'V') {
      glog('start', 'vector ship debug');
      return scenes.run('shipVectorDebug');
    }

    if (ch === 'O') {
      // 210: `IF G$ = "O" THEN GOSUB 3000` - BLOAD PLANET FILE, P/F and SHIP'S DATA back,
      // then 3030's `POKE 38391,77`. Only what END 210 BSAVEd is in those three files; the
      // sixteen bytes at 38204-38219 are in none of them, so the enemy, the ground batteries,
      // the surrender and atmosphere flags and the planet we are at all come back as a fresh
      // machine has them. 190 and 195 set the position, and 225 copies the gap over it if
      // this run of the page still holds it.
      const saved = readSave();
      if (!saved) {
        hires.hcolor(5);
        hires.text('THERE IS NO GAME SAVED', 8, 22);
        glog('start', 'no saved game found');
        await wait(2000);
        hires.text('                       ', 8, 22);
        hires.hcolor(1);
        continue;
      }
      const restored = new GameState();
      applySave(restored, saved);
      Object.assign(state, restored);
      glog('start', `loaded saved game, planet ${saved.savedPlanet}`);
      return scenes.run('instruments');
    }
  }
}

function wait(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
