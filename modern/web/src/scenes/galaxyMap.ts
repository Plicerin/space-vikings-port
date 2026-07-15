import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';

function drawPlanetDot(hires: import('../engine/hires').Hires, x: number, y: number, visited: boolean, surrendered: boolean): void {
  const sx = Math.round(x);
  const sy = Math.round(y);

  if (surrendered) {
    hires.hcolor(2);
    hires.hplot(sx, sy - 2);
    hires.hplot(sx - 2, sy);
    hires.hplot(sx, sy);
    hires.hplot(sx + 2, sy);
    hires.hplot(sx, sy + 2);
  } else if (visited) {
    hires.hcolor(5);
    hires.hplot(sx - 1, sy - 1);
    hires.hplot(sx, sy - 1);
    hires.hplot(sx + 1, sy - 1);
    hires.hplot(sx - 1, sy);
    hires.hplot(sx, sy);
    hires.hplot(sx + 1, sy);
    hires.hplot(sx - 1, sy + 1);
    hires.hplot(sx, sy + 1);
    hires.hplot(sx + 1, sy + 1);
  } else {
    hires.hplot(sx, sy);
    hires.hplot(sx + 1, sy);
    hires.hplot(sx, sy + 1);
  }
}

function drawCrosshair(hires: import('../engine/hires').Hires, x: number, y: number): void {
  hires.hcolor(5);
  hires.hplot(x, y - 2);
  hires.hplot(x, y - 1);
  hires.hplot(x, y);
  hires.hplot(x, y + 1);
  hires.hplot(x, y + 2);
  hires.hplot(x - 2, y);
  hires.hplot(x - 1, y);
  hires.hplot(x + 1, y);
  hires.hplot(x + 2, y);
}

export async function galaxyMapScene(
  ctx: SceneContext,
  scenes: SceneManager,
): Promise<void> {
  const { hires, state, input } = ctx;
  setScene('galaxyMap');

  for (;;) {
    hires.hgr();
    hires.hcolor(1);
    hires.line(1, 1, 1, 190);
    hires.line(1, 190, 279, 190);
    hires.line(279, 190, 279, 1);
    hires.line(279, 1, 1, 1);

    for (let p = 0; p < 20; p++) {
      const planet = state.planets[p];
      const sx = planet.x * 10 - 35;
      const sy = planet.y * 5;

      drawPlanetDot(hires, sx, sy, planet.visited, planet.surrendered);

      if (planet.visited && p !== state.planetIndex && p > 0) {
        hires.hcolor(1);
        const label = planet.name.toUpperCase().slice(0, 8);
        hires.text(label, sx / 8 - 2, sy / 8 + 6);
      }

      if (p === state.planetIndex) {
        hires.hcolor(2);
        hires.line(sx - 5, sy + 5, sx + 5, sy + 5);
        hires.line(sx + 5, sy + 5, sx + 5, sy - 5);
        hires.line(sx + 5, sy - 5, sx - 5, sy - 5);
        hires.line(sx - 5, sy - 5, sx - 5, sy + 5);
      }
    }

    hires.hcolor(1);
    hires.text('GALAXY MAP', 15, 1);
    hires.hcolor(3);
    hires.text(`STARDATE: ${state.stardate.toFixed(1)}`, 2, 2);

    const conquered = state.planets.filter(p => p.surrendered).length;
    hires.text(`CONQUERED: ${conquered}/20`, 26, 2);

    hires.hcolor(1);
    hires.text('LEGEND:', 2, 3);
    hires.hcolor(2);
    hires.text('+', 10, 3);
    hires.hcolor(1);
    hires.text(':CONQUERED', 12, 3);
    hires.hcolor(5);
    hires.text('*', 24, 3);
    hires.hcolor(1);
    hires.text(':VISITED', 26, 3);
    hires.hcolor(1);
    hires.text('.:UNKNOWN', 37, 3);

    hires.hcolor(3);
    hires.text('ARROWS:MOVE  ENTER:SELECT  SPACE:EXIT', 4, 4);

    hires.hcolor(5);
    hires.line(1, 33, 279, 33);

    if (state.commanderMode && state.commanderMapTarget !== null) {
      const target = state.planets[state.commanderMapTarget];
      hires.hcolor(5);
      hires.text(`COMMAND TARGET: ${target.name.toUpperCase()}`.slice(0, 38), 1, 22);
      glog('commander', `galaxy map target ${target.name}`);
      await new Promise(r => setTimeout(r, 60));
      return scenes.run('hyperdrive');
    }

    let cursorX = 140;
    let cursorY = 75;

    for (;;) {
      const dx = input.isDown('ArrowLeft') ? -3 : input.isDown('ArrowRight') ? 3 : 0;
      const dy = input.isDown('ArrowUp') ? -3 : input.isDown('ArrowDown') ? 3 : 0;
      cursorX = Math.max(10, Math.min(270, cursorX + dx));
      cursorY = Math.max(33, Math.min(185, cursorY + dy));

      drawCrosshair(hires, cursorX, cursorY);

      const k = input.peekKey();
      if (k > 0) {
        input.clearKey();
        const ch = String.fromCharCode(k & 0x7f).toUpperCase();

        if (k === 0x8d || ch === '\r' || k === 13) {
          const px = (cursorX + 35) / 10;
          const py = cursorY / 5;
          let found = -1;
          for (let p = 0; p < 20; p++) {
            const planet = state.planets[p];
            if (Math.abs(px - planet.x) <= 2 && Math.abs(py - planet.y) <= 1) {
              found = p;
              break;
            }
          }

          if (found >= 0) {
            const currentPlanet = state.planets[state.planetIndex];
            const targetPlanet = state.planets[found];
            const x1 = Math.abs(currentPlanet.x - targetPlanet.x);
            const y1 = Math.abs(currentPlanet.y - targetPlanet.y);
            const z1 = Math.abs(currentPlanet.z - targetPlanet.z);
            const dist = Math.sqrt(x1 * x1 + y1 * y1 + z1 * z1);

            hires.hcolor(1);
            hires.text(`${targetPlanet.name.toUpperCase()}`, 1, 21);
            hires.text(`LOC: ${targetPlanet.x} ${targetPlanet.y} ${targetPlanet.z}`, 1, 22);
            hires.text(`DIST: ${Math.round(dist)} L/Y`, 1, 23);

            glog('galaxyMap', `selected ${targetPlanet.name} dist=${Math.round(dist)}`);

            if (targetPlanet.visited || targetPlanet.surrendered) {
              hires.text(`POP: ${targetPlanet.population}  TECH: ${targetPlanet.defense}`, 1, 24);
              hires.text('FURTHER INFO? (Y/N)', 19, 24);
            } else {
              hires.text('NO FURTHER INFO', 1, 24);
            }

            if (targetPlanet.visited || targetPlanet.surrendered) {
              const info = await input.waitForKey();
              const infoCh = String.fromCharCode(info & 0x7f).toUpperCase();
              if (infoCh === 'Y') {
                state.commanderMapTarget = found;
                return scenes.run('com');
              }
            }
          } else {
            hires.hcolor(1);
            hires.text('NO STAR SYSTEM THERE  ', 1, 21);
          }
        } else if (ch === ' ' || ch === 'X' || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9')) {
          return scenes.run('starshipSimulator');
        }
      }

      await new Promise(r => setTimeout(r, 50));

      hires.hcolor(0);
      hires.hplot(cursorX, cursorY - 2);
      hires.hplot(cursorX, cursorY - 1);
      hires.hplot(cursorX, cursorY);
      hires.hplot(cursorX, cursorY + 1);
      hires.hplot(cursorX, cursorY + 2);
      hires.hplot(cursorX - 2, cursorY);
      hires.hplot(cursorX - 1, cursorY);
      hires.hplot(cursorX + 1, cursorY);
      hires.hplot(cursorX + 2, cursorY);
    }
  }
}
