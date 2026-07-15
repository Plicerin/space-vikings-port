import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';

const PLANET_NAMES = [
  'SOL', 'ALPHA CENTAURI', "BARNARD'S STAR", 'WOLF 359', 'LUYTEN',
  'LALANDE 21185', 'SIRIUS', 'VARCAR', 'XANADON', 'EPSILON ERIDANA',
  'CYGNI', 'PROCYON', 'TAU CETI', 'LACAILLE 9352', 'LARSEN-C',
  'GROOMBRIDGE 168', 'KRUGER 60', 'EPSILON INDI', 'ARGO', 'SHIVANDA',
];
const MORALE = ['', 'AWFUL!!!', 'POOR', 'SO-SO', 'FAIR', 'GOOD', 'EXCELLENT!'];
const LOCATION = ['ON BOARD', 'PLANETSIDE', 'SHORE LEAVE', 'CRYOGENIC SLEEP'];

function bar(hires: import('../engine/hires').Hires, x: number, y: number, w: number, pct: number, color: number): void {
  const fill = Math.round(w * Math.min(100, Math.max(0, pct)) / 100);
  if (fill <= 0) return;
  hires.hcolor(color);
  hires.hlin(x, x + fill - 1, y);
}

export async function statusScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input } = ctx;
  setScene('status');

  // Page 1 — ship systems
  hires.hgr();
  for (let y = 0; y <= 140; y++) hires.hlin(0, 279, y);

  hires.hcolor(3);
  hires.text('-SHIP STATUS REPORT-', 9, 1);

  const conquered = state.planets.filter(p => p.surrendered).length;

  hires.hcolor(1);
  hires.text(`LOCATION :${PLANET_NAMES[state.planetIndex]}`, 1, 3);
  hires.text(`STARDATE :${state.stardate.toFixed(1)}`, 22, 3);
  hires.text(`CONDITION:${state.condition.toUpperCase()}`, 1, 4);
  hires.text(`SYSTEMS  :${conquered}/20`, 22, 4);

  hires.hcolor(5);
  hires.line(1, 38, 279, 38);

  const energyPct = Math.min(100, Math.round((state.energy / 2000) * 100));
  hires.hcolor(1);
  hires.text('ENERGY', 1, 6);
  hires.text(`${energyPct}%`, 10, 6);
  bar(hires, 100, 46, 120, energyPct, energyPct > 30 ? 3 : 5);

  hires.text('CREDITS', 1, 7);
  hires.text(`${Math.floor(state.credits)}`, 10, 7);

  hires.hcolor(1);
  hires.text('SHIELDS', 1, 8);
  hires.text(`${state.damage.shieldsPct}%`, 10, 8);
  bar(hires, 100, 62, 120, state.damage.shieldsPct, state.damage.shieldsPct > 30 ? 3 : 5);

  hires.text('HULL', 1, 9);
  hires.text(`${100 - state.damage.hullPct}%`, 10, 9);
  bar(hires, 100, 70, 120, 100 - state.damage.hullPct, state.damage.hullPct < 70 ? 5 : 3);

  hires.text('MISSILES', 1, 10);
  hires.text(`${state.missilesRemaining}`, 10, 10);

  hires.hcolor(5);
  hires.line(1, 85, 279, 85);

  hires.hcolor(1);
  hires.text('SYSTEM       STATUS', 1, 12);
  hires.text('COMPUTER', 1, 13);
  hires.text(`${state.damage.computerPct}%`, 20, 13);
  bar(hires, 130, 102, 90, state.damage.computerPct, state.damage.computerPct > 30 ? 3 : 5);

  hires.text('H-DRIVE', 1, 14);
  hires.text(`${state.damage.hyperdrivePct}%`, 20, 14);
  bar(hires, 130, 110, 90, state.damage.hyperdrivePct, state.damage.hyperdrivePct > 30 ? 3 : 5);

  hires.text('RADAR', 1, 15);
  hires.text(`${state.damage.radarPct}%`, 20, 15);
  bar(hires, 130, 118, 90, state.damage.radarPct, state.damage.radarPct > 30 ? 3 : 5);

  hires.text('ENVIRON', 1, 16);
  hires.text(`${state.damage.envPct}%`, 20, 16);
  bar(hires, 130, 126, 90, state.damage.envPct, state.damage.envPct > 30 ? 3 : 5);

  hires.text('LASER', 1, 17);
  hires.text(`${state.damage.laserPct}%`, 20, 17);
  bar(hires, 130, 134, 90, state.damage.laserPct, state.damage.laserPct > 30 ? 3 : 5);

  hires.text('NAV.COMP', 1, 18);
  hires.text('100%', 20, 18);
  bar(hires, 130, 142, 90, 100, 3);

  hires.text('ENGINE#1', 1, 19);
  hires.text(`${state.damage.engine1Pct}%`, 20, 19);
  bar(hires, 130, 150, 90, state.damage.engine1Pct, state.damage.engine1Pct > 30 ? 3 : 5);

  hires.text('ENGINE#2', 1, 20);
  hires.text(`${state.damage.engine2Pct}%`, 20, 20);
  bar(hires, 130, 158, 90, state.damage.engine2Pct, state.damage.engine2Pct > 30 ? 3 : 5);

  hires.hcolor(5);
  hires.text('PRESS ANY KEY FOR TROOP STATUS', 2, 22);
  glog('status', `page=1 energy=${energyPct}% credits=${Math.floor(state.credits)} hull=${100 - state.damage.hullPct}%`);
  await input.waitForKey();

  // Page 2 — troops + ground forces
  hires.hgr();
  for (let y = 0; y <= 140; y++) hires.hlin(0, 279, y);

  hires.hcolor(3);
  hires.text('-TROOP STATUS-', 12, 1);

  hires.hcolor(1);
  hires.text('TROOPS', 1, 3);
  hires.text('-', 18, 3);
  hires.text(`${state.forces.troops}`, 24, 3);
  bar(hires, 78, 22, 140, (state.forces.troops / 20000) * 100, state.forces.troops > 0 ? 3 : 5);

  hires.text('MORALE', 1, 4);
  hires.text('-', 18, 4);
  hires.text(MORALE[state.forces.morale], 24, 4);

  const troopPlanet = state.forces.troopPlanetIndex;
  const here = troopPlanet === state.planetIndex;
  const locName = troopPlanet >= 0 && troopPlanet < PLANET_NAMES.length ? PLANET_NAMES[troopPlanet] : '';
  hires.text('LOCATION', 1, 5);
  hires.text('-', 18, 5);
  hires.text(LOCATION[state.forces.troopLocation], 24, 5);
  if (troopPlanet >= 0 && troopPlanet !== state.planetIndex) {
    hires.text(`ON: ${locName}`, 1, 6);
  }

  if (state.forces.troops === 0) {
    hires.hcolor(2);
    hires.text('THE TROOPS ARE ALL DEAD!', 6, 7);
  }

  hires.hcolor(5);
  hires.line(1, 60, 279, 60);

  hires.hcolor(1);
  hires.text('EQUIPMENT', 1, 9);
  hires.text('FIGHTERS', 1, 10);
  hires.text('-', 18, 10);
  hires.text(`${state.forces.fighters}`, 24, 10);

  hires.text('TRANSPORTS', 1, 11);
  hires.text('-', 18, 11);
  hires.text(`${state.forces.transports}`, 24, 11);

  hires.text('TANKS', 1, 12);
  hires.text('-', 18, 12);
  hires.text(`${state.forces.tanks}`, 24, 12);

  hires.text('GND.MISSILES', 1, 13);
  hires.text('-', 18, 13);
  hires.text(`${state.forces.groundMissiles}`, 24, 13);

  hires.hcolor(5);
  hires.line(1, 108, 279, 108);

  hires.hcolor(1);
  hires.text('PLANET STATUS', 1, 15);
  let r = 16;
  for (let p = 0; p < 20 && r <= 22; p++) {
    const pl = state.planets[p];
    if (pl.visited || pl.surrendered) {
      const icon = pl.surrendered ? '+' : '*';
      hires.text(`${icon} ${pl.name.toUpperCase().slice(0, 16)}`, 1, r);
      r++;
    }
  }

  glog('status', `page=2 troops=${state.forces.troops} morale=${state.forces.morale}`);
  await input.waitForKey();

  return scenes.run('com');
}
