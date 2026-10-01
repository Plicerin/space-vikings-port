import { setScene, log as glog } from '../engine/gameLog';
import { decodeShapeTableJson } from '../engine/shapeTable';
import type { ShapeTable } from '../engine/shapeTable';
import { drawReentryScreen, REENTRY_EXIT_STATE, reentryX } from './reentryScreen';
import type { SceneContext, SceneManager } from '../engine/sceneManager';

export async function reentryScene(
  ctx: SceneContext,
  scenes: SceneManager,
): Promise<void> {
  const { hires, state, loader } = ctx;
  setScene('reentry');

  // RE.bas lines 1-22 and 27-35, in reentryScreen.ts beside ORBIT's, because this file is
  // carrying another agent's uncommitted work.
  //
  // Three things here were wrong and the last of them made the game unplayable. The flood at
  // line 10 is `HCOLOR= 5`, orange, not black. The text at line 20 is inverse, from line 5's
  // `POKE 973,255`, with a blank band above and below it. And the position bytes go through
  // line 6600's signed decode: `Y1 = 0: Y2 = 4` is Y 1024 rather than 0, and `Z1 = 168:
  // Z2 = 228` is Z **-7000**, not 58,536 - taken unsigned it landed past line 133's
  // 20,000-unit wrap, so every re-entry threw the ship to the edge of the map. Found by
  // playing: flying into the planet put the ship at Z -19,365.
  let shapes: ShapeTable | null = null;
  try {
    shapes = decodeShapeTableJson(await loader.json('data/shapes/shape-table.json'));
  } catch { /* without it line 2's needle-track erase is skipped */ }
  drawReentryScreen(hires, shapes);

  // RE.bas:25-37
  state.atmosphere = REENTRY_EXIT_STATE.atmosphere !== 0;
  state.inOrbit = false;
  state.x = reentryX(state.x);
  state.y = REENTRY_EXIT_STATE.y;
  state.z = REENTRY_EXIT_STATE.z;
  state.heading = REENTRY_EXIT_STATE.heading;

  glog('init', `reentry pos=(${state.x},${state.y},${state.z}) heading=${state.heading} planet=${state.planetIndex}`);
  return scenes.run('starshipSimulator');
}