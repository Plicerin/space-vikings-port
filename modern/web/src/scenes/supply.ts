import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';

function drawHeader(hires: import('../engine/hires').Hires): void {
  hires.hcolor(3);
  hires.text('SUPPLY REPORT', 13, 1);
  hires.hcolor(1);
  hires.line(1, 14, 278, 14);
}

function totalValue(state: import('../engine/gameState').GameState): number {
  const raw = state.loot.platinum * 10
    + state.loot.gold * 10
    + state.loot.silver * 20
    + state.loot.titaniumKlb * 2
    + state.loot.collapsiumTons * 50
    + state.loot.steelTons * 0.5
    + state.loot.fissionablesLb * 3;
  const finished = state.loot.electronicCrates * 25
    + state.loot.weaponCrates * 40
    + state.loot.fighterPartCrates * 30
    + state.loot.luxuryFoodCases * 5
    + state.loot.wineCases * 2
    + state.loot.artUnits * 100;
  return Math.floor(raw + finished);
}

export async function supplyScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input } = ctx;
  setScene('supply');
  glog('supply', `credits=${state.credits} loot value=${totalValue(state)}`);

  for (;;) {
    hires.hgr();
    drawHeader(hires);

    let r = 3;
    const line = (label: string, value: string) => {
      hires.text(`* ${label}`, 1, r);
      hires.text(`= ${value}`, 18, r);
      r++;
    };

    hires.hcolor(1);
    line('PLATINUM', `${state.loot.platinum * 10} POUNDS`);
    line('GOLD', `${state.loot.gold * 10} POUNDS`);
    line('SILVER', `${state.loot.silver * 20} POUNDS`);
    line('TITANIUM', `${state.loot.titaniumKlb}K POUNDS`);
    line('COLLAPSIUM', `${state.loot.collapsiumTons} TONS`);
    line('STEEL', `${state.loot.steelTons} TONS`);
    line('FISSIONABLES', `${state.loot.fissionablesLb} POUNDS`);

    hires.line(1, 93, 278, 93);
    hires.hcolor(5);
    hires.text(`EST. VALUE: ${totalValue(state)} CREDITS`, 4, 13);
    hires.hcolor(1);
    hires.text(`IN HOLD: ${state.credits} CREDITS`, 4, 15);

    hires.hcolor(3);
    hires.text('SPACE-PAGE 2', 26, 18);
    hires.text('ENTER-RETURN', 26, 19);

    const k1 = await input.waitForKey();
    const ch1 = String.fromCharCode(k1 & 0x7f).toUpperCase();
    if (ch1 === '\r') { return; }

    hires.hgr();
    drawHeader(hires);

    r = 3;
    hires.hcolor(1);
    line('ELECTRONIC PARTS', `${state.loot.electronicCrates} CRATES`);
    line('WEAPONS', `${state.loot.weaponCrates} CRATES`);
    line('FIGHTER PARTS', `${state.loot.fighterPartCrates} CRATES`);
    line('LUXURY FOODS', `${state.loot.luxuryFoodCases} CASES`);
    line('WINE/LIQUOR', `${state.loot.wineCases * 100} CASES`);
    line('ART WORKS', `${state.loot.artUnits * 10} UNITS`);

    hires.hcolor(5);
    hires.text(`TOTAL VALUE: ${totalValue(state)} CREDITS`, 4, 12);
    hires.text(`CREDITS: ${Math.floor(state.credits)}`, 4, 14);

    hires.hcolor(3);
    hires.text('1-PAGE 1', 26, 18);
    hires.text('ENTER-RETURN', 26, 19);

    const k2 = await input.waitForKey();
    const ch2 = String.fromCharCode(k2 & 0x7f);
    if (ch2 === '1') continue;
    return;
  }
}
