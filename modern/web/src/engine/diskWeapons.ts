/**
 * Firing, STARSHIP SIMULATOR lines 185, 1000-1090 and 1500-1570.
 *
 * There is no enemy AI to transcribe. `X9 = 400: Y9 = -100: Z9 = -3500` is set once at line 2
 * and never touched again, so the enemy is a fixed point in the world and the only thing that
 * moves is you. What stands in for combat is this.
 *
 * ```
 * 185   IF PEEK(-16287) > 127 THEN GOSUB 1500
 * 1500  IF PEEK(38208) = 1 THEN POKE 38208,0: POKE 38150,100
 * 1501  IF PEEK(38202) = 1 THEN 1000                 ; 38202 = 1 selects the missile
 * 1502  IF PEEK(38186) = 0 THEN RETURN               ; a dead laser cannot fire
 * 1505  ...three beams and CALL LA...  J1 = 10: J2 = 1
 * 1535  VP = PEEK(38160) + (J1 / (TE+1)): IF VP < HL THEN POKE 38160,VP
 * 1540  IF PEEK(38210) = 0 THEN DP = PEEK(38152) + (J2 / (TE+1)):
 *       IF DP < HL THEN POKE 38152,DP
 * 1550  IF VP => PEEK(38150) THEN ...THE PLANET HAS SURRENDERED...
 * 1560  IF DP > PEEK(38204) AND PEEK(38205) <> 0 THEN "RUNEX"
 * 1085  IF HIT = 1 THEN GOSUB 1200: J1 = 10: J2 = 120: GOSUB 1535
 * 1090  J = PEEK(38187) - 2: GOSUB 3380: POKE 38187,J
 * ```
 *
 * `TE = PEEK(38282 + PEEK(38209))` is the planet's tech, read **once** at line 8, and
 * `HL = 255` from line 1.
 *
 * Four things that follow, all of them measured on the disk by `oracle/probe_weapons.mjs`.
 *
 * - **The laser does not aim.** 1535 and 1540 test nothing about where the ship is pointing
 *   or how far away anything is. Holding the button while facing nowhere in particular raised
 *   38160 all the same. The port had a screen-space test - the enemy within 40 by 30 pixels
 *   of the middle - which is invented.
 * - **`IF VP < HL THEN POKE` is a test, not a clamp.** At 250 a shot computes 252.5 and
 *   stores; at 253 it computes 255.5, which is not less than 255, and **nothing is stored** -
 *   the byte stays 253 while the same held button was moving it from 250 a moment earlier.
 * - **Every store truncates, and the fraction is gone for good**, because the next shot PEEKs
 *   the byte back. 38160 moved in steps of **2** where the arithmetic says 2.5.
 * - **So the laser can never damage the enemy ship.** 1540 adds `1 / (TE + 1)`, which reaches
 *   a whole number only at TE = 0, and line 189 refuses to put an enemy on a planet below tech
 *   2. Measured at TE = 3: 38152 stayed at 0 through 900 frames of continuous fire. Only the
 *   missile, at J2 = 120, can destroy it.
 *
 * A missile costs 2 whether it hits or misses, and `5251 GOTO 1090` means shooting down a
 * ground battery goes out through the same line and charges 2 for that too.
 */

export const WEAPON_ADDRESSES = {
  /** 38202 - 1 selects the missile, anything else the laser. */ selected: 38202,
  /** 38186 - the laser; at 0 it will not fire. */ laser: 38186,
  /** 38187 - missiles, two a shot. */ missiles: 38187,
  /** 38160, VP - how far the assault on the planet has got. */ planetVitality: 38160,
  /** 38150, SP - what it has to reach. H/D line 93 sets it to TECH * 60. */ surrenderAt: 38150,
  /** 38152, DP - damage done to the enemy ship. H/D line 16 zeroes it. */ enemyDamage: 38152,
  /** 38204 - what the enemy ship can take. H/D line 93 sets it to TECH * 60. */ enemyLimit: 38204,
  /** 38205 - an enemy is there at all. */ enemyPresent: 38205,
  /** 38207 - ground batteries left. */ groundBatteries: 38207,
  /** 38208 - the planet has surrendered. */ surrendered: 38208,
  /** 38210 - in atmosphere. */ atmosphere: 38210,
  /** 38219 + planet - marked on surrender. */ conquered: 38219,
} as const;

/** Line 2: the enemy sits here and never moves. */
export const ENEMY_POSITION = { x: 400, y: -100, z: -3500 } as const;

/** 1505 and 1085: what a laser shot and a missile hit are worth. */
export const LASER = { j1: 10, j2: 1 } as const;
export const MISSILE = { j1: 10, j2: 120, cost: 2 } as const;

/** Line 1, `HL = 255`. */
export const HL = 255;

/**
 * `IF x < HL THEN POKE addr,x` - the store 1535 and 1540 make.
 *
 * Returns the byte that ends up there. Not a clamp: at or above 255 the old value stays, and
 * below it the value is truncated into a byte, so the fraction never carries to the next shot.
 */
export function storeIfUnder255(current: number, added: number): number {
  const v = current + added;
  return v < HL ? Math.trunc(v) : current;
}

export interface FireState {
  /** 38160. */ planetVitality: number;
  /** 38152. */ enemyDamage: number;
  /** 38187. */ missiles: number;
  /** 38208. */ surrendered: boolean;
  /** 38150. */ surrenderAt: number;
}

export interface FireContext {
  /** `TE`, the planet's tech, read once at line 8. */ tech: number;
  /** 38210. */ atmosphere: boolean;
  /** 38186 - a laser at 0 cannot fire. */ laserPct: number;
  /** 38204. */ enemyLimit: number;
  /** 38205. */ enemyPresent: boolean;
}

export interface FireResult extends FireState {
  fired: boolean;
  /** 1550 fired this shot. */ planetSurrendered: boolean;
  /** 1560 fired - the enemy ship is gone and EX runs. */ enemyDestroyed: boolean;
}

/** 1535-1560, shared by the laser and by a missile that hit. */
function applyHit(s: FireState, ctx: FireContext, j1: number, j2: number): FireResult {
  const divisor = ctx.tech + 1;                       // line 8's TE, not clamped anywhere
  const planetVitality = storeIfUnder255(s.planetVitality, j1 / divisor);   // 1535
  let enemyDamage = s.enemyDamage;
  if (!ctx.atmosphere) {                              // 1540
    enemyDamage = storeIfUnder255(s.enemyDamage, j2 / divisor);
  }
  // 1550 tests the computed VP, which is what would have been stored.
  const vp = s.planetVitality + j1 / divisor;
  const planetSurrendered = !s.surrendered && vp >= s.surrenderAt;
  // 1560 tests the computed DP the same way.
  const dp = ctx.atmosphere ? s.enemyDamage : s.enemyDamage + j2 / divisor;
  const enemyDestroyed = !ctx.atmosphere && dp > ctx.enemyLimit && ctx.enemyPresent;
  return {
    ...s, planetVitality, enemyDamage,
    surrendered: s.surrendered || planetSurrendered,
    fired: true, planetSurrendered, enemyDestroyed,
  };
}

/**
 * 1500-1570, the laser.
 *
 * Firing at a planet that has already surrendered un-surrenders it and puts the bar back to
 * 100 - `1500 IF PEEK(38208) = 1 THEN POKE 38208,0: POKE 38150,100`.
 */
export function fireLaser1500(s: FireState, ctx: FireContext): FireResult {
  let st = s;
  if (st.surrendered) st = { ...st, surrendered: false, surrenderAt: 100 };   // 1500
  if (ctx.laserPct === 0) {                                                   // 1502
    return { ...st, fired: false, planetSurrendered: false, enemyDestroyed: false };
  }
  return applyHit(st, ctx, LASER.j1, LASER.j2);
}

/**
 * 1000-1090, the missile.
 *
 * `hit` is the caller's: in atmosphere 1010 tests the missile's height against the horizon,
 * and in space 1050 tests a box 300 by 80 by 200 around the enemy. Either way 1090 charges
 * two, so a miss is not free.
 */
export function fireMissile1000(s: FireState, ctx: FireContext, hit: boolean): FireResult {
  let st = s;
  if (st.surrendered) st = { ...st, surrendered: false, surrenderAt: 100 };   // 1500
  if (st.missiles === 0) {                                                    // 1000
    return { ...st, fired: false, planetSurrendered: false, enemyDestroyed: false };
  }
  let r: FireResult = hit
    ? applyHit(st, ctx, MISSILE.j1, MISSILE.j2)                               // 1085
    : { ...st, fired: true, planetSurrendered: false, enemyDestroyed: false };
  r = { ...r, missiles: Math.max(0, r.missiles - MISSILE.cost) };             // 1090 and 3380
  return r;
}

/** 1050's box in space, and 1010's rule in atmosphere. */
export const MISSILE_BOX = { x: 150, yUp: 60, yDown: 20, z: 100 } as const;

export function missileHits1050(
  p: { x: number; y: number; z: number },
  enemy = ENEMY_POSITION,
): boolean {
  return p.x < enemy.x + MISSILE_BOX.x && p.x > enemy.x - MISSILE_BOX.x
    && p.y < enemy.y + MISSILE_BOX.yUp && p.y > enemy.y - MISSILE_BOX.yDown
    && p.z < enemy.z + MISSILE_BOX.z && p.z > enemy.z - MISSILE_BOX.z;
}

/** 5250: one battery fewer, and 5251's `GOTO 1090` charges two missiles for it. */
export function groundBatteryDestroyed5250(
  batteries: number, missiles: number,
): { batteries: number; missiles: number } {
  return {
    batteries: batteries - 1 > -1 ? batteries - 1 : batteries,
    missiles: Math.max(0, missiles - MISSILE.cost),
  };
}
