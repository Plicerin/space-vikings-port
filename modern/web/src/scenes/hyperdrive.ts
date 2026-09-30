import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { log as glog } from '../engine/gameLog';
import { clearPendingConquestCollection } from '../engine/commander';
import { EXTRACTED_ARRIVAL_STATE_BY_PLANET, getFallbackArrivalState } from '../engine/extractedOriginalData';

interface WarpLine {
  angle: number;
  length: number;
  speed: number;
  phase: number;
  color: number;
}

function drawStarfield(hires: import('../engine/hires').Hires, seed: number): void {
  hires.hcolor(3);
  for (let i = 0; i < 40; i++) {
    const x = (seed * 17 + i * 41) % 279;
    const y = (seed * 11 + i * 29) % 120;
    if ((i + seed) % 4 === 0) continue;
    hires.hplot(x, y);
  }
}

/** Line 14's C1, C2 - where every streak starts. */
export const HD_ORIGIN = { x: 140, y: 63 } as const;
/** Line 20's FOR H = 1 TO 175. */
export const HD_STREAKS = 175;

export async function hyperdriveScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input, audio } = ctx;

  if (
    state.atmosphere ||
    state.navDestination === null ||
    state.navDestination === state.planetIndex
  ) {
    return scenes.run('starshipSimulator');
  }

  if (state.energy === 0) {
    hires.hgr();
    hires.hcolor(2);
    hires.text('OUT OF ENERGY', 14, 12);
    await new Promise((r) => setTimeout(r, 2000));
    hires.text('ORBIT DECAYING', 14, 12);
    await new Promise((r) => setTimeout(r, 2000));
    return scenes.run('playerDeath');
  }

  const src = state.planets[state.planetIndex];
  const dst = state.planets[state.navDestination!];
  const sourcePlanet = state.planetIndex;
  const dx = Math.abs(src.x - dst.x);
  const dy = Math.abs(src.y - dst.y);
  const dz = Math.abs(src.z - dst.z);
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // The jump cost, H/D lines 10010 and 10020:
  //
  //   10010 X1 = ABS(PEEK(38366 + PEEK(38209))) - ABS(PEEK(38366 + PEEK(38163)))
  //         Y1 = <the same expression>: Z1 = <the same expression>
  //   10020 D1 = INT(SQR(X1 ^ 2 + Y1 ^ 2 + Z1 ^ 2) + .6)
  //
  // 38366 is the X table - GALAXY MAP 3020 reads X, Y and Z from M, M - 21 and M - 42 with
  // M = 38366 - and line 10010 reads the X expression into all three variables. Y and Z
  // never enter the cost, so the sum under the root is 3 * X1 ^ 2 and D1 comes out as
  // |dX| * sqrt(3), rounded. Copy-paste, by the look of it, but it is what the disk does.
  const dxByte = dst.x - src.x;
  const jumpCost = Math.floor(Math.sqrt(3 * dxByte * dxByte) + 0.6);
  state.jumpDistance = distance;
  glog('hyperdrive', `jumping to ${dst.name} dist=${distance.toFixed(1)}`);

  // Lines 17-20 and 76-80, the jump itself.
  //
  // Line 17 blanks rows 0-15 with printed spaces, then line 20 draws 175 straight lines from
  // C1,C2 - set at line 14 to (140,63) - to `RND(1) * 279, RND(1) * 125`, in the HCOLOR 3
  // line 14 also sets. Line 80 sets R = 2 and jumps back to 20, which runs the same loop
  // again with HCOLOR 0 from line 76, rubbing the streaks out. The targets are random, so
  // this cannot be compared pixel for pixel; the origin, the extent and the clear can.
  //
  // What was here was an animation of eighty polar "warp lines" over 2.7 seconds, with
  // HYPERDRIVE CHARGE and WARP DRIVE ENGAGED captions, none of which is on the disk.
  input.clearKey();
  hires.hcolor(1);
  for (let r = 1; r <= 16; r++) hires.text(' '.repeat(40), 1, r);

  const targets: Array<[number, number]> = [];
  hires.hcolor(3);
  for (let i = 0; i < HD_STREAKS; i++) {
    // HPLOT truncates, and both expressions are non-negative.
    const tx = Math.floor(Math.random() * 279);
    const ty = Math.floor(Math.random() * 125);
    targets.push([tx, ty]);
    hires.line(HD_ORIGIN.x, HD_ORIGIN.y, tx, ty);
    audio.beep(200 + Math.floor(Math.random() * 1800), 4);   // line 20's CALL NOISE
  }
  await new Promise((r) => setTimeout(r, 700));

  // 76, 80
  hires.hcolor(0);
  for (const [tx, ty] of targets) hires.line(HD_ORIGIN.x, HD_ORIGIN.y, tx, ty);

  state.planetIndex = state.navDestination;
  state.navDestination = null;
  state.commanderMapTarget = null;
  state.planetSurrendered = false;
  state.planetVitality = 0;
  state.shipVitality = 0;
  state.atmosphere = false;
  state.inOrbit = false;
  state.planetSurrendered = state.planets[state.planetIndex]?.surrendered ?? false;
  clearPendingConquestCollection(state, sourcePlanet);

  const arrivalState = EXTRACTED_ARRIVAL_STATE_BY_PLANET[state.planetIndex]
    ?? getFallbackArrivalState(state.planetIndex);
  state.planetVitalityLimit = arrivalState.planetVitalityLimit;
  state.shipDestructionLimit = arrivalState.shipDestructionLimit;
  state.shipKind = arrivalState.shipKind;
  state.enemyShips = arrivalState.enemyShips;
  state.planetSurrendered = arrivalState.planetSurrendered;
  state.atmosphere = arrivalState.atmosphere;

  state.planets[state.planetIndex].visited = true;

  state.x = Math.round(10000 - Math.random() * 20000);
  state.y = Math.round(5000 - Math.random() * 10000);
  let z = 0;
  do {
    z = Math.round(10000 - Math.random() * 20000);
  } while (Math.abs(z) < 7000);
  state.z = z;
  // Line 73 is `A = RND(1) * 255`, so 0 to 254 - not 255.
  state.heading = Math.floor(Math.random() * 255);
  state.pitch = 0;
  state.bank = 0;

  state.energy = Math.max(0, state.energy - jumpCost);
  // Line 5's POKE 301,0 - COLLECT's loot rates go back to full for the new trip.
  state.collectedThisTrip = false;
  // H/D line 105 `POKE 38206,0: POKE 38389,0: POKE 38149,0` - the jump is what makes a trip a
  // trip, so both of SHORE LEAVE's once-per-trip flags go with it.
  state.enlistedThisTrip = false;
  state.baseTriedThisLanding = false;

  // Line 16's `POKE 38152,0`. The enemy-damage counter is cleared on **every** jump, whatever
  // the destination's tech - measured at line 16 on both a tech 2 and a tech 1 arrival. This
  // used to sit inside the tech >= 2 branch below, standing in for 93's `POKE 38161,0`, so a
  // jump to a primitive planet carried the previous system's damage across.
  state.shipVitality = 0;

  // Line 25's `POKE 38823, PEEK(38163): POKE 38824,0: CALL 38825` loads the destination's
  // record, and 38204 comes with it - $97D2 inside TRANLIT.OBJ0 writes it. Measured: 150
  // arriving at SOL, 20 at VARCAR, 0 at a tech 1 planet. For tech > 1 line 93 overwrites it a
  // moment later, so it only shows through on a primitive destination.
  const arriving = state.planets[state.planetIndex];
  if (arriving) state.shipDestructionLimit = arriving.destructionLimit;

  // Lines 90-93. TECH is the destination's, because line 25's CALL has already moved 38209 -
  // line 26's `POKE 38209, PEEK(38163)` is a second write of a value that is already there.
  const tech = arriving?.defense ?? 0;
  if (tech < 2) {
    state.planetVitalityLimit = 0;            // 90
  } else {
    state.planetVitalityLimit = tech * 60;    // 93
    state.shipDestructionLimit = tech * 60;
    state.planetVitality = 0;
    // 93 also pokes 38161 to 0. Nothing on the disk ever reads 38161 - it is the only write
    // to it anywhere - so there is nothing here to mirror.
  }

  return scenes.run('starshipSimulator');
}
