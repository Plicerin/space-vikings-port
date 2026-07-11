// Ship Status Report — port of STATUS.bas.
//
// Two pages: ship systems on the first, troop status on the second. Press
// any key to flip from page 1 to page 2; another key returns to COM.

import type { SceneContext, SceneManager } from '../engine/sceneManager';

const PLANET_NAMES = [
  'SOL', 'ALPHA CENTAURI', "BARNARD'S STAR", 'WOLF 359', 'LUYTEN',
  'LALANDE 21185', 'SIRIUS', 'VARCAR', 'XANADON', 'EPSILON ERIDANA',
  'CYGNI', 'PROCYON', 'TAU CETI', 'LACAILLE 9352', 'LARSEN-C',
  'GROOMBRIDGE 168', 'KRUGER 60', 'EPSILON INDI', 'ARGO', 'SHIVANDA',
];
const MORALE = ['', 'AWFUL!!!', 'POOR', 'SO-SO', 'FAIR', 'GOOD', 'EXCELLENT!'];
const LOCATION = ['ON BOARD', 'PLANETSIDE', 'SHORE LEAVE', 'CRYOGENIC SLEEP'];

export async function statusScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input } = ctx;

  // Page 1 — ship systems
  hires.hgr();
  hires.hcolor(1);
  for (let y = 0; y <= 123; y++) hires.hlin(0, 279, y);
  hires.hcolor(3);
  hires.text('-SHIP STATUS REPORT-', 9, 1);
  hires.text(`LOCATION :${PLANET_NAMES[state.planetIndex]}`, 1, 3);
  hires.text(`STARDATE :${state.stardate.toFixed(1)}`, 1, 5);

  const energyPct = Math.min(100, Math.round((state.energy / 2000) * 100));
  hires.text(`ENERGY  :${energyPct}%`, 1, 7);
  hires.text(`CREDITS  :${Math.floor(state.credits)}`, 22, 7);
  hires.text(`SHIELDS :${state.damage.shieldsPct}%`, 1, 8);
  hires.text(`CONDITION:${state.condition.toUpperCase()}`, 22, 8);
  hires.text(`HULL DMG:${100 - state.damage.hullPct}%`, 1, 9);
  hires.text(`MISSILES :${state.missilesRemaining}`, 22, 9);
  hires.text(`COMPUTER:${state.damage.computerPct}%`, 1, 10);
  hires.text(`H-DRIVE  :${state.damage.hyperdrivePct}%`, 22, 10);
  hires.text(`RADAR   :${state.damage.radarPct}%`, 1, 11);
  hires.text(`ENV.     :${state.damage.envPct}%`, 22, 11);
  hires.text(`LASER   :${state.damage.laserPct}%`, 1, 12);
  hires.text('NAV.COMP.:100%', 22, 12);
  hires.text(`ENGINE#1:${state.damage.engine1Pct}%`, 1, 13);
  hires.text(`ENGINE#2 :${state.damage.engine2Pct}%`, 22, 13);
  await input.waitForKey();

  // Page 2 — troops + ground forces
  hires.hgr();
  hires.hcolor(1);
  for (let y = 0; y <= 123; y++) hires.hlin(0, 279, y);
  hires.hcolor(3);
  hires.text('-TROOP STATUS-', 12, 1);
  hires.hcolor(1);
  hires.text(`NO. OF TROOPS`, 1, 3);
  hires.text(`-`, 18, 3);
  hires.text(`${state.forces.troops}`, 24, 3);
  hires.text(`TROOP MORALE`, 1, 4);
  hires.text(`-`, 18, 4);
  hires.text(`${MORALE[state.forces.morale]}`, 24, 4);
  hires.text(`TROOP LOCATION`, 1, 5);
  hires.text(`-`, 18, 5);
  hires.text(LOCATION[state.forces.troopLocation], 24, 5);
  hires.text(`FIGHTERS`, 1, 7);
  hires.text(`-`, 18, 7);
  hires.text(`${state.forces.fighters}`, 24, 7);
  hires.text(`TRANSPORTS`, 1, 8);
  hires.text(`-`, 18, 8);
  hires.text(`${state.forces.transports}`, 24, 8);
  hires.text(`TANKS`, 1, 9);
  hires.text(`-`, 18, 9);
  hires.text(`${state.forces.tanks}`, 24, 9);
  hires.text(`GROUND MISSILES`, 1, 10);
  hires.text(`-`, 18, 10);
  hires.text(`${state.forces.groundMissiles}`, 24, 10);
  if (state.forces.troops === 0) {
    hires.hcolor(2);
    hires.text('THE TROOPS ARE ALL DEAD!', 6, 14);
  }
  await input.waitForKey();

  return scenes.run('com');
}
