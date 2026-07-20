import { setScene, log as glog } from '../engine/gameLog';
import type { GameState } from '../engine/gameState';
import type { Hires } from '../engine/hires';
import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { drawApproachPlanetPointCloud } from './cockpit';

const PLANET_NAMES = [
  'MERCURY', 'VENUS', 'EARTH', 'MARS', 'JUPITER',
  'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO', 'ALPHA',
  'BETA', 'GAMMA', 'DELTA', 'EPSILON', 'ZETA',
  'ETA', 'THETA', 'IOTA', 'KAPPA', 'LAMBDA',
];

function renderOrbitView(hires: Hires, state: GameState, planetIndex: number): void {
  hires.hgr();

  const cx = 140;
  const cy = 58;
  const left = 10;
  const right = 270;
  const top = 4;
  const bottom = 100;
  const sweep = state.x * 0.012 + state.z * 0.009
    + (state.heading / 256 * 6.2832) * 9;

  drawApproachPlanetPointCloud(
    hires, cx, cy, left, right, top, bottom,
    planetIndex + 1, sweep,
  );

  hires.hcolor(3);
  hires.line(0, 103, 279, 103);

  hires.hcolor(1);
  const name = PLANET_NAMES[planetIndex] ?? `SYSTEM ${planetIndex + 1}`;
  hires.text(`ORBIT: ${name}`, 2, 1);
  const alt = Math.round((state.y - 200) / 2);
  hires.text(`ALT: ${alt}KM`, 2, 2);

  hires.hcolor(5);
  hires.text('SENSORS: CLEAR', 2, 14);
  hires.text(`ENEMY: ${state.enemyShips}`, 2, 15);
  hires.text(`ENERGY: ${state.energy}`, 2, 16);

  hires.hcolor(3);
  hires.text('ORBITAL INSERTION', 11, 24);
}

export async function orbitScene(
  ctx: SceneContext,
  scenes: SceneManager,
): Promise<void> {
  const { hires, state } = ctx;
  setScene('orbit');

  state.atmosphere = false;
  state.inOrbit = true;
  state.x = 188 + (2 * 256);
  state.y = 200;
  state.z = 208 + (7 * 256);
  state.heading = 190;

  if ((state.shipKind as number) === 2) {
    state.shipKind = 3;
  }

  glog('init', `orbit pos=(${state.x},${state.y},${state.z}) heading=${state.heading} ship=${state.shipKind}`);

  renderOrbitView(hires, state, state.planetIndex);
  await new Promise(r => setTimeout(r, 1200));

  return scenes.run('starshipSimulator');
}
