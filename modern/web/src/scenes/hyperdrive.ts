// Hyperdrive jump — port of H_D.bas.
//
// Validates preconditions (not in atmosphere, destination set, energy left),
// plays a "warp" effect (random radial lines from screen centre), updates
// stardate and position, sets new planet index, generates random arrival
// XYZ coordinates per H_D.bas:50-72.

import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { log as glog } from '../engine/gameLog';
import { clearPendingConquestCollection } from '../engine/commander';
import { EXTRACTED_ARRIVAL_STATE_BY_PLANET } from '../engine/extractedOriginalData';

export async function hyperdriveScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input, audio } = ctx;

  // H_D.bas:1 — guards. Atmosphere, same-system, no destination → abort.
  if (
    state.atmosphere ||
    state.navDestination === null ||
    state.navDestination === state.planetIndex
  ) {
    return scenes.run('starshipSimulator');
  }
  // H_D.bas:2-4 — out of energy.
  if (state.energy === 0) {
    hires.hgr();
    hires.hcolor(2);
    hires.text('OUT OF ENERGY', 14, 12);
    await new Promise((r) => setTimeout(r, 2000));
    hires.text('ORBIT DECAYING', 14, 12);
    await new Promise((r) => setTimeout(r, 2000));
    return scenes.run('playerDeath');
  }

  const src = state.planets[state.planetIndex];
  const dst = state.planets[state.navDestination!];
  const sourcePlanet = state.planetIndex;
  const dx = Math.abs(src.x - dst.x);
  const dy = Math.abs(src.y - dst.y);
  const dz = Math.abs(src.z - dst.z);
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  state.jumpDistance = distance;
  glog('hyperdrive', `jumping to ${dst.name} dist=${distance.toFixed(1)}`);

  // Warp effect — H_D.bas:18-20. Radial lines from screen centre (vanishing point).
  hires.hgr();
  hires.hcolor(3);
  audio.beep(80, 200);
  const centerX = 140;
  const centerY = 63;
  for (let i = 0; i < 175; i++) {
    // Generate random angle and length for each streak
    const angle = Math.random() * Math.PI * 2;
    const length = 20 + Math.random() * 100; // Varying lengths for depth
    const endX = centerX + Math.cos(angle) * length;
    const endY = centerY + Math.sin(angle) * length;
    hires.line(centerX, centerY, endX, endY);
    if (i % 30 === 0) audio.click();
    // Yield occasionally so the animation paces.
    if (!state.commanderMode && i % 25 === 0) await new Promise((r) => setTimeout(r, 16));
  }

  // Apply state changes.
  state.stardate += distance + 0.3;
  state.planetIndex = state.navDestination;
  state.navDestination = null;
  state.commanderMapTarget = null;
  state.planetSurrendered = false;
  state.planetVitality = 0;
  state.shipVitality = 0;
  state.atmosphere = false;
  state.inOrbit = false;
  state.planetSurrendered = state.planets[state.planetIndex]?.surrendered ?? false;
  clearPendingConquestCollection(state, sourcePlanet);

  const extractedArrival = EXTRACTED_ARRIVAL_STATE_BY_PLANET[state.planetIndex];
  if (extractedArrival) {
    state.planetVitalityLimit = extractedArrival.planetVitalityLimit;
    state.shipDestructionLimit = extractedArrival.shipDestructionLimit;
    state.shipKind = extractedArrival.shipKind;
    state.enemyShips = extractedArrival.enemyShips;
    state.planetSurrendered = extractedArrival.planetSurrendered;
    state.atmosphere = extractedArrival.atmosphere;
  } else {
    state.planetVitalityLimit = 0;
    state.shipDestructionLimit = 0;
    state.shipKind = 0;
    state.enemyShips = 0;
  }

  // H_D.bas:15 — mark planet as visited
  state.planets[state.planetIndex].visited = true;

  // Generate arrival position — H_D.bas:50-75.
  state.x = Math.round(10000 - Math.random() * 20000);
  state.y = Math.round(5000 - Math.random() * 10000);
  let z = 0;
  do {
    z = Math.round(10000 - Math.random() * 20000);
  } while (Math.abs(z) < 7000);
  state.z = z;
  state.heading = Math.floor(Math.random() * 256);
  state.pitch = 128;
  state.bank = 128;

  // Decrement energy.
  state.energy = Math.max(0, state.energy - Math.ceil(distance));

  hires.hcolor(1);
  hires.text('JUMP COMPLETE', 13, 12);
  await new Promise((r) => setTimeout(r, state.commanderMode ? 60 : 1000));
  return scenes.run('starshipSimulator');
}
