/**
 * The economy, as the BASIC computes it.
 *
 * These numbers sat in `DISK_TRUTH.md` quoted off the listing for a long time and were never
 * run. `oracle/probe_economy.mjs` runs them now: it drives the disk to GROUND FORCES, sets
 * the thirteen cargo counters to known values, sells, and reads `L` and `CR` out of
 * Applesoft's own variable table.
 *
 * Twelve of the thirteen rates are constants, so with the one random counter emptied the
 * whole sum is predictable - and the machine agrees to the credit.
 */

/** The thirteen cargo counters, `$9528`-`$9534`, in the order SHORE LEAVE 2400-2405 reads. */
export const LOOT_ADDRESSES = [
  38171, 38172, 38173, 38174, 38175, 38176, 38177,
  38178, 38179, 38180, 38181, 38182, 38183,
] as const;

/**
 * SHORE LEAVE 2400-2405, one rate per counter.
 *
 * ```
 * 2400 L = PEEK(38171) * (300 * RND(1)): L = L + (PEEK(38172) * 150): ...
 * 2405 ... L = L + ((PEEK(38181) * 20) * 75): L = L + ((PEEK(38182) * 10) * 100):
 *          L = L + ((PEEK(38183) * 10) * 200)
 * ```
 *
 * `null` marks the first, which is priced at `300 * RND(1)` per unit rather than a constant -
 * so art is worth anywhere from nothing to 300 a unit, decided once per sale.
 *
 * The two that look like typos are not. Platinum is `20 * 75`, **1500**, and silver is
 * `10 * 100`, **1000**: the multipliers are the other way round from what the units suggest,
 * and the machine bears it out.
 */
export const LOOT_RATES: readonly (number | null)[] = [
  null,        // 38171  art          300 * RND(1)
  150,         // 38172  wine
  100,         // 38173  luxury food
  200,         // 38174  fighter parts
  200,         // 38175  weapons
  200,         // 38176  electronics
  300,         // 38177  fissionables
  15,          // 38178  steel
  5,           // 38179  collapsium
  25,          // 38180  titanium
  20 * 75,     // 38181  platinum    = 1500
  10 * 100,    // 38182  silver      = 1000
  10 * 200,    // 38183  gold        = 2000
];

/**
 * 2400-2408: the sale, doubled and truncated.
 *
 * `artRate` is the `300 * RND(1)` the caller rolled, kept as an argument so the deterministic
 * part can be checked on its own - which is exactly how the machine was made to agree.
 * `2406 L = L * 2` doubles everything, and `2408 L = INT(L)` truncates once at the end, not
 * per term.
 */
export function lootValue2400(counts: readonly number[], artRate: number): number {
  let l = (counts[0] ?? 0) * artRate;
  for (let i = 1; i < LOOT_RATES.length; i++) l += (counts[i] ?? 0) * (LOOT_RATES[i] as number);
  return Math.trunc(l * 2);
}

/** The roll 2400 makes for art: `300 * RND(1)`, so 0 up to but not including 300. */
export const rollArtRate = (rnd: () => number = Math.random): number => 300 * rnd();

/**
 * SHORE LEAVE 2170: `C = 20000 + ((RND(1) * 5000) * (RND(1) * 10))`, then `2110 C = INT(C)`.
 *
 * So a base costs 20000 at the very least and 70000 at the very most. Measured on the disk at
 * 32982, which is inside that and says nothing more - the distribution is a product of two
 * uniforms, so the middle is far more likely than either end.
 */
export function baseCost2170(rnd: () => number = Math.random): number {
  return Math.trunc(20000 + (rnd() * 5000) * (rnd() * 10));
}

export const BASE_COST_MIN = 20000;
export const BASE_COST_MAX = 70000;

/**
 * What stops a base being built, in the order the BASIC tests it.
 *
 * ```
 * 2100  IF PEEK(38303 + planet) > 0 THEN "THERE IS ALREADY A BASE ON THIS PLANET, SIR!"
 * 2105  IF PEEK(38282 + planet) < 2 THEN "THIS PLANET IS TOO BACKWARD TO BUILD A BASE, SIR!"
 * 2106  IF PEEK(38149) = 1         THEN "ONLY ONE TIME PER TRIP, SIR."
 * 2130  IF CR < C                  THEN "YOU DON'T HAVE ENOUGH CREDITS TO BUILD A BASE HERE."
 * ```
 *
 * and 2107 sets 38149 before the price is even shown, so a refusal at 2130 still spends the
 * one attempt. GROUND FORCES line 65 gets there first for options 3 to 6: those need a base
 * on the planet already, and print "NO BASE" without entering SHORE LEAVE at all.
 */
export interface BaseGate {
  alreadyThere: boolean;
  tooBackward: boolean;
  alreadyTriedThisTrip: boolean;
}

export function baseRefusal2100(g: BaseGate): string | null {
  if (g.alreadyThere) return 'THERE IS ALREADY A BASE ON THIS PLANET, SIR!';
  if (g.tooBackward) return 'THIS PLANET IS TOO BACKWARD TO BUILD A BASE, SIR!';
  if (g.alreadyTriedThisTrip) return 'ONLY ONE TIME PER TRIP, SIR.';
  return null;
}

// ---- 2500-2540, the repair bill --------------------------------------------------------------
//
// ```
// 2500 DATA SHIELD,38200,ENERGY,38199,# 1 ENGINE,38198,# 2 ENGINE,38197,COMPUTER,38196,
//      RADAR,38195,ENV. CONTROL,38194,HULL DMG.,38193,HYPERDRIVE,38190,MISSILES,38187,
//      LASER,38186,NAV. COMP.,38184
// 2505 IF PEEK(38210) = 0 OR PEEK(29469) > 22 THEN "YOU MUST LAND ON PLANET FIRST."
// 2510 PRINT "  REPAIR SHIP": FOR J = 1 TO 12: READ A$: READ LO
// 2520 D = PEEK(LO): IF D < 100 AND J <> 10 AND J <> 2 THEN ...
//      CD = INT((RND(1) * 150) * (100 - ((D / 100) * 100))) ... P = P + CD: POKE LO,100
// 2524 IF D < 63 AND J = 2 THEN D2 = 63 - D: D2 = D2 * (100 / 63)
// 2525 IF D < 63 AND J = 2 THEN D1 = INT((D2 / 100) * 100) ...
//      CD = INT((RND(1) * 200) * (100 - D1)) ... P = P + CD: POKE LO,63
// 2530 IF D < 100 AND J = 10 THEN ...
//      CD = INT((RND(1) * 100) * (100 - PEEK(LO))) ... P = P + CD: POKE LO,100
// 2540 NEXT
// ```
//
// Each RND sits inside its own THEN, so a system already at full costs no draw at all - which
// makes the number of draws part of what a replay checks, not only their values.
//
// Three things here that reading the listing loosely would miss.
//
// - **Energy is the odd one out twice over.** It is the only system with a threshold of 63
//   rather than 100, the only one restored to 63 rather than 100, and its cost runs the wrong
//   way: `D1` is the damage rescaled onto 0..100 and the price is `100 - D1`, so the *worse*
//   the energy the *cheaper* the repair. Every other system charges `100 - D`, which gets
//   dearer the more broken it is. Confirmed on the machine, not inferred: energy at 17 gave
//   D2 = 73.0159 and D1 = 73, and the byte came back 63.
// - **NAV. COMP. is repaired and charged for.** It is J = 12, so it falls into 2520 with
//   everything else. The port skipped it.
// - **Missiles are a count, not a percentage.** J = 10 restores 38187 to 100, so the repair
//   screen is also where the missile rack is refilled, at `RND(1) * 100` a missile short.

/** 2500's DATA, in the order 2510's `FOR J = 1 TO 12` reads it. */
export const REPAIR_SYSTEMS = [
  { name: 'SHIELD', address: 38200 },
  { name: 'ENERGY', address: 38199 },
  { name: '# 1 ENGINE', address: 38198 },
  { name: '# 2 ENGINE', address: 38197 },
  { name: 'COMPUTER', address: 38196 },
  { name: 'RADAR', address: 38195 },
  { name: 'ENV. CONTROL', address: 38194 },
  { name: 'HULL DMG.', address: 38193 },
  { name: 'HYPERDRIVE', address: 38190 },
  { name: 'MISSILES', address: 38187 },
  { name: 'LASER', address: 38186 },
  { name: 'NAV. COMP.', address: 38184 },
] as const;

/** 2505: the ship has to be down, and low enough. `29469` is the Y coordinate's low byte. */
export function repairAvailable2505(atmosphere: boolean, yLow: number): boolean {
  return atmosphere && yLow <= 22;
}

export interface RepairLine {
  /** J, 1-based, as the FOR loop counts it. */
  index: number;
  name: string;
  address: number;
  /** D, the byte before the repair. */
  before: number;
  /** CD for this system, or 0 when it was not worth repairing and no draw was made. */
  cost: number;
  /** What the POKE leaves behind: 63 for energy, 100 for the rest. */
  restoredTo: number;
  /** Whether this system drew. */
  drew: boolean;
}

/**
 * One pass of 2510-2540 over all twelve systems.
 *
 * `values` is the twelve bytes in `REPAIR_SYSTEMS` order. Returns each line, the running total
 * `P` that 2560 bills, and the bytes as the POKEs leave them.
 */
export function repairBill2500(
  values: readonly number[],
  rnd: () => number = Math.random,
): { lines: RepairLine[]; total: number; after: number[] } {
  const lines: RepairLine[] = [];
  const after = values.slice();
  let total = 0;

  for (let i = 0; i < REPAIR_SYSTEMS.length; i++) {
    const j = i + 1;                       // J counts from 1
    const d = values[i] ?? 0;
    const sys = REPAIR_SYSTEMS[i];
    let cost = 0;
    let restoredTo = d;
    let drew = false;

    if (j === 2) {
      // 2524/2525. Note the price falls as the damage rises.
      if (d < 63) {
        const d2 = (63 - d) * (100 / 63);
        const d1 = Math.trunc((d2 / 100) * 100);
        cost = Math.trunc(rnd() * 200 * (100 - d1));
        restoredTo = 63;
        drew = true;
      }
    } else if (j === 10) {
      // 2530. It re-PEEKs the byte rather than using D, which is the same value either way.
      if (d < 100) {
        cost = Math.trunc(rnd() * 100 * (100 - d));
        restoredTo = 100;
        drew = true;
      }
    } else if (d < 100) {
      // 2520. `100 - ((D / 100) * 100)` is written out rather than folded to `100 - D`: the
      // machine carries a 32-bit mantissa, so the round trip through the division is where a
      // difference would show up if there is one.
      cost = Math.trunc(rnd() * 150 * (100 - ((d / 100) * 100)));
      restoredTo = 100;
      drew = true;
    }

    if (drew) { total += cost; after[i] = restoredTo; }
    lines.push({ index: j, name: sys.name, address: sys.address, before: d, cost, restoredTo, drew });
  }
  return { lines, total, after };
}

/**
 * 2560-2610: what happens when the bill is presented.
 *
 * `IF CR < P THEN 2600` and answering anything but Y at 2580 both land at 2605, which makes
 * the local government angry: 2610 pokes 38208 to 0 - the planet un-surrenders - and clears
 * 38219 + planet. Not having the credits also zeroes them at 2602.
 */
export function repairPayment2560(credits: number, total: number, paying: boolean):
  { paid: boolean; credits: number; planetLost: boolean } {
  if (credits < total) return { paid: false, credits: 0, planetLost: true };
  if (!paying && total > 0) return { paid: false, credits, planetLost: true };
  return { paid: true, credits: Math.trunc(credits - total), planetLost: false };
}

/**
 * SHORE LEAVE 3000 and 3060 - the weapons, and what one costs.
 *
 * `MU(1..4) = 50, 75, 40, 30` against `LO = 38156` counting **down**: fighters at 38156,
 * transports 38155, tanks 38154, missiles 38153. That is the same order GROUND FORCES line
 * 600 pokes them back in, which is what ties the two screens together.
 *
 * `3060 C = INT((RND(1) + .2) * 4 * MU(J1 + 1))`, so a unit costs between `0.8 * MU` and
 * `4.8 * MU`, rolled fresh for each of the four. 3070 refuses more than 255, 3072 refuses a
 * total over 255, and 3090 refuses what the credits will not cover.
 */
export const WEAPONS = [
  { name: 'FIGHTERS', address: 38156, unit: 50 },
  { name: 'TRANSPORTS', address: 38155, unit: 75 },
  { name: 'TANKS', address: 38154, unit: 40 },
  { name: 'MISSILES', address: 38153, unit: 30 },
] as const;

export function weaponCost3060(unit: number, rnd: () => number = Math.random): number {
  return Math.trunc((rnd() + 0.2) * 4 * unit);
}
