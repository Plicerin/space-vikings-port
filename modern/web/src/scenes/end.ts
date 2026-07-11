import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { drawOptions, drawPrompt, getChoice } from '../engine/menu';
import { setScene, log as glog } from '../engine/gameLog';

export async function endScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input } = ctx;
  setScene('end');

  const allConquered = state.planets.every(p => p.surrendered);

  for (;;) {
    hires.hgr();
    hires.hcolor(3);

    if (allConquered) {
      hires.text('CONGRATULATIONS!', 12, 1);
      hires.text('ALL STAR SYSTEMS', 10, 2);
      hires.text('ARE UNDER YOUR CONTROL!', 7, 3);
    } else {
      hires.text('END GAME', 16, 2);
    }
    hires.hcolor(1);

    drawOptions(hires, [
      { key: '1', label: 'SAVE GAME' },
      { key: '2', label: 'CONTINUE PRESENT GAME' },
      { key: '3', label: 'END GAME' },
    ], 5, 7);

    drawPrompt(hires, 9, 7);

    const c = await getChoice(input, hires, 1, 3);

    if (c === 1) {
      if (!state.inOrbit) {
        hires.hcolor(5);
        hires.text('YOU MUST BE IN ORBIT', 2, 14);
        hires.text('TO SAVE GAME.', 2, 15);
        await new Promise(r => setTimeout(r, 2000));
      } else {
        state.savedGameSentinel = 77;
        saveGame(state);
        hires.hcolor(1);
        hires.text('GAME SAVED.', 2, 14);
        glog('save', 'game saved to localStorage');
        await new Promise(r => setTimeout(r, 2000));
      }
    } else if (c === 2) {
      return scenes.run('starshipSimulator');
    } else if (c === 3) {
      hires.hcolor(5);
      hires.text('GAME OVER', 16, 12);
      glog('endGame', 'player ended game');
      localStorage.removeItem('spaceVikingsSave');
      await new Promise(r => setTimeout(r, 3000));
      return scenes.run('start');
    }
  }
}

function saveGame(state: import('../engine/gameState').GameState): void {
  const data = {
    x: state.x, y: state.y, z: state.z,
    pitch: state.pitch, bank: state.bank, heading: state.heading,
    speed: state.speed, energy: state.energy,
    hyperdriveActive: state.hyperdriveActive,
    commanderMode: state.commanderMode,
    atmosphere: state.atmosphere, inOrbit: state.inOrbit,
    planetIndex: state.planetIndex, shipKind: state.shipKind,
    stardate: state.stardate, credits: state.credits,
    planetSurrendered: state.planetSurrendered,
    weaponMode: state.weaponMode, condition: state.condition,
    shieldsOn: state.shieldsOn, autopilot: state.autopilot,
    laserType: state.laserType, pendingConquestCollectionPlanet: state.pendingConquestCollectionPlanet,
    planetVitality: state.planetVitality, shipVitality: state.shipVitality,
    planetVitalityLimit: state.planetVitalityLimit, shipDestructionLimit: state.shipDestructionLimit,
    missilesRemaining: state.missilesRemaining,
    laserOperational: state.laserOperational,
    enemyShips: state.enemyShips,
    savedGameSentinel: state.savedGameSentinel,
    missileMode: state.missileMode,
    antiFighterTurrets: state.antiFighterTurrets,
    jumpDistance: state.jumpDistance,
    forceRedraw: state.forceRedraw,
    shoreLeaveMode: state.shoreLeaveMode,
    damage: { ...state.damage },
    forces: { ...state.forces },
    loot: { ...state.loot },
    planets: state.planets.map(p => ({ ...p })),
    navDestination: state.navDestination,
    commanderMapTarget: state.commanderMapTarget,
  };
  localStorage.setItem('spaceVikingsSave', JSON.stringify(data));
}
