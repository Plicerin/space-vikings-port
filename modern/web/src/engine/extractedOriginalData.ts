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

export const OPENING_NEW_GAME_STATE = {
  // START.bas:190-195 initializes the new-game simulator position before
  // RUN INSTRUMENTS / STARSHIP SIMULATOR.
  x: 700,
  y: 200,
  z: -7000,
  // Heading 252 (~-100° = atan2(-700,7000)) points the ship at the
  // home planet so it's centered in the cockpit view on arrival.
  heading: 252,
  // Pitch 123 (~-1.6°) tilts the ship slightly down toward the planet.
  pitch: 123,

  // START.bas begins at the home planet / Alpha Centauri (system 1).
  planetIndex: 1,

  // Live original opening cockpit capture showed 38205=3 and 38207=30 while
  // approaching the home planet. Ship placement is anchored separately by
  // STARSHIP SIMULATOR.bas:2 (X9=400,Y9=-100,Z9=-3500).
  shipKind: 3 as const,
  enemyShips: 30,
  shipDestructionLimit: 150,
  atmosphere: false,
  planetSurrendered: false,

  // Gentle approach speed — ship drifts toward the home planet
  // so the cockpit feels alive (starfield scrolls, planet grows).
  // Player takes full control via arrow keys / speed keys at any time.
  speed: 20,
} as const;


