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
    hires.hgr();
    fillBackground(hires, 6, 0, 123);
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
