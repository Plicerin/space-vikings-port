// Supplies Report — port of SUPPLY.bas. Two pages: raw materials, then
// finished goods + credits. SPACE flips page; '1' returns to page 1; any
// other key on page 2 returns to COM.

import type { SceneContext, SceneManager } from '../engine/sceneManager';

export async function supplyScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input } = ctx;

  for (;;) {
    // Page 1 — raw materials
    hires.hgr();
    hires.hcolor(3);
    hires.text('- SUPPLY REPORT -', 11, 1);
    hires.hcolor(1);
    let r = 3;
    const line = (label: string, value: string) => {
      hires.text(`* ${label}`, 1, r);
      hires.text(`= ${value}`, 18, r);
      r++;
    };
    line('PLATINUM', `${state.loot.platinum * 10} POUNDS`);
    line('GOLD', `${state.loot.gold * 10} POUNDS`);
    line('SILVER', `${state.loot.silver * 20} POUNDS`);
    line('TITANIUM', `${state.loot.titaniumKlb}K POUNDS`);
    line('COLLAPSIUM', `${state.loot.collapsiumTons} TONS`);
    line('STEEL', `${state.loot.steelTons} TONS`);
    line('FISSIONABLES', `${state.loot.fissionablesLb} POUNDS`);
    hires.hcolor(5);
    hires.text('HIT SPACE BAR TO CONTINUE.', 7, r + 2);
    await input.waitForKey();

    // Page 2 — finished goods + credits
    hires.hgr();
    hires.hcolor(3);
    hires.text('- SUPPLY REPORT -', 11, 1);
    hires.hcolor(1);
    r = 3;
    line('ELECTRONIC PARTS', `${state.loot.electronicCrates} CRATES`);
    line('WEAPONS', `${state.loot.weaponCrates} CRATES`);
    line('FIGHTER PARTS', `${state.loot.fighterPartCrates} CRATES`);
    line('LUXURY FOODS', `${state.loot.luxuryFoodCases} CASES`);
    line('WINE/LIQUOR', `${state.loot.wineCases * 100} CASES`);
    line('ART WORKS', `${state.loot.artUnits * 10} UNITS`);
    line('CREDITS', `${Math.floor(state.credits)}`);
    hires.hcolor(5);
    hires.text('HIT SPACE BAR TO RETURN', 8, r + 2);
    hires.text('(1 TO RETURN TO 1ST PAGE)', 7, r + 3);

    const k = await input.waitForKey();
    const ch = String.fromCharCode(k & 0x7f);
    if (ch === '1') continue; // back to page 1
return;
}
}
