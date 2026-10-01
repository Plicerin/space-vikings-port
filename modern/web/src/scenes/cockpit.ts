import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { fireLaser1500, fireMissile1000, missileHit1000 } from '../engine/diskWeapons';
import { damageTick3000, spawnGroundBolt5000, stepGroundBolt5095, groundBoltSpent5095,
  groundBoltStep5090, damageTickRuns190 } from '../engine/diskDamage';
import { GameState } from '../engine/gameState';
import {
  Camera, forwardVector, makeStarfield, project, Star, v3, v3add, v3sub,
  pitchByteToRad,
  v3scale, v3len, v3dot, v3normalize, v3cross,
} from '../engine/math3d';
import { ShapeRenderer, decodeShapeTableJson } from '../engine/shapeTable';
import type { ShapeTable } from '../engine/shapeTable';
import { drawPanelNeedles, erasePanelNeedles, setPanelShapes, drawInstruments,
  drawGaugeBars, gaugeStateFromGame } from './instruments';
import type { PanelNeedles } from './instruments';
import {
  computeShipPointScale,
  decodeShipPointJson,
  renderShipPointSprite,
  type ShipPointSprite,
} from '../engine/shipPointSprite';
import {
  decodeApple2HiresPage,
  drawBitmap,
  findBitmapBounds,
  scaleToFit,
  type Bitmap,
  type BitmapBounds,
} from '../engine/apple2HiresBitmap';
import { extractShipBitmapFromAppleWinState, type AppleWinStateJson } from '../engine/applewinState';
import {
  COCKPIT_SHIP_WIREFRAME_VIEW,
  drawShipWireframe,
  drawShipWorld,
  parseShipBytecode,
  projectShipBytecode,
  projectShipWorld,
  type ShipBytecodeOp,
} from '../engine/shipBytecode';
import { setScene, log as glog } from '../engine/gameLog';
import { AIController } from '../engine/ai';
import {
  clearPendingConquestCollection,
  chooseCommanderScene,
  chooseCommanderTarget,
  markPlanetConquered,
  shouldPreferPlanetaryBombardment,
} from '../engine/commander';
import type { Shape } from '../engine/shapeTable';
import { VectorRenderer, type VectorOverlayData } from '../engine/vectorRenderer';

// The original's stars are not random. PLANET # 0, BLOADed to $7300 by START line 100, is
// 195 fixed points from offset 36 on - the same bytecode the ship models use, every record
// opcode 0. oracle/probe_starfield.mjs extracts them; makeStarfield() was a 220-point
// pseudo-random cloud that had nothing to do with the disk.
let starOps: ShipBytecodeOp[] | null = null;
// On the disk these are the same slot: RE BLOADs PLANET # n over $7300, replacing the star
// table with the planet's ground wireframe, so in the atmosphere you see ground and not
// stars. Both are the same bytecode - the numbered files are opcode 1/2/3 line work with y
// at 0, where PLANET # 0 is all opcode-0 points.
let groundOps: ShipBytecodeOp[] | null = null;

const W1 = 20000;
const W2 = -20000;
const OPENING_VIEW_TOLERANCE = 40;
const FRAME_DT_SCALE = 0.72;
/**
 * How long one pass of STARSHIP SIMULATOR's main loop takes.
 *
 * Line 129 moves the ship `S` units along its heading once a pass - `X1 = S * (ZP * XH)` and so
 * on - so the step is right and the only question is how often it happens. This used to say 500
 * milliseconds, from the repo's own reading of a trace. The machine says otherwise:
 * `oracle/probe_flightspeed.mjs` samples X, Y and Z out of line 8's own cells at 29467, 29469
 * and 29471 often enough to see each jump, and gets steps of exactly 30, 60 and 120 at those
 * three speeds, **2.5 to 2.6 seconds apart at every one of them**. End to end that is 36 units a
 * second at full speed against the port's 239 - five times too fast, and it showed: a few
 * seconds of play put the ship at X 18,000, past every bound the game uses. Line 192 only runs
 * the damage tick inside X -3500 to 4500, Y -3000 to 3000, Z -6000 to 2000, and line 156
 * re-enters the atmosphere inside a 900-unit cube, so the whole game happens in a box the port
 * was crossing in about five seconds.
 *
 * Nothing in the pixel harnesses could catch this. The flight view moves every frame and is the
 * one screen they do not compare.
 */
const BASIC_SIMULATOR_TICK_SECONDS = 2.55;
const TURN_RATE = 0.9;
const FIRE_COOLDOWN_SECONDS = 0.45;
const SHIP_SCALE_MIN = 0.02;
const SHIP_SCALE_MAX = 2.0;
const SHIP_TARGET_MIN_PX = 8;
const SHIP_TARGET_MAX_PX = 32;
const SHIP_SCALE_PER_DISTANCE = 0.95;
const BOMBARDMENT_DEBUG_FLAG = 'bombardment';
const HOSTILE_DEBUG_FLAG = 'hostile';
const SOL_PRESENTATION_STARS: Array<[number, number]> = [
  [91, 25],
  [123, 46],
  [135, 50],
  [204, 71],
  [52, 111],
  [64, 116],
];

type Point2 = { x: number; y: number };

function wrap(v: number): number {
  if (v < W2) return W1;
  if (v > W1) return W2;
  return v;
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

interface Projectile {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number;
}

interface LaserBolt {
  x1: number; y1: number; x2: number; y2: number;
  age: number;
}

/**
 * A bolt from one of the planet's ground batteries - STARSHIP SIMULATOR 5000-5096.
 *
 * The port had these as a fighter squadron, which the disk does not have: 5000 is thrown up
 * from the surface, gated on 38207 having a battery left, and 5250 takes one off when the
 * ship's guns answer it. `shapeIdx` is M, the shape 5090 XDRAWs - 9 for a bolt that came in
 * past x 190, 10 for one below 91, 8 for the middle of the screen.
 */
interface GroundBoltState {
  screenX: number; screenY: number;
  vx: number; vy: number;
  shapeIdx: number;
  /** Paces 5095, which the disk runs at 11.6 steps a second - measured off the machine. */
  stepTimer: number;
  /** 5230, drawn for a moment after a hit while the ship is at red alert. */
  returnFireTimer: number;
  returnFireGunX: number;
}

/**
 * How long one pass of 5090-5096 takes on the disk: 88,046 cycles at 1.0205 MHz, the median
 * gap between consecutive 5090 draws in `oracle/captured/replay/ground.json`. It matters
 * because 5090 rolls for a hit exactly once per step, so the step rate is the damage rate.
 */
const GROUND_BOLT_STEP_SECONDS = 0.086;

interface DamageFlash {
  timer: number;
  type: 'hit' | 'explosion';
}

interface PlanetPayloadShape {
  id: number;
  points: Array<[number, number]>;
}

interface PlanetPayloadJson {
  shapes: PlanetPayloadShape[];
}

interface PlanetHgrJson {
  page1: number[];
  page2: number[];
  page1NonZeroBytes?: number;
  page2NonZeroBytes?: number;
  videoPageHint?: 'page1' | 'page2';
}

export async function cockpitScene(
  ctx: SceneContext,
  scenes: SceneManager,
): Promise<void> {
  const { hires, state, input, audio, loader } = ctx;
  applyCockpitDebugOverrides(state);
  setScene('cockpit');
  // STARSHIP SIMULATOR line 9 is `POKE 38149,7` and runs on every start, and 182 clears it
  // to 0 on the first pass - so coming back to flight wipes ESTABLISH BASE's flag whatever it
  // held. Confirmed on the machine in oracle/probe_tripgates.mjs. It is why a base is one per
  // landing while enlisting, whose flag nothing else touches, is one per jump.
  state.baseTriedThisLanding = false;
  glog('init', `pos=(${state.x},${state.y},${state.z}) atm=${state.atmosphere} orbit=${state.inOrbit}`);

  let pitchRad = pitchByteToRad(state.pitch);
  let headingRad = (state.heading / 256) * 2 * Math.PI;

let planetSourceBitmap: Bitmap | null = null;
let planetSourceBounds: BitmapBounds | null = null;
let bombardmentSourceBitmap: Bitmap | null = null;
let bombardmentSourceBounds: BitmapBounds | null = null;
let enemyPointSprite: ShipPointSprite | null = null;
let enemySourceBitmap: Bitmap | null = null;
let enemySourceBounds: BitmapBounds | null = null;
let enemyBytecodeOps: ShipBytecodeOp[] | null = null;
const shapeR = new ShapeRenderer(hires);
// The shape table the panel needles come out of - line 180 draws shapes 13 and 14 from it
// every pass of the flight loop.
let panelShapes: ShapeTable | null = null;
void (async () => {
  try {
    panelShapes = decodeShapeTableJson(await loader.json('data/shapes/shape-table.json'));
    setPanelShapes(panelShapes);
  }
  catch { /* no table: the needles stay off rather than being guessed at */ }
})();
let assetsReady = false;

const shipKind = state.shipKind;
const effectiveShipKind: 0 | 1 | 3 | 4 = (shipKind as number) === 2 ? 3 : shipKind;
const displayShipKind: 0 | 1 | 3 | 4 = effectiveShipKind >= 1 ? effectiveShipKind : 0;
let assetsReadyPromise: Promise<void> = Promise.resolve();
{
  // The star table is `START 100`'s `BLOAD PLANET # 0,A$7300` and it happens for every game,
  // whatever is or is not in orbit. Only the enemy's own model is chosen by 240 and 250 -
  // DEBRIS when the planet is armed and the ship is gone, `SHIP # J` otherwise.
  //
  // This whole block used to sit behind `if (displayShipKind >= 1)`, so a planet with no
  // enemy on it got no stars and no ground wireframe either: an empty sky in open space and
  // an empty box in the air. Reachable two ways - fly on after EX has destroyed the ship, or
  // load a saved game, where 38205 is in the sixteen-byte gap END never writes - and found
  // the second way.
  assetsReadyPromise = (async () => {
    // planet-N.json is not loaded any more. Its "shapes" came from running an Apple
    // shape-table decoder over 3D vector data - ship-1.json declares offsets
    // [0, 1, 44, 1, 171], and a shape table's offsets cannot point into its own header -
    // and nothing reads them now that the ground wireframe comes from the disk.
    try {
      const planetAssetIndex = Math.max(0, Math.min(20, state.planetIndex));
      const hgr = await loader.json<PlanetHgrJson>(`data/debug/planet-${planetAssetIndex}-state9023-bombardment-hgr.json`);
      const sourcePage = hgr.videoPageHint === 'page1' ? hgr.page1 : hgr.page2;
      bombardmentSourceBitmap = decodeApple2HiresPage(sourcePage);
      bombardmentSourceBounds = findBitmapBounds(bombardmentSourceBitmap);
    } catch { /* source-backed bombardment state not generated for every planet yet */ }

    try {
      const json = await loader.json<{ bytes: number[] }>('data/shapes/starfield-bytecode.json');
      starOps = parseShipBytecode(json.bytes);
    } catch { /* no star table: renderStarfield draws nothing */ }
    try {
      // The disk numbers planets 1..20; the port's array is 0-based.
      const n = state.planetIndex + 1;
      const json = await loader.json<{ bytes: number[] }>(`data/shapes/planet-${n}-ground.json`);
      groundOps = parseShipBytecode(json.bytes);
    } catch { /* no ground for this planet */ }
    // 230-250: the enemy's model, and only it, depends on there being an enemy.
    if (displayShipKind >= 1) {
    try {
      const json = await loader.json<{ bytes: number[] }>(`data/shapes/ship-${displayShipKind}-bytecode.json`);
      enemyBytecodeOps = parseShipBytecode(json.bytes);
      state.enemyShapeLoaded = enemyBytecodeOps.length > 0;
    } catch { /* bytecode asset not generated for every ship kind yet */ }
    try {
      const json = await loader.json<any>(`data/shapes/ship-${displayShipKind}-points.json`);
      enemyPointSprite = decodeShipPointJson(json);
      state.enemyShapeLoaded = enemyPointSprite.shapes.length > 0 || state.enemyShapeLoaded;
    } catch { /* point-sprite source not present for every ship kind yet */ }
    if (displayShipKind === 4) {
      try {
        const sourceState = await loader.json<AppleWinStateJson>('data/debug/applewin-space-vikings-state.json');
        const extracted = extractShipBitmapFromAppleWinState(sourceState);
        if (extracted) {
          enemySourceBitmap = extracted.ship;
          enemySourceBounds = extracted.component.bounds;
          planetSourceBitmap = extracted.planet;
          planetSourceBounds = extracted.planetBounds;
          state.enemyShapeLoaded = true;
        }
      } catch { /* source-state fallback is optional */ }
    }
    }
    assetsReady = true;
  })();
}
await assetsReadyPromise;

const viewport = document.getElementById('viewport');
const stage = document.getElementById('stage') as HTMLCanvasElement | null;
const vectorRenderer = new VectorRenderer(
  viewport ?? document.body,
  stage,
);
void vectorRenderer.loadShip(loader, displayShipKind);

// H_D.bas initializes encounter thresholds on arrival. Do not fabricate
// them from tech here; use explicit state values populated from extracted
// original game state.
const planetTech = state.planets[state.planetIndex]?.defense || 0;
void planetTech;

const enemy = spawnEnemy(state);

  const projectiles: Projectile[] = [];
  const laserBolts: LaserBolt[] = [];
  const groundBolts: GroundBoltState[] = [];
  const flashes: DamageFlash[] = [];
  let surrenderMsgTimer = 0;
  let destructionPending = false;
  let lastBombardmentReport = -1;
  let enemyScreenX = 140;
  let enemyScreenY = 65;
  let enemyVisible = false;
  let seededDebugFighters = false;
  let openingVolleySeeded = false;

  return new Promise<void>((resolve) => {
    let raf = 0;
    let next: string | null = null;
    let lastT = performance.now();
    let simulatorAccumulator = 0;
    let prevHeading = headingRad;
    let prevPitch = pitchRad;
    let fireCooldown = 0;
  let transitionCooldown = 0;
  let showControls = false;
  let vectorMode = false;
  const ai = new AIController();

    function runNextScene(): boolean {
      if (!next) return false;
      // The true inverse of pitchByteToRad, which is (byte / 256) * 2 * Math.PI.
      // This used to write ((pitchRad / (Math.PI / 4)) * 128 + 128) % 256, a different
      // mapping entirely: leaving the cockpit level (0 rad) stored 128, and re-entering
      // read that back as Math.PI - flying backwards. Heading below always used the
      // true inverse, which is why only pitch drifted.
      //
      // 0 is level on the disk too: STARSHIP SIMULATOR 175/177 clamp $7321 to 0..59 and
      // 195..255, a signed range centred on 0, and a new game starts it at 0.
      state.pitch = Math.round(((pitchRad / (2 * Math.PI)) * 256 + 256) % 256);
      state.heading = Math.round(((headingRad / (2 * Math.PI)) * 256 + 256) % 256);
      vectorRenderer.destroy();
      cancelAnimationFrame(raf);
      const target = next;
      next = null;
      scenes.run(target).then(() => resolve());
      return true;
    }

    function updateTimers(dt: number) {
      fireCooldown = Math.max(0, fireCooldown - dt);
      transitionCooldown = Math.max(0, transitionCooldown - dt);
    }

    function checkDebugFighters() {
      if (!seededDebugFighters && isCockpitDebugFlag(HOSTILE_DEBUG_FLAG)) {
        seededDebugFighters = true;
        spawnGroundBolt();
        spawnGroundBolt();
      }
    }

    function checkAutoConquest() {
      if (state.commanderMode && state.atmosphere
        && !state.planetSurrendered && state.planetVitalityLimit <= 0) {
        markPlanetConquered(state);
        glog('surrender', `surface occupation ${state.planets[state.planetIndex].name}`);
      }
    }

    function handleInput(dt: number) {
      if (state.commanderMode) {
        next = chooseCommanderScene(state);
        if (next === 'galaxyMap' && state.atmosphere) {
          glog('commander', 'orbit before course plot');
          next = 'orbit';
        }
        if (next === 'starshipSimulator' || next === 'cockpit') {
          next = null;
        }
        if (!next && state.autopilot) {
          applyAutoPilot(dt);
        }
      } else if (state.autopilot && state.planetSurrendered && !state.atmosphere) {
        const nextTarget = chooseCommanderTarget(state);
        if (nextTarget >= 0) {
          state.navDestination = nextTarget;
          glog('ai', `plotting course to ${state.planets[nextTarget].name}`);
          next = 'hyperdrive';
        } else {
          next = 'end';
        }
      } else if (state.autopilot) {
        applyAutoPilot(dt);
      } else {
        if (input.isDown('ArrowLeft')) headingRad -= TURN_RATE * dt;
        if (input.isDown('ArrowRight')) headingRad += TURN_RATE * dt;
        if (input.isDown('ArrowUp')) pitchRad += TURN_RATE * dt;
        if (input.isDown('ArrowDown')) pitchRad -= TURN_RATE * dt;
      }
    }

    function applyAutoPilot(dt: number) {
      const aiIn = ai.update(state, pitchRad, headingRad, enemy, dt);
      headingRad += aiIn.dHeading * dt;
      pitchRad += aiIn.dPitch * dt;
      if (aiIn.speed !== undefined) state.speed = aiIn.speed;
      if (aiIn.fire && fireCooldown <= 0) {
        fireCooldown = FIRE_COOLDOWN_SECONDS;
        if (state.weaponMode === 'missile') fireMissile();
        else fireLaser();
      }
    }

    function clampOrientation() {
      const pmax = (Math.PI / 180) * 60;
      if (pitchRad > pmax) pitchRad = pmax;
      if (pitchRad < -pmax) pitchRad = -pmax;
      if (headingRad > 2 * Math.PI) headingRad -= 2 * Math.PI;
      if (headingRad < 0) headingRad += 2 * Math.PI;
    }

    function handleDiscreteInput() {
      const k = input.peekKey();
      if (k <= 0) return;
      const ch = String.fromCharCode(k & 0x7f).toUpperCase();
      input.clearKey();
      if (k === 0x9b) {
        showControls = !showControls;
      } else if (ch === '1') {
        state.speed = Math.max(0, state.speed - 3);
      } else if (ch === '2') {
        state.speed = Math.min(120, state.speed + 3);
      } else if (ch === '3') {
        state.speed = Math.max(0, state.speed - 15);
      } else if (ch === '4') {
        state.speed = Math.min(120, state.speed + 15);
      } else if (ch === 'A') {
        state.autopilot = !state.autopilot;
        if (!state.autopilot) {
          state.commanderMode = false;
        }
        glog('autopilot', state.autopilot ? 'engaged' : 'disengaged');
      } else if (ch === 'P') {
        state.commanderMode = !state.commanderMode;
        if (state.commanderMode) {
          state.autopilot = true;
        }
        glog('commander', state.commanderMode ? 'engaged' : 'disengaged');
      } else if (ch === 'W') {
        state.weaponMode = state.weaponMode === 'missile' ? 'laser' : 'missile';
        state.missileMode = state.weaponMode === 'missile';
      } else if (ch === 'S') {
        if (!state.shieldsOn && state.damage.shieldsPct <= 0) {
          audio.beep(200, 100);
        } else {
          state.shieldsOn = !state.shieldsOn;
        }
      } else if (ch === 'B') {
        state.condition = state.condition === 'green' ? 'blue'
          : state.condition === 'blue' ? 'red' : 'green';
        state.antiFighterTurrets = state.condition === 'red' ? 3 : 0;
      } else if (ch === 'C') {
        next = 'com';
      } else if (ch === 'R') {
        next = 'radar';
      } else if (ch === 'H') {
        if (state.navDestination !== null && !state.atmosphere) {
          next = 'hyperdrive';
        }
      } else if (ch === 'O') {
        if (state.inOrbit) {
          state.inOrbit = false;
          state.atmosphere = true;
          state.y = 3000;
        } else if (state.atmosphere) {
          state.y = 4500;
        }
      } else if (ch === 'V') {
        vectorMode = !vectorMode;
        if (vectorMode) {
          vectorRenderer.show();
        } else {
          vectorRenderer.hide();
        }
      } else if (ch === ' ' && fireCooldown <= 0) {
        fireCooldown = FIRE_COOLDOWN_SECONDS;
        if (state.weaponMode === 'missile') {
          fireMissile();
        } else {
          fireLaser();
        }
      }
    }

    function updatePhysics(dt: number): Camera {
      const fwd = forwardVector(pitchRad, headingRad);
      // STARSHIP SIMULATOR.bas:129 applies S * vector once per source loop.
      // The DSK trace shows one loop about every 500 ms, not every browser
      // frame: at S=120, Z advances in exact 120-unit chunks.
      simulatorAccumulator += dt;
      const simulatorTicks = Math.floor(simulatorAccumulator / BASIC_SIMULATOR_TICK_SECONDS);
      simulatorAccumulator -= simulatorTicks * BASIC_SIMULATOR_TICK_SECONDS;
      for (let i = 0; i < simulatorTicks; i += 1) {
        const newPos = v3add(v3(state.x, state.y, state.z), v3scale(fwd, state.speed));
        state.x = wrap(newPos.x);
        state.y = wrap(newPos.y);
        state.z = wrap(newPos.z);
      }

      if (simulatorTicks > 0 && state.atmosphere && state.speed > 0) {
        const gravityFactor = 1 - Math.max(0, Math.sin(pitchRad));
        state.y -= (6 - (state.speed / 10)) * gravityFactor * simulatorTicks;
        if (state.y < 20) {
          state.y = 20;
          pitchRad = 0;
          state.pitch = 0;      // 0 is level; see the writeback above
        }
      }

      return {
        pos: v3(state.x, state.y, state.z),
        pitch: pitchRad,
        heading: headingRad,
      };
    }

    function updateTransitions() {
      if (transitionCooldown > 0) return;
      const currentPlanet = state.planets[state.planetIndex];
      const commanderSiegeReentry = state.commanderMode
        && (currentPlanet?.groundAssaultFailed || shouldPreferPlanetaryBombardment(state))
        && !state.planetSurrendered
        && state.planetVitalityLimit > 0
        && !state.atmosphere
        && !state.inOrbit
        && Math.hypot(state.x, state.y, state.z) < 15000;

      if (commanderSiegeReentry) {
        glog('transition', `commander siege reentry pos=(${state.x},${state.y},${state.z})`);
        next = 'reentry';
      } else if (Math.abs(state.x) < 900 && Math.abs(state.y) < 900
        && Math.abs(state.z) < 900 && !state.atmosphere && !state.inOrbit) {
        glog('transition', `reentry pos=(${state.x},${state.y},${state.z})`);
        next = 'reentry';
      }
      if (state.atmosphere && state.y > 4000) {
        glog('transition', `orbit pos=(${state.x},${state.y},${state.z})`);
        next = 'orbit';
      }
    }

    function updateEnemyAI(dt: number) {
      if (destructionPending || state.planetSurrendered
        || (!enemy.alive && !state.atmosphere)) return;
      // 190 and 192. In atmosphere the tick runs every pass and ground fire follows it at .5;
      // in space both need the ship inside the box near the planet, and the gate is .6. The
      // port had this the wrong way round - it fired only in space, and never in air.
      const runs = damageTickRuns190(
        { x: state.x, y: state.y, z: state.z },
        { surrendered: state.planetSurrendered, atmosphere: state.atmosphere },
      );
      if (!runs.tick) return;
      const nearPlanet = true;
      // Lines 190 and 192 are part of the same pass as the movement, so they run at the same
      // rate. This was `2 * dt`, the old half-second pass written out by hand.
      if (Math.random() < dt / BASIC_SIMULATOR_TICK_SECONDS) {
        enemyAttack(nearPlanet);
        // `IF RND(1) < .5 AND PEEK(38207) > 0 THEN GOSUB 5000` - one bolt, right after the
        // tick, and only while the planet still has a battery standing.
        if (Math.random() < runs.groundFireChance && state.enemyShips > 0) spawnGroundBolt();
      }
    }

    function updateProjectiles(dt: number, cam: Camera) {
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.x += p.vx * dt * FRAME_DT_SCALE;
        p.y += p.vy * dt * FRAME_DT_SCALE;
        p.z += p.vz * dt * FRAME_DT_SCALE;
        p.age += dt;

        // A missile cannot shoot a bolt down. 5250 is reached only from 5240, inside the
        // ship's own return fire at 5200 - nothing in the original tests a projectile
        // against a bolt, so the collision test the port had here is gone.

        // No hit test here. 1050 is walked at the moment of firing, sixteen steps inside the
        // one pass, so by the time this is drawn the shot has already been scored - and the
        // box it used is 1050's, which is 60 above the enemy and only 20 below, not the
        // symmetric 60 that used to be tested here.
        if (p.age > 2) { projectiles.splice(i, 1); }
      }
    }

    function updateLaserBolts(dt: number) {
      for (let i = laserBolts.length - 1; i >= 0; i--) {
        laserBolts[i].age += dt;
        if (laserBolts[i].age > 0.15) laserBolts.splice(i, 1);
      }
    }

    /**
     * 5090-5096, one discrete step at a time.
     *
     * The step has to be discrete because 5090 rolls for a hit exactly once per pass, so
     * moving the bolt continuously would change how often it can hit. A hit is 5098, which
     * enters the damage routine at 3205 with L = 7 and so takes shields and nothing else -
     * never the hull, the engines, the radar, the computer or the laser.
     */
    function updateGroundBolts(dt: number) {
      for (let i = groundBolts.length - 1; i >= 0; i--) {
        const f = groundBolts[i];
        if (f.returnFireTimer > 0) f.returnFireTimer -= dt;
        f.stepTimer += dt;
        if (f.stepTimer < GROUND_BOLT_STEP_SECONDS) continue;
        f.stepTimer -= GROUND_BOLT_STEP_SECONDS;

        const d = state.damage;
        const step = groundBoltStep5090(
          { shields: d.shieldsPct, radar: d.radarPct, engine1: d.engine1Pct,
            engine2: d.engine2Pct, computer: d.computerPct, laser: d.laserPct, hull: d.hullPct },
          // 38165 is the condition: 1 green, 2 blue, 3 red. 5200 returns unless it is red.
          { condition: state.condition === 'red' ? 3 : state.condition === 'blue' ? 2 : 1,
            batteries: state.enemyShips },
        );

        if (step.hit) {
          d.shieldsPct = step.damage.shields;
          audio.beep(1200, 30);
          flashes.push({ timer: 0.08, type: 'hit' });
          glog('groundFire', 'shields=' + d.shieldsPct.toFixed(0));
          if (!d.pendingUpdate) d.pendingUpdate = true;
        }
        if (step.returnFire) {
          // 5230 `HPLOT LX - 20,123 TO X1 - 3,Y1 + 3` and the same at LX + 20, X1 + 3.
          f.returnFireTimer = 0.12;
          f.returnFireGunX = step.returnFire.gunX;
          laserBolts.push({ x1: step.returnFire.gunX - 20, y1: 123,
            x2: f.screenX - 3, y2: f.screenY + 3, age: 0.1 });
          laserBolts.push({ x1: step.returnFire.gunX + 20, y1: 123,
            x2: f.screenX + 3, y2: f.screenY + 3, age: 0.1 });
          audio.beep(700, 25);
        }
        if (step.batteryDestroyed) {
          // 5250's POP throws away 5000's return address, so the bolt goes no further.
          onGroundBatteryDestroyed();
          groundBolts.splice(i, 1);
          continue;
        }

        // 5095: advance, then test. A spent bolt returns from 5000 without being drawn again.
        const moved = stepGroundBolt5095(
          { x: f.screenX, y: f.screenY, vx: f.vx, vy: f.vy, shape: f.shapeIdx });
        f.screenX = moved.x;
        f.screenY = moved.y;
        if (groundBoltSpent5095(moved)) { groundBolts.splice(i, 1); continue; }
      }
    }

    function updateFlashes(dt: number) {
      for (let i = flashes.length - 1; i >= 0; i--) {
        flashes[i].timer -= dt;
        if (flashes[i].timer <= 0) flashes.splice(i, 1);
      }
    }

    function updateSurrenderTimer(dt: number) {
      if (surrenderMsgTimer <= 0) return;
      surrenderMsgTimer -= dt;
      if (surrenderMsgTimer <= 0) {
        markPlanetConquered(state);
        if (state.planets.every(p => p.surrendered)) {
          glog('victory', 'all 20 systems conquered via bombardment');
          next = 'end';
        }
      }
    }

    function checkEnemyDestruction() {
      if (state.shipVitality > state.shipDestructionLimit
        && state.shipDestructionLimit > 0
        && state.shipKind !== 0 && !destructionPending) {
        glog('destroy', `enemy shipVit=${state.shipVitality} limit=${state.shipDestructionLimit}`);
        destructionPending = true;
        next = 'ex';
      }
    }

    function renderFrame(cam: Camera, dt: number) {
      if (vectorMode) {
        vectorRenderer.setAtmosphere(state.atmosphere);
        const overlay: VectorOverlayData = {
          projectiles: projectiles.map(p => ({ x: p.x, y: p.y, z: p.z })),
          laserBolts: laserBolts.map(b => ({ x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2, age: b.age })),
          fighters: groundBolts.map(f => ({ screenX: f.screenX, screenY: f.screenY, shapeIdx: f.shapeIdx })),
          flashes: flashes.map(fl => ({ timer: fl.timer, type: fl.type })),
          surrenderMsgTimer,
          enemyAlive: enemy.alive,
          enemyPos: { x: enemy.pos.x, y: enemy.pos.y, z: enemy.pos.z },
        };
        vectorRenderer.render(state, pitchRad, headingRad, dt, showControls, overlay);
        return;
      }

      hires.hgr();

      // In atmosphere the original draws the planet's ground wireframe - the same display
      // list `ground_parity.mjs` checks at 100% - through the same renderer as the starfield.
      // `renderStarfield` already picks `groundOps` over `starOps` when atmosphere is set, and
      // it was unreachable: this branch sent every atmospheric frame to drawBombardmentView
      // instead, which draws an invented dotted frame and a point cloud from a bitmap that is
      // null in normal play. Flying in air showed an empty box. Found by playing it.
      if (state.atmosphere && groundOps) {
        renderStarfield(cam);
      } else if (state.atmosphere) {
        drawBombardmentView(
          hires,
          state,
          pitchRad,
          headingRad,
          state.weaponMode === 'laser' && fireCooldown > FIRE_COOLDOWN_SECONDS - 0.12,
          bombardmentSourceBitmap,
          bombardmentSourceBounds,
        );
      } else {
        // No planet body: measured, the original draws none in flight. What you see out
        // there is the star table, and once RE has run, the planet's ground wireframe -
        // both of which renderStarfield() draws from the disk's own data. There used to be
        // a procedural disc here, at a hardcoded position, with nothing behind it.
        renderStarfield(cam);
        renderEnemyShip(cam);
        const solSpaceView = state.planetIndex === 0 && !state.atmosphere;
        if (solSpaceView) {
          clearSolPresentationUpperLeft(hires);
        }
      }

      // $6DD5 walks its address out of page 2 for any line reaching sy 96 - y/z of 1, which
      // is what a clipped endpoint gives - and puts two bytes into hi-res page 1. Page 1 is
      // what the original has on screen while it draws into page 2, so those bytes show as
      // specks until the next pass clears that page: about half a second. Measured in
      // oracle/probe_line6dd5wrap.mjs, the cells and masks matched here exactly. The port
      // redraws every frame, so plotting them now gives the same one-frame speck.
      hires.plotOffPageStrays();

      renderTargetReticle();
      renderProjectiles(cam);
      renderLaserBolts();
      renderGroundBolts();
      renderFlashes();
      renderSurrenderMessage();
      drawHUD(hires, state, pitchRad, headingRad, prevHeading, prevPitch, dt, showControls, panelShapes);
      prevHeading = headingRad;
      prevPitch = pitchRad;
    }

    function renderStarfield(_cam: Camera) {
      // In the atmosphere the disk has the ground wireframe in this slot, not the stars.
      const ops = state.atmosphere ? groundOps : starOps;
      if (!ops) return;
      hires.hcolor(3);
      // Same projection and clipping as everything else, and the disk plots each star two
      // pixels wide - measured, see oracle/DISK_TRUTH.md.
      drawShipWorld(hires, projectShipWorld(
        ops, { x: state.x, y: state.y, z: state.z }, state.heading, state.pitch, null,
      ));
    }


    function renderEnemyShip(cam: Camera) {
      enemyVisible = false;
      // Whether the ship is **drawn** is not whether it is a threat. `CALL CA` walks one
      // display list, and the model sits at A30841 from START onwards; only H/D 37's
      // `POKE 30841,127`, EX 40's BLOAD DEBRIS or a new BLOAD on arrival change it. Nothing on
      // the disk gates the drawing on 38208, the surrender flag - that gates the damage tick at
      // 190 and 192. The port was hiding the ship at a secured planet, which is why the opening
      // frame had a star ball and the disk's had a ship in the middle of it.
      const modelKind = (state.shipKind as number) === 2 ? 3 : (state.shipKind as number);
      if (modelKind <= 0 || state.atmosphere) return;
      const visibleShip = enemy.pos;
      const ep = project(cam, visibleShip);
      if (!ep.visible) return;
      const sprScale = Math.max(1, Math.min(64, Math.round(2500 / ep.depth)));
      shapeR.rot = 0;
      shapeR.scale = 1;
      hires.hcolor(3);
      enemyVisible = enemy.alive && ep.visible;
      if (enemy.alive) {
        enemyScreenX = clamp(Math.round(ep.x), 12, 268);
        enemyScreenY = clamp(Math.round(ep.y), 12, 118);
      }
      const desiredPx = Math.max(12, Math.min(24, 80000 / Math.max(1, ep.depth)));
      const shipDrawX = Math.round(ep.x);
      const shipDrawY = clamp(Math.round(ep.y), 22, 86);
      if (enemyPointSprite && enemyPointSprite.shapes.length > 0) {
        const scale = computeShipPointScale(enemyPointSprite.bounds, desiredPx);
        renderShipPointSprite(hires, enemyPointSprite, shipDrawX, shipDrawY, scale);
      } else if (enemyBytecodeOps) {
        // Project every vertex through the camera, the way the disk does, rather than
        // stamping a fixed-view sprite at a projected point. The transform is derived in
        // oracle/fit_projection.mjs; measured against the original, this took ship shape
        // agreement from 12.1% to 69.8% and the aspect ratio from 2.30x too tall to 1.05x.
        //
        // The model's coordinates are absolute world coordinates, so it takes **no offset**.
        // Line 2's `X9 = 400: Y9 = -100: Z9 = -3500` is not somewhere to put the ship - it is
        // where the ship already is: `ship-3-bytecode` spans x 150-600, y -120-30, z -3650 to
        // -3350, centred on exactly that point. Adding it as an offset put the model twice as
        // far out. Measured at the machine's own camera by `oracle/flight_view_parity.mjs`: with
        // no offset the star table and the ship together give 396 lit pixels against the disk's
        // 396, nothing differing.
        const projection = projectShipWorld(
          enemyBytecodeOps,
          { x: state.x, y: state.y, z: state.z },
          state.heading,
          state.pitch,
          null,
        );
        if (projection.segments.length || projection.dots.length) {
          drawShipWorld(hires, projection);
        } else if (enemySourceBitmap && enemySourceBounds) {
          drawScaledBitmap(shipDrawX, shipDrawY, desiredPx, enemySourceBitmap, enemySourceBounds);
        }
      } else if (enemySourceBitmap && enemySourceBounds) {
        drawScaledBitmap(shipDrawX, shipDrawY, desiredPx, enemySourceBitmap, enemySourceBounds);
      } else {
        drawOrbitingShipFallback(hires, shipDrawX, shipDrawY, Math.max(1, Math.min(4, sprScale)));
      }
    }

    function drawScaledBitmap(
      drawX: number, drawY: number, desiredPx: number,
      bmp: Bitmap, bounds: BitmapBounds,
    ) {
      const scale = scaleToFit(bounds, desiredPx);
      const bw = bounds.width * scale;
      const bh = bounds.height * scale;
      drawBitmap(hires, bmp, Math.round(drawX - (bw / 2)), Math.round(drawY - (bh / 2)), scale, bounds);
    }

    function renderTargetReticle() {
      hires.hcolor(5);
      hires.text('-[ ]-', 18, 8);
    }

    function renderProjectiles(cam: Camera) {
      hires.hcolor(3);
      for (const p of projectiles) {
        const pp = project(cam, v3(p.x, p.y, p.z));
        if (pp.visible && pp.y >= 0 && pp.y < 124) {
          hires.hplot(Math.round(pp.x), Math.round(pp.y));
          hires.hplot(Math.round(pp.x) + 1, Math.round(pp.y));
        }
      }
    }

    function renderLaserBolts() {
      for (const b of laserBolts) {
        if (b.age < 0.08) hires.hcolor(5);
        else hires.hcolor(3);
        hires.line(b.x1, b.y1, b.x2, b.y2);
      }
    }

    function renderGroundBolts() {
      // The sprite branch here read ship-N.json, which is not a shape table; the lines below
      // stand in for 5090's `XDRAW M AT X1,Y1`.

      for (const f of groundBolts) {
        const fx = Math.round(f.screenX);
        const fy = Math.round(f.screenY);

        hires.hcolor(1);
        if (f.shapeIdx === 8) {
          hires.line(fx - 3, fy, fx + 3, fy);
        } else if (f.shapeIdx === 9) {
          hires.line(fx, fy - 3, fx, fy + 3);
          hires.line(fx - 2, fy, fx + 2, fy);
        } else {
          hires.line(fx - 2, fy, fx + 2, fy);
          hires.line(fx, fy - 2, fx, fy + 2);
        }
      }
    }

    function renderFlashes() {
      for (const fl of flashes) {
        if (fl.type === 'explosion') {
          hires.hcolor(5);
          for (let fy = 0; fy < 40; fy++) {
            hires.hplot(Math.round(Math.random() * 279),
              Math.round(Math.random() * 124));
          }
        } else {
          hires.hcolor(5);
          hires.line(0, 60, 279, 60);
          hires.line(0, 64, 279, 64);
        }
      }
    }

    function renderSurrenderMessage() {
      if (surrenderMsgTimer <= 0) return;
      hires.hcolor(3);
      hires.text('THE PLANET HAS SURRENDERED', 4, 13);
    }

    function frame(now: number) {
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      updateTimers(dt);
      checkDebugFighters();
      checkAutoConquest();

      handleInput(dt);
      clampOrientation();
      handleDiscreteInput();

      // 3360: `IF PEEK(38393) = 0 THEN POKE 38393,1: PRINT "^DRUNDMG"`. **Once.** The flag
      // stays set until SHORE LEAVE 2555 clears it on a repair, so the lamp comes on the first
      // time anything gets through and the flight loop is not interrupted again. The port was
      // running DMG on every hit.
      if (!next && state.damage.pendingUpdate && transitionCooldown <= 0) {
        state.damage.pendingUpdate = false;
        if (!state.shipDamaged) next = 'dmg';
      }
      if (runNextScene()) return;

      const cam = updatePhysics(dt);

      updateTransitions();
      if (runNextScene()) return;

      updateEnemyAI(dt);
      updateProjectiles(dt, cam);
      updateLaserBolts(dt);
      updateGroundBolts(dt);
      updateFlashes(dt);
      updateSurrenderTimer(dt);
      checkEnemyDestruction();
      if (runNextScene()) return;

      renderFrame(cam, dt);
      raf = requestAnimationFrame(frame);
    }

  function fireMissile() {
  // STARSHIP_SIM:1000-1090
  // Line 1500: if planet surrendered, unsurrender and reset vitality limit
  if (state.planetSurrendered && !state.commanderMode) {
    state.planetSurrendered = false;
    state.planets[state.planetIndex].surrendered = false;
    clearPendingConquestCollection(state, state.planetIndex);
    state.planetVitalityLimit = 100;
  }
  // No energy cost. The one write to 38199 anywhere on the disk is H/D line 15, so firing
  // does not spend fuel - the 15 and 3 that used to be charged here were invented.
  // 1000's `IF PEEK(38187) = 0 THEN 1090`: only an empty rack skips the flight, and one
  // missile left still flies. 1090 charges two either way and 3380 stops the count at 0.
  glog('fire', `missile missiles=${state.missilesRemaining}`);
  const fwd = forwardVector(pitchRad, headingRad);

  // The whole shot is decided here, not over the next two seconds: 1010's loop is sixteen
  // steps of 160 along this vector, all inside one pass. The projectile pushed below is only
  // what is drawn - it carries no hit test of its own.
  const pitchByte = Math.round(((pitchRad / (2 * Math.PI)) * 256 + 256) % 256);
  const hit = state.missilesRemaining > 0 && missileHit1000(
    { x: state.x, y: state.y, z: state.z }, fwd, pitchByte,
    { atmosphere: !!state.atmosphere });

  const startPos = v3add(v3(state.x, state.y, state.z), v3scale(fwd, 100));
  projectiles.push({
    x: startPos.x, y: startPos.y, z: startPos.z,
    vx: fwd.x * 160, vy: fwd.y * 160, vz: fwd.z * 160,
    age: 0,
  });
  audio.beep(440, 60);
  onMissileHit(hit);
}

  function fireLaser() {
  // STARSHIP_SIM:1500-1530
  // Line 1500: if planet surrendered, unsurrender and reset vitality limit
  if (state.planetSurrendered && !state.commanderMode) {
    state.planetSurrendered = false;
    state.planets[state.planetIndex].surrendered = false;
    clearPendingConquestCollection(state, state.planetIndex);
    state.planetVitalityLimit = 100;
  }
  if (!state.laserOperational || state.damage.laserPct < 10) return;
  glog('fire', `laser`);
  laserBolts.push({
        x1: 90, y1: 123, x2: 136, y2: 60,
        age: 0,
      });
      laserBolts.push({
        x1: 190, y1: 123, x2: 144, y2: 60,
        age: 0,
      });
      audio.laser();

      // 1535 and 1540 run on every shot. The original has no aiming for the laser at all -
      // no screen-space test, no range test - so this is unconditional.
      onLaserHit();
      // 1500-1540 has no screen-space test of any kind, and a ground battery is only ever
      // destroyed by 5240 inside the ship's own return fire. Firing the laser at a bolt does
      // nothing, so the box test the port had here is gone.

  // Planet surface bombardment (STARSHIP_SIM:1535-1550)
  if (state.atmosphere) {
    const j1 = state.commanderMode ? 120 : 10;
    const te = Math.max(1, state.defenseTech);
    state.planetVitality = Math.min(255, state.planetVitality + j1 / (te + 1));
    const report = Math.floor(state.planetVitality / 20);
    if (report !== lastBombardmentReport) {
      lastBombardmentReport = report;
      glog('bombardment', `planetVit=${state.planetVitality.toFixed(1)} limit=${state.planetVitalityLimit}`);
    }

    if (state.planetVitality >= state.planetVitalityLimit && state.planetVitalityLimit > 0 && !state.planetSurrendered) {
      glog('surrender', `planetVit=${state.planetVitality.toFixed(1)} limit=${state.planetVitalityLimit}`);
      surrenderMsgTimer = 3;
      markPlanetConquered(state);
      audio.beep(880, 200);
    }
  }
    }

  function onMissileHit(isHit: boolean) {
  // 1085 and 1090, through the same 1535-1560 the laser goes through. The only difference is
  // J2 - 120 against the laser's 1 - which is the whole reason the missile is the only thing
  // that can destroy the enemy ship.
  //
  // The arithmetic this used to do by hand got three things wrong that the shared routine
  // gets right: the stores truncate into a byte, `IF DP < HL` is a test and not a clamp, and
  // TE is line 8's byte with no `Math.max(1, ...)` under it. The flash is faithful either
  // way - 1200 and 1100 both XDRAW an even number of times, so nothing is left behind.
  if (isHit) {
    glog('hit', `missile shipVit=${state.shipVitality}`);
    flashes.push({ timer: 0.3, type: 'explosion' });
    audio.beep(220, 120);
  } else {
    // 1088's GOSUB 1100, the miss.
    flashes.push({ timer: 0.15, type: 'hit' });
    audio.beep(660, 40);
  }

  const r = fireMissile1000({
    planetVitality: state.planetVitality,
    enemyDamage: state.shipVitality,
    missiles: state.missilesRemaining,
    surrendered: state.planetSurrendered,
    surrenderAt: state.planetVitalityLimit,
  }, {
    tech: state.commanderMode ? 0 : state.defenseTech,
    atmosphere: state.atmosphere,
    laserPct: state.damage.laserPct,
    enemyLimit: state.shipDestructionLimit,
    enemyPresent: state.shipKind !== 0,
  }, isHit);
  if (!r.fired) return;
  state.planetVitality = r.planetVitality;
  state.shipVitality = r.enemyDamage;
  state.missilesRemaining = r.missiles;
  state.planetVitalityLimit = r.surrenderAt;
  if (r.planetSurrendered) {
    glog('surrender', `planetVit=${state.planetVitality}`);
    surrenderMsgTimer = 3;
    markPlanetConquered(state);
  }
  if (r.enemyDestroyed && !destructionPending) {
    glog('destroy', `enemy shipVit=${state.shipVitality} limit=${state.shipDestructionLimit}`);
    destructionPending = true;
    next = 'ex';
  }
}

function onLaserHit() {
  // 1535-1560. There is no aiming: the original tests nothing about where the ship points or
  // how far away anything is, so this runs on every shot. `IF VP < HL THEN POKE` is a test
  // rather than a clamp, and each store truncates into a byte, so the fraction never carries
  // to the next shot - measured on the disk, 38160 moving in steps of 2 where the arithmetic
  // says 2.5, and standing still at 253 while the same held button moved it from 250.
  glog('hit', `laser shipVit=${state.shipVitality}`);
  flashes.push({ timer: 0.2, type: 'explosion' });
  audio.beep(180, 100);

  const r = fireLaser1500({
    planetVitality: state.planetVitality,
    enemyDamage: state.shipVitality,
    missiles: state.missilesRemaining,
    surrendered: state.planetSurrendered,
    surrenderAt: state.planetVitalityLimit,
  }, {
    // TE is the planet's tech straight from line 8 - no Math.max(1, ...), which the port had
    // and which would halve the step on a tech-0 planet.
    tech: state.commanderMode ? 0 : state.defenseTech,
    atmosphere: state.atmosphere,
    laserPct: state.damage.laserPct,
    enemyLimit: state.shipDestructionLimit,
    enemyPresent: state.shipKind !== 0,
  });
  if (!r.fired) return;
  state.planetVitality = r.planetVitality;
  state.shipVitality = r.enemyDamage;
  state.planetVitalityLimit = r.surrenderAt;
  if (r.planetSurrendered) {
    glog('surrender', `planetVit=${state.planetVitality}`);
    surrenderMsgTimer = 3;
    markPlanetConquered(state);
  }
  if (r.enemyDestroyed && !destructionPending) {
    destructionPending = true;
  }
}

  function enemyAttack(nearPlanet: boolean) {
    // Lines 3000-3381, in diskDamage.ts, transcribed from the listing and checked against a
    // real flight. Two things were wrong here: the heavy branch is 3001 AND 3010, two rolls
    // at .4, so 0.16 and not 0.4 - a damaging tick is 0.412 likely, where reading it as one
    // roll gave 0.58 and took damage 40% too often - and the shield gate at 3205 tests the
    // POKEd byte, so shields of 10.9 store as 10 and let the rest of the ship take it.
    void nearPlanet;
    const d = state.damage;
    const r = damageTick3000({
      shields: d.shieldsPct, radar: d.radarPct,
      engine1: d.engine1Pct, engine2: d.engine2Pct,
      computer: d.computerPct, laser: d.laserPct, hull: d.hullPct,
    }, {
      shieldsOn: state.shieldsOn,
      // 38205, which 3000 tests against 38210: an enemy is out there, or you are in air.
      enemyPresent: enemy.alive,
      atmosphere: state.atmosphere,
    });

    // 3019 flashes `RND(1) * 5` times; 3032 flashes once. Both make a noise.
    for (let i = 0; i < r.heavyFlashes; i++) {
      flashes.push({ timer: 0.1 + Math.random() * 0.15, type: 'explosion' });
    }
    if (r.heavyBranch) audio.beep(200, 50);
    if (r.lightBranch) {
      laserBolts.push({ x1: 40 + Math.random() * 200, y1: 123, x2: 136, y2: 60, age: 0.08 });
      laserBolts.push({ x1: 40 + Math.random() * 200, y1: 123, x2: 144, y2: 60, age: 0.08 });
      audio.beep(300, 60);
    }
    if (!r.struck) return;

    d.shieldsPct = r.damage.shields;
    d.radarPct = r.damage.radar;
    d.engine1Pct = r.damage.engine1;
    d.engine2Pct = r.damage.engine2;
    d.computerPct = r.damage.computer;
    d.laserPct = r.damage.laser;
    d.hullPct = r.damage.hull;
    d.laserOperational = d.laserPct >= 10;
    state.laserOperational = d.laserOperational;

    glog('enemyAttack', `shields=${state.shieldsOn} hull=${d.hullPct.toFixed(0)}` +
      `${r.absorbedByShields ? ' absorbed' : ''}`);
    if (r.destroyed) {
      glog('destroy', 'hull=0');
      next = 'playerDeath';
    }
    // 3360: the DMG screen only the first time damage gets through.
    if (!d.pendingUpdate) d.pendingUpdate = true;
  }

    /**
     * 5000-5080. Three draws and nothing else: where it crosses, which edge, how steeply.
     *
     * There is no origin to spawn from. The port used to place these at the enemy ship's
     * screen position with an invented spread and clamps; the disk puts X1 anywhere in
     * 10..270 and brings the bolt in at y 10 or y 120.
     */
    function spawnGroundBolt() {
      const b = spawnGroundBolt5000();
      groundBolts.push({
        screenX: b.x, screenY: b.y, vx: b.vx, vy: b.vy, shapeIdx: b.shape,
        stepTimer: 0, returnFireTimer: 0, returnFireGunX: 0,
      });
    }

    /** 5250, which takes a battery off 38207 and abandons the rest of the bolt's flight. */
    function onGroundBatteryDestroyed() {
      flashes.push({ timer: 0.15, type: 'hit' });
      audio.beep(500, 50);
      state.enemyShips = Math.max(0, state.enemyShips - 1);
    }

    raf = requestAnimationFrame(frame);
  });
}

function spawnEnemy(state: GameState) {
  // START.bas loads SHIP # J before RUN INSTRUMENTS, so the opening frame
  // includes the loaded ship over the home planet.
  if (state.atmosphere || state.planetSurrendered || state.shipKind === 0) {
    return {
      pos: v3(0, 0, 0),
      alive: false,
    };
  }

  // Enemy position from STARSHIP_SIM:2 — X9=400, Y9=-100, Z9=-3500
  return {
    pos: v3(400, -100, -3500),
    alive: true,
  };
}

function isOpeningSolView(state: GameState): boolean {
  return state.planetIndex === 0
    && !state.atmosphere
    && Math.abs(state.x - 700) <= OPENING_VIEW_TOLERANCE
    && Math.abs(state.y - 200) <= OPENING_VIEW_TOLERANCE
    && Math.abs(state.z + 7000) <= OPENING_VIEW_TOLERANCE;
}

function isOpeningApproach(state: GameState): boolean {
  return state.planetIndex === 1
    && !state.atmosphere
    && state.z < -2500;
}

function drawSolPresentationStars(hires: import('../engine/hires').Hires): void {
  for (const [x, y] of SOL_PRESENTATION_STARS) {
    hires.hplot(x, y);
  }
}

function clearSolPresentationUpperLeft(hires: import('../engine/hires').Hires): void {
  hires.clearRect(0, 28, 46, 21);
}

function drawPlanetFallback(
  hires: import('../engine/hires').Hires,
  cx: number,
  cy: number,
  radius: number,
): void {
  drawPlanetPointCloud(hires, cx, cy, radius, 1, 0.72);
}


export let planetRotationTime = 0;

export function drawPlanetPointCloud(
  hires: import('../engine/hires').Hires,
  cx: number,
  cy: number,
  radius: number,
  seed: number,
  yScale = 0.68,
): void {
  const r = Math.max(3, Math.round(radius));
  planetRotationTime += 0.015;
  const yaw = seed * 0.57 + planetRotationTime * 0.4;
  const pitch = -0.22 + (seed % 3) * 0.12;
  const points = buildProjectedSphereCloud(r, Math.max(3, Math.round(r * yScale)), yaw, pitch, true);

  hires.hcolor(3);
  for (const point of points) {
    const x = cx + point.x;
    const y = cy + point.y;
    if (x < 0 || x >= 280 || y < 0 || y >= 124) continue;
    hires.hplot(x, y);
  }
}
function buildProjectedSphereCloud(
  rx: number,
  ry: number,
  yaw: number,
  pitch: number,
  compact: boolean,
): Point2[] {
  const points: Point2[] = [];
  const rimCount = compact
    ? Math.max(18, Math.min(44, Math.round(rx * 1.25)))
    : 56;
  for (let i = 0; i < rimCount; i++) {
    const angle = (i / rimCount) * Math.PI * 2;
    points.push({
      x: Math.round(Math.cos(angle) * rx),
      y: Math.round(Math.sin(angle) * ry),
    });
  }

  const latitudes = compact ? [-48, -20, 12, 42] : [-58, -32, -8, 18, 44];
  const lonSamples = compact ? 16 : 24;
  for (let b = 0; b < latitudes.length; b++) {
    const lat = latitudes[b] * Math.PI / 180;
    for (let i = 0; i < lonSamples; i++) {
      if (!compact && i % 2 === 1 && b % 2 === 0) continue;
      const lon = (i / lonSamples) * Math.PI * 2;
      const projected = projectSpherePoint(lat, lon, yaw, pitch, rx, ry);
      if (projected.z < 0.04) continue;
      points.push({ x: projected.x, y: projected.y });
    }
  }

  const longitudes = compact ? [-60, -25, 12, 48] : [-65, -35, 0, 35, 65];
  const latSamples = compact ? 14 : 22;
  for (let m = 0; m < longitudes.length; m++) {
    const lon = longitudes[m] * Math.PI / 180;
    for (let i = 0; i < latSamples; i++) {
      if (!compact && i % 2 === 1 && m % 2 === 0) continue;
      const lat = (-70 + (i / Math.max(1, latSamples - 1)) * 140) * Math.PI / 180;
      const projected = projectSpherePoint(lat, lon, yaw, pitch, rx, ry);
      if (projected.z < 0.04) continue;
      points.push({ x: projected.x, y: projected.y });
    }
  }

  return dedupePoints(points);
}

function projectSpherePoint(
  lat: number,
  lon: number,
  yaw: number,
  pitch: number,
  rx: number,
  ry: number,
): { x: number; y: number; z: number } {
  const cosLat = Math.cos(lat);
  const x0 = cosLat * Math.cos(lon);
  const y0 = Math.sin(lat);
  const z0 = cosLat * Math.sin(lon);
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const x1 = x0 * cosYaw + z0 * sinYaw;
  const z1 = -x0 * sinYaw + z0 * cosYaw;
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const y1 = y0 * cosPitch - z1 * sinPitch;
  const z2 = y0 * sinPitch + z1 * cosPitch;

  return {
    x: Math.round(x1 * rx),
    y: Math.round(y1 * ry),
    z: z2,
  };
}


function shapeRenderMetrics(shape: Shape): { plotCount: number; maxDim: number } {
  let x = 0;
  let y = 0;
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  let plotCount = 0;

  for (const v of shape) {
    if (v.plot) plotCount += 1;
    if (v.dir === 1) x += 1;
    else if (v.dir === 3) x -= 1;
    else if (v.dir === 2) y += 1;
    else if (v.dir === 0) y -= 1;

    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  return {
    plotCount,
    maxDim: Math.max(1, Math.max(maxX - minX, maxY - minY)),
  };
}

function computeShipRenderScale(
  _depth: number,
  distanceScale: number,
  metric: { plotCount: number; maxDim: number },
): number {
  const desiredPx = Math.max(
    SHIP_TARGET_MIN_PX,
    Math.min(SHIP_TARGET_MAX_PX, distanceScale * SHIP_SCALE_PER_DISTANCE),
  );
  const baseScale = desiredPx / metric.maxDim;
  return Math.max(SHIP_SCALE_MIN, Math.min(SHIP_SCALE_MAX, baseScale));
}

function drawOrbitingShipFallback(
  hires: import('../engine/hires').Hires,
  cx: number,
  cy: number,
  scale: number,
): void {
  const s = Math.max(1, scale);
  const rows: Array<[number, number, number]> = [
    [8, -18, 5],
    [8, -15, 5],
    [8, -12, 6],
    [6, -9, 9],
    [2, -6, 15],
    [-8, -3, 28],
    [-25, 0, 52],
    [-31, 3, 58],
    [-24, 6, 44],
    [-16, 9, 28],
    [-8, 12, 15],
  ];

  for (const [x, y, w] of rows) {
    hires.line(cx + x * s, cy + y * s, cx + (x + w) * s, cy + y * s);
  }

  hires.line(cx + 13 * s, cy - 18 * s, cx + 18 * s, cy - 18 * s);
  hires.line(cx + 13 * s, cy - 15 * s, cx + 21 * s, cy - 15 * s);
  hires.line(cx + 27 * s, cy + 1 * s, cx + 34 * s, cy + 3 * s);
  hires.line(cx - 31 * s, cy + 3 * s, cx - 38 * s, cy + 6 * s);
  hires.line(cx - 12 * s, cy + 9 * s, cx - 18 * s, cy + 15 * s);
  hires.line(cx + 5 * s, cy + 9 * s, cx + 11 * s, cy + 15 * s);
}

function applyCockpitDebugOverrides(state: GameState): void {
  if (!isCockpitDebugFlag(BOMBARDMENT_DEBUG_FLAG)) return;

  state.planetIndex = 6; // Sirius: hostile, high-tech world for distinct bombardment visuals.
  state.atmosphere = true;
  state.inOrbit = false;
  state.planetSurrendered = false;
  state.planets[state.planetIndex].surrendered = false;
  state.shipKind = 0;
  state.enemyShips = 0;
  state.speed = Math.max(30, state.speed);
  state.y = 160;
  state.x = 1200;
  state.z = -600;
  state.weaponMode = 'laser';
  state.missileMode = false;
  state.damage.laserPct = 100;
  state.damage.laserOperational = true;
  state.laserOperational = true;
}

function isCockpitDebugFlag(flag: string): boolean {
  if (typeof window === 'undefined') return false;
  const debug = new URLSearchParams(window.location.search).get('debug');
  return debug?.split(',').map(part => part.trim()).includes(flag) ?? false;
}

function drawBombardmentView(
  hires: import('../engine/hires').Hires,
  state: GameState,
  pitchRad: number,
  headingRad: number,
  weaponFiring: boolean,
  bombardmentSourceBitmap: Bitmap | null,
  bombardmentSourceBounds: BitmapBounds | null,
): void {
  const pitchShift = clamp(pitchRad / (Math.PI / 3), -1, 1);
  const sweep = state.x * 0.012 + state.z * 0.009 + headingRad * 9;
  const fieldTop = 10;
  const fieldBottom = 120;
  const fieldLeft = 18;
  const fieldRight = 262;
  const centerX = 140;
  const centerY = 64;
  const crosshairOffsetY = Math.round((0.35 - pitchShift) * 12);
  const crosshairY = clamp(centerY + crosshairOffsetY, fieldTop + 12, fieldBottom - 12);
  const crosshairX = clamp(centerX + Math.round(Math.sin(sweep * 0.33) * 4), fieldLeft + 12, fieldRight - 12);

  hires.hcolor(3);
  for (let x = fieldLeft; x <= fieldRight; x++) {
    if (((x - fieldLeft) % 3) === 0) {
      hires.hplot(x, fieldTop);
      hires.hplot(x, fieldBottom);
    }
  }
  for (let y = fieldTop; y <= fieldBottom; y++) {
    if (((y - fieldTop) % 3) === 0) {
      hires.hplot(fieldLeft, y);
      hires.hplot(fieldRight, y);
    }
  }

  drawApproachPlanetPointCloud(
    hires,
    centerX,
    centerY + 8 + Math.round(pitchShift * 10),
    fieldLeft + 4,
    fieldTop + 4,
    fieldRight - 4,
    fieldBottom - 4,
    state.planetIndex + 1,
    sweep,
  );

  hires.hcolor(5);
  hires.line(crosshairX - 14, crosshairY, crosshairX - 4, crosshairY);
  hires.line(crosshairX + 4, crosshairY, crosshairX + 14, crosshairY);
  hires.line(crosshairX, crosshairY - 14, crosshairX, crosshairY - 4);
  hires.line(crosshairX, crosshairY + 4, crosshairX, crosshairY + 14);
  hires.line(crosshairX - 4, crosshairY - 4, crosshairX + 4, crosshairY - 4);
  hires.line(crosshairX - 4, crosshairY + 4, crosshairX + 4, crosshairY + 4);
  hires.line(crosshairX - 4, crosshairY - 4, crosshairX - 4, crosshairY + 4);
  hires.line(crosshairX + 4, crosshairY - 4, crosshairX + 4, crosshairY + 4);
  hires.line(crosshairX - 2, crosshairY, crosshairX + 2, crosshairY);
  hires.line(crosshairX, crosshairY - 2, crosshairX, crosshairY + 2);

  if (weaponFiring) {
    hires.line(centerX - 26, 123, crosshairX - 5, crosshairY + 6);
    hires.line(centerX + 26, 123, crosshairX + 5, crosshairY + 6);
  }
}

function drawBombardmentSourceBitmap(
  hires: import('../engine/hires').Hires,
  bitmap: Bitmap,
  bounds: BitmapBounds,
  left: number,
  top: number,
  right: number,
  bottom: number,
): void {
  const availableW = right - left + 1;
  const availableH = bottom - top + 1;
  const scale = Math.max(
    1,
    Math.floor(
      Math.min(
        availableW / Math.max(1, bounds.width),
        availableH / Math.max(1, bounds.height),
      ),
    ),
  );
  const drawW = bounds.width * scale;
  const drawH = bounds.height * scale;
  const destX = left + Math.max(0, Math.floor((availableW - drawW) / 2));
  const destY = top + Math.max(0, Math.floor((availableH - drawH) / 2));
  drawBitmap(hires, bitmap, destX, destY, scale, bounds);
}

export function drawApproachPlanetPointCloud(
  hires: import('../engine/hires').Hires,
  cx: number,
  cy: number,
  left: number,
  right: number,
  top: number,
  bottom: number,
  seed: number,
  sweep: number,
): void {
  hires.hcolor(3);
  const width = right - left;
  const height = bottom - top;
  const radius = Math.max(30, Math.floor(Math.min(width, height) * 0.43));
  const rx = radius;
  const ry = radius;
  const yawStep = Math.round(sweep * 0.08);
  const yaw = seed * 0.61 + yawStep * 0.08 + planetRotationTime * 0.2;
  const pitch = -0.34;
  const points = buildProjectedSphereCloud(rx, ry, yaw, pitch, false);

  for (const point of points) {
    const x = cx + point.x;
    const y = cy + point.y;
    if (x < left || x > right || y < top || y > bottom) continue;
    hires.hplot(x, y);
  }
}

function dedupePoints(points: Point2[]): Point2[] {
  const seen = new Set<string>();
  const unique: Point2[] = [];
  for (const point of points) {
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(point);
  }
  return unique;
}

function pseudoNoise(seed: number): number {
  const n = Math.sin(seed * 12.9898) * 43758.5453;
  return n - Math.floor(n);
}

let prevNeedles: PanelNeedles | null = null;

function drawHUD(
  hires: import('../engine/hires').Hires,
  state: GameState,
  pitchRad: number,
  headingRad: number,
  prevHeading: number,
  prevPitch: number,
  dt: number,
  showControls: boolean,
  panelShapes: ShapeTable | null,
) {
  // The panel is INSTRUMENTS', not this file's.
  //
  // The disk draws it once, before the simulator starts, and the simulator only puts the four
  // needles, the eight gauge bars and line 155's five numbers on top of it. What stood here
  // was a second panel written from scratch - seven of INSTRUMENTS' lines instead of its
  // twenty-odd, the three titles in normal video instead of inverse, no X/Y/Z or XHDNG/YHDNG
  // labels, and an invented third row of indicators labelled RADAR and H/DRIVE that the disk
  // has no trace of. Against the disk's own screen it was 2,205 pixels to 3,241.
  //
  // `gauges: false` because the bars come from the game's state below, not from the phase
  // `LAMPS_AT_CAPTURE` froze.
  drawInstruments(hires, { gauges: false });
  drawGaugeBars(hires, gaugeStateFromGame(state), 'store');

  // STARSHIP SIMULATOR lines 159, 170, 173 and 180 - the four needles.
  //
  // What stood here was the port's own reading of this part of the panel: speed and energy
  // as filled bars, and the bank and pitch needles as rate-of-change markers at
  // 140 + dHeading * 8 and 155 + dPitch * 6. The disk drives all four off bytes, not off how
  // fast anything is changing - TX off the bank byte, VY off the pitch byte, SX off
  // PEEK(38157) and EX off PEEK(38199) - and line 159 erases the previous positions with the
  // wider shapes 25 and 26 rather than repainting the whole track.
  if (panelShapes) {
    const needles: PanelNeedles = {
      bank: state.bank,
      pitch: state.pitch,
      speed: Math.max(0, Math.min(120, Math.round(state.speed))),
      energy: Math.round(state.energy),
    };
    if (prevNeedles) erasePanelNeedles(hires, panelShapes, prevNeedles);
    drawPanelNeedles(hires, panelShapes, needles);
    prevNeedles = needles;
  }

  // STARSHIP SIMULATOR line 155, which is all the simulator itself prints on the panel:
  //
  //   VTAB 24: HTAB 1: PRINT INT(X/2);" ";: HTAB 7: PRINT INT(Y/2);" ";: HTAB 13:
  //     PRINT INT(Z/2);" ";: HTAB 26: PRINT INT(H*Q);"  ";: HTAB 35: PRINT INT(P*Q);"  ";
  //
  // Row 24, one row **below** INSTRUMENTS' X, Y, Z, XHDNG and YHDNG labels on row 23. The port
  // printed the numbers on row 23, on top of the labels, which is why the disk's screen has
  // them and the port's did not. INT is a floor, not a round.
  hires.hcolor(3);
  const at = (v: string, col: number) => hires.text(v, col, 24);
  at(`${Math.floor(state.x / 2)} `, 1);
  at(`${Math.floor(state.y / 2)} `, 7);
  at(`${Math.floor(state.z / 2)} `, 13);
  at(`${Math.round((headingRad * 180) / Math.PI)}  `, 26);
  at(`${Math.round((pitchRad * 180) / Math.PI)}  `, 35);

  // Nothing else is printed over the view.
  //
  // What stood here was a status line of the port's own - ENEMY:n and MIS:n across the top,
  // SURRENDERED under them, and a banner for the autopilot and the commander bot. The only
  // thing STARSHIP SIMULATOR prints up there is line 156's crosshair, and the disk's own flight
  // capture shows the star field and that crosshair and nothing besides. All four of those
  // readings are already on the panel or in SHIP STATUS, which is where the game puts them.

  // Controls overlay
  if (showControls) {
    drawControlsOverlay(hires);
  }
  }

function drawControlsOverlay(hires: import('../engine/hires').Hires): void {
  for (let y = 0; y <= 127; y++) hires.line(0, y, 279, y);

  hires.hcolor(3);
  hires.text('--- CONTROLS ---', 12, 1);
  hires.hcolor(1);

  const left: [string, string][] = [
    ['ARROWS', 'PITCH/YAW'],
    ['1 / 2', 'SPEED -/+ 3'],
    ['3 / 4', 'SPEED -/+ 15'],
    ['SPACE', 'FIRE WEAPON'],
    ['W', 'MISSILE/LASER'],
    ['S', 'SHIELDS ON/OFF'],
    ['A', 'AUTOPILOT'],
    ['B', 'CONDITION'],
    ['', 'GRN>BLU>RED'],
  ];
  const right: [string, string][] = [
    ['C', 'COMMAND MODE'],
    ['P', 'BOT / COMMANDER'],
    ['R', 'RADAR'],
    ['H', 'HYPERDRIVE'],
    ['O', 'ORBIT/DESCEND'],
    ['ESC', 'THIS OVERLAY'],
    ['', ''],
    ['', ''],
    ['', ''],
    ['', ''],
  ];

  for (let i = 0; i < left.length; i++) {
    const row = 3 + i;
    hires.hcolor(5);
    hires.text(left[i][0].padEnd(8), 1, row);
    hires.hcolor(1);
    hires.text(left[i][1], 9, row);
    hires.hcolor(5);
    hires.text(right[i][0].padEnd(8), 20, row);
    hires.hcolor(1);
    hires.text(right[i][1], 28, row);
  }

  hires.hcolor(3);
  hires.text('PRESS ESC TO RETURN', 10, 22);
}
