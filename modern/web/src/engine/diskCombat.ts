/**
 * GROUND FORCES' combat, as lines 500-690 compute it.
 *
 * The port's version was written from the screen rather than from the listing, and three of
 * its formulas were wrong. They are transcribed here instead, with the addresses each
 * quantity lives at, so the two can be compared.
 *
 * ```
 * 500 TECH = PEEK(38209): TECH = PEEK(38282 + TECH): ET = PEEK(38206) * 500: M = PEEK(38153)
 * 510 SP = PEEK(38150): VP = PEEK(38160)
 * 550 VIC = RND(1) * (10 * TECH)
 *     IF VIC < 20 THEN T1 = TECH*3: T2 = 500+(RND*20): T3 = 200+(RND*5):
 *                      X = RND*(12/(TECH+.5)): GOTO 560
 * 555 T1 = 1: T2 = 200*(RND*5): T3 = 500+(RND*5): X = -(RND*(10/(TECH+.5)))
 * 560 T = T-(RND*(RND*5)): P = P-(RND*(RND*5)): M = M-(RND*(RND*5))
 *     TP = TP-(RND*1)+.5
 *     TR = TR-(RND*(RND*(TECH*(RND*T2))))
 * 570 ET = ET-(RND*(RND*(3*(RND*T3)))): IF PEEK(38205) > 0 THEN X = X-(RND*1)
 * 572 PS = 100/(SP+.01): PS = PS*VP
 * 575 X = X+(PEEK(38203)-3)
 * 580 VP = VP+X: IF VP > 255 THEN VP = 255
 * 585 IF VP < 0 THEN VP = 0
 * 590 ... 598  clamp T, P, M, TP and TR at zero
 * 600 POKE 38156,P: POKE 38155,TP: POKE 38154,T: POKE 38153,M
 * 660 IF VP => SP THEN ...surrender...
 * 670 IF TR = 0 THEN ...defeat...
 * 680 GOTO 550
 * ```
 *
 * Three things the port had wrong, all of them here:
 *
 * - **`T2` in the losing branch is `200 * (RND * 5)`, not `200 + (RND * 5)`.** A multiply, so
 *   0 to 1000 rather than 200 to 205 - and `T2` scales the troop losses, so the branch where
 *   the roll goes against you can cost five times more than the branch where it does not.
 * - **`TP = TP - (RND * 1) + .5`.** Transports can go **up**: the roll is a single uniform
 *   and half is added back, so the change is `(-0.5, +0.5]`. The port had `rnd * rnd * 0.5`,
 *   which only ever subtracts.
 * - **`ET` is updated every round** by line 570 and the port never had it at all.
 *
 * And one the port did not have at all: **line 650's `GOSUB 4000` truncates every round**.
 *
 * ```
 * 4000 P = INT(P): TP = INT(TP): TR = INT(TR): T = INT(T): M = INT(M): PS = INT((PS*100)/100)
 * ```
 *
 * so the fractions are thrown away in the variables themselves, not just in the byte line 600
 * pokes. A round's arithmetic always starts from whole numbers. Watching a real assault shows
 * both halves - an arithmetic step, then its truncation - thirteen times each over 27 values.
 *
 * `TR` is not a PEEK. It comes off the disk at line 11 - `OPEN MISC FILE: READ MISC FILE:
 * INPUT SD: INPUT TR: INPUT CR` - which is also where the credits come from, and why a lost
 * battle writes the file back at line 670.
 */

/** Where each quantity lives. Verified by driving the disk, see `oracle/probe_combat.mjs`. */
export const COMBAT_ADDRESSES = {
  /** 38150, SP - the vitality the planet surrenders at. Zeroed on surrender by line 660. */
  surrenderAt: 38150,
  /** 38151 - set to 7 when the battle is lost. */
  defeatFlag: 38151,
  /** 38153-38156, the four weapon counts, poked back by line 600. */
  missiles: 38153,
  tanks: 38154,
  transports: 38155,
  fighters: 38156,
  /** 38158 - the planet the troops are on. Lines 66 and 67 refuse if it is not this one. */
  troopPlanet: 38158,
  /** 38160, VP - how far the assault has got. */
  vitality: 38160,
  /** 38166 - where the troops are; zeroed on defeat. */
  troopLocation: 38166,
  /** 38203 - morale, 1 to 6. Line 575 adds `morale - 3` to the swing every round. */
  morale: 38203,
  /** 38205 - anything above zero costs another `RND` off the swing each round. */
  penalty: 38205,
  /** 38206 - the enemy's troops, times 500. */
  enemyTroops: 38206,
  /** 38208 - set to 1 when the planet surrenders. */
  surrendered: 38208,
  /** 38209 - the planet being attacked. */
  planet: 38209,
  /** 38219 + planet - marked 1 on surrender. */
  conqueredBase: 38219,
  /** 38282 + planet - the planet's tech level, which drives everything. */
  techBase: 38282,
} as const;

export interface CombatState {
  /** P, 38156. */ fighters: number;
  /** TP, 38155. */ transports: number;
  /** T, 38154. */ tanks: number;
  /** M, 38153. */ missiles: number;
  /** TR, off the MISC FILE. */ troops: number;
  /** ET, `PEEK(38206) * 500` at line 500. */ enemyTroops: number;
  /** VP, 38160. */ vitality: number;
}

export interface CombatInputs {
  /** `PEEK(38282 + PEEK(38209))`. */ tech: number;
  /** SP, 38150. */ surrenderAt: number;
  /** `PEEK(38203)`. */ morale: number;
  /** `PEEK(38205) > 0`. */ penalty: boolean;
}

export interface CombatRound extends CombatState {
  /** PS, line 572 - what the screen shows as the surrender percentage. */
  surrenderPct: number;
  /** The round's swing, after 570 and 575. */
  x: number;
  outcome: 'continue' | 'surrender' | 'defeat';
}

/** Applesoft's POKE truncates towards zero; see `oracle/probe_combat.mjs`. */
const poked = (v: number): number => Math.trunc(v);

/**
 * One pass of 550-680.
 *
 * `rnd` is supplied so a caller can drive it deterministically. Every `RND(1)` in the listing
 * is one call here, in the order the lines make them, which is what makes the arithmetic
 * comparable at all - Applesoft's own RND is a five-byte float LCG and is not reproduced.
 */
export function combatRound550(
  s: CombatState,
  inp: CombatInputs,
  rnd: () => number = Math.random,
): CombatRound {
  const { tech, surrenderAt: sp, morale, penalty } = inp;
  let { fighters: p, transports: tp, tanks: t, missiles: m, troops: tr, enemyTroops: et, vitality: vp } = s;

  const vic = rnd() * (10 * tech);                    // 550
  let t2: number;
  let t3: number;
  let x: number;
  if (vic < 20) {
    t2 = 500 + rnd() * 20;
    t3 = 200 + rnd() * 5;
    x = rnd() * (12 / (tech + 0.5));
  } else {                                            // 555
    t2 = 200 * (rnd() * 5);                           // a multiply, not an add
    t3 = 500 + rnd() * 5;
    x = -(rnd() * (10 / (tech + 0.5)));
  }

  t -= rnd() * (rnd() * 5);                           // 560
  p -= rnd() * (rnd() * 5);
  m -= rnd() * (rnd() * 5);
  tp = tp - rnd() * 1 + 0.5;                          // can go up
  tr -= rnd() * (rnd() * (tech * (rnd() * t2)));

  et -= rnd() * (rnd() * (3 * (rnd() * t3)));         // 570
  if (penalty) x -= rnd() * 1;

  const surrenderPct = (100 / (sp + 0.01)) * vp;      // 572
  x += morale - 3;                                    // 575

  vp += x;                                            // 580
  if (vp > 255) vp = 255;
  if (vp < 0) vp = 0;                                 // 585

  if (t < 0) t = 0;                                   // 590-598
  if (p < 0) p = 0;
  if (m < 0) m = 0;
  if (tp < 0) tp = 0;
  if (tr < 0) tr = 0;

  // 600 pokes the four back as bytes, so the stored counts are truncated even though the
  // arithmetic above carries fractions from round to round.
  const out: CombatRound = {
    fighters: p, transports: tp, tanks: t, missiles: m, troops: tr, enemyTroops: et,
    vitality: vp, surrenderPct, x,
    outcome: vp >= sp ? 'surrender' : tr === 0 ? 'defeat' : 'continue',
  };
  return out;
}

/** What line 600 stores: the same truncation, into the four bytes. */
export function pokedCounts600(r: CombatState): {
  fighters: number; transports: number; tanks: number; missiles: number;
} {
  return {
    fighters: poked(r.fighters), transports: poked(r.transports),
    tanks: poked(r.tanks), missiles: poked(r.missiles),
  };
}

/**
 * Line 4000, which line 650 calls every round before it redraws.
 *
 * `P = INT(P): TP = INT(TP): TR = INT(TR): T = INT(T): M = INT(M)` - so this is not a display
 * convenience, it is part of the model. Apply it to the state the next round starts from.
 */
export function truncate4000(s: CombatState): CombatState {
  return {
    fighters: Math.trunc(s.fighters), transports: Math.trunc(s.transports),
    tanks: Math.trunc(s.tanks), missiles: Math.trunc(s.missiles),
    troops: Math.trunc(s.troops), enemyTroops: s.enemyTroops, vitality: s.vitality,
  };
}

/**
 * Line 500: the tech level is a double indirection - the planet number at 38209 indexes the
 * table at 38282 - and the enemy's troops are five hundred a head.
 */
export function readCombatInputs(
  peek: (addr: number) => number,
): CombatInputs & { planet: number; enemyTroops: number } {
  const planet = peek(COMBAT_ADDRESSES.planet);
  return {
    planet,
    tech: peek(COMBAT_ADDRESSES.techBase + planet),
    enemyTroops: peek(COMBAT_ADDRESSES.enemyTroops) * 500,
    surrenderAt: peek(COMBAT_ADDRESSES.surrenderAt),
    morale: peek(COMBAT_ADDRESSES.morale),
    penalty: peek(COMBAT_ADDRESSES.penalty) > 0,
  };
}
