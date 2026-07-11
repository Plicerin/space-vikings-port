import { setScene, log as glog } from '../engine/gameLog';
import type { SceneContext, SceneManager } from '../engine/sceneManager';

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function orbitScene(
  ctx: SceneContext,
  scenes: SceneManager,
): Promise<void> {
  const { hires, state, audio } = ctx;
  setScene('orbit');

  // ORBIT.bas:25-37
  // POKE 38210,0
  state.atmosphere = false;
  state.inOrbit = true;

  // ORBIT.bas:27
  // X1 = 188:X2 = 2:Y1 = 200:Y2 = 0:Z1 = 208:Z2 = 7
  // These are the low/high bytes written into XI/YI/ZI.
  state.x = 188 + (2 * 256);
  state.y = 200 + (0 * 256);
  state.z = 208 + (7 * 256);

  // ORBIT.bas:28-29
  // Preserve pitch/bank, force heading to 190 for insertion.
  state.heading = 190;

  // ORBIT.bas:30-32
  // BLOAD PLANET # 0, and if 38205 != 0 then BLOAD SHIP # J with 2 -> 3 remap.
  // Live opening capture shows the opening orbit scene carrying ship type 3.
  if (state.shipKind === 0) {
    state.shipKind = 3;
    state.enemyShips = Math.max(state.enemyShips, 30);
  } else if ((state.shipKind as number) === 2) {
    state.shipKind = 3;
  }

  glog('init', `orbit pos=(${state.x},${state.y},${state.z}) heading=${state.heading} ship=${state.shipKind}`);

  audio.beep(660, 200);
  const frames = state.commanderMode ? 4 : 12;
  for (let i = 0; i < frames; i++) {
    hires.hgr();
    hires.hcolor(6);
    for (let y = 0; y <= 125; y++) hires.line(0, y, 279, y);
    hires.hcolor(1);
    hires.text('ORBITAL INSERTION START', 10, 7);
    await wait(state.commanderMode ? 60 : 90);
  }

  return scenes.run('starshipSimulator');
}