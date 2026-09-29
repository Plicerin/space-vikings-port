import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { drawOptions, drawPrompt, getChoice, writeLines, clearLines } from '../engine/menu';
import { drawComMainScreen, comStatusBytes } from './com';
import type { ShapeTable } from '../engine/shapeTable';
import { setScene, log as glog } from '../engine/gameLog';
import { chooseCommanderScene, isCurrentPlanetConquered, markPlanetConquered } from '../engine/commander';
import type { GameState } from '../engine/gameState';

async function wait(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function commanderWait(state: GameState, ms: number): Promise<void> {
  await wait(state.commanderMode ? Math.min(ms, 60) : ms);
}



/**
 * The battle screen's fixed layout - lines 100, 110, 120, 130, 140 and 145.
 *
 * Line 100 takes the window full width and 17 rows deep (`POKE 32,0: POKE 33,40: POKE 34,0:
 * POKE 35,16`) and blanks rows 0-15 with printed spaces. Those are still normal video -
 * line 150's `POKE 973,255` comes afterwards, so everything below is inverse and this is
 * not.
 *
 * HCOLOR 5 is set once at line 110 and never changed, so the box and every label are orange.
 *
 * The line numbers run 120, 130, 140, 145, so PROBABILITY and OF SUCCESS are printed after
 * COMPUTER and PROJECTION even though they sit above them.
 */
export function drawGroundForcesBattle(hires: import('../engine/hires').Hires): void {
  // 100
  hires.hcolor(1);
  for (let r = 1; r <= 16; r++) hires.text(' '.repeat(40), 1, r);
  // 110
  hires.hcolor(5);
  hires.line(7, 12, 271, 12);
  hires.line(271, 12, 271, 76);
  hires.line(271, 76, 7, 76);
  hires.line(7, 76, 7, 12);
  // 120
  hires.text(' GROUND FORCES', 13, 2);
  hires.text('BATTLE IN', 8, 4);
  hires.text('PROGRESS', 8, 5);
  // 130
  hires.text('FIGHTERS:', 24, 4);
  hires.text('TRANSPORTS:', 22, 5);
  hires.text('TROOPS:', 26, 6);
  hires.text('TANKS:', 27, 7);
  hires.text('MISSILES:', 24, 8);
  // 140
  hires.text(' COMPUTER ', 8, 10);
  hires.text('  STATUS  ', 25, 10);
  hires.text('PROJECTION', 8, 11);
  // 145
  hires.text('PROBABILITY', 5, 7);
  hires.text('OF SUCCESS :', 6, 8);
}

/**
 * GROUND FORCES' menu - lines 12, 13, 30, 40 and 50.
 *
 * Reached from COM by 2 (COM line 127). It does not clear the screen and it does not fill:
 * line 12 blanks rows 1-12 with printed spaces and line 13 draws the same box COM does, over
 * the top of COM's own screen. COM's twelve readouts down the right survive, and so does the
 * HCOLOR 6 flood and the 40-character line COM prints at row 14.
 *
 * The window is COM's as well - `POKE 32,1` / `POKE 33,21` - so line 12's eighteen spaces
 * land on columns 1 to 18, and every PRINT starts at column 1.
 *
 * HCOLOR carries over too, because it lives in the hi-res routines' zero page rather than in
 * a BASIC variable and RUN does not touch it. $E4 reads 42 = $2A when GROUND FORCES holds at
 * line 60, which is HCOLOR 1 - COM's line 90. So the box and all of this text are green, not
 * the white the port used for the title.
 */
export function drawGroundForcesMenu(hires: import('../engine/hires').Hires): void {
  hires.hcolor(1);
  // 12: FOR C = 2 TO 13: VTAB C: PRINT <18 spaces>
  for (let r = 2; r <= 13; r++) hires.text(' '.repeat(18), 2, r);
  // 13
  hires.line(1, 1, 139, 1);
  hires.line(139, 1, 139, 110);
  hires.line(139, 110, 1, 110);
  hires.line(1, 110, 1, 1);
  hires.text('  GROUND FORCES', 2, 2);
  // 30, 40, 50 - nine PRINTs from row 3, with the blank line 13's trailing PRINT leaves.
  const options = [
    '1) ATTACK PLANET', '2) RECALL TROOPS', '3) SHORE LEAVE',
    '4) ENLIST TROOPS', '5) SELL LOOT', '6) REPAIR/RESTOCK',
    '7) ESTABLISH BASE', '8) CRYOGENICS', '9) RETURN',
  ];
  for (let i = 0; i < options.length; i++) hires.text(options[i], 2, 4 + i);
}

export async function groundForcesScene(
  ctx: SceneContext,
  scenes: SceneManager,
): Promise<void> {
  const { hires, state, input, audio, loader } = ctx;
  setScene('groundForces');

  // COM's line 8 erase needs the shape table; without it the two needle tracks stay.
  let shapes: ShapeTable | null = null;
  try {
    shapes = (await import('../engine/shapeTable')).decodeShapeTableJson(
      await loader.json('data/shapes/shape-table.json'),
    );
  } catch { /* the erase is skipped */ }

  for (;;) {
    // GROUND FORCES never clears the screen - it is chained from COM and draws over what COM
    // left, which is why the twelve readouts and the bottom labels are still on the page.
    drawComMainScreen(hires, comStatusBytes(state), shapes);
    drawGroundForcesMenu(hires);

    const hasBase = state.planets[state.planetIndex].hasBase;

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
  drawGroundForcesBattle(hires);

  if (state.planetSurrendered) {
    state.planetVitality = 25;
  }

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

  function drawBattleFX(vp: number, sp: number, round: number): void {
    hires.hcolor(3);
    hires.line(10, 84, 270, 84);
    hires.hcolor(1);
    for (let i = 0; i < 20; i++) {
      const gx = 10 + (round * 13 + i * 37) % 260;
      const gy = 86 + (round * 7 + i * 23) % 34;
      hires.hplot(gx, gy);
    }
    hires.hcolor(5);
    for (let i = 0; i < 1 + (round % 3); i++) {
      const ex = 20 + (round * 41 + i * 97) % 240;
      const ey = 87 + (round * 19 + i * 53) % 30;
      hires.line(ex - 2, ey, ex + 2, ey);
      hires.line(ex, ey - 2, ex, ey + 2);
    }
    const pct = Math.min(100, Math.round((vp / Math.max(1, sp)) * 100));
    hires.hcolor(1);
    hires.line(60, 118, 220, 118);
    hires.line(60, 118, 60, 123);
    hires.line(220, 118, 220, 123);
    const fill = Math.round((pct / 100) * 150);
    const barColor = pct >= 80 ? 5 : pct >= 40 ? 6 : 1;
    hires.hcolor(barColor);
    for (let y = 119; y <= 122; y++) hires.line(61, y, 61 + fill, y);
    hires.hcolor(3);
    hires.text('SURRENDER', 31, 15);
    hires.text(`${pct}%`, 32, 16);
  }

  let sp = state.planetVitalityLimit;
  let vp = state.planetVitality;

  for (let round = 0; round < 200; round++) {
    drawBattleFX(vp, sp, round);
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
