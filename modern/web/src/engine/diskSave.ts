/**
 * Saving and loading a game, END 190-220 and START 25-225.
 *
 * The disk keeps two separate things, and only one of them needs a save command.
 *
 * **MISC FILE** is a text file of three numbers - `SD`, `TR`, `CR`: the stardate, the troops
 * and the credits. Eight places write it as you play (SHORE LEAVE 2096, 2160, 2290, 2460 and
 * 2620; GROUND FORCES 670, 800 and 1120; H/D 6) and six read it back. It is always current.
 * `START 2050` resets it to `100.3`, `2000`, `10000` for a new game.
 *
 * **Everything else** waits for END's option 1:
 *
 * ```
 * 190 IF PEEK(38210) = 1 THEN "YOU MUST BE IN ORBIT TO SAVE GAME" ... RETURN
 * 200 POKE 38211,PEEK(29467) ... POKE 38218,PEEK(29474)
 * 202 POKE 38219,PEEK(29475)
 * 204 POKE 38391,77: POKE 38392,PEEK(38209)
 * 210 POKE 38823,PEEK(38209): POKE 38824,1: CALL 38825:
 *     BSAVE P/F,A$97E1,L$140: BSAVE PLANET FILE,A$954C,L$AF:
 *     BSAVE SHIP'S DATA ,A38150,L54: PRINT "GAME SAVED."
 * ```
 *
 * Three blocks and no more:
 *
 * | block | bytes | what is in it |
 * | --- | --- | --- |
 * | `SHIP'S DATA` | 38150-38203 | the ship: damage, energy, missiles, loot, forces, morale |
 * | `PLANET FILE` | 38220-38394 | the galaxy: conquered flags, tech, bases, star coordinates |
 * | `P/F` | 38881-39200 | twenty per-planet records, swapped by MEM TRANSFER A |
 *
 * `CALL 38825` with `38824 = 1` writes the current planet's working cells into `P/F`, and with
 * `38824 = 0` reads a planet's record back. END 210 stores before it saves; START 220 loads
 * the record for `PEEK(38392)`, which 204 wrote.
 *
 * ## The sixteen bytes in the gap
 *
 * **38204 to 38219 is in neither of the first two blocks.** That is where the enemy ship
 * lives (38204, 38205), the ground batteries (38207), the surrender flag (38208), the
 * atmosphere flag (38210), which planet we are at (38209) - and where 200 and 202 put the
 * ship's position and attitude, copied cell by cell out of `29467-29475`.
 *
 * START 225 copies those nine cells straight back for an old game, so the mechanism is
 * complete and works perfectly **within one run of the machine**. Across a power cycle there
 * is nothing on the disk to read them from, and 225 restores whatever RAM happens to hold.
 * 38209 is never written by the record transfer either - H/D pokes it separately at line 26 -
 * so the planet is not restored at all.
 *
 * That is modelled here exactly: the three blocks go to storage, and the gap is a
 * session-lifetime holder that does not. Save and continue in the same tab and the ship is
 * where it was; reload the page first and it starts where START 190 and 195 put it.
 *
 * `probe_save.mjs` has the machine's side of it: 190's refusal, 200 and 202's nine cells, and
 * 204's two markers.
 */
import type { GameState } from './gameState';

export const SAVE_KEY = 'spaceVikingsSave';

/** 204: `POKE 38391,77`. 77 is `M`. */
export const SAVED_MARKER = 77;

/** START 190 and 195, the position an old game comes back to when the gap is empty. */
export const START_POSITION = { x: 700, y: 200, z: -7000, heading: 0, pitch: 0 } as const;

/** The three BSAVEs, as END 210 writes them. */
export const SAVE_BLOCKS = [
  { name: "SHIP'S DATA", from: 38150, to: 38203 },
  { name: 'PLANET FILE', from: 38220, to: 38394 },
  { name: 'P/F', from: 38881, to: 39200 },
] as const;

/** Whether an address is inside any of the three blocks. */
export function isSaved(address: number): boolean {
  return SAVE_BLOCKS.some((b) => address >= b.from && address <= b.to);
}

/** 200 and 202's nine cells, `29467-29475`, which live in the gap at `38211-38219`. */
export interface GapCells {
  x: number; y: number; z: number; heading: number; pitch: number;
  planetIndex: number;
}

/**
 * The gap, kept for as long as the page is open and no longer - which is what a block of RAM
 * between two BSAVEd regions amounts to.
 */
let gap: GapCells | null = null;
export function stashGap(cells: GapCells): void { gap = { ...cells }; }
export function peekGap(): GapCells | null { return gap ? { ...gap } : null; }
export function clearGap(): void { gap = null; }

export interface SavedGame {
  /** 38391, so a payload written by something else is not mistaken for a save. */
  savedGameSentinel: number;
  /** 38392, which START 220 uses to pull the right record out of P/F. */
  savedPlanet: number;
  /** MISC FILE, which on the disk is a separate text file written as you play. */
  misc: { stardate: number; troops: number; credits: number };
  /** `SHIP'S DATA`, 38150-38203. */
  ship: {
    damage: GameState['damage'];
    energy: number;
    missilesRemaining: number;
    speed: number;
    loot: GameState['loot'];
    forces: Omit<GameState['forces'], 'troops'>;
    planetVitality: number;
    planetVitalityLimit: number;
    /** 38163, which H/D line 1 refuses to jump on when it is 0. */
    navDestination: number | null;
  };
  /**
   * `PLANET FILE`, 38220-38394, and `P/F`, 38881-39200. Both are per-planet, so they are kept
   * together here: the first holds the conquered flag, the tech, the base and the star's
   * coordinates, the second the working record MEM TRANSFER A swaps in and out.
   *
   * All twenty are in it. `38219 + P` runs from 38220 for the disk's planet 1, and the
   * port's `planets[i]` is that same planet 1 at `i = 0`, so there is no planet in the gap -
   * 38219 itself is the disk's slot 0, which nothing reads.
   */
  planets: GameState['planets'][number][];
}

/** END 210, once 190 has let it through. */
export function buildSave(state: GameState): SavedGame {
  return {
    savedGameSentinel: SAVED_MARKER,
    savedPlanet: state.planetIndex,
    misc: {
      stardate: state.stardate,
      troops: state.forces.troops,
      credits: Math.floor(state.credits),
    },
    ship: {
      damage: { ...state.damage },
      energy: state.energy,
      missilesRemaining: state.missilesRemaining,
      speed: state.speed,
      loot: { ...state.loot },
      forces: (() => {
        const { troops: _troops, ...rest } = state.forces;
        return { ...rest };
      })(),
      planetVitality: state.planetVitality,
      planetVitalityLimit: state.planetVitalityLimit,
      navDestination: state.navDestination,
    },
    planets: state.planets.map((p) => ({ ...p })),
  };
}

/**
 * START 200-225 for an old game, onto a `GameState` that is otherwise fresh.
 *
 * Everything the three blocks do not cover is left exactly as a new `GameState` has it, which
 * is the port's equivalent of RAM that no BLOAD wrote: the enemy, the ground batteries, the
 * surrender and atmosphere flags, and the planet we are at. 190 and 195 set the position, and
 * 225 then copies the gap back over it if this run of the page still has it.
 */
export function applySave(state: GameState, saved: SavedGame): void {
  Object.assign(state.damage, saved.ship.damage);
  state.energy = saved.ship.energy;
  state.missilesRemaining = saved.ship.missilesRemaining;
  state.speed = saved.ship.speed;
  Object.assign(state.loot, saved.ship.loot);
  Object.assign(state.forces, saved.ship.forces);
  state.planetVitality = saved.ship.planetVitality;
  state.planetVitalityLimit = saved.ship.planetVitalityLimit;
  state.navDestination = saved.ship.navDestination;
  state.laserOperational = state.damage.laserOperational;

  state.stardate = saved.misc.stardate;
  state.forces.troops = saved.misc.troops;
  state.credits = saved.misc.credits;

  for (let i = 0; i < state.planets.length; i++) {
    const p = saved.planets[i];
    if (p) state.planets[i] = { ...state.planets[i], ...p };
  }

  // 3030's `POKE 38391,77`, which is what an old game carries into GALAXY MAP and INSTRUMENTS.
  state.savedGameSentinel = SAVED_MARKER;

  // 190 and 195.
  state.x = START_POSITION.x;
  state.y = START_POSITION.y;
  state.z = START_POSITION.z;
  state.heading = START_POSITION.heading;
  state.pitch = START_POSITION.pitch;

  // 225, which reads the gap - present only if the page has not been reloaded since the save.
  const cells = peekGap();
  if (cells) {
    state.x = cells.x;
    state.y = cells.y;
    state.z = cells.z;
    state.heading = cells.heading;
    state.pitch = cells.pitch;
  }
}

export function readSave(): SavedGame | null {
  let raw: string | null = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as SavedGame;
    if (!data || typeof data !== 'object') return null;
    if (data.savedGameSentinel !== SAVED_MARKER) return null;
    if (!Array.isArray(data.planets) || !data.ship || !data.misc) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(saved: SavedGame): void {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); } catch { /* storage refused */ }
}

export function clearSave(): void {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* storage refused */ }
}
