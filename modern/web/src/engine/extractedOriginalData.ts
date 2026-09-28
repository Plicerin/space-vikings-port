export interface ExtractedPlanetRecord {
  planet: number;
  tech: number;
  base: number;
  conquered: number;
  inferredDefender: number;
}

export const EXTRACTED_LIVE_PLANET_TABLE: ExtractedPlanetRecord[] = [
  { planet: 0, tech: 3, base: 2, conquered: 0, inferredDefender: 3 },
  { planet: 1, tech: 3, base: 1, conquered: 100, inferredDefender: 3 },
  { planet: 2, tech: 3, base: 0, conquered: 0, inferredDefender: 3 },
  { planet: 3, tech: 3, base: 0, conquered: 0, inferredDefender: 3 },
  { planet: 4, tech: 0, base: 0, conquered: 0, inferredDefender: 0 },
  { planet: 5, tech: 2, base: 0, conquered: 0, inferredDefender: 3 },
  { planet: 6, tech: 1, base: 0, conquered: 0, inferredDefender: 1 },
  { planet: 7, tech: 4, base: 0, conquered: 0, inferredDefender: 4 },
  { planet: 8, tech: 2, base: 0, conquered: 0, inferredDefender: 3 },
  { planet: 9, tech: 3, base: 0, conquered: 0, inferredDefender: 3 },
  { planet: 10, tech: 4, base: 0, conquered: 0, inferredDefender: 4 },
  { planet: 11, tech: 0, base: 0, conquered: 0, inferredDefender: 0 },
  { planet: 12, tech: 1, base: 0, conquered: 0, inferredDefender: 1 },
  { planet: 13, tech: 4, base: 0, conquered: 0, inferredDefender: 4 },
  { planet: 14, tech: 2, base: 0, conquered: 0, inferredDefender: 3 },
  { planet: 15, tech: 0, base: 0, conquered: 0, inferredDefender: 0 },
  { planet: 16, tech: 3, base: 0, conquered: 0, inferredDefender: 3 },
  { planet: 17, tech: 3, base: 0, conquered: 0, inferredDefender: 3 },
  { planet: 18, tech: 3, base: 0, conquered: 0, inferredDefender: 3 },
  { planet: 19, tech: 1, base: 0, conquered: 0, inferredDefender: 1 },
] as const;

export interface ExtractedEncounterSnapshot {
  name: string;
  overlay: string;
  planetIndex: number;
  planetVitalityLimit: number;
  shipVitality: number;
  planetVitality: number;
  shipDestructionLimit: number;
  shipKind: number;
  enemyShips: number;
  planetSurrendered: number;
  atmosphere: number;
}

export interface ExtractedArrivalState {
  planetIndex: number;
  planetVitalityLimit: number;
  shipDestructionLimit: number;
  shipKind: 0 | 1 | 3 | 4;
  enemyShips: number;
  planetSurrendered: boolean;
  atmosphere: boolean;
}

export const EXTRACTED_LIVE_ENCOUNTER_SNAPSHOTS: ExtractedEncounterSnapshot[] = [
  {
    name: 'planet-1-command-mode',
    overlay: 'COM',
    planetIndex: 1,
    planetVitalityLimit: 100,
    shipVitality: 0,
    planetVitality: 1,
    shipDestructionLimit: 150,
    shipKind: 3,
    enemyShips: 30,
    planetSurrendered: 0,
    atmosphere: 0,
  },
  {
    name: 'planet-1-radar',
    overlay: 'RADAR',
    planetIndex: 1,
    planetVitalityLimit: 100,
    shipVitality: 0,
    planetVitality: 1,
    shipDestructionLimit: 150,
    shipKind: 3,
    enemyShips: 30,
    planetSurrendered: 0,
    atmosphere: 0,
  },
  {
    name: 'planet-1-ground-forces-report',
    overlay: 'GROUND FORCES',
    planetIndex: 1,
    planetVitalityLimit: 100,
    shipVitality: 0,
    planetVitality: 1,
    shipDestructionLimit: 150,
    shipKind: 3,
    enemyShips: 30,
    planetSurrendered: 0,
    atmosphere: 0,
  },
  {
    name: 'planet-1-galaxy-map-system-info',
    overlay: 'GALAXY MAP / SYSTEM INFO',
    planetIndex: 1,
    planetVitalityLimit: 0,
    shipVitality: 0,
    planetVitality: 1,
    shipDestructionLimit: 150,
    shipKind: 3,
    enemyShips: 30,
    planetSurrendered: 1,
    atmosphere: 0,
  },
  {
    name: 'planet-1-ship-id',
    overlay: 'SHIP I.D.',
    planetIndex: 1,
    planetVitalityLimit: 0,
    shipVitality: 0,
    planetVitality: 1,
    shipDestructionLimit: 150,
    shipKind: 3,
    enemyShips: 30,
    planetSurrendered: 1,
    atmosphere: 0,
  },
] as const;

export const EXTRACTED_ARRIVAL_STATE_BY_PLANET: Partial<Record<number, ExtractedArrivalState>> = {
  // Live original hostile encounter captures for Alpha Centauri.
  1: {
    planetIndex: 1,
    planetVitalityLimit: 100,
    shipDestructionLimit: 150,
    shipKind: 3,
    enemyShips: 30,
    planetSurrendered: false,
    atmosphere: false,
  },
} as const;

export function getFallbackArrivalState(planetIndex: number): ExtractedArrivalState {
  const record = EXTRACTED_LIVE_PLANET_TABLE.find((entry) => entry.planet === planetIndex);
  const shipKind = (record?.inferredDefender ?? 0) as 0 | 1 | 3 | 4;
  const hostile = shipKind !== 0 && planetIndex !== 0;

  return {
    planetIndex,
    planetVitalityLimit: hostile ? 100 : 0,
    shipDestructionLimit: hostile ? 150 : 0,
    shipKind,
    enemyShips: hostile ? 30 : 0,
    planetSurrendered: false,
    atmosphere: false,
  };
}

export const OPENING_NEW_GAME_STATE = {
  // START.bas:190-195, which runs BEFORE the new/old branch:
  //   190 BV%=-7000: GOSUB 6000: POKE ZI,LO%: POKE ZI+1,HI%
  //       BV%=700:   ... POKE XI ...     BV%=200: ... POKE YI ...
  //   195 POKE H1,0
  // Line 225 overwrites this block from SHIP'S DATA, but only for an OLD game
  // (line 224 is IF G$ = "N" THEN GOTO 230).
  //
  // Measured on the original disk (oracle/probe_opening.mjs): after answering
  // (N)EW, $731B settles at bc 02 c8 00 a8 e4 00 00 00 and does not change
  // again. The earlier y=210, z=-6761, heading=255, pitch=248 here came from
  // paused-opening-scene.json, which is a capture taken some way INTO flight,
  // not the opening — the ship had already been flying when it was taken.
  x: 700,
  y: 200,
  z: -7000,
  heading: 0,
  pitch: 0,
  bank: 0,

  // START.bas begins at the home planet / Alpha Centauri (system 1).
  planetIndex: 1,

  // These four are planet 1's P/F record. START line 220 calls into
  // TRANLIT.OBJ0, which copies the current planet's record to $953C-$9541;
  // measured there at the start of a new game it reads 96 03 64 1e 01 01.
  //   $953C = 150 destruction limit   $953D = 3 ship kind
  //   $953F = 30 enemy ships          $9541 = 1 planet
  // The simulator's own ship anchor remains STARSHIP SIMULATOR.bas:2
  // (X9=400, Y9=-100, Z9=-3500).
  shipKind: 3 as const,
  enemyShips: 30,
  shipDestructionLimit: 150,
  // STARSHIP SIMULATOR 156/158 gate RE and ORBIT on PEEK(38210); measured 0.
  atmosphere: false,
  planetSurrendered: false,

  // SHIP'S DATA-M offset 7 ($950D) is $78; measured PEEK(38157)=120 in play.
  speed: 120,
} as const;


