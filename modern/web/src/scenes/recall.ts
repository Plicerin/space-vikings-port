import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';

export async function recallScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input } = ctx;
  setScene('recall');

  hires.hgr();
  hires.hcolor(1);
  hires.line(1, 1, 139, 1);
  hires.line(139, 1, 139, 110);
  hires.line(139, 110, 1, 110);
  hires.line(1, 110, 1, 1);

  hires.hcolor(3);
  hires.text('RECALL TROOPS', 4, 2);
  hires.hcolor(1);

  const troopsPlanet = state.forces.troopPlanetIndex;
  const loc = state.forces.troopLocation;

  if (troopsPlanet >= 0 && troopsPlanet !== state.planetIndex && loc > 0 && loc < 3) {
    hires.text('TROOPS ARE NOT ON', 2, 4);
    hires.text('THIS PLANET, SIR!', 2, 5);
  } else if (state.forces.troops === 0) {
    hires.text('WE HAVE NO TROOPS', 2, 4);
    hires.text('LEFT, SIR!', 2, 5);
    state.forces.troopLocation = 0;
  } else if (loc === 1 || loc === 2) {
    hires.text('TROOPS ARE BEING', 2, 4);
    hires.text('RECALLED, SIR!', 2, 5);
    state.forces.troopLocation = 0;
    state.forces.troopPlanetIndex = -1;
    glog('recall', `troops recalled from location ${loc}`);
  } else if (loc === 3) {
    hires.text('TROOPS ARE IN', 2, 4);
    hires.text('CRYOGENIC SLEEP!', 2, 5);
  } else {
    hires.text('TROOPS ARE ALREADY', 2, 4);
    hires.text('ON BOARD, SIR!', 2, 5);
  }

  hires.hcolor(5);
  hires.text('PRESS ANY KEY...', 2, 20);
  if (state.commanderMode) {
    await new Promise(r => setTimeout(r, 60));
    return scenes.run('starshipSimulator');
  }
  await input.waitForKey();

  return scenes.run('groundForces');
}
