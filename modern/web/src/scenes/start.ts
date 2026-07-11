import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';
import { OPENING_NEW_GAME_STATE } from '../engine/extractedOriginalData';
import { GameState } from '../engine/gameState';

export async function startScene(
  ctx: SceneContext,
  scenes: SceneManager,
): Promise<void> {
  const { hires, state, input } = ctx;

  // START.bas:7500 — title plate
  hires.hgr();
  hires.hcolor(3);
  hires.text('*****************', 12, 8);
  hires.text('*               *', 12, 9);
  hires.text('* SPACE VIKINGS *', 12, 10);
  hires.text('*               *', 12, 11);
  hires.text('* COPYRIGHT1982 *', 12, 12);
  hires.text('* BY:           *', 12, 13);
  hires.text('* G.M. ROBBINS  *', 12, 14);
  hires.text('*               *', 12, 15);
  hires.text('*****************', 12, 16);

  // START.bas:8000-9090 — starfield + perspective ground
  const titleStars = [
    [35, 8], [83, 18], [121, 24], [204, 11], [245, 28], [264, 17],
    [18, 42], [61, 57], [154, 50], [219, 63], [257, 70], [271, 54],
    [29, 102], [47, 118], [88, 131], [126, 111], [175, 138], [221, 124], [258, 145],
    [17, 162], [69, 170], [103, 181], [166, 173], [214, 166], [248, 182],
  ] as const;
  hires.hcolor(5);
  for (const [x, y] of titleStars) {
    hires.hplot(x, y);
    hires.hplot(x + 1, y);
    hires.hplot(x, y + 1);
  }

  hires.hcolor(1);
  let j = 100;
  let b = 0;
  const c = 0.4;
  while (j + (b + c) <= 189) {
    hires.line(0, j, 279, j);
    b = b + c;
    j = j + b;
  }

  let d = 8;
  const e = 0.22;
  let y = 189;
  let x2 = 0;
  for (let jj = 0; jj <= 38; jj += 2) {
    hires.line(140 + jj, 100, 140 + x2, y);
    hires.line(140 - jj, 100, 140 - x2, y);
    x2 += 19;
    if (x2 > 138) { x2 = 138; d = d - e; y = y - d; }
  }
  hires.line(141, 100, 141, 189);

  // START.bas:1001/1010 — credits
  hires.hcolor(3);
  hires.text('SUBLOGIC PRESENTS:', 12, 20);
  hires.text('A SIMULATION GAME BY MITCHELL ROBBINS', 2, 21);

  // START.bas:60 — (N)ew or (O)ld game prompt
  hires.hgr();
  hires.hcolor(3);

  hires.text('*****************', 12, 8);
  hires.text('*               *', 12, 9);
  hires.text('* SPACE VIKINGS *', 12, 10);
  hires.text('*               *', 12, 11);
  hires.text('* COPYRIGHT1982 *', 12, 12);
  hires.text('* BY:           *', 12, 13);
  hires.text('* G.M. ROBBINS  *', 12, 14);
  hires.text('*               *', 12, 15);
  hires.text('*****************', 12, 16);

  hires.hcolor(1);
  hires.text('(N)EW GAME OR (O)LD GAME?', 8, 20);
  hires.hcolor(5);
  hires.text('C = THREE-D PROTOTYPE', 11, 22);
  hires.text('V = VECTOR SHIP DEBUG', 11, 23);
  hires.text('PRESS ESC IN COCKPIT FOR CONTROLS', 5, 21);

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
      localStorage.removeItem('spaceVikingsSave');
      return scenes.run('instruments');
    }


    if (ch === 'V') {
      glog('start', 'vector ship debug');
      return scenes.run('shipVectorDebug');
    }

    if (ch === 'O') {
      const saved = localStorage.getItem('spaceVikingsSave');
      if (!saved) {
        hires.hcolor(5);
        hires.text('THERE IS NO GAME SAVED', 8, 22);
        glog('start', 'no saved game found');
        await wait(2000);
        hires.text('                       ', 8, 22);
        hires.hcolor(1);
        continue;
      }
      try {
        const data = JSON.parse(saved);
        if (!data || typeof data !== 'object' || data.savedGameSentinel !== 77) {
          throw new Error('invalid or unsaved game');
        }
        if (!('planets' in data) || !Array.isArray(data.planets)) {
          throw new Error('invalid save schema');
        }
        const restored = new GameState();
        Object.assign(restored, data);

        // Merge nested objects to avoid losing defaults when old saves miss keys.
        if (data.damage) Object.assign(restored.damage, data.damage);
        if (data.forces) Object.assign(restored.forces, data.forces);
        if (data.loot) Object.assign(restored.loot, data.loot);

        // Restore planets with forward-compatible defaults if saved fields are missing.
        if (Array.isArray(data.planets)) {
          const basePlanets = new GameState().planets;
          const loadedPlanets = data.planets as Array<Partial<typeof state.planets[number]>>;
          restored.planets = basePlanets.map((basePlanet, i) => {
            const rawPlanet = loadedPlanets[i];
            if (!rawPlanet || typeof rawPlanet !== 'object') return { ...basePlanet };
            const planet = rawPlanet as Partial<typeof state.planets[number]>;
            return {
              ...basePlanet,
              ...planet,
              looted: planet.looted ?? basePlanet.looted,
            };
          });
        } else {
          restored.planets = new GameState().planets;
        }
        restored.pendingConquestCollectionPlanet = restored.pendingConquestCollectionPlanet ?? null;
        // Keyboard state should not leak across sessions.
        restored.pendingKey = null;
        restored.laserOperational = restored.damage.laserOperational;
        Object.assign(state, restored);
        glog('start', 'loaded saved game');
        return scenes.run('instruments');
      } catch {
        localStorage.removeItem('spaceVikingsSave');
        hires.hcolor(5);
        hires.text('SAVE DATA CORRUPT', 8, 22);
        glog('start', 'save data corrupt');
        await wait(2000);
        continue;
      }
    }
  }
}

function wait(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
