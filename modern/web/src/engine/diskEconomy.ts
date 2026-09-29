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
