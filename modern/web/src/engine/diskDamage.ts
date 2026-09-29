/**
 * The damage model, STARSHIP SIMULATOR lines 3000-3381 and 5098.
 *
 * ```
 * 190  IF PEEK(38208) = 0 AND PEEK(38210) = 1 THEN GOSUB 3000:
 *      IF RND(1) < .5 AND PEEK(38207) > 0 THEN GOSUB 5000
 * 192  IF PEEK(38208) = 0 AND X > -3500 AND X < 4500 AND Y > -3000 AND Y < 3000
 *      AND Z > -6000 AND Z < 2000 THEN GOSUB 3000:
 *      IF RND(1) < .6 AND PEEK(38207) > 0 THEN GOSUB 5000
 *
 * 3000 IF PEEK(38205) = 0 AND PEEK(38210) = 0 THEN RETURN
 * 3001 POKE -16300,0: IF RND(1) > .4 THEN 3030
 * 3010 IF RND(1) > .4 THEN 3030
 * 3019 ...flash and sound... DMG = 1
 * 3030 IF RND(1) > .3 THEN 3200
 * 3032 ...flash and sound... DMG = 1
 * 3200 IF DMG = 0 THEN RETURN
 * 3205 J = PEEK(38200) - (RND(1) * 1.1): GOSUB 3380: POKE 38200,J:
 *      IF PEEK(38200) > 10 AND PEEK(38201) = 1 THEN RETURN
 * 3207 IF L = 7 THEN RETURN
 * 3230 J = PEEK(38195) - (RND(1) * 5): GOSUB 3380: POKE 38195,J
 * 3260 J = PEEK(38198) - (RND(1) * 5): GOSUB 3380
 * 3270 POKE 38198,J: ...38197, 38196, 38186 the same, then 38193 - (RND(1) * 4)
 * 3350 POKE 38193,J: DMG = 0: IF J = 0 THEN PRINT "RUNS/X"
 * 3360 IF PEEK(38393) = 0 THEN POKE 38393,1: PRINT "RUNDMG"
 * 3380 IF J < 0 THEN J = 0
 * ```
 *
 * Four things the port had wrong.
 *
 * - **The heavy branch needs two rolls, not one.** `3001` and `3010` are separate
 *   `IF RND(1) > .4 THEN 3030`, so 3019 needs **both** to come in at or under .4: a chance of
 *   **0.16**, not 0.4. With 3030's independent 0.3 that makes a damaging tick 0.412 likely.
 *   Reading it as one roll gives 0.58, so the port was taking damage about 40% too often.
 * - **There is no per-bolt hit on the player.** Nothing in the original tests whether an
 *   enemy's shot reaches you. Damage is this periodic tick, gated by an enemy being present
 *   or the ship being in atmosphere; the only other source is ground fire, below.
 * - **Ground fire damages shields and nothing else.** `5098` is
 *   `L = 7: GOSUB 3205: L = 0`, and `3207` is `IF L = 7 THEN RETURN` - so a hit from the
 *   surface enters the damage routine at 3205, takes `RND(1) * 1.1` off the shields, and
 *   stops. It cannot touch the hull.
 * - **The shield gate tests the poked byte.** `POKE 38200,J: IF PEEK(38200) > 10` - so
 *   shields of 10.9 store as 10 and the test fails, and everything else takes damage. Testing
 *   the unrounded number absorbs a hit the original lets through.
 *
 * Five systems are never touched here: env. control (38194), hyperdrive (38190), missiles
 * (38187), nav. comp. (38184) and energy (38199). Whatever wears those down, it is not this.
 */

/** The ship's systems, at the addresses SHORE LEAVE 2500's DATA names them by. */
export const DAMAGE_ADDRESSES = {
  /** 38200, and 38201 is whether they are up. */ shields: 38200,
  shieldsOn: 38201,
  /** 38199 - not damaged by this routine. */ energy: 38199,
  engine1: 38198,
  engine2: 38197,
  computer: 38196,
  radar: 38195,
  /** 38194 - not damaged by this routine. */ envControl: 38194,
  hull: 38193,
  /** 38190 - not damaged by this routine. */ hyperdrive: 38190,
  /** 38187 - not damaged by this routine. */ missiles: 38187,
  laser: 38186,
  /** 38184 - not damaged by this routine. */ navComp: 38184,
  /** 38205 - an enemy is present. */ enemyPresent: 38205,
  /** 38207 - how many ground batteries are left. */ groundBatteries: 38207,
  /** 38208 - the planet has surrendered. */ surrendered: 38208,
  /** 38210 - the ship is in atmosphere. */ atmosphere: 38210,
  /** 38393 - set the first time damage gets through, which chains to the DMG screen. */
  dmgScreenShown: 38393,
} as const;

/** The six the routine does damage, in the order 3230-3350 works through them. */
export const DAMAGED_SYSTEMS = [
  { name: 'radar', address: 38195, scale: 5 },
  { name: 'engine1', address: 38198, scale: 5 },
  { name: 'engine2', address: 38197, scale: 5 },
  { name: 'computer', address: 38196, scale: 5 },
  { name: 'laser', address: 38186, scale: 5 },
  { name: 'hull', address: 38193, scale: 4 },
] as const;

/** The ones it leaves alone, which is worth naming so the omission is deliberate. */
export const UNDAMAGED_SYSTEMS = [38199, 38194, 38190, 38187, 38184] as const;

export interface ShipDamage {
  shields: number;
  radar: number;
  engine1: number;
  engine2: number;
  computer: number;
  laser: number;
  hull: number;
}

export interface DamageContext {
  /** 38201 - whether the shields are raised. */ shieldsOn: boolean;
  /** 38205 - an enemy is present. */ enemyPresent: boolean;
  /** 38210 - the ship is in atmosphere. */ atmosphere: boolean;
}

export interface DamageResult {
  damage: ShipDamage;
  /** Whether a damaging tick happened at all - 3200's `IF DMG = 0 THEN RETURN`. */
  struck: boolean;
  /** 3205's gate held and nothing past it ran. */ absorbedByShields: boolean;
  /** 3350: the hull reached zero, which runs S/X. */ destroyed: boolean;
  /** 3019 fired - both of 3001 and 3010's rolls came in. It flashes `RND(1) * 5` times. */
  heavyBranch: boolean;
  /** How many times 3019's loop runs: `HC = RND(1) * 5`. */ heavyFlashes: number;
  /** 3032 fired - 3030's roll came in. One flash and two sounds. */ lightBranch: boolean;
}

/** 3380, and the byte a POKE stores. Applesoft truncates. */
const stored = (v: number): number => (v < 0 ? 0 : Math.trunc(v));

/**
 * 3205 alone, which is what ground fire gets - `5098 L = 7: GOSUB 3205: L = 0`.
 *
 * Shields lose `RND(1) * 1.1` and the routine returns at 3207 whatever the shields are left
 * at. Nothing else on the ship can be touched by a shot from the surface.
 */
export function groundFire5098(d: ShipDamage, rnd: () => number = Math.random): DamageResult {
  const shields = stored(d.shields - rnd() * 1.1);
  return {
    damage: { ...d, shields },
    struck: true, absorbedByShields: true, destroyed: false,
    heavyBranch: false, heavyFlashes: 0, lightBranch: false,
  };
}

/**
 * One call of 3000.
 *
 * Returns the ship unchanged and `struck: false` when the two gates at 3001/3010 and 3030
 * both decline, which is 58.8% of calls.
 */
export function damageTick3000(
  d: ShipDamage,
  ctx: DamageContext,
  rnd: () => number = Math.random,
): DamageResult {
  const none = { struck: false, absorbedByShields: false, destroyed: false,
    heavyBranch: false, heavyFlashes: 0, lightBranch: false };
  // 3000: neither an enemy nor an atmosphere means nothing happens at all.
  if (!ctx.enemyPresent && !ctx.atmosphere) return { damage: d, ...none };

  // 3001 and 3010 are two separate `IF RND(1) > .4 THEN 3030`, so 3019 needs both.
  const heavyBranch = rnd() <= 0.4 && rnd() <= 0.4;
  const heavyFlashes = heavyBranch ? Math.trunc(rnd() * 5) : 0;   // 3019 `HC = RND(1) * 5`
  const lightBranch = rnd() <= 0.3;                               // 3030, independent
  const flags = { heavyBranch, heavyFlashes, lightBranch };
  if (!heavyBranch && !lightBranch) {                             // 3200 `IF DMG = 0`
    return { damage: d, ...none, ...flags };
  }

  // 3205. The stored byte is what 3205's own test then reads back.
  const shields = stored(d.shields - rnd() * 1.1);
  if (shields > 10 && ctx.shieldsOn) {
    return { damage: { ...d, shields }, struck: true, absorbedByShields: true,
      destroyed: false, ...flags };
  }

  const out: ShipDamage = {
    shields,
    radar: stored(d.radar - rnd() * 5),                // 3230
    engine1: stored(d.engine1 - rnd() * 5),            // 3260
    engine2: stored(d.engine2 - rnd() * 5),            // 3270
    computer: stored(d.computer - rnd() * 5),
    laser: stored(d.laser - rnd() * 5),
    hull: stored(d.hull - rnd() * 4),
  };
  return {
    damage: out, struck: true, absorbedByShields: false,
    destroyed: out.hull === 0,                         // 3350 `IF J = 0 THEN PRINT "RUNS/X"`
    ...flags,
  };
}

/** How often 3000 does anything: 0.4 * 0.4 for the heavy branch, then 0.3 for the other. */
export const TICK_DAMAGE_CHANCE = 1 - (1 - 0.4 * 0.4) * (1 - 0.3);

/**
 * Lines 190 and 192 - when the tick is called at all, and when ground fire follows it.
 *
 * In atmosphere it is every pass with a 0.5 chance of ground fire; in space it is only inside
 * the box around the planet, with 0.6. Both need the planet to have not surrendered, and
 * ground fire needs a battery left at 38207.
 */
export const GROUND_FIRE_CHANCE = { atmosphere: 0.5, space: 0.6 } as const;

export const DAMAGE_BOX = {
  x: [-3500, 4500], y: [-3000, 3000], z: [-6000, 2000],
} as const;

export function damageTickRuns190(
  pos: { x: number; y: number; z: number },
  ctx: { surrendered: boolean; atmosphere: boolean },
): { tick: boolean; groundFireChance: number } {
  if (ctx.surrendered) return { tick: false, groundFireChance: 0 };
  if (ctx.atmosphere) return { tick: true, groundFireChance: GROUND_FIRE_CHANCE.atmosphere };
  const inBox = pos.x > DAMAGE_BOX.x[0] && pos.x < DAMAGE_BOX.x[1]
    && pos.y > DAMAGE_BOX.y[0] && pos.y < DAMAGE_BOX.y[1]
    && pos.z > DAMAGE_BOX.z[0] && pos.z < DAMAGE_BOX.z[1];
  return { tick: inBox, groundFireChance: inBox ? GROUND_FIRE_CHANCE.space : 0 };
}
