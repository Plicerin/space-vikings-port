import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';
import { getShipModelInfo } from '../engine/shipModels';

const SHIP_INFO: Record<number, { name: string; lines: string[] }> = {
  0: {
    name: 'NONE',
    lines: ['THERE IS NO', 'STARSHIP IN', 'THIS SYSTEM.'],
  },
  1: {
    name: getShipModelInfo(1)?.name ?? 'SPACE LAB',
    lines: ['AND OBSERVATORY', 'MINIMUM WEAPONS', 'AND ARMOR.'],
  },
  3: {
    name: getShipModelInfo(3)?.name ?? 'LIGHT CRUISER',
    lines: ['WITH LASERS,', 'MISSILES AND', 'FIGHTER COVER.'],
  },
  4: {
    name: getShipModelInfo(4)?.name ?? 'HEAVY CRUISER',
    lines: ['WITH PHOTON', 'MISSILES AND', 'HEAVY LASERS.', '20-40 FIGHTERS'],
  },
};

const SHIP_WIREFRAMES: Record<number, number[][]> = {
  1: [
    [1,-13,0, 2,-11,0, 1,-10,.5, 2,-11,.5, 2,-11,-.5, 2,-10,-.5, 1,-10,1.5, 2,-10,-1.5, 2,-5,-1.5, 2,-5,1.5, 2,-10,1.5, 1,-10,0, 2,-5,0, 1,-5,2.5, 2,-5,-2.5, 2,5,-2.5, 2,5,2.5, 2,-5,2.5, 1,5,1.5, 2,6,1.5, 2,6,-1.5, 2,5,-1.5, 1,6,0, 2,6,-7.5, 2,16,-7.5],
    [2,16,-4.5, 2,6,-4.5, 1,-2,2.5, 2,-2,3.5, 2,2,3.5, 2,2,2.5, 1,-2,.5, 2,2,.5, 2,2,-.5, 2,-2,-.5, 2,-2,.5, 1,-2,-2.5, 2,-2,-3.5, 2,2,-3.5, 2,2,-2.5],
    [77],
    [1,-13,0, 2,-11,0, 1,-10,.5, 2,-11,.5, 2,-11,-.5, 2,-10,-.5, 1,-10,1.5, 2,-10,-1.5, 2,-5,-1.5, 2,-5,1.5, 2,-10,1.5, 1,-10,0, 2,-5,0, 1,-5,2.5, 2,-5,-2.5, 2,5,-2.5, 2,5,2.5, 2,-5,2.5, 1,5,1.5, 2,6,1.5, 2,6,-1.5, 2,5,-1.5],
    [1,-2,2.5, 2,-2,3.5, 2,2,3.5, 2,2,2.5, 1,-2,.5, 2,2,.5, 2,2,-.5, 2,-2,-.5, 2,-2,.5, 1,-2,-2.5, 2,-2,-3.5, 2,2,-3.5, 2,2,-2.5, 1,6,0, 2,16,0],
    [127],
  ],
  3: [
    [1,-25,0, 2,20,15, 2,20,-15, 2,-25,0, 2,5,0, 2,20,15, 1,5,0, 2,20,-15, 1,5,0, 2,15,4, 1,5,0, 2,15,-4, 1,20,-5, 2,15,-5, 2,15,5, 2,20,5, 1,15,1, 2,18,1, 1,15,-1, 2,18,-1, 2,18,-4, 2,20,-4, 1,20,4, 2,18,4, 2,18,-4, 2,20,-4],
    [1,19,-3, 2,19,-1, 1,16,4, 2,17,4, 2,17,3, 2,16,3, 2,16,4, 1,16,-2, 2,16,-4, 2,18,-4, 2,18,-3, 2,17,-3, 2,17,-2, 2,16,-2, 1,-5,3, 2,-5,-3, 2,1,-3, 2,1,3, 2,-5,3],
    [77],
    [1,-25,0, 2,5,1, 2,15,4, 2,20,4, 2,20,2, 2,5,1, 1,15,4, 2,15,2, 1,15,4, 2,18,7, 2,20,7, 2,20,4, 1,18,7, 2,18,9, 2,20,9, 2,20,7, 1,19,9, 2,19,10],
    [1,19,8, 1,17,4, 2,17,5, 2,19,5, 2,19,4, 1,-25,0, 2,20,0, 1,20,2, 2,20,-2, 2,-25,-.5],
    [1,-5,-.5, 2,2,-.5, 2,2,-1, 1,-5,-.5, 2,-5,-1],
    [127],
  ],
  4: [
    [1,-23,1, 2,-23,-1, 2,-15,-4, 2,-11,-4, 2,-10,-3, 2,-10,3, 2,-11,4, 2,-15,4, 2,-23,1],
    [1,-23,0, 2,-10,0, 1,-15,4, 2,-15,-4],
    [1,-10,2, 2,-6,2, 2,-6,-2, 2,-10,-2],
    [1,-6,2, 2,-5,4, 2,-5,1, 2,-6,0, 2,-5,-1, 2,-5,-4, 2,-6,-2],
    [1,-5,4, 2,23,4, 2,23,-4, 2,-5,-4, 1,-5,-1, 2,20,-1, 1,-5,1, 2,20,1, 1,0,3, 2,5,3, 1,10,3, 2,15,3, 1,0,-3, 2,5,-3, 1,10,-3, 2,15,-3, 1,20,-4, 2,20,4],
    [1,2,4, 2,2,6, 1,4,4, 2,4,6, 1,13,4, 2,13,6, 1,15,4, 2,15,6, 1,-2,6, 2,20,6, 2,20,10, 2,-2,10, 2,-2,6, 1,-2,7, 2,-3,7, 2,-3,9, 2,-2,9],
    [1,19,10, 2,19,6],
    [1,2,-4, 2,2,-6, 1,4,-4, 2,4,-6, 1,13,-4, 2,13,-6, 1,-2,-6, 2,-2,-10, 2,20,-10, 2,20,-6, 2,-2,-6, 1,-2,-7, 2,-3,-7, 2,-3,-9, 2,-2,-9, 1,19,-6, 2,19,-10],
    [1,15,-6, 2,15,-4],
    [77],
    [1,-23,0, 2,-23,1, 2,-15,1, 2,-15,0, 2,-23,0, 2,-15,-1, 2,-15,4, 2,-23,1],
    [1,-15,4, 2,-10,4, 2,-10,-1, 2,-15,-1, 1,-11,4, 2,-11,-1, 1,-10,3, 2,-6,3, 2,-6,0, 2,-10,0, 1,-6,3, 2,-5,4, 2,-5,0, 2,-6,0, 1,-6,2, 2,20,2, 1,-5,4, 2,20,4, 2,20,0, 2,-5,0, 1,2,2, 2,2,-1, 1,4,2, 2,4,-1, 1,13,2, 2,13,-1, 1,15,2, 2,15,-1],
    [1,20,3, 2,23,3, 2,23,0, 2,20,0, 1,-2,-1, 2,20,-1, 2,20,-3, 2,-2,-3, 2,-2,-1, 1,-1,-1, 2,-1,-3, 1,1,-2, 2,6,-2, 1,13,-2, 2,19,-2, 1,-2,4, 2,-2,5, 2,0,5, 2,0,4, 1,-1,5, 2,-1,8, 2,0,7, 2,1,6, 2,-.5,5, 1,-1,7, 2,-2,7],
    [127],
  ],
};

export async function shipIdScene(
  ctx: SceneContext,
  scenes: SceneManager,
): Promise<void> {
  const { hires, state, input } = ctx;
  setScene('shipId');

  const requestedKind = parseShipKindParam(new URLSearchParams(window.location.search).get('ship'));
  const kind = requestedKind ?? (state.planets[state.planetIndex]?.defender || 0);

  hires.hgr();

  hires.hcolor(1);
  hires.line(1, 1, 161, 1);
  hires.line(161, 1, 161, 123);
  hires.line(161, 123, 1, 123);
  hires.line(1, 123, 1, 1);

  for (let j = 7; j <= 161; j += 5) hires.line(j, 1, j, 123);
  for (let j = 5; j <= 123; j += 5) hires.line(1, j, 161, j);

  const wireframes = SHIP_WIREFRAMES[kind];
  if (wireframes) {
    hires.hcolor(3);
    let ox = 80;
    let oy = 40;

    for (const row of wireframes) {
      let i = 0;
      while (i < row.length) {
        const c = row[i];
        if (c === 77) { ox = 80; oy += 60; i++; continue; }
        if (c === 127) { i++; continue; }
        const x = row[i + 1];
        const y = row[i + 2];
        const sx = ox - x * 2;
        const sy = oy - y * 2;
        if (c === 1) hires.hplot(sx, sy);
        else if (c === 2) hires.hplotTo(sx, sy);
        i += 3;
      }
    }
  }

  const info = SHIP_INFO[kind] || SHIP_INFO[0];
  hires.hcolor(3);
  hires.text('-SHIP I.D.-', 25, 1);

  let row = 4;
  hires.text(info.name, 25, row);
  row += 2;
  for (const line of info.lines) {
    hires.text(line, 25, row);
    row += 2;
  }

  glog('shipId', `identified ship kind=${kind} name=${info.name}`);

  await input.waitForKey();
  return scenes.run('radar');
}

function parseShipKindParam(value: string | null): 0 | 1 | 3 | 4 | null {
  if (value === '0') return 0;
  if (value === '1') return 1;
  if (value === '2' || value === '3') return 3;
  if (value === '4') return 4;
  return null;
}
