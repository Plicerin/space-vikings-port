import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';
import { clearPendingConquestCollection } from '../engine/commander';

const PLANET_NAMES = [
  'SOL', 'ALPHA CENTAURI', "BARNARD'S STAR", 'WOLF 359', 'LUYTEN',
  'LALANDE 21185', 'SIRIUS', 'VARCAR', 'XANADON', 'EPSILON ERIDANA',
  'CYGNI', 'PROCYON', 'TAU CETI', 'LACAILLE 9352', 'LARSEN-C',
  'GROOMBRIDGE 168', 'KRUGER 60', 'EPSILON INDI', 'ARGO', 'SHIVANDA',
];

function cap255(v: number): number {
  return Math.min(255, Math.round(v));
}

export async function collectScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input } = ctx;
  setScene('collect');

  const tech = state.planets[state.planetIndex].defender;
  const name = PLANET_NAMES[state.planetIndex];

  hires.hgr();
  hires.hcolor(1);
  hires.line(1, 1, 139, 1);
  hires.line(139, 1, 139, 110);
  hires.line(139, 110, 1, 110);
  hires.line(1, 110, 1, 1);

  hires.hcolor(3);
  hires.text('LOOT COLLECTION', 4, 2);
  hires.hcolor(1);

  let j1 = 0;
  let j2 = 0;

  if (tech === 0) {
    hires.text('PLANET IS NON-', 2, 4);
    hires.text('HABITABLE.', 2, 5);
    hires.text('THERE IS NO LOOT', 2, 6);
    hires.text('TO GATHER, SIR.', 2, 7);
  } else if (tech === 1) {
    hires.text('PLANET IS PRIMITIVE.', 2, 4);
    hires.text('THE ONLY LOOT IS A', 2, 5);
    hires.text('LITTLE GOLD AND', 2, 6);
    hires.text('SILVER AND SOME', 2, 7);
    hires.text('WINES AND LIQUORS.', 2, 8);
  state.loot.gold = cap255(state.loot.gold + Math.random() * 5);
  state.loot.silver = cap255(state.loot.silver + Math.random() * 5);
  state.loot.wineCases = cap255(state.loot.wineCases + Math.random() * 10);
  } else if (tech === 2) {
    hires.text('LIMITED ATOMIC STAGE.', 2, 4);
    hires.text('NO HIGH TECH PRODUCTS', 2, 5);
    hires.text('BUT ABUNDANCE OF', 2, 6);
    hires.text('OTHER GOODS, SIR!', 2, 7);
    j1 = 0;
    j2 = 10;
    distributeLoot(state, j1, j2);
  } else if (tech === 3) {
    hires.text('SOPHISTICATED TECH.', 2, 4);
    hires.text("WE'LL GET PLENTY OF", 2, 5);
    hires.text('LOOT HERE, SIR!', 2, 6);
    j1 = 10;
    j2 = 7;
    distributeLoot(state, j1, j2);
  } else if (tech >= 4) {
    hires.text('SUPERIOR TECHNOLOGY.', 2, 4);
    hires.text("WE'VE HIT IT BIG", 2, 5);
    hires.text('THIS TIME, SIR!!!', 2, 6);
    j1 = 15;
    j2 = 15;
    distributeLoot(state, j1, j2);
  }

  hires.hcolor(3);
  hires.text(`OPERATION ${name}`, 2, 12);
  hires.text('IS A SUCCESS, SIR!', 2, 13);

  glog('collect', `tech=${tech} planet=${name}`);
  state.planets[state.planetIndex].looted = true;
  clearPendingConquestCollection(state, state.planetIndex);

  hires.hcolor(5);
  hires.text('PRESS ANY KEY...', 2, 20);
  if (state.commanderMode) {
    await new Promise(r => setTimeout(r, 60));
    return scenes.run('starshipSimulator');
  }
  await input.waitForKey();

  return scenes.run('com');
}

function distributeLoot(state: import('../engine/gameState').GameState, j1: number, j2: number): void {
  const l = state.loot;
  l.platinum = cap255(l.platinum + Math.random() * j2);
  l.gold = cap255(l.gold + Math.random() * j2);
  l.silver = cap255(l.silver + Math.random() * j2);
  l.titaniumKlb = cap255(l.titaniumKlb + Math.random() * j2);
  l.collapsiumTons = cap255(l.collapsiumTons + Math.random() * j1);
  l.steelTons = cap255(l.steelTons + Math.random() * j2);
  l.fissionablesLb = cap255(l.fissionablesLb + Math.random() * j2);
  l.electronicCrates = cap255(l.electronicCrates + Math.random() * j1);
  l.weaponCrates = cap255(l.weaponCrates + Math.random() * j1);
  l.fighterPartCrates = cap255(l.fighterPartCrates + Math.random() * j2);
  l.luxuryFoodCases = cap255(l.luxuryFoodCases + Math.random() * 20);
  l.wineCases = cap255(l.wineCases + Math.random() * j2);
  l.artUnits = cap255(l.artUnits + Math.random() * j1);
}
