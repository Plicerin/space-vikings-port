import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { windowColumns } from '../engine/hires';
import { combatRound550, truncate4000, type CombatState } from '../engine/diskCombat';
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
  for (let r = 1; r <= 16; r++) hires.text(' '.repeat(windowColumns(0, 40)), 1, r);
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
/**
 * Line 12's `FOR C = 2 TO 13: VTAB C: PRINT <18 spaces>`, which is also what line 65's
 * `R = 5: GOSUB 12` runs on its own before a refusal - 12 returns at its own `IF R = 5` before
 * 13 redraws the box and the menu.
 *
 * Eighteen columns from column 2, because COM left the window at `POKE 32,1: POKE 33,21`.
 */
export function clearGroundForcesMenu(hires: import('../engine/hires').Hires): void {
  hires.hcolor(1);
  for (let r = 2; r <= 13; r++) hires.text(' '.repeat(18), 2, r);
}

export function drawGroundForcesMenu(hires: import('../engine/hires').Hires): void {
  hires.hcolor(1);
  // 12
  clearGroundForcesMenu(hires);
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

    // 62 and 65: the box is redrawn and then `R = 5: GOSUB 12` wipes the menu - for **every**
    // choice, before the dispatch at 70 ever happens. RECALL is where that showed: it blanks
    // nothing of its own, so its message was landing on top of the options.
    hires.hcolor(1);
    hires.line(1, 1, 139, 1);
    hires.line(139, 1, 139, 110);
    hires.line(139, 110, 1, 110);
    hires.line(1, 110, 1, 1);
    clearGroundForcesMenu(hires);

    // Lines 65, 66 and 67. Each one runs `R = 5: GOSUB 12` first - the menu is wiped, the box
    // and the options with it - and then prints inside that same left column from row 2, not in
    // a block at row 16 over the instrument panel. Each ends `GOTO 310`, which is
    // `POKE 38151,7: RUN COM`, so the refusal takes the long way round through COM and back.
    const refuse = async (lines: string[], from: number): Promise<void> => {
      hires.hcolor(5);
      for (let i = 0; i < lines.length; i++) hires.text(lines[i], 2, from + i);
      await wait(3000);
      state.runGroundForcesOnReturn = true;
    };

    if (c >= 3 && c <= 6 && !hasBase) {
      // 65: one word, on the row VTAB 2 leaves the cursor on.
      await refuse(['NO BASE'], 2);
      return scenes.run('com');
    }

    if (c === 4 && state.forces.troopPlanetIndex !== state.planetIndex) {
      // 66: a blank PRINT first, so these start on row 3.
      await refuse(['DO YOU REALLY', 'EXPECT ANYONE TO', 'ENLIST!? YOU LEFT',
        'YOUR TROOPS ON', 'ANOTHER PLANET!'], 3);
      return scenes.run('com');
    }

    // 66 and 67 both test `PEEK(38158) <> PEEK(38209)` - **where the troops are**, not what
    // they are doing. Reinforcing an assault on the planet they are already on is allowed; the
    // thing the game refuses is leaving them behind and starting again somewhere else.
    if (c === 1 && state.forces.troopPlanetIndex !== state.planetIndex) {
      // 67
      await refuse(["YOU CAN'T ATTACK!", 'YOU LEFT', 'YOUR TROOPS ON',
        'ANOTHER PLANET!'], 3);
      return scenes.run('com');
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

  // No hgr(). Line 100 is `POKE 32,0: POKE 33,40: POKE 34,0: POKE 35,16: HOME: FOR C = 1 TO
  // 16: VTAB C: PRINT <40 spaces>: NEXT` - it blanks text rows 0 to 15 and nothing below them,
  // so the instrument panel is still standing under the battle. Clearing the page took it away.
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

  // Line 150's `POKE 973,255` is never put back except inside 4010, so **everything printed
  // during the assault is inverse** - and line 170's blank is inverse spaces, which makes rows
  // 11 to 14 a solid white band with the messages in black through it. The port was printing
  // green text on the fill.
  //
  // The messages themselves are single PRINTs at the window's left edge, which line 100 put at
  // column 0. Every break below is the disk's; the port had its own, half the width and
  // indented by one.
  const INVERSE = { invert: true } as const;
  /** Line 170: `FOR C = 12 TO 15: VTAB C: PRINT <39 spaces>`, and the cursor left on row 11. */
  const band = (): void => {
    for (let r = 12; r <= 15; r++) hires.text(' '.repeat(39), 1, r, INVERSE);
  };
  const say = (lines: string[], from = 12): void => {
    for (let i = 0; i < lines.length; i++) hires.text(lines[i], 1, from + i, INVERSE);
  };

  if (transports === 0) {
    // 175
    say(['THERE ARE NO TRANSPORTS AVAILABLE!']);
    await commanderWait(state, 2000);
    return scenes.run('com');
  }

  band();
  let messageRow = 12;
  say(['ALL TRANSPORTS AWAY, SIR!'], messageRow++);
  audio.beep(440, 100);
  await wait(2000);

  // 180's second half: `IF PEEK(38210) = 0`, so it is only said on the way in from space.
  if (!state.atmosphere) {
    say(['TRANSPORTS ENTERING ATMOSPHERE!'], messageRow++);
    await commanderWait(state, 2000);
  }

  if (fighters > 0) {
    say(['FIGHTERS LAUNCHING FROM TRANSPORTS!'], messageRow++);
    await commanderWait(state, 2000);
  }

  // 195: `R4 = 1: GOSUB 170` - the band goes back down and the cursor with it.
  band();

  // 200: `C = PEEK(38282 + PEEK(38209))` - the planet's technology, which the port keeps as
  // `defense`. This read `defender`, which is `resolveShipKind(shipKind)`, the ship in orbit -
  // a different byte with a different meaning, so the assault could describe one planet and
  // COLLECT, which reads `defense`, describe another.
  const tech = state.planets[state.planetIndex].defense;

  // 210: `ON C + 1 GOTO 220,300,330,400,450`.
  if (tech === 0) {
    say(['PLANET IS NON HABITABLE. THERE IS NO', 'ENEMY TO RESIST LANDING FORCE.']);
    await commanderWait(state, 3000);
    // 230, 240, 310: blank again, `GOSUB 740` marks the planet taken, and then `GOTO 310` -
    // `POKE 38151,7: RUN COM`. There is no battle and **no COLLECT**: 805's tech-0 branch at
    // 820 is not reachable from here, because nothing on a non-habitable world is worth the
    // trip. The port was running the collect scene.
    band();
    markPlanetConquered(state);
    glog('attack', 'surrendered - no resistance');
    await commanderWait(state, 2000);
    state.runGroundForcesOnReturn = true;
    return scenes.run('com');
  } else if (tech === 1) {
    say(['PLANET IS VERY PRIMITIVE.', 'THE LOCAL INHABITANTS ARE UNABLE TO',
      'RESIST THE LANDING FORCE!!!', 'PLANET SECURE WITH MINIMUM OF FIGHTING!']);
    // 305: `POKE 38150,0` - SP is zero, so the first round of 550 already has VP >= SP.
    state.planetVitality = 0;
    await commanderWait(state, 3000);
  } else if (tech === 2) {
    say(['PLANET IS IN THE LIMITED ATOMIC STAGE', 'OF DEVELOPMENT!']);
    await commanderWait(state, 3000);
    // 340
    if (!state.planetSurrendered) {
      say(['ATTACK FORCE IS MEETING RESISTANCE!!'], 14);
      await commanderWait(state, 2000);
    }
  } else if (tech === 3) {
    // 400: the second line lands on row 12, because of the VTAB 13 between them.
    say(['PLANET HAS COMPARABLE TECHNOLOGY TO US!']);
    await commanderWait(state, 3000);
    say(['HEAVY COUNTER ATTACK HAS BEEN LAUNCHED!'], 13);
    await commanderWait(state, 3000);
  } else {
    // 450. "COUNTER ATTACK!!!" is printed with a trailing semicolon and GOOD LUCK follows it on
    // the same row after a pause, three spaces along.
    say(['PLANET HAS SUPERIOR TECHNOLOGY TO OURS!']);
    await commanderWait(state, 3000);
    if (!state.planetSurrendered) {
      say(['THE ENEMY HAS LAUNCHED A VERY HEAVY', 'COUNTER ATTACK!!!'], 13);
      await commanderWait(state, 1000);
      hires.text('   GOOD LUCK, SIR!!!', 18, 14, INVERSE);
      await commanderWait(state, 2000);
    }
  }

  // What stood here was a `drawBattleFX` of the port's own: a white rule across the box, twenty
  // pseudo-random green dots, orange crosses, a coloured progress bar with its own frame, and a
  // SURRENDER heading with a percentage under it. GROUND FORCES draws none of that. Its whole
  // per-round update is line 4010 - the five numbers at HTAB 33 and the projection at VTAB 8,
  // HTAB 18 - over the box and labels lines 110 to 145 put down once.
  let sp = state.planetVitalityLimit;
  let vp = state.planetVitality;
  // ET, line 500: `ET = PEEK(38206) * 500`. Line 570 takes some off every round and nothing
  // ever reads it again, so it decides nothing - combatRound550() carries it because the
  // transcription should be the whole of 550-598, but there is no state here to give it and
  // none is invented.
  let enemyTroops = 0;

  for (let round = 0; round < 200; round++) {
    // Lines 550-598 and 4000, in diskCombat.ts, transcribed from the listing and checked
    // against a real assault on the disk. Three things here were wrong: T2 in the losing
    // branch is a multiply, transports can go UP, and line 4000 truncates every round.
    const before: CombatState = {
      fighters, transports, tanks, missiles, troops, enemyTroops, vitality: vp,
    };
    const r = combatRound550(before, {
      tech, surrenderAt: sp, morale: state.forces.morale, penalty: state.shipKind > 0,
    });
    ({ fighters, transports, tanks, missiles, troops, enemyTroops } = truncate4000(r));
    vp = r.vitality;
    const ps = Math.min(100, Math.round(r.surrenderPct));
    const x = r.x;
    void x;


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
    // 4010's `VTAB 8: HTAB 18: PRINT PS;"%"` - row 7, beside OF SUCCESS :, not row 6 beside
    // PROBABILITY. 145 prints PROBABILITY at VTAB 7 and OF SUCCESS : on the line after it.
    hires.text(`${ps}%   `, 18, 8);

    audio.beep(200 + Math.random() * 200, 30);
    await commanderWait(state, 200);

    if (vp >= sp) {
      state.planetVitality = 0;
      markPlanetConquered(state);
        hires.hcolor(3);
        // 660: `R4 = 1: GOSUB 170` then one line at column 0.
        band();
        say(['THE PLANET HAS SURRENDERED!']);
        glog('attack', 'victory');
        await commanderWait(state, 3000);

        if (state.planets.every(p => p.surrendered)) {
          say(['ALL SYSTEMS HAVE SURRENDERED!', 'YOU HAVE WON!'], 14);
          glog('victory', 'all 20 systems conquered');
          await commanderWait(state, 5000);
          return scenes.run('end');
        }

        band();
        say(['TROOPS ARE NOW COLLECTING LOOT.']);
      await commanderWait(state, 1500);
      state.forces.troops = Math.round(troops) + troopsLeft;
      return scenes.run('collect');
    }

  // 670 is `IF TR = 0` - the troops, not the transports. Losing every transport with troops
  // still aboard is not how the assault ends.
  if (Math.round(troops) === 0) {
    state.planets[state.planetIndex].groundAssaultFailed = true;
    state.forces.troopLocation = 0;   // 665
    state.forces.troops = 0;
    state.pendingGroundForcesDefeatPlanet = state.planetIndex;
    state.pendingGroundForcesNeedsRecovery = true;
      hires.hcolor(5);
      band();
      say(['THE BATTLE IS LOST! ALL TROOPS', 'HAVE BEEN DESTROYED!!!']);
      glog('attack', 'defeat - troops lost');
      await commanderWait(state, 3000);
      state.runGroundForcesOnReturn = true;   // 670
      return scenes.run('com');
    }

    const k = input.peekKey();
    if (k > 0) {
      input.clearKey();
      // 1100 reads the key and 1110 works out which one it is - and then **1115 is `K = 82`**,
      // unconditionally, so 1120's `IF K = 82` is always true and any key at all retreats. The
      // port asked for R.
      {
        state.planets[state.planetIndex].groundAssaultFailed = true;
        state.forces.troopLocation = 0;
        state.forces.troops = Math.round(troops) + troopsLeft;
        let m = state.forces.morale - 1;
        if (m < 1) m = 1;
        state.pendingGroundForcesDefeatPlanet = state.planetIndex;
        state.pendingGroundForcesNeedsRecovery = true;
        state.forces.morale = m as 1 | 2 | 3 | 4 | 5 | 6;
        hires.hcolor(5);
        band();
        say(['GROUND FORCES RETREATING, SIR!', 'PLANET NOT SECURED!']);
        glog('attack', 'retreat');
        await commanderWait(state, 2000);
        state.runGroundForcesOnReturn = true;   // 1130
        return scenes.run('com');
      }
    }
  }

  return scenes.run('com');
}
