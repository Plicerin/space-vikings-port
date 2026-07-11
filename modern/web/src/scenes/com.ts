import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';
import { drawOptions, drawPrompt, getChoice, writeLines, clearLines } from '../engine/menu';

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

/** Draw a violet HGR background (HCOLOR=6 fill). COM.bas:20 */
function drawVioletBackground(hires: import('../engine/hires').Hires): void {
  hires.hcolor(6);
  for (let y = 0; y <= 123; y++) hires.line(0, y, 279, y);
}

/** Draw the left-panel box (COMMAND MODE / menu area). COM.bas:90 */
function drawMenuBox(hires: import('../engine/hires').Hires): void {
  hires.hcolor(1);
  hires.line(1, 1, 139, 1);
  hires.line(139, 1, 139, 110);
  hires.line(139, 110, 1, 110);
  hires.line(1, 110, 1, 1);
}

async function showError(hires: import('../engine/hires').Hires, lines: string[], durationMs = 2500): Promise<void> {
  writeLines(hires, 1, 21, lines, 2);
  await wait(durationMs);
  clearLines(hires, 1, 21, 40, 2);
}

export const comScene = async (ctx: SceneContext, scenes: SceneManager): Promise<void> => {
  const { hires, state, input } = ctx;
  setScene('com');

  // COM.bas:5,12 — if PEEK(38388) > 0, we came from galaxy map with a
  // planet selection. Show that planet's info directly, then return.
  if (state.commanderMapTarget !== null) {
    const target = state.commanderMapTarget;
    state.commanderMapTarget = null; // clear marker (POKE 38388,0)
    showPlanetData(hires, state.planets[target], PLANET_NAMES[target], target);
    hires.hcolor(5);
    hires.text('READY', 10, 20);
    await input.waitForKey();
    glog('com', 'return to galaxy map');
    return scenes.run('galaxyMap');
  }

  mainMenu: for (;;) {
    // ── COMMAND MODE (COM.bas:20-122) ────────────────────────────────────
    hires.hgr();
    drawVioletBackground(hires);
    drawMenuBox(hires);

    hires.hcolor(3);
    hires.text('COMMAND MODE', 4, 2);

    drawOptions(hires, [
      { key: '1', label: 'COMPUTER' },
      { key: '2', label: 'GROUND FORCES' },
      { key: '3', label: 'RADAR' },
      { key: '4', label: 'END' },
      { key: '5', label: 'RETURN' },
    ], 4, 2);

    drawPrompt(hires, 14, 2);

    const mainChoice = await getChoice(input, hires, 1, 5);

    switch (mainChoice) {
      case 1: // COMPUTER → CENTRAL COMPUTER
        break; // fall through to computerMenu loop
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

    // ── CENTRAL COMPUTER (COM.bas:200-280) ──────────────────────────────
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
        case 1: // NAVIGATION COMPUTER
          break; // fall through to navMenu below
        case 2: // GALAXY DIRECTORY
          await galaxyDirectory(ctx);
          continue computerMenu;
        case 3: // GALAXY MAP
          glog('com', 'galaxy map');
          return scenes.run('galaxyMap');
        case 4: // SHIP STATUS
          return scenes.run('status');
        case 5: // SUPPLIES REPORT
          return scenes.run('supply');
        case 6: // RETURN to main menu
          continue mainMenu;
      }

      // ── NAVIGATION COMPUTER (COM.bas:800-897) ────────────────────────
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
          // DIRECTORY → GALAXY DIRECTORY (COM.bas:840)
          await galaxyDirectory(ctx);
          continue navMenu;
        }
        if (navChoice === 3) {
          // RETURN to computer menu
          continue computerMenu;
        }

        // SET COURSE (COM.bas:860-897)
        await setCourse(ctx);
        continue navMenu;
      }
    }
  }
};

function enterComputerMenu(hires: import('../engine/hires').Hires): boolean {
  // COM.bas:200-215 — clear box, show CENTRAL COMPUTER title
  clearLines(hires, 1, 1, 40, 16);
  hires.hcolor(1);
  hires.text('CENTRAL COMPUTER', 3, 2);
  return true;
}

function enterNavComputer(hires: import('../engine/hires').Hires): boolean {
  // COM.bas:800-810
  clearLines(hires, 1, 1, 40, 16);
  hires.hcolor(1);
  hires.text('NAVIGATION COMPUTER', 3, 2);
  return true;
}

/** Display a planet's info on an HGR page (COM.bas:979-1170).
 *  Writes tech level, population, secured/independent, and base status. */
function showPlanetData(
  hires: import('../engine/hires').Hires,
  planet: import('../engine/gameState').PlanetState,
  name: string,
  _idx: number,
): void {
  hires.hgr();
  hires.hcolor(5);
  for (let y = 0; y <= 123; y++) hires.line(0, y, 279, y);

  hires.hcolor(3);
  hires.text(`${name} STAR SYSTEM`, 5, 2);

  hires.hcolor(1);
  if (!planet.visited) {
    hires.text('NO INFORMATION AVAILABLE', 3, 5);
    hires.text('AT THIS TIME.', 3, 6);
    return;
  }

  hires.text('TECHNOLOGICAL DEVELOPMENT:', 3, 5);
  const tech = planet.defense;
  const desc = TECH_DESC[tech] ?? TECH_DESC[0];
  const descLines = desc.split('\n');
  for (let i = 0; i < descLines.length; i++) {
    hires.text(descLines[i], 3, 6 + i);
  }

  if (tech >= 2) {
    hires.text('ORBITING DEFENSE CAPABILITY --', 3, 9);
    hires.text('FIGHTER PROTECTION PROBABLE.', 3, 10);
  }

  const pop = planet.population * 35294;
  hires.text(`POPULATION = APPROX. ${pop.toLocaleString('en-US')}`.slice(0, 38), 3, 12);

  if (planet.surrendered) {
    hires.text(`${name} HAS BEEN SECURED`.slice(0, 38), 3, 14);
  } else {
    hires.text(`${name} IS INDEPENDENT.`.slice(0, 38), 3, 14);
  }

  if (planet.hasBase) {
    hires.text('THERE IS AN OPERATIONAL REPAIR BASE', 3, 16);
    hires.text('ON THE PLANET.', 3, 17);
  }
}

async function galaxyDirectory(ctx: SceneContext): Promise<void> {
  const { hires, input } = ctx;

  // COM.bas:900-1170
  hires.hgr();
  // COM.bas:910 — HCOLOR=5 horizontal line fill (violet stripe background)
  hires.hcolor(5);
  for (let y = 0; y <= 123; y++) hires.line(0, y, 279, y);

  hires.hcolor(3);
  hires.text('** GALAXY DIRECTORY **', 10, 1);

  // COM.bas:940 — Two columns: 1-10 on left, 11-20 on right
  hires.hcolor(1);
  for (let i = 0; i < 10; i++) {
    const left = `${i + 1}) ${PLANET_NAMES[i]}`.slice(0, 19);
    const right = `${i + 11}) ${PLANET_NAMES[i + 10]}`.slice(0, 19);
    hires.text(left, 2, 3 + i);
    hires.text(right, 21, 3 + i);
  }

  hires.hcolor(5);
  hires.text('1) DISPLAY PLANETARY DATA', 7, 15);
  hires.text('2) RETURN               ', 7, 16);

  drawPrompt(hires, 18, 10);

  const choice = await getChoice(input, hires, 1, 2);

  if (choice === 2) return; // RETURN

  // 1) DISPLAY PLANETARY DATA (COM.bas:970-1170)
  // ASK WHICH SYSTEM — enter planet number 1-20
  for (;;) {
    clearLines(hires, 1, 15, 40, 6);
    hires.hcolor(5);
    hires.text('WHICH SYSTEM?', 10, 15);

    // Two-digit input (COM.bas:970-976)
    const planetIdx = await readTwoDigitNumber(input, hires, 16, 24, 1, 20);
    if (planetIdx === null) continue;

    // COM.bas:978 — validate 1-20
    if (planetIdx < 1 || planetIdx > 20) {
      await showError(hires, ['TRY AGAIN PLEASE.']);
      continue;
    }

    // COM.bas:979-990 — display planet info
    const idx = planetIdx - 1;
    showPlanetData(hires, ctx.state.planets[idx], PLANET_NAMES[idx], idx);

    // COM.bas:1170 — READY prompt, wait for any key
    hires.hcolor(5);
    hires.text('READY', 10, 20);
    await input.waitForKey();
    return;
  }
}

async function setCourse(ctx: SceneContext): Promise<void> {
  const { hires, state, input } = ctx;

  // COM.bas:860-897
  clearLines(hires, 1, 1, 40, 16);
  hires.hcolor(1);
  hires.text('NAVIGATION COMPUTER', 3, 2);
  hires.text('ENTER DESIRED', 3, 4);
  hires.text('DESTINATION', 3, 5);

  const planetIdx = await readTwoDigitNumber(input, hires, 6, 14, 1, 20);

  if (planetIdx === null) {
    await showError(hires, ['INVALID INPUT.']);
    return;
  }

  // COM.bas:878 — validate 1-20
  if (planetIdx < 1 || planetIdx > 20) {
    await showError(hires, ['<ERROR>']);
    return;
  }

  // COM.bas:879 — can't set course to current planet
  if (planetIdx - 1 === state.planetIndex) {
    await showError(hires, ["THAT'S WHERE WE", 'ARE NOW, SIR!']);
    return;
  }

  // COM.bas:880 — POKE 38163, C (set destination planet)
  state.navDestination = planetIdx - 1;
  const name = PLANET_NAMES[planetIdx - 1];
  glog('nav', `course set to ${name}`);

  clearLines(hires, 1, 3, 40, 8);
  hires.hcolor(3);
  hires.text(name.slice(0, 38), 3, 5);
  hires.text('COURSE SET.', 3, 7);

  await wait(2500);
}

/** Read 1-2 digit number at a given VTAB/HTAB cursor position.
 *  COM.bas:871-876 — two-digit GET input with backspace support.
 *  Returns null if input is empty/invalid. */
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

    // Backspace (CHR$(8) in Apple II) — COM.bas:871-873
    if ((k & 0x7f) === 8) {
      if (j > 0) {
        j -= 2; // will be incremented back to j-1 by loop
        if (inputStr.length > 0) {
          inputStr = inputStr.slice(0, -1);
        }
        // Clear displayed digit
        hires.hcolor(0);
        hires.text(' ', startCol + j + 1, promptRow);
        continue;
      }
      j = -1; // restart
      continue;
    }

    // CR (Enter) — COM.bas:874
    if ((k & 0x7f) === 13 || ch === '\r') {
      break;
    }

    // Only accept digits — COM.bas:875
    if (ch < '0' || ch > '9') {
      j--; // try again at same position
      continue;
    }

    // Display digit
    hires.hcolor(3);
    hires.text(ch, startCol + j, promptRow);
    inputStr += ch;
  }

  if (inputStr.length === 0) return null;
  const val = parseInt(inputStr, 10);
  if (isNaN(val) || val < min || val > max) return null;
  return val;
}
