import { setScene, log as glog } from '../engine/gameLog';
import { decodeShapeTableJson } from '../engine/shapeTable';
import type { ShapeTable } from '../engine/shapeTable';
import { drawOrbitScreen, ORBIT_EXIT_STATE } from './orbitScreen';
import type { SceneContext, SceneManager } from '../engine/sceneManager';


export async function orbitScene(
  ctx: SceneContext,
  scenes: SceneManager,
): Promise<void> {
  const { hires, state, loader } = ctx;
  setScene('orbit');

  // Lines 25-37. The values live beside the draw so there is one copy of them.
  state.atmosphere = ORBIT_EXIT_STATE.atmosphere !== 0;
  state.inOrbit = true;
  state.x = ORBIT_EXIT_STATE.x;
  state.y = ORBIT_EXIT_STATE.y;
  state.z = ORBIT_EXIT_STATE.z;
  state.heading = ORBIT_EXIT_STATE.heading;

  if ((state.shipKind as number) === 2) {
    state.shipKind = 3;
  }

  glog('init', `orbit pos=(${state.x},${state.y},${state.z}) heading=${state.heading} ship=${state.shipKind}`);

  // ORBIT.bas lines 1-22, in orbitScreen.ts - checked against the disk at 0 of 53,760
  // pixels. No hgr(): line 10 floods only rows 0-125 and the panel below is flight's.
  let shapes: ShapeTable | null = null;
  try {
    shapes = decodeShapeTableJson(await loader.json('data/shapes/shape-table.json'));
  } catch { /* without it line 2's needle-track erase is skipped */ }
  drawOrbitScreen(hires, shapes);
  await new Promise(r => setTimeout(r, 1200));

  return scenes.run('starshipSimulator');
}
