import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';
import { clearPendingConquestCollection } from '../engine/commander';

/**
 * COLLECT, the loot award after a won ground assault - COLLECT.bas.
 *
 * GROUND FORCES line 805 chains here once the planet surrenders. It prints a message for the
 * planet's tech level, adds loot, and goes on to COM.
 *
 * It draws only into the band GROUND FORCES' line 170 clears - rows 11-14, columns 0-38 -
 * and it inherits `$3CD` = 255 from there, so both messages are inverse. Everything else on
 * the page is the battle screen underneath.
 */

/** Line 10000's DATA. Note GROOMBRIDGE **1618**, as STATUS spells it - COM has 168. */
const PLANET_NAMES = [
  'SOL', 'ALPHA CENTAURI', "BARNARD'S STAR", 'WOLF 359', 'LUYTEN',
  'LALANDE 21185', 'SIRIUS', 'VARCAR', 'XANADON', 'EPSILON ERIDANA',
  'CYGNI', 'PROCYON', 'TAU CETI', 'LACAILLE 9352', 'LARSEN-C',
  'GROOMBRIDGE 1618', 'KRUGER 60', 'EPSILON INDI', 'ARGO', 'SHIVANDA',
];

/** Line 805's `ON TECH + 1 GOSUB 820,840,910,1070,1090`. */
export const COLLECT_MESSAGES: string[][] = [
  ['PLANET IS NON-HABITABLE.', 'THERE IS NO LOOT TO GATHER, SIR.'],
  ['PLANET IS PRIMITIVE. THE ONLY LOOT',
   'IS A LITTLE GOLD AND SILVER AND SOME',
   'WINES AND LIQUORS, SIR.'],
  ['PLANET IS IN THE LIMITED ATOMIC STAGE.',
   'THERE ARE NO HIGH TECHNOLOGY PRODUCTS',
   'AVAILABLE, BUT THERE IS AN ABUNDANCE',
   'OF OTHER GOODS, SIR!'],
  ['PLANET HAS A SOPHISTICATED TECHNOLOGY.', "WE'LL GET PLENTY OF LOOT HERE, SIR."],
  ['PLANET HAS A SUPERIOR TECHNOLOGY.', "WE'VE HIT IT BIG THIS TIME, SIR!!!"],
];

const INVERSE = { invert: true } as const;
type H = import('../engine/hires').Hires;

/** Line 170: `FOR C = 12 TO 15: VTAB C: PRINT "<39 spaces>"` into a window at left 0. */
export function clearCollectBand(hires: H): void {
  for (let r = 12; r <= 15; r++) hires.text(' '.repeat(39), 1, r, INVERSE);
}

/**
 * Lines 802-805. `VTAB 12: HTAB 1` is 0-based row 11, column 0.
 *
 * COLLECT does not clear the band before printing - 800 and 802 only move the cursor. It does
 * not need to: GROUND FORCES line 690 ran `R4 = 1: GOSUB 160` on its way here, so the band is
 * already the white one and carries nothing but "TROOPS ARE NOW COLLECTING LOOT.", which every
 * one of these messages is long enough to cover. The tech-2 branch at 910 is the exception and
 * does blank it itself, after a pause. The band is drawn here so the screen can be compared on
 * its own.
 */
export function drawCollectMessage(hires: H, tech: number): void {
  clearCollectBand(hires);
  const lines = COLLECT_MESSAGES[tech] ?? [];
  for (let i = 0; i < lines.length; i++) hires.text(lines[i], 1, 12 + i, INVERSE);
}

/** Line 16, after its own `GOSUB 160` has cleared the band again. */
export function drawCollectSuccess(hires: H, planetIndex: number): void {
  clearCollectBand(hires);
  hires.text(`OPERATION ${PLANET_NAMES[planetIndex] ?? ''} IS A`, 1, 12, INVERSE);
  hires.text('SUCCESS, SIR!', 1, 13, INVERSE);
}

export interface CollectLoot {
  /** Keyed by address, as SUPPLY reads them. */
  [address: number]: number;
}

/**
 * Lines 850-1050, bugs included.
 *
 * Two of them are in the original and the port reproduces both:
 *
 * - **Line 880 pokes `J`, not `F`.** Line 870 works out silver into `F` and tests `J`, and
 *   880 stores `J` - still gold's value from 850. So at tech 1, silver comes out equal to gold.
 *   Run on the machine at last, by forcing the planet's tech byte: gold 2, silver 2, and the
 *   whole path costs three draws because 870 throws its value away but still advances the
 *   stream. 840's message promises "WINES AND LIQUORS" and 890 credits **38173, luxury food** -
 *   wine is 38172 and is never touched.
 * - **Line 960 pokes 31180, not 38180.** Titanium is never awarded, and `$79CC` - inside the
 *   ship model BLOADed to `$7879` - is written instead. Confirmed on the machine: a tech 3
 *   assault left titanium at 0 and took 31180 from 68 to 5, which is exactly the value 960
 *   worked out for titanium.
 *
 * Line 920 halves the rates once per trip: `IF PEEK(301) = 1 THEN J1 = J1 * .6: J2 = J2 * .6`,
 * then 921 pokes 301 to 1. H/D line 5 pokes it back to 0, so the first haul after a jump is
 * the full one. 301 is `$012D`, inside the 6502 stack page - the flag is kept 210 bytes down
 * a stack that grows down from `$01FF` - but an assault and a collection take the stack no
 * lower than `$019D`, so nothing overwrites it and the flag works as intended.
 *
 * All thirteen draws are replayed against the machine's own RND stream in
 * `oracle/replay_parity.mjs`, so the order, the rates and both bugs are confirmed on the
 * values and not on their bounds.
 */
export function awardLoot(
  loot: CollectLoot,
  tech: number,
  alreadyCollected: boolean,
  rnd: () => number = Math.random,
): { loot: CollectLoot; modelByteWritten: number | null } {
  const out = { ...loot };
  const cap = (v: number) => (v > 255 ? 255 : Math.floor(v));

  if (tech === 1) {
    const gold = cap(out[38183] + rnd() * 5);
    out[38183] = gold;
    // 870/880: F is computed and discarded; J is stored.
    void cap(out[38182] + rnd() * 5);
    out[38182] = gold;
    out[38173] = cap(out[38173] + rnd() * 10);
    return { loot: out, modelByteWritten: null };
  }
  if (tech < 2) return { loot: out, modelByteWritten: null };

  // 910, 1070, 1090 set the two rates before calling 920.
  let j1: number;
  let j2: number;
  if (tech === 2) { j1 = 0; j2 = 10; }
  else if (tech === 3) { j2 = 7; j1 = 10; }
  else { j2 = 15; j1 = 15; }
  if (alreadyCollected) { j1 *= 0.6; j2 *= 0.6; }

  out[38183] = cap(out[38183] + rnd() * j2);   // 925 gold
  out[38182] = cap(out[38182] + rnd() * j2);   // 940 silver
  out[38181] = cap(out[38181] + rnd() * j2);   // 950 platinum
  const stray = cap(out[38180] + rnd() * j2);  // 960 - poked to 31180, so titanium never moves
  out[38179] = cap(out[38179] + rnd() * j1);   // 970 collapsium
  out[38178] = cap(out[38178] + rnd() * j2);   // 980 steel
  out[38177] = cap(out[38177] + rnd() * j2);   // 990 fissionables
  out[38176] = cap(out[38176] + rnd() * j1);   // 1000 electronic parts
  out[38175] = cap(out[38175] + rnd() * j1);   // 1010 weapons
  out[38174] = cap(out[38174] + rnd() * j2);   // 1020 fighter parts
  out[38173] = cap(out[38173] + rnd() * 20);   // 1030 luxury foods
  out[38172] = cap(out[38172] + rnd() * j2);   // 1040 wine/liquor
  out[38171] = cap(out[38171] + rnd() * j1);   // 1050 art works
  return { loot: out, modelByteWritten: stray };
}

function lootToState(state: import('../engine/gameState').GameState, loot: CollectLoot): void {
  const l = state.loot;
  l.artUnits = loot[38171];
  l.wineCases = loot[38172];
  l.luxuryFoodCases = loot[38173];
  l.fighterPartCrates = loot[38174];
  l.weaponCrates = loot[38175];
  l.electronicCrates = loot[38176];
  l.fissionablesLb = loot[38177];
  l.steelTons = loot[38178];
  l.collapsiumTons = loot[38179];
  l.titaniumKlb = loot[38180];
  l.platinum = loot[38181];
  l.silver = loot[38182];
  l.gold = loot[38183];
}

export async function collectScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, scenes: _s } = ctx as SceneContext & { scenes?: unknown };
  void _s;
  setScene('collect');

  const tech = state.planets[state.planetIndex]?.defense ?? 0;

  // 13, 805. The tech-2 branch at 910 waits before it says anything - `FOR J = 1 TO 4000: NEXT`
  // ahead of its own `R4 = 1: GOSUB 160` - so the previous message stands a while longer. The
  // other four print straight over the band GROUND FORCES left.
  if (tech === 2) await new Promise((r) => setTimeout(r, 4000));
  drawCollectMessage(hires, tech);
  // 810: `FOR J = 1 TO 7000: NEXT`.
  await new Promise((r) => setTimeout(r, 2500));

  const before: CollectLoot = {
    38171: state.loot.artUnits, 38172: state.loot.wineCases, 38173: state.loot.luxuryFoodCases,
    38174: state.loot.fighterPartCrates, 38175: state.loot.weaponCrates,
    38176: state.loot.electronicCrates, 38177: state.loot.fissionablesLb,
    38178: state.loot.steelTons, 38179: state.loot.collapsiumTons,
    38180: state.loot.titaniumKlb, 38181: state.loot.platinum,
    38182: state.loot.silver, 38183: state.loot.gold,
  };
  const { loot } = awardLoot(before, tech, state.collectedThisTrip === true);
  lootToState(state, loot);
  state.collectedThisTrip = true;   // line 921's POKE 301,1
  clearPendingConquestCollection(state, state.planetIndex);

  // 16
  drawCollectSuccess(hires, state.planetIndex);
  glog('collect', `tech=${tech} planet=${PLANET_NAMES[state.planetIndex]}`);
  await new Promise((r) => setTimeout(r, 1500));

  // 17: `POKE 38151,7`, which COM line 98 turns into a `RUN GROUND FORCES` before it ever shows
  // its menu - so the trip ends back in the ground-forces menu, not COM's.
  state.runGroundForcesOnReturn = true;
  return scenes.run('com');
}
