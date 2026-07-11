import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { drawOptions, drawPrompt, getChoice, writeLines, clearLines } from '../engine/menu';
import { setScene, log as glog } from '../engine/gameLog';
import { chooseCommanderScene, isCurrentPlanetConquered, markPlanetConquered } from '../engine/commander';
import type { GameState } from '../engine/gameState';

async function wait(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function commanderWait(state: GameState, ms: number): Promise<void> {
  await wait(state.commanderMode ? Math.min(ms, 60) : ms);
}

export async function groundForcesScene(
  ctx: SceneContext,
  scenes: SceneManager,
): Promise<void> {
  const { hires, state, input, audio } = ctx;
  setScene('groundForces');

  for (;;) {
    hires.hgr();
    hires.hcolor(1);
    hires.line(1, 1, 139, 1);
    hires.line(139, 1, 139, 110);
    hires.line(139, 110, 1, 110);
    hires.line(1, 110, 1, 1);

    hires.hcolor(3);
    hires.text('GROUND FORCES', 4, 2);
    hires.hcolor(1);

    const hasBase = state.planets[state.planetIndex].hasBase;

    drawOptions(hires, [
      { key: '1', label: 'ATTACK PLANET' },
      { key: '2', label: 'RECALL TROOPS' },
      { key: '3', label: 'SHORE LEAVE' },
      { key: '4', label: 'ENLIST TROOPS' },
      { key: '5', label: 'SELL LOOT' },
      { key: '6', label: 'REPAIR/RESTOCK' },
      { key: '7', label: 'ESTABLISH BASE' },
      { key: '8', label: 'CRYOGENICS' },
      { key: '9', label: 'RETURN' },
    ], 4, 2);

    drawPrompt(hires, 14, 2);

    if (state.commanderMode) {
      const next = chooseCommanderScene(state);
      if (next && next !== 'groundForces') {
        return scenes.run(next);
      }

      const c = commanderChoice(state);
      if (c === 1) {
        return attackPlanet(ctx, scenes);
      }
      if (c === 2) {
        return scenes.run('recall');
      }
      if (c === 3) {
        state.shoreLeaveMode = 0;
        return scenes.run('shoreLeave');
      }
      if (c === 4) {
        state.shoreLeaveMode = 1;
        return scenes.run('shoreLeave');
      }
      if (c === 5) {
        state.shoreLeaveMode = 2;
        return scenes.run('shoreLeave');
      }
      if (c === 6) {
        state.shoreLeaveMode = 3;
        return scenes.run('shoreLeave');
      }
      if (c === 7) {
        state.shoreLeaveMode = 4;
        return scenes.run('shoreLeave');
      }
      if (c === 8) {
        state.shoreLeaveMode = 5;
        return scenes.run('shoreLeave');
      }
      return scenes.run('com');
    }

    const c = await getChoice(input, hires, 1, 9);

    if (c >= 3 && c <= 6 && !hasBase) {
      hires.hcolor(5);
      writeLines(hires, 2, 16, ['NO BASE ON THIS', 'PLANET!'], 5);
      await wait(2000);
      continue;
    }

    if (c === 4 && state.forces.troopLocation !== 0) {
      hires.hcolor(5);
      writeLines(hires, 2, 16, ['DO YOU REALLY', 'EXPECT ANYONE TO', 'ENLIST!? YOU LEFT', 'YOUR TROOPS ON', 'ANOTHER PLANET!'], 5);
      await wait(2000);
      continue;
    }

    if (c === 1 && state.forces.troopLocation !== 0 && state.forces.troopLocation !== 3) {
      hires.hcolor(5);
      writeLines(hires, 2, 16, ["YOU CAN'T ATTACK!", 'YOU LEFT', 'YOUR TROOPS ON', 'ANOTHER PLANET!'], 5);
      await wait(2000);
      continue;
    }

    if (c === 1) return attackPlanet(ctx, scenes);
    if (c === 2) return scenes.run('recall');
    if (c === 3) { state.shoreLeaveMode = 0; return scenes.run('shoreLeave'); }
    if (c === 4) { state.shoreLeaveMode = 1; return scenes.run('shoreLeave'); }
    if (c === 5) { state.shoreLeaveMode = 2; return scenes.run('shoreLeave'); }
    if (c === 6) { state.shoreLeaveMode = 3; return scenes.run('shoreLeave'); }
    if (c === 7) { state.shoreLeaveMode = 4; return scenes.run('shoreLeave'); }
    if (c === 8) { state.shoreLeaveMode = 5; return scenes.run('shoreLeave'); }
    if (c === 9) return scenes.run('com');
  }
}

function commanderChoice(state: GameState): number {
  if (!isCurrentPlanetConquered(state)) {
    if (state.forces.troopLocation !== 0 && state.forces.troopLocation !== 3) {
      return 2;
    }
    return 1;
  }

  // On surrendered worlds, stay in orbit and move on unless manual
  // operations are required by command routing.
  if (state.forces.troopLocation !== 0 && state.forces.troopLocation !== 3) {
    return 2;
  }
  if (state.forces.troopLocation === 3) {
    return 8;
  }
  return 9;
}

async function attackPlanet(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input, audio } = ctx;

  hires.hgr();
  hires.hcolor(5);
  hires.line(7, 12, 271, 12);
  hires.line(271, 12, 271, 76);
  hires.line(271, 76, 7, 76);
  hires.line(7, 76, 7, 12);

  hires.hcolor(3);
  hires.text('GROUND FORCES', 13, 2);
  hires.text('BATTLE IN', 8, 4);
  hires.text('PROGRESS', 8, 5);

  if (state.planetSurrendered) {
    state.planetVitality = 25;
  }

  hires.hcolor(1);
  hires.text('FIGHTERS:', 24, 4);
  hires.text('TRANSPORTS:', 22, 5);
  hires.text('TROOPS:', 26, 6);
  hires.text('TANKS:', 27, 7);
  hires.text('MISSILES:', 24, 8);

  hires.text('PROBABILITY', 5, 7);
  hires.text('OF SUCCESS:', 6, 8);

  hires.text('COMPUTER', 8, 10);
  hires.text('STATUS', 25, 10);
  hires.text('PROJECTION', 8, 11);

  state.forces.troopLocation = 1;
  state.forces.troopPlanetIndex = state.planetIndex;

  let fighters = state.forces.fighters;
  let transports = state.forces.transports;
  let tanks = state.forces.tanks;
  let missiles = state.forces.groundMissiles;
  let troops = state.forces.troops;

  const maxBoarded = transports * 1000;
  let troopsLeft = 0;
  if (troops > maxBoarded) {
    troopsLeft = troops - maxBoarded;
    troops = maxBoarded;
  }

  if (state.enemyShips === 0 && state.planetSurrendered) {
    return scenes.run('com');
  }

  if (transports === 0) {
    hires.hcolor(5);
    writeLines(hires, 2, 12, ['THERE ARE NO', 'TRANSPORTS', 'AVAILABLE!'], 5);
    await commanderWait(state, 2000);
    return scenes.run('com');
  }

  hires.hcolor(1);
  writeLines(hires, 2, 12, ['ALL TRANSPORTS', 'AWAY, SIR!']);
  audio.beep(440, 100);
  await wait(2000);

  if (!state.atmosphere) {
    writeLines(hires, 2, 14, ['TRANSPORTS ENTERING', 'ATMOSPHERE!']);
    await commanderWait(state, 2000);
  }

  if (fighters > 0) {
    writeLines(hires, 2, 16, ['FIGHTERS LAUNCHING', 'FROM TRANSPORTS!']);
    await commanderWait(state, 2000);
  }

  const tech = state.planets[state.planetIndex].defender;

  hires.hcolor(1);
  if (tech === 0) {
    writeLines(hires, 2, 12, ['PLANET IS NON', 'HABITABLE. THERE IS NO', 'ENEMY TO RESIST', 'LANDING FORCE.']);
    await commanderWait(state, 3000);
    markPlanetConquered(state);
    glog('attack', 'surrendered - no resistance');
    await commanderWait(state, 2000);
    hires.text('TROOPS COLLECTING', 2, 12);
    hires.text('LOOT.', 2, 13);
    await commanderWait(state, 1500);
    return scenes.run('collect');
  } else if (tech === 1) {
    writeLines(hires, 2, 12, ['PLANET IS VERY PRIMITIVE.', 'THE LOCAL INHABITANTS ARE', 'UNABLE TO RESIST THE', 'LANDING FORCE!!!', 'PLANET SECURE WITH', 'MINIMUM OF FIGHTING!']);
    state.planetVitality = 0;
    await commanderWait(state, 3000);
  } else if (tech === 2) {
    writeLines(hires, 2, 12, ['PLANET IS IN THE LIMITED', 'ATOMIC STAGE OF', 'DEVELOPMENT!']);
    await commanderWait(state, 3000);
    if (!state.planetSurrendered) {
      hires.text('ATTACK FORCE IS', 2, 15);
      hires.text('MEETING RESISTANCE!!', 2, 16);
      await commanderWait(state, 2000);
    }
  } else if (tech === 3) {
    writeLines(hires, 2, 12, ['PLANET HAS COMPARABLE', 'TECHNOLOGY TO US!']);
    await commanderWait(state, 3000);
    writeLines(hires, 2, 15, ['HEAVY COUNTER ATTACK', 'HAS BEEN LAUNCHED!']);
    await commanderWait(state, 3000);
  } else {
    writeLines(hires, 2, 12, ['PLANET HAS SUPERIOR', 'TECHNOLOGY TO OURS!']);
    await commanderWait(state, 3000);
    if (!state.planetSurrendered) {
      writeLines(hires, 2, 15, ['THE ENEMY HAS LAUNCHED', 'A VERY HEAVY', 'COUNTER ATTACK!!!', 'GOOD LUCK, SIR!!!']);
      await commanderWait(state, 2000);
    }
  }

  let sp = state.planetVitalityLimit;
  let vp = state.planetVitality;

  for (let round = 0; round < 200; round++) {
    let x: number;
    const vic = Math.random() * (10 * tech);

    let t2: number, t3: number;
    if (vic < 20) {
      t2 = 500 + Math.random() * 20;
      t3 = 200 + Math.random() * 5;
      x = Math.random() * (12 / (tech + 0.5));
    } else {
      t2 = 200 + Math.random() * 5;
      t3 = 500 + Math.random() * 5;
      x = -(Math.random() * (10 / (tech + 0.5)));
    }

    tanks -= Math.random() * Math.random() * 5;
    fighters -= Math.random() * Math.random() * 5;
    missiles -= Math.random() * Math.random() * 5;
    transports -= Math.random() * Math.random() * 0.5;
    troops -= Math.random() * Math.random() * tech * Math.random() * t2;

    if (state.shipKind > 0) x -= Math.random();

    const ps = Math.min(100, Math.round((100 / (sp + 0.01)) * vp));
    x += (state.forces.morale - 3);
    vp += x;

    vp = Math.max(0, Math.min(255, vp));
    tanks = Math.max(0, tanks);
    fighters = Math.max(0, fighters);
    missiles = Math.max(0, missiles);
    transports = Math.max(0, transports);
    troops = Math.max(0, troops);

    state.forces.fighters = Math.round(fighters);
    state.forces.transports = Math.round(transports);
    state.forces.tanks = Math.round(tanks);
    state.forces.groundMissiles = Math.round(missiles);

    hires.hcolor(1);
    hires.text(`${Math.round(fighters)}   `, 33, 4);
    hires.text(`${Math.round(transports)}   `, 33, 5);
    hires.text(`${Math.round(troops)}   `, 33, 6);
    hires.text(`${Math.round(tanks)}   `, 33, 7);
    hires.text(`${Math.round(missiles)}   `, 33, 8);
    hires.text(`${ps}%   `, 18, 7);

    audio.beep(200 + Math.random() * 200, 30);
    await commanderWait(state, 200);

    if (vp >= sp) {
      state.planetVitality = 0;
      markPlanetConquered(state);
        hires.hcolor(3);
        clearLines(hires, 2, 12, 30, 6);
        writeLines(hires, 2, 12, ['THE PLANET HAS', 'SURRENDERED!'], 3);
        glog('attack', 'victory');
        await commanderWait(state, 3000);

        if (state.planets.every(p => p.surrendered)) {
          writeLines(hires, 2, 15, ['ALL SYSTEMS HAVE', 'SURRENDERED!', 'YOU HAVE WON!'], 3);
          glog('victory', 'all 20 systems conquered');
          await commanderWait(state, 5000);
          return scenes.run('end');
        }

        writeLines(hires, 2, 12, ['TROOPS ARE NOW', 'COLLECTING LOOT.']);
      await commanderWait(state, 1500);
      state.forces.troops = Math.round(troops) + troopsLeft;
      return scenes.run('collect');
    }

  if (Math.round(transports) === 0) {
    state.planets[state.planetIndex].groundAssaultFailed = true;
    state.forces.troopLocation = 0;
    state.forces.troopPlanetIndex = -1;
    state.forces.troops = 0;
    state.pendingGroundForcesDefeatPlanet = state.planetIndex;
    state.pendingGroundForcesNeedsRecovery = true;
      hires.hcolor(5);
      clearLines(hires, 2, 12, 30, 6);
      writeLines(hires, 2, 12, ['THE BATTLE IS LOST!', 'ALL TROOPS HAVE BEEN', 'DESTROYED!!!'], 5);
      glog('attack', 'defeat - troops lost');
      await commanderWait(state, 3000);
      return scenes.run('com');
    }

    const k = input.peekKey();
    if (k > 0) {
      input.clearKey();
      const ch = String.fromCharCode(k & 0x7f).toUpperCase();
      if (ch === 'R') {
        state.planets[state.planetIndex].groundAssaultFailed = true;
        state.forces.troopLocation = 0;
        state.forces.troopPlanetIndex = -1;
        state.forces.troops = Math.round(troops) + troopsLeft;
        let m = state.forces.morale - 1;
        if (m < 1) m = 1;
        state.pendingGroundForcesDefeatPlanet = state.planetIndex;
        state.pendingGroundForcesNeedsRecovery = true;
        state.forces.morale = m as 1 | 2 | 3 | 4 | 5 | 6;
        hires.hcolor(5);
        clearLines(hires, 2, 12, 30, 6);
        writeLines(hires, 2, 12, ['GROUND FORCES', 'RETREATING, SIR!', 'PLANET NOT SECURED!'], 5);
        glog('attack', 'retreat');
        await commanderWait(state, 2000);
        return scenes.run('com');
      }
    }
  }

  return scenes.run('com');
}
