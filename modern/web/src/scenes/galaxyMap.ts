import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';

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
      // GALAXY MAP.bas:3060-3065 — X = X(P)*10-35, Y = Y(P)*5
      const sx = planet.x * 10 - 35;
      const sy = planet.y * 5;

      if (planet.z < 12) hires.hcolor(6);
      else if (planet.z < 16) hires.hcolor(5);
      else hires.hcolor(1);

      if (planet.surrendered) hires.hcolor(2);

      hires.hplot(Math.round(sx), Math.round(sy));
      hires.hplot(Math.round(sx) + 1, Math.round(sy));
      hires.hplot(Math.round(sx), Math.round(sy) + 1);

      if (p === state.planetIndex) {
        hires.hcolor(2);
        hires.line(sx - 5, sy + 5, sx + 5, sy + 5);
        hires.line(sx + 5, sy + 5, sx + 5, sy - 5);
        hires.line(sx + 5, sy - 5, sx - 5, sy - 5);
        hires.line(sx - 5, sy - 5, sx - 5, sy + 5);
      }
    }

    hires.hcolor(5);
    hires.line(1, 150, 279, 150);

    hires.hcolor(1);
    hires.text('GALAXY MAP', 15, 20);
    hires.text('--PRESS SPACE TO RETURN--', 8, 20);


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
      cursorY = Math.max(10, Math.min(145, cursorY + dy));

      hires.hcolor(5);
      hires.hplot(cursorX, cursorY);
      hires.hplot(cursorX + 1, cursorY);

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
          const loc = state.planetIndex;
          const currentPlanet = state.planets[loc];
          const targetPlanet = state.planets[found];
          const x1 = Math.abs(currentPlanet.x - targetPlanet.x);
          const y1 = Math.abs(currentPlanet.y - targetPlanet.y);
          const z1 = Math.abs(currentPlanet.z - targetPlanet.z);
          const dist = Math.sqrt(x1 * x1 + y1 * y1 + z1 * z1);

          hires.hcolor(1);
          hires.text(`STAR SYSTEM: ${targetPlanet.name.toUpperCase()} `, 1, 21);
          hires.text(`LOC: ${targetPlanet.x} ${targetPlanet.y} ${targetPlanet.z} `, 1, 22);
          hires.text(`DISTANCE: ${Math.round(dist)} L/Y `, 1, 23);

          glog('galaxyMap', `selected ${targetPlanet.name} dist=${Math.round(dist)}`);

const planet = targetPlanet;
if (planet.visited || planet.surrendered) {
            hires.text('FURTHER INFO? (Y/N)', 1, 24);
            const info = await input.waitForKey();
            const infoCh = String.fromCharCode(info & 0x7f).toUpperCase();
            if (infoCh === 'Y') {
              state.commanderMapTarget = found;
              return scenes.run('com');
            }
          } else {
            hires.text('NO FURTHER INFO', 1, 24);
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
      hires.hplot(cursorX, cursorY);
      hires.hplot(cursorX + 1, cursorY);
    }
  }
}
