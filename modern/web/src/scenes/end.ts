import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { drawOptions, drawPrompt, getChoice } from '../engine/menu';
import { setScene, log as glog } from '../engine/gameLog';

function drawStats(hires: import('../engine/hires').Hires, state: import('../engine/gameState').GameState): void {
  const conquered = state.planets.filter(p => p.surrendered).length;
  const visited = state.planets.filter(p => p.visited).length;
  const hullPct = 100 - state.damage.hullPct;

  hires.hcolor(3);
  hires.text('CAREER SUMMARY', 13, 10);
  hires.hcolor(1);
  hires.text(`SYSTEMS CONQUERED: ${conquered}/20`, 4, 12);
  hires.text(`SYSTEMS VISITED : ${visited}/20`, 4, 13);
  hires.text(`TOTAL CREDITS   : ${Math.floor(state.credits)}`, 4, 14);
  hires.text(`TROOPS ON BOARD : ${state.forces.troops}`, 4, 15);
  hires.text(`HULL INTEGRITY  : ${hullPct}%`, 4, 16);
  hires.text(`STARDATE        : ${state.stardate.toFixed(1)}`, 4, 17);
  hires.hcolor(5);
  hires.text(`CONDITION: ${state.condition.toUpperCase()}`, 4, 18);
}

export async function endScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input } = ctx;
  setScene('end');

  const allConquered = state.planets.every(p => p.surrendered);

  for (;;) {
    hires.hgr();

    if (allConquered) {
      hires.hcolor(3);
      for (let j = 0; j < 5; j++) {
        const rx = Math.floor(Math.random() * 260) + 10;
        const ry = Math.floor(Math.random() * 170) + 10;
        hires.hplot(rx, ry);
      }

      hires.hcolor(5);
      hires.text('*** CONGRATULATIONS! ***', 8, 1);
      hires.hcolor(3);
      hires.text('ALL STAR SYSTEMS', 10, 3);
      hires.text('ARE UNDER YOUR CONTROL!', 7, 4);
      hires.text('THE GALAXY IS YOURS!', 8, 5);
    } else {
      hires.hcolor(3);
      hires.text('END GAME', 16, 2);
    }

    drawStats(hires, state);

    hires.hcolor(1);
    drawOptions(hires, [
      { key: '1', label: 'SAVE GAME' },
      { key: '2', label: 'CONTINUE PRESENT GAME' },
      { key: '3', label: 'END GAME' },
    ], 5, 20);

    drawPrompt(hires, 8, 20);

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
      hires.hgr();
      hires.hcolor(3);
      if (allConquered) {
        hires.text('YOU HAVE CONQUERED', 9, 4);
        hires.text('THE ENTIRE GALAXY!', 9, 5);
      } else {
        hires.text('GAME OVER', 16, 4);
      }

      drawStats(hires, state);

      hires.hcolor(5);
      hires.text('A NEW LEGEND BEGINS...', 8, 22);
      glog('endGame', `game ended conquered=${state.planets.filter(p => p.surrendered).length} credits=${Math.floor(state.credits)}`);
      localStorage.removeItem('spaceVikingsSave');
      await new Promise(r => setTimeout(r, 5000));
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
