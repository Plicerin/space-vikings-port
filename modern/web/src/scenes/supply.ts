import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';

/**
 * SUPPLY, the cargo manifest - SUPPLY.bas.
 *
 * Reached from flight by C for COM, 1 for CENTRAL COMPUTER, 5 for SUPPLIES REPORT: COM line
 * 270's `ON C GOTO 800,900,30,1200,20000` lands on 20000's RUN SUPPLY.
 *
 * Two pages of one screen. Line 1450 holds the first at a GET; line 1460 sets R1 and calls
 * 1400 again, which clears, prints the title and returns early at the R1 test, and the
 * second page is drawn over it. Line 1510 takes `1` back to the first page.
 *
 * Unlike COM's chain this one owns the screen: line 20 floods rows 0-123 with HCOLOR 1, and
 * line 1400 pokes 973,255, so the whole report is inverse - solid blocks with black glyphs,
 * the same as STATUS. Only line 1515 puts the flag back, on the way out.
 *
 * The window is `POKE 32,1 / POKE 33,39 / POKE 34,0 / POKE 35,15`, so line 1400's clear is
 * 39 printed spaces on rows 0-14 starting at column 1.
 */

const INVERSE = { invert: true } as const;

/** The thirteen counters, with the multiplier the original applies when printing. */
export interface SupplyCargo {
  /** Keyed by address, the way COM's readouts are. */
  [address: number]: number;
}

const PAGE1: Array<[number, string, number, string]> = [
  [38181, '* PLATINUM ', 10, 'POUNDS'],
  [38183, '* GOLD', 10, 'POUNDS'],
  [38182, '* SILVER ', 20, 'POUNDS'],
  [38180, '* TITANIUM ', 1, 'THOUSAND POUNDS'],
  [38179, '* COLLAPSIUM ', 1, 'TONS'],
  [38178, '* STEEL ', 1, 'TONS'],
  [38177, '* FISSIONABLES ', 1, 'POUNDS'],
];

const PAGE2: Array<[number, string, number, string]> = [
  [38176, '* ELECTRONIC PARTS', 1, 'CRATES'],
  [38175, '* WEAPONS ', 1, 'CRATES'],
  [38174, '* FIGHTER PARTS', 1, 'CRATES'],
  [38173, '* LUXURY FOODS', 1, 'CASES'],
  [38172, '* WINE/LIQUOR', 100, 'CASES'],
  [38171, '* ART WORKS', 10, 'UNITS'],
];

type H = import('../engine/hires').Hires;

/** Line 20's flood and line 1400's clear and title. */
function frame(hires: H): void {
  hires.hcolor(1);
  for (let y = 0; y <= 123; y++) hires.hlin(0, 279, y);
  // Line 1400 prints 39 spaces into a 39-wide window from its left margin, and only 38
  // columns come out blanked - measured: column 39 (x 273-279) still shows the HCOLOR 1
  // flood underneath, odd pixels only. The last character wraps instead of printing.
  for (let r = 1; r <= 15; r++) hires.text(' '.repeat(38), 2, r, INVERSE);
  // VTAB 1: HTAB 11 - and HTAB is absolute, so 0-based column 10.
  hires.text('- SUPPLY REPORT -', 11, 1, INVERSE);
}

/** One manifest row: the label at column 1, `= n` at HTAB 19, the unit at HTAB 24. */
function row(hires: H, label: string, value: number, unit: string, r: number): void {
  hires.text(label, 2, r, INVERSE);
  hires.text(`= ${value}`, 19, r, INVERSE);
  if (unit) hires.text(unit, 24, r, INVERSE);
}

/** Lines 1405-1450. */
export function drawSupplyPage1(hires: H, cargo: SupplyCargo): void {
  frame(hires);
  // 1405's VTAB 3 is 0-based row 2.
  for (let i = 0; i < PAGE1.length; i++) {
    const [addr, label, mul, unit] = PAGE1[i];
    row(hires, label, (cargo[addr] ?? 0) * mul, unit, 3 + i);
  }
  hires.text('HIT SPACE BAR TO CONTINUE.', 2, 11, INVERSE);
}

/** Lines 1465-1500. CREDITS is printed with no unit after it. */
export function drawSupplyPage2(hires: H, cargo: SupplyCargo, credits: number): void {
  frame(hires);
  for (let i = 0; i < PAGE2.length; i++) {
    const [addr, label, mul, unit] = PAGE2[i];
    row(hires, label, (cargo[addr] ?? 0) * mul, unit, 3 + i);
  }
  row(hires, '* CREDITS', Math.floor(credits), '', 9);
  // 1500: HTAB 9 and HTAB 8 are 0-based columns 8 and 7.
  hires.text('HIT SPACE BAR TO RETURN', 9, 11, INVERSE);
  hires.text('(1 TO RETURN TO 1ST PAGE)', 8, 12, INVERSE);
}

/**
 * The port's loot as the thirteen bytes SUPPLY peeks.
 *
 * Note the port names some fields for the *displayed* quantity - `titaniumKlb`,
 * `wineCases` - while the disk stores a plain count and multiplies only when printing. They
 * are treated as the byte here, which is what the addresses hold.
 */
export function supplyCargoFrom(state: import('../engine/gameState').GameState): SupplyCargo {
  const l = state.loot;
  return {
    38181: l.platinum, 38183: l.gold, 38182: l.silver, 38180: l.titaniumKlb,
    38179: l.collapsiumTons, 38178: l.steelTons, 38177: l.fissionablesLb,
    38176: l.electronicCrates, 38175: l.weaponCrates, 38174: l.fighterPartCrates,
    38173: l.luxuryFoodCases, 38172: l.wineCases, 38171: l.artUnits,
  };
}

export async function supplyScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input } = ctx;
  setScene('supply');
  const cargo = supplyCargoFrom(state);
  glog('supply', `credits=${Math.floor(state.credits)}`);

  for (;;) {
    drawSupplyPage1(hires, cargo);
    await input.waitForKey();
    drawSupplyPage2(hires, cargo, state.credits);
    // 1510: only `1` goes back; anything else leaves.
    const k = await input.waitForKey();
    if (String.fromCharCode(k & 0x7f) !== '1') break;
  }
  return scenes.run('com');
}
