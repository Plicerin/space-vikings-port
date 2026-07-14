import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';

const PLANET_NAMES = [
  'MERCURY', 'VENUS', 'EARTH', 'MARS', 'JUPITER',
  'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO', 'ALPHA',
  'BETA', 'GAMMA', 'DELTA', 'EPSILON', 'ZETA',
  'ETA', 'THETA', 'IOTA', 'KAPPA', 'LAMBDA',
];

export async function recallScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input } = ctx;
  setScene('recall');

  hires.hgr();
  hires.hcolor(3);
  hires.text('RECALL TROOPS', 14, 2);

  hires.hcolor(1);
  hires.line(1, 25, 278, 25);

  const loc = state.forces.troopLocation;
  const troopsPlanet = state.forces.troopPlanetIndex;
  const here = troopsPlanet === state.planetIndex;
  const planetName = troopsPlanet >= 0 && troopsPlanet < PLANET_NAMES.length
    ? PLANET_NAMES[troopsPlanet] : `SYSTEM ${troopsPlanet + 1}`;

  hires.text('TROOP STATUS', 4, 4);
  hires.text(`TROOPS: ${state.forces.troops}`, 4, 6);
  hires.text(`FIGHTERS: ${state.forces.fighters}`, 4, 7);
  hires.text(`TANKS: ${state.forces.tanks}`, 4, 8);
  hires.text(`MISSILES: ${state.forces.groundMissiles}`, 4, 9);
  hires.text(`TRANSPORTS: ${state.forces.transports}`, 4, 10);
  hires.text(`MORALE: ${'*'.repeat(state.forces.morale)}${'.'.repeat(6 - state.forces.morale)}`, 4, 11);
  hires.text(`CREDITS: ${state.credits}`, 4, 12);

  hires.hcolor(1);
  hires.line(1, 100, 278, 100);

  if (troopsPlanet >= 0 && troopsPlanet !== state.planetIndex && loc > 0 && loc < 3) {
    hires.hcolor(5);
    hires.text('TROOPS DEPLOYED ON', 2, 14);
    hires.text(`${planetName}!`, 2, 15);
    hires.hcolor(3);
    hires.text('CANNOT RECALL FROM', 2, 17);
    hires.text('ANOTHER SYSTEM.', 2, 18);
  } else if (state.forces.troops === 0) {
    hires.hcolor(5);
    hires.text('NO TROOPS TO RECALL!', 2, 14);
    state.forces.troopLocation = 0;
  } else if (loc === 1 || loc === 2) {
    hires.hcolor(1);
    hires.text('RECALLING ALL TROOPS!', 2, 14);
    hires.text('TRANSPORTS EN ROUTE.', 2, 15);
    state.forces.troopLocation = 0;
    state.forces.troopPlanetIndex = -1;
    glog('recall', `troops recalled from location ${loc}`);
  } else if (loc === 3) {
    hires.hcolor(6);
    hires.text('TROOPS IN CRYOGENIC', 2, 14);
    hires.text('SLEEP. THAWING NOW!', 2, 15);
  } else {
    hires.hcolor(1);
    hires.text('ALL TROOPS ON BOARD.', 2, 14);
  }

  hires.hcolor(3);
  hires.text('PRESS ANY KEY...', 12, 22);

  if (state.commanderMode) {
    await new Promise(r => setTimeout(r, 60));
    return scenes.run('starshipSimulator');
  }
  await input.waitForKey();

  scenes.run('groundForces');
}
