// Typed game-state schema replacing the original POKE/PEEK address space.
//
// Field names match the spirit of the variables Mitchell Robbins used in the
// BASIC source (STARSHIP SIMULATOR.bas line 2-3 et al). Comments give the
// original Apple II address (decimal/hex) and the BASIC line where it's
// observed in case you need to cross-reference. Addresses below come from
// reading detokenized/*.bas plus analysis/comprehensive_memory_layout.md.
// Live emulator-backed tables and snapshots are captured in extractedOriginalData.ts.
//
// Addresses marked TODO/? are observed in the source but not fully labelled.
// Add them as you port the scene that uses them.
//
// /** Apple II paddle: 0..255 (centre = 128). Pitch/bank/heading stored as
// * the raw paddle byte; the assembly state-machine ($9023) converts these
// * to direction vectors via the SN/CSN sin/cos lookup at $6006/$6009. */
export type PaddleByte = number;

/** Battle-station condition. Original POKE colours:
 * green=normal (default), blue=alert, red=battle.
 * Anti-fighter laser turrets only fire at red. */
export type Condition = 'green' | 'blue' | 'red';

/** Active weapon mode. Toggled by W key. */
export type WeaponMode = 'missile' | 'laser';

export interface DamageState {
  engine1Pct: number;
  engine2Pct: number;
  computerPct: number;
  radarPct: number;
  envPct: number;
  hullPct: number;
  shieldsPct: number;
  hyperdrivePct: number;
  missilePct: number;
  laserPct: number;
  comsPct: number;
  powerPct: number;
  laserOperational: boolean;
  pendingUpdate: boolean;
}

export class GameState {
  // ---------------------------------------------------------------------
  // Position / velocity
  // ---------------------------------------------------------------------

  /** X / Y / Z, 16-bit signed. Origin at home planet (Sol).
   * In BASIC: XI=$731B (29467), YI=$731D, ZI=$731F. Stored low-byte / high-byte.
   * The HUD displays INT(value/2) so on-screen coords are half these. */
  x = 0;
  y = 0;
  z = 0;

  // ---------------------------------------------------------------------
  // Orientation (paddle-byte form, 0..255)
  // ---------------------------------------------------------------------

  /** Pitch — paddle 1 ($7321 = 29473). 128 = level. */
  pitch: PaddleByte = 128;
  /** Bank — paddle 0 ($7322). 128 = wings level. */
  bank: PaddleByte = 128;
  /** Heading byte ($7323). Set to 0 by START.bas:195 on new game. */
  heading: PaddleByte = 0;

  // ---------------------------------------------------------------------
  // Drive / power
  // ---------------------------------------------------------------------

  /** Speed S = PEEK(38157)=$950D. Range 0..120 (clamped in
   *  STARSHIP SIMULATOR.bas:207-208). 1/2 keys = ±3, 3/4 keys = ±15. */
  speed = 60;

  /** Hyperdrive engaged ($953A == 1?). H key when nav destination set. */
  hyperdriveActive = false;
  /** Autopilot — A key toggles. Manual = false, Auto = true. */
  autopilot = false;
  /** Full campaign commander. Uses autopilot flight plus strategic scene routing. */
  commanderMode = false;

  // ---------------------------------------------------------------------
  // Combat state
  // ---------------------------------------------------------------------

  /** Currently selected weapon. W toggles. */
  weaponMode: WeaponMode = 'missile';
  /** Shields on/off — S key toggles. Light reflects on/off, not strength. */
  shieldsOn = false;
  /** Battle-station condition. B key advances green→blue→red→green.
   *  Anti-fighter turrets only fire at red. */
  condition: Condition = 'green';
  /** Number of missiles remaining. PEEK(38187)=$954B. Decremented by 2
   * per missile salvo (STARSHIP_SIM:1090). Initial 0 until restocked. */
  missilesRemaining = 60;
  /** Laser tone / type byte LT = $9557 (38167). Cycled by fire flow. */
  laserType = 0;
  /** Planet surrendered flag — PEEK(38208)=$9550. 1 = planet has
   * surrendered; suppresses further combat at this planet. */
  planetSurrendered = false;
  /** Planet vitality — PEEK(38160)=$94F8. Damaged by player attacks;
   * when >= planetVitalityLimit ($38150=$94EE), planet surrenders. */
  planetVitality = 0;
  /** Planet vitality limit — PEEK(38150)=$94EE. Live captures show this is
   * an explicit encounter-state value and should not be recomputed from tech
   * in scene logic. Planet surrenders when planetVitality >= this value. */
  planetVitalityLimit = 0;
  /** ENEMY ship damage accumulator — PEEK(38152)=$94F0. Increments when
   * player weapons hit the enemy ship (J2/(TE+1) per hit).
   * When > shipDestructionLimit AND shipKind != 0, triggers RUN EX
   * (enemy ship explodes, EX.bas halves enemyShips, sets shipKind=0). */
  shipVitality = 0;
  /** ENEMY ship destruction threshold — PEEK(38204)=$953C. Live captures
   * show this is an explicit encounter-state value and should not be derived
   * from tech in scene logic. Enemy ship is destroyed when shipVitality
   * exceeds this. */
  shipDestructionLimit = 0;
  /** Planet's defense technology level — PEEK(38282+planetIndex)=$958A+P.
   * Higher = less damage from player attacks (divides J1/J2). */
  get defenseTech(): number {
    return this.planets[this.planetIndex]?.defense ?? 0;
  }
  /** Enemy ship count at current planet — PEEK(38207)=$954F.
   * Decremented on enemy destruction (EX.bas:56 halves it). */
  enemyShips = 0;
  /** Laser system operational — PEEK(38186)=$952A. 0 = inoperable.
   * Checked before laser fire (STARSHIP_SIM:1502). */
  laserOperational = true;
  /** Missile mode flag — PEEK(38202)=$955A. 1 = missile, 0 = laser.
   * When 1, fire button (line 185→1500→1501) redirects to missile (1000). */
  missileMode = false;
  /** Anti-fighter turret status — PEEK(38165)=$950D. Value 3 = active.
   * Enemy fire from planet (line 5200) only triggers if this is 3. */
  antiFighterTurrets = 0;
  /** Enemy I.D. shape table loaded flag. Set when BLOAD SHIP # J loads
   * enemy shape data for display in cockpit and radar. */
  enemyShapeLoaded = false;

  // ---------------------------------------------------------------------
  // Mode flags
  // ---------------------------------------------------------------------

  /** PEEK(38210)=$9542. 0 = vacuum/space, 1 = inside atmosphere.
   * Reentry triggered when |X|,|Y|,|Z| < 900 in space (STARSHIP_SIM:156).
   * Orbit insertion when Y > 4000 in atmosphere (STARSHIP_SIM:158). */
  atmosphere = false;
  /** Currently in orbit ($953F or similar — TODO confirm). */
  inOrbit = false;
  /** Force redraw next frame ($9505 set to 7 in STARSHIP_SIM:9). */
  forceRedraw = false;

  // ---------------------------------------------------------------------
  // World / progression
  // ---------------------------------------------------------------------

  /** Current planet index 0..19 ($9541 = 38209). 0 = Sol. */
  planetIndex = 0;
  /** ENEMY ship type at current planet — PEEK(38205)=$953D. 0=no enemy,
   * 1/3/4=enemy ship class (2→3 mapped in START.bas:230). Determines which
   * SHIP_no_J binary is BLOADed for the enemy sprite. Set to 0 by EX.bas
   * after enemy destruction. */
  shipKind: 0 | 1 | 3 | 4 = 0;
  /** Old-game sentinel — $95F7 (38391). PEEK==77 ($4D='M') indicates a
   *  saved game exists. Set by SAVE GAME, cleared by NEW GAME. */
  savedGameSentinel: number = 0;

  // ---------------------------------------------------------------------
  // Damage Control (the right-hand panel in the master computer screen)
  // ---------------------------------------------------------------------

  // Each is true when the system has a "trouble light" (white = inoperable).
  // BASIC reads/writes these as % efficiency (0..100); a system goes
  // "NO/GO" below some threshold.
  damage: DamageState = {
    engine1Pct: 100,
    engine2Pct: 100,
    computerPct: 100,
    radarPct: 100,
    envPct: 100,
    hullPct: 100,
    shieldsPct: 100,
    hyperdrivePct: 100,
    missilePct: 100,
    laserPct: 100,
    comsPct: 100,
    powerPct: 100,
    laserOperational: true,
    pendingUpdate: false,
  };

  // ---------------------------------------------------------------------
  // Ground forces and inventory
  // ---------------------------------------------------------------------

  forces = {
    /** Manual: max 20,000 troops. STATUS displays as PEEK(38167)*256 + PEEK(38159). */
    troops: 1000,
    /** Max 255 each. Assault transports carry 1000 troops apiece. */
    transports: 4, // PEEK(38155)
    fighters: 8, // PEEK(38156)
    tanks: 8, // PEEK(38154)
    groundMissiles: 8, // PEEK(38153)
    /** Troop location: PEEK(38166).
     * 0 = ON BOARD, 1 = PLANETSIDE, 2 = SHORE LEAVE, 3 = CRYOGENIC SLEEP. */
    troopLocation: 0 as 0 | 1 | 2 | 3,
    /** Morale 1..6: AWFUL, POOR, SO-SO, FAIR, GOOD, EXCELLENT! (PEEK 38203).
     * Initial 6 (EXCELLENT) per START.bas:2030. */
    morale: 6 as 1 | 2 | 3 | 4 | 5 | 6,
    /** Currently engaged in surface battle. */
    inGroundBattle: false,
    /** Which planet the troops are deployed on (-1 = on board ship). */
    troopPlanetIndex: -1,
  };

  /** Loot quantities, each at the unit/multiplier the manual lists. The
   *  PEEK addresses appear in SUPPLY.bas:1410-1490. */
  loot = {
    platinum: 0, // PEEK(38181) * 10 pounds
    gold: 0, // PEEK(38183) * 10 pounds
    silver: 0, // PEEK(38182) * 20 pounds
    titaniumKlb: 0, // PEEK(38180) thousand-pound units
    collapsiumTons: 0, // PEEK(38179)
    steelTons: 0, // PEEK(38178)
    fissionablesLb: 0, // PEEK(38177)
    electronicCrates: 0, // PEEK(38176)
    weaponCrates: 0, // PEEK(38175)
    fighterPartCrates: 0, // PEEK(38174)
    luxuryFoodCases: 0, // PEEK(38173)
    wineCases: 0, // PEEK(38172) * 100
    artUnits: 0, // PEEK(38171) * 10
  };

  /** Stardate — increments on hyperdrive jumps. Stored in MISC FILE on disk
   *  (Applesoft text I/O). H_D.bas:6 reads it, advances by D1+0.3, writes back. */
  stardate = 100.3;

  /** Star system distance computed by H_D.bas:10010 — sqrt of squared
   *  XYZ coordinate diff between current and destination planet. Cached
   *  here for hyperdrive flow. */
  jumpDistance = 0;

  /** Federation credits available for repairs, troops, weapons, base
   *  construction. Initial value set by NEW GAME init. */
  credits = 10000;

  // ---------------------------------------------------------------------
  // Per-planet data (20 star systems, manual §"Galaxy Directory")
  // ---------------------------------------------------------------------

  /** One entry per star system. Index 0 = Sol (home), 1 = Alpha Centauri,
   *  ... 19 = Shivanda. PLANET FILE / SHIP'S DATA on disk persist these. */
  planets: PlanetState[] = makeInitialGalaxy();

  // ---------------------------------------------------------------------
  // Navigation / hyperdrive
  // ---------------------------------------------------------------------

  /** Planet index set as next hyperdrive destination (0..19), or null if
   *  unset. Manual: must be set before H key engages hyperdrive. */
  navDestination: number | null = null;
  /** Target shown by the automated commander when previewing the galaxy map. */
  commanderMapTarget: number | null = null;

  // ---------------------------------------------------------------------
  // UI state (transient, not in original game memory)
  // ---------------------------------------------------------------------

  /** Last keystroke that the active scene hasn't consumed yet. Equivalent to
   * Apple II's PEEK(-16384) keyboard strobe, but managed at scene level. */
  pendingKey: number | null = null;

  /** If conquest succeeds and loot is still uncollected, this points to the
   * planet that should be processed by the commander on the next orbital
   * encounter.
   */
  pendingConquestCollectionPlanet: number | null = null;

  /** Planet index that recently lost a ground-forces assault.
   * When set, commander routing gives one pass through recovery logic before
   * allowing another automatic ground-forces assault at that planet. */
  pendingGroundForcesDefeatPlanet: number | null = null;
  // Recovery state flags are set when assault fails (see §127) and reset on conquest success (§328-§329)

  /** Pending immediate re-assault recovery flag after defeat/retreat */
  
  /** Ship energy (fuel) — starts at 2000, decremented by hyperdrive jumps.
   *  When 0, hyperdrive is unavailable. */
  energy = 2000;

  /** Immediate re-assault recovery flag after ground-forces defeat.
   *  Set when assault fails, reset on conquest success. */
  pendingGroundForcesNeedsRecovery = false;

  /** Shore leave sub-mode passed from groundForces scene.
   * 0=paid leave, 1=enlist, 2=sell loot, 3=repair, 4=establish base, 5=cryogenics. */
  shoreLeaveMode: number = 0;

  // ---------------------------------------------------------------------
  // Loaded Planet Data (the "BLOAD" result)
  // ---------------------------------------------------------------------
  /** This holds the specific coordinates and scale for the currently loaded planet. */
  loadedPlanetData = {
    centerX: 0,
    centerY: 0,
    centerZ: 0,
    scale: 1,
    baseScale: 1,
    hasBase: false,
    surrendered: false,
    looted: false,
  };

  /** Checks if all systems have been surrendered to trigger the victory condition. */
  checkVictory(): boolean {
    return this.planets.every(p => p.surrendered);
  }
}

export interface PlanetState {
  name: string;
  surrendered: boolean;
  looted: boolean;
  hasBase: boolean;
  groundAssaultFailed: boolean;
  defender: number;
  defense: number;
  population: number;
  visited: boolean;
  x: number;
  y: number;
  z: number;
}

const PLANET_DATA = [
  { name: 'Sol', tech: 3, pop: 125, hasBase: true, x: 15, y: 15, z: 15, defender: 0 },
  { name: 'Alpha Centauri', tech: 3, pop: 70, hasBase: true, x: 13, y: 13, z: 12, defender: 3 },
  { name: "Barnard's Star", tech: 3, pop: 175, hasBase: false, x: 14, y: 9, z: 15, defender: 3 },
  { name: 'Wolf 359', tech: 3, pop: 0, hasBase: false, x: 8, y: 16, z: 12, defender: 3 },
  { name: 'Luyten', tech: 0, pop: 0, hasBase: false, x: 22, y: 14, z: 19, defender: 0 },
  { name: 'Lalande 21185', tech: 2, pop: 90, hasBase: false, x: 13, y: 22, z: 19, defender: 3 },
  { name: 'Sirius', tech: 1, pop: 3, hasBase: false, x: 17, y: 23, z: 12, defender: 1 },
  { name: 'Varcar', tech: 4, pop: 150, hasBase: false, x: 14, y: 8, z: 9, defender: 4 },
  { name: 'Xanadon', tech: 2, pop: 85, hasBase: false, x: 19, y: 13, z: 25, defender: 3 },
  { name: 'Epsilon Eridana', tech: 3, pop: 157, hasBase: false, x: 20, y: 22, z: 10, defender: 3 },
  { name: 'Cygni', tech: 4, pop: 0, hasBase: false, x: 9, y: 23, z: 20, defender: 4 },
  { name: 'Procyon', tech: 0, pop: 1, hasBase: false, x: 7, y: 23, z: 14, defender: 0 },
  { name: 'Tau Ceti', tech: 1, pop: 165, hasBase: false, x: 25, y: 21, z: 13, defender: 1 },
  { name: 'Lacaille 9352', tech: 4, pop: 6, hasBase: false, x: 25, y: 15, z: 21, defender: 4 },
  { name: 'Larsen-C', tech: 2, pop: 0, hasBase: false, x: 9, y: 21, z: 19, defender: 3 },
  { name: 'Groombridge 168', tech: 0, pop: 80, hasBase: false, x: 25, y: 5, z: 11, defender: 0 },
  { name: 'Kruger 60', tech: 3, pop: 130, hasBase: false, x: 24, y: 10, z: 10, defender: 3 },
  { name: 'Epsilon Indi', tech: 3, pop: 155, hasBase: false, x: 11, y: 18, z: 27, defender: 3 },
  { name: 'Argo', tech: 3, pop: 2, hasBase: false, x: 18, y: 27, z: 11, defender: 3 },
  { name: 'Shivanda', tech: 1, pop: 7, hasBase: false, x: 11, y: 11, z: 25, defender: 1 },
];

export function makeInitialGalaxy(): PlanetState[] {
  return PLANET_DATA.map((data, i) => ({
    name: data.name,
    surrendered: i === 0, // Sol is friendly from the start
    looted: i === 0, // Sol has no raid loot to collect
    hasBase: data.hasBase,
    groundAssaultFailed: false,
    defender: data.defender,
    defense: data.tech,
    population: data.pop,
    visited: i === 0, // Sol is known from the start
    x: data.x,
    y: data.y,
    z: data.z,
  }));
}
