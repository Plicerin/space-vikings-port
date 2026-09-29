import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';
import { drawOptions, drawPrompt, getChoice, writeLines, clearLines } from '../engine/menu';
import { ShapeRenderer } from '../engine/shapeTable';

const PLANET_NAMES = [
  'SOL', 'ALPHA CENTAURI', "BARNARD'S STAR", 'WOLF 359', 'LUYTEN',
  'LALANDE 21185', 'SIRIUS', 'VARCAR', 'XANADON', 'EPSILON ERIDANA',
  'CYGNI', 'PROCYON', 'TAU CETI', 'LACAILLE 9352', 'LARSEN-C',
  'GROOMBRIDGE 168', 'KRUGER 60', 'EPSILON INDI', 'ARGO', 'SHIVANDA',
];

const TECH_DESC = [
  'NO INTELLIGENT LIFEFORMS INDICATED.',
  'PRIMITIVE PSEUDO SOCIETY ONLY.',
  'LIMITED ATOMIC DEVELOPMENT',
  'SOPHISTICATED TECHNOLOGY WITH\nSTARSHIP CAPABILITY.',
  'ADVANCED CAPABILITY-SUPERIOR\nTO OURS!',
];

async function wait(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function fillBackground(hires: import('../engine/hires').Hires, color: number, y1: number, y2: number): void {
  hires.hcolor(color);
  for (let y = y1; y <= y2; y++) hires.hlin(0, 279, y);
}

function drawMenuBox(hires: import('../engine/hires').Hires): void {
  hires.hcolor(1);
  hires.line(1, 1, 139, 1);
  hires.line(139, 1, 139, 110);
  hires.line(139, 110, 1, 110);
  hires.line(1, 110, 1, 1);
}


/**
 * COM's twelve right-hand readouts - lines 40 to 70.
 *
 * `ST(1..12)` is set by line 15140 and the label pairs are the DATA at 15000-15030, read in
 * order; line 70 loops `FOR J = 1 TO 2`, so each readout prints two lines, on its row and
 * the one below. Lines 40 and 50 give `V()` and `H()`: rows 2, 5, 8, 11 and columns 23, 29,
 * 35. HTAB and TAB( ) are absolute screen columns here, so those are the columns outright.
 *
 * What the addresses hold is fixed by two other programs. SHORE LEAVE line 2500 names them
 * - `DATA SHIELD,38200,ENERGY,38199,# 1 ENGINE,38198, ...` - and STATUS prints them as
 * percentages (`PRINT "ENGINE#1:"; PEEK(38198);"%"`), so they are 0-100 health, except
 * 38187, which STATUS prints as a bare missile count, and 38199, which it divides by 62.
 * 38193 is hull *health*: STATUS prints `100 - PEEK(38193)` as HULL DMG.
 */
const COM_READOUT_ROWS = [2, 5, 8, 11];
const COM_READOUT_COLS = [23, 29, 35];
export const COM_ENERGY = 38199;

export interface ComReadout {
  /** The address ST(J1) holds, so the table can be checked against the disk. */
  addr: number;
  what: string;
  lines: [string, string];
  /** 1-based, as hires.text() takes them. */
  col: number;
  row: number;
}

export const COM_READOUTS: ComReadout[] = ([
  [38198, '# 1 ENGINE', '  1  ', ' ENG '],
  [38197, '# 2 ENGINE', '  2  ', ' ENG '],
  [38196, 'COMPUTER', ' COMP', 'NO/GO'],
  [38195, 'RADAR', 'RADAR', 'NO/GO'],
  [38194, 'ENV. CONTROL', ' ENV ', 'NO/GO'],
  [38193, 'HULL DMG.', ' HULL', ' DMG '],
  [COM_ENERGY, 'ENERGY', 'POWER', ' LOW '],
  [38200, 'SHIELD', ' SHLD', 'NO/GO'],
  [38190, 'HYPERDRIVE', 'HYPER', 'DRIVE'],
  [38187, 'MISSILES', ' MSL ', 'NO/GO'],
  [38186, 'LASER', 'LASER', 'NO/GO'],
  [38185, 'COMS', ' COM ', 'NO/GO'],
] as [number, string, string, string][]).map(([addr, what, a, b], i) => ({
  addr, what, lines: [a, b] as [string, string],
  col: COM_READOUT_COLS[i % 3], row: COM_READOUT_ROWS[(i / 3) | 0],
}));

/** The bytes COM found on a fresh ship, read off the machine by probe_comreadouts.mjs. */
export const COM_FRESH_SHIP: Record<number, number> = {
  38198: 100, 38197: 100, 38196: 100, 38195: 100, 38194: 128, 38193: 100,
  38199: 63, 38200: 100, 38190: 100, 38187: 60, 38186: 100, 38185: 1,
};

/**
 * Line 70 calls `GOSUB 10000` before every PRINT, and that subroutine only pokes 973 ($3CD):
 *
 *     10000 IF J1 = 7 AND PEEK(ST(J1)) < 16 THEN POKE 973,255: RETURN
 *     10005 IF T = 0 THEN POKE 973,255: RETURN
 *     10010 POKE 973,0: RETURN
 *
 * **$3CD is the character generator's inverse flag**, so a failed system's readout is
 * highlighted - black glyphs on a solid block - which is what labels like NO/GO, POWER LOW
 * and HULL DMG are for.
 *
 * This was read as "255 means skip" at first, on the strength of a probe that zeroed the
 * computer, shields and laser and dropped the energy to 9 and saw those four readouts stop
 * looking like glyphs. The probe's own numbers say otherwise, and they are exact: the four
 * went 70 -> 210, 95 -> 185, 68 -> 212 and 88 -> 192 lit pixels, and a readout is five
 * cells, 5 x 7 x 8 = 280. Every pair sums to 280. That is the complement of the glyph, not
 * its absence. STATUS settles it independently - line 30 pokes 973,255 and leaves it there
 * for the whole report, which is drawn and is inverse from edge to edge.
 *
 * HCOLOR is still 6 here: line 20 set it and nothing changes it until line 90.
 */
export function drawComReadouts(
  hires: import('../engine/hires').Hires,
  status: Record<number, number> = COM_FRESH_SHIP,
): void {
  hires.hcolor(6);
  for (const r of COM_READOUTS) {
    const v = status[r.addr] ?? 0;
    const failed = r.addr === COM_ENERGY ? v < 16 : v === 0;
    const opts = failed ? { invert: true } : undefined;
    hires.text(r.lines[0], r.col, r.row, opts);
    hires.text(r.lines[1], r.col, r.row + 1, opts);
  }
}

/** The port's state as the twelve bytes COM peeks. */
export function comStatusBytes(
  state: import('../engine/gameState').GameState,
): Record<number, number> {
  const d = state.damage;
  return {
    38198: d.engine1Pct, 38197: d.engine2Pct, 38196: d.computerPct,
    38195: d.radarPct, 38194: d.envPct, 38193: d.hullPct,
    [COM_ENERGY]: Math.round(state.energy),
    38200: d.shieldsPct, 38190: d.hyperdrivePct,
    38187: state.missilesRemaining, 38186: d.laserPct, 38185: d.comsPct,
  };
}


/**
 * COM line 8, before it draws anything of its own:
 *
 *     HCOLOR= 0: FOR X = 200 TO 260 STEP 5: DRAW 25 AT X,133: NEXT:
 *                FOR X = 13 TO 73 STEP 5: DRAW 25 AT X,133: NEXT
 *
 * Shape 25 is the eraser - the wider shape line 159 uses - swept along both needle tracks,
 * so it wipes the speed and energy needles the flight loop left on the panel. TX at 140 and
 * the vertical needle at x 136 fall between the two ranges and survive, which is why COM's
 * page has exactly those two.
 *
 * Exported because it outlives COM: anything COM chains to - STATUS, for one - inherits a
 * panel with those two tracks already cleared.
 */
export function eraseComNeedleTracks(
  hires: import('../engine/hires').Hires,
  shapes: import('../engine/shapeTable').ShapeTable,
): void {
  const r = new ShapeRenderer(hires);
  r.rot = 0; r.scale = 1;
  hires.hcolor(0);
  for (let x = 200; x <= 260; x += 5) r.draw(shapes, 24, x, 133);
  for (let x = 13; x <= 73; x += 5) r.draw(shapes, 24, x, 133);
}

/**
 * COM's command screen, as the original draws it.
 *
 * Pure, so it can be compared against the disk: oracle/com_parity.mjs calls it on a
 * throwaway Hires and diffs the result. The original is COM.bas lines 20, 90 and 100-120 -
 * HCOLOR 6 flooded across rows 0 to 123, a green box from (1,1) to (139,110), then the
 * menu text through the hi-res character generator.
 */
export function drawComMainScreen(
  hires: import('../engine/hires').Hires,
  status: Record<number, number> = COM_FRESH_SHIP,
  shapes: import('../engine/shapeTable').ShapeTable | null = null,
): void {
  // No hgr(). COM.bas line 20 floods rows 0 to 123 and never touches what is below, so the
  // instrument panel is still standing underneath it - measured, the original's page has
  // 3,011 lit pixels there while clearing the buffer left the port with none.
  if (shapes) eraseComNeedleTracks(hires, shapes);

  fillBackground(hires, 6, 0, 123);

  // COM fills and then clears its text window over the fill, so the menu area is black and
  // only the right-hand side keeps the background. Measured off the original's own page:
  // columns 0-18 of rows 0-13 are blank, column 19 carries the box's right edge at x139,
  // and columns 20 onwards are still HCOLOR 6. The few lit pixels in column 0 are the box's
  // left edge at x1, not surviving fill.
  //
  // The extent is taken from the image rather than from WNDLFT/WNDWDTH, which read 1 and 21
  // when COM settles - and the image says 0-based columns 0-19 over rows 0-13.
  //
  // That is not line 80's HOME. HOME clears the $400 text page, which is invisible while
  // the hi-res screen is showing; only characters sent through COUT reach the character
  // generator. The blanking is line 29, run while the window is still POKE 32,0 / POKE
  // 33,40: fourteen printed lines of twenty spaces - one at row 0, twelve from VTAB 2,
  // and one at row 13.
  hires.clearTextCells(1, 1, 20, 14);

  // Lines 60-70, before the box and the menu: the twelve readouts on the right.
  drawComReadouts(hires, status);

  // COM.bas line 80 prints a 40-character line at row 15. Text is opaque, so it clears that
  // row across the full width, and the labels sit on black rather than on the fill.
  hires.clearTextCells(1, 15, 40, 1);

  drawMenuBox(hires);

  hires.hcolor(3);
  // COM line 100: PRINT TAB( 3);"COMMAND MODE" - which lands on 0-based column 2.
  hires.text('COMMAND MODE', 3, 2);

  drawOptions(hires, [
    { key: '1', label: 'COMPUTER' },
    { key: '2', label: 'GROUND FORCES' },
    { key: '3', label: 'RADAR' },
    { key: '4', label: 'END' },
    { key: '5', label: 'RETURN' },
  ], 4, 2);

  // Line 95's PRINT, line 100's title and its trailing PRINT, and line 110's five options
  // and their trailing PRINT put COMMAND? on 0-based row 9, not 13.
  drawPrompt(hires, 10, 2);

  // COM.bas line 80, verbatim: VTAB 15: HTAB 1: PRINT "  COMPUTER DISPLAY      DAMAGE CONTROL  "
  hires.hcolor(3);
  hires.text('  COMPUTER DISPLAY      DAMAGE CONTROL  ', 1, 15);
}

async function showError(hires: import('../engine/hires').Hires, lines: string[], durationMs = 2500): Promise<void> {
  writeLines(hires, 1, 21, lines, 5);
  await wait(durationMs);
  clearLines(hires, 1, 21, 40, 2);
}

const SHIP_NAMES: Record<number, string> = {
  0: 'NONE',
  1: 'SPACE LAB',
  3: 'LIGHT CRUISER',
  4: 'HEAVY CRUISER',
};

export const comScene = async (ctx: SceneContext, scenes: SceneManager): Promise<void> => {
  const { hires, state, input } = ctx;
  setScene('com');

  if (state.commanderMapTarget !== null) {
    const target = state.commanderMapTarget;
    state.commanderMapTarget = null;
    showPlanetData(hires, state.planets[target], PLANET_NAMES[target], target);
    hires.hcolor(5);
    hires.text('READY', 10, 20);
    await input.waitForKey();
    glog('com', 'return to galaxy map');
    return scenes.run('galaxyMap');
  }

  mainMenu: for (;;) {
    drawComMainScreen(hires, comStatusBytes(state));

    const mainChoice = await getChoice(input, hires, 1, 5);

    switch (mainChoice) {
      case 1:
        break;
      case 2:
        glog('com', 'ground forces');
        return scenes.run('groundForces');
      case 3:
        glog('com', 'radar');
        return scenes.run('radar');
      case 4:
        glog('com', 'end');
        return scenes.run('end');
      case 5:
        glog('com', 'return to flight');
        return scenes.run('starshipSimulator');
    }

    computerMenu: for (;;) {
      if (!enterComputerMenu(hires)) continue mainMenu;

      drawOptions(hires, [
        { key: '1', label: 'NAVIGATION COMP.' },
        { key: '2', label: 'GALAXY DIRECTORY' },
        { key: '3', label: 'GALAXY MAP' },
        { key: '4', label: 'SHIP STATUS' },
        { key: '5', label: 'SUPPLIES REPORT' },
        { key: '6', label: 'RETURN' },
      ], 4, 2);

      drawPrompt(hires, 14, 2);

      const compChoice = await getChoice(input, hires, 1, 6);

      switch (compChoice) {
        case 1:
          break;
        case 2:
          await galaxyDirectory(ctx);
          continue computerMenu;
        case 3:
          glog('com', 'galaxy map');
          return scenes.run('galaxyMap');
        case 4:
          return scenes.run('status');
        case 5:
          return scenes.run('supply');
        case 6:
          continue mainMenu;
      }

      navMenu: for (;;) {
        if (!enterNavComputer(hires)) continue computerMenu;

        drawOptions(hires, [
          { key: '1', label: 'DIRECTORY' },
          { key: '2', label: 'SET COURSE' },
          { key: '3', label: 'RETURN' },
        ], 6, 2);

        drawPrompt(hires, 12, 2);

        const navChoice = await getChoice(input, hires, 1, 3);

        if (navChoice === 1) {
          await galaxyDirectory(ctx);
          continue navMenu;
        }
        if (navChoice === 3) {
          continue computerMenu;
        }

        await setCourse(ctx);
        continue navMenu;
      }
    }
  }
};

function enterComputerMenu(hires: import('../engine/hires').Hires): boolean {
  clearLines(hires, 1, 1, 40, 16);
  hires.hcolor(1);
  hires.text('CENTRAL COMPUTER', 3, 2);
  return true;
}

function enterNavComputer(hires: import('../engine/hires').Hires): boolean {
  clearLines(hires, 1, 1, 40, 16);
  hires.hcolor(1);
  hires.text('NAVIGATION COMPUTER', 3, 2);
  return true;
}

function showPlanetData(
  hires: import('../engine/hires').Hires,
  planet: import('../engine/gameState').PlanetState,
  name: string,
  _idx: number,
): void {
  hires.hgr();
  fillBackground(hires, 5, 0, 123);

  hires.hcolor(3);
  hires.text(`${name} STAR SYSTEM`, 5, 2);

  hires.hcolor(planet.surrendered ? 2 : 1);
  hires.text(`STATUS: ${planet.surrendered ? 'SECURED' : 'INDEPENDENT'}`, 3, 3);

  if (!planet.visited) {
    hires.hcolor(1);
    hires.text('NO INFORMATION AVAILABLE', 3, 5);
    hires.text('AT THIS TIME.', 3, 6);
    return;
  }

  hires.hcolor(1);
  hires.text('TECHNOLOGICAL DEVELOPMENT:', 3, 5);
  const tech = planet.defense;
  const desc = TECH_DESC[tech] ?? TECH_DESC[0];
  const descLines = desc.split('\n');
  for (let i = 0; i < descLines.length; i++) {
    hires.text(descLines[i], 3, 6 + i);
  }

  let r = 9;
  if (tech >= 2) {
    hires.text('ORBITING DEFENSE CAPABILITY --', 3, r);
    hires.text('FIGHTER PROTECTION PROBABLE.', 3, r + 1);
    r += 2;
  }

  const pop = planet.population * 35294;
  hires.text(`POPULATION = APPROX. ${pop.toLocaleString('en-US')}`.slice(0, 38), 3, r);
  r++;

  if (planet.defender > 0) {
    hires.text(`DEFENDER: ${SHIP_NAMES[planet.defender] ?? 'UNKNOWN'}`, 3, r + 1);
    r += 2;
  }

  if (planet.hasBase) {
    hires.text('REPAIR BASE PRESENT', 3, r + 1);
  }

  if (planet.looted) {
    hires.hcolor(5);
    hires.text('LOOT COLLECTED', 3, 23);
  }
}

async function galaxyDirectory(ctx: SceneContext): Promise<void> {
  const { hires, input, state } = ctx;

  hires.hgr();
  fillBackground(hires, 5, 0, 123);

  hires.hcolor(3);
  hires.text('** GALAXY DIRECTORY **', 10, 1);

  hires.hcolor(1);
  for (let i = 0; i < 10; i++) {
    const leftP = state.planets[i];
    const rightP = state.planets[i + 10];
    const leftIcon = leftP.surrendered ? '+' : leftP.visited ? '*' : ' ';
    const rightIcon = rightP.surrendered ? '+' : rightP.visited ? '*' : ' ';
    const leftCur = i === state.planetIndex ? '>' : ' ';
    const rightCur = (i + 10) === state.planetIndex ? '>' : ' ';

    hires.hcolor(leftP.surrendered ? 2 : leftP.visited ? 5 : 1);
    let left = `${leftCur}${leftIcon}${i + 1}) ${PLANET_NAMES[i]}`.slice(0, 20);
    hires.text(left, 1, 3 + i);

    hires.hcolor(rightP.surrendered ? 2 : rightP.visited ? 5 : 1);
    let right = `${rightCur}${rightIcon}${i + 11}) ${PLANET_NAMES[i + 10]}`.slice(0, 20);
    hires.text(right, 21, 3 + i);
  }

  hires.hcolor(1);
  hires.text(`CURRENT: ${PLANET_NAMES[state.planetIndex]}`, 2, 14);

  hires.hcolor(5);
  hires.text('1) DISPLAY PLANETARY DATA', 7, 15);
  hires.text('2) RETURN               ', 7, 16);

  drawPrompt(hires, 18, 10);

  const choice = await getChoice(input, hires, 1, 2);

  if (choice === 2) return;

  for (;;) {
    clearLines(hires, 1, 15, 40, 6);
    hires.hcolor(5);
    hires.text('WHICH SYSTEM?', 10, 15);

    const planetIdx = await readTwoDigitNumber(input, hires, 16, 24, 1, 20);
    if (planetIdx === null) continue;

    if (planetIdx < 1 || planetIdx > 20) {
      await showError(hires, ['TRY AGAIN PLEASE.']);
      continue;
    }

    const idx = planetIdx - 1;
    showPlanetData(hires, ctx.state.planets[idx], PLANET_NAMES[idx], idx);

    hires.hcolor(5);
    hires.text('READY', 10, 20);
    await input.waitForKey();
    return;
  }
}

async function setCourse(ctx: SceneContext): Promise<void> {
  const { hires, state, input } = ctx;

  clearLines(hires, 1, 1, 40, 16);
  hires.hcolor(1);
  hires.text('NAVIGATION COMPUTER', 3, 2);
  hires.text('DESIRED DESTINATION', 3, 4);

  const planetIdx = await readTwoDigitNumber(input, hires, 5, 14, 1, 20);

  if (planetIdx === null) {
    await showError(hires, ['INVALID INPUT.']);
    return;
  }

  if (planetIdx < 1 || planetIdx > 20) {
    await showError(hires, ['<ERROR>']);
    return;
  }

  if (planetIdx - 1 === state.planetIndex) {
    await showError(hires, ["THAT'S WHERE WE", 'ARE NOW, SIR!']);
    return;
  }

  state.navDestination = planetIdx - 1;
  const name = PLANET_NAMES[planetIdx - 1];
  const dist = Math.round(Math.sqrt(
    Math.pow(state.planets[state.planetIndex].x - state.planets[planetIdx - 1].x, 2) +
    Math.pow(state.planets[state.planetIndex].y - state.planets[planetIdx - 1].y, 2) +
    Math.pow(state.planets[state.planetIndex].z - state.planets[planetIdx - 1].z, 2)
  ));
  glog('nav', `course set to ${name} dist=${dist}`);

  clearLines(hires, 1, 3, 40, 8);
  hires.hcolor(3);
  hires.text(name.slice(0, 38), 3, 5);
  hires.text('COURSE SET.', 3, 7);
  hires.hcolor(1);
  hires.text(`DISTANCE: ${dist} L/Y`, 3, 8);

  await wait(2500);
}

async function readTwoDigitNumber(
  input: import('../engine/input').Input,
  hires: import('../engine/hires').Hires,
  startRow: number,
  startCol: number,
  min: number,
  max: number,
): Promise<number | null> {
  let inputStr = '';
  const promptRow = startRow;

  for (let j = 0; j < 2; j++) {
    const k = await input.waitForKey();
    const ch = String.fromCharCode(k & 0x7f);

    if ((k & 0x7f) === 8) {
      if (j > 0) {
        j -= 2;
        if (inputStr.length > 0) {
          inputStr = inputStr.slice(0, -1);
        }
        hires.hcolor(0);
        hires.text(' ', startCol + j + 1, promptRow);
        continue;
      }
      j = -1;
      continue;
    }

    if ((k & 0x7f) === 13 || ch === '\r') {
      break;
    }

    if (ch < '0' || ch > '9') {
      j--;
      continue;
    }

    hires.hcolor(3);
    hires.text(ch, startCol + j, promptRow);
    inputStr += ch;
  }

  if (inputStr.length === 0) return null;
  const val = parseInt(inputStr, 10);
  if (isNaN(val) || val < min || val > max) return null;
  return val;
}
