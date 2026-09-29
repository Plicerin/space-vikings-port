import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { damageTick3000 } from '../engine/diskDamage';
import { GameState } from '../engine/gameState';
import {
  Camera, forwardVector, makeStarfield, project, Star, v3, v3add, v3sub,
  pitchByteToRad,
  v3scale, v3len, v3dot, v3normalize, v3cross,
} from '../engine/math3d';
import { ShapeRenderer, decodeShapeTableJson } from '../engine/shapeTable';
import type { ShapeTable } from '../engine/shapeTable';
import { drawPanelNeedles, erasePanelNeedles, setPanelShapes } from './instruments';
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
// Measured from the original DSK: at S=120, Z advances in exact 120-unit
// chunks about every 500 ms, or approximately two STARSHIP SIMULATOR loops/sec.
const BASIC_SIMULATOR_TICK_SECONDS = 0.5;
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

interface EnemyFighter {
  screenX: number; screenY: number;
  vx: number; vy: number;
  shapeIdx: number;
  alive: boolean;
  firing: boolean;
}

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
if (displayShipKind >= 1) {
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
  const fighters: EnemyFighter[] = [];
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
        spawnFighter(118, 48, true);
        spawnFighter(162, 82, true);
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
      const nearPlanet = state.atmosphere
        || (state.x > -3500 && state.x < 4500
          && state.y > -3000 && state.y < 3000
          && state.z > -6000 && state.z < 2000);
      if (!nearPlanet) return;
      if (!state.atmosphere && Math.random() < 0.5 * dt) {
        spawnFighter(enemyScreenX, enemyScreenY, enemyVisible);
      }
      if (Math.random() < 2 * dt) {
        enemyAttack(nearPlanet);
      }
    }

    function updateProjectiles(dt: number, cam: Camera) {
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.x += p.vx * dt * FRAME_DT_SCALE;
        p.y += p.vy * dt * FRAME_DT_SCALE;
        p.z += p.vz * dt * FRAME_DT_SCALE;
        p.age += dt;
        let hitFighter = false;

        if (!state.atmosphere && fighters.length > 0) {
          const pp = project(cam, v3(p.x, p.y, p.z));
          if (pp.visible && pp.y >= 0 && pp.y < 124) {
            for (let j = fighters.length - 1; j >= 0; j--) {
              const f = fighters[j];
              if (Math.abs(pp.x - f.screenX) < 6 && Math.abs(pp.y - f.screenY) < 6) {
                onFighterDestroyed(j);
                fighters.splice(j, 1);
                hitFighter = true;
                break;
              }
            }
          }
        }
        if (hitFighter) {
          projectiles.splice(i, 1);
          continue;
        }

        if (!state.atmosphere && enemy.alive) {
          const dx = p.x - enemy.pos.x;
          const dy = p.y - enemy.pos.y;
          const dz = p.z - enemy.pos.z;
          if (Math.abs(dx) < 150 && Math.abs(dy) < 60 && Math.abs(dz) < 100) {
            onMissileHit(true);
            projectiles.splice(i, 1);
            continue;
          }
        }
        if (p.age > 2) { projectiles.splice(i, 1); }
      }
    }

    function updateLaserBolts(dt: number) {
      for (let i = laserBolts.length - 1; i >= 0; i--) {
        laserBolts[i].age += dt;
        if (laserBolts[i].age > 0.15) laserBolts.splice(i, 1);
      }
    }

    function updateFighters(dt: number) {
      for (let i = fighters.length - 1; i >= 0; i--) {
        const f = fighters[i];
        if (!f.alive) { fighters.splice(i, 1); continue; }
        f.screenX += f.vx * dt * FRAME_DT_SCALE;
        f.screenY += f.vy * dt * FRAME_DT_SCALE;
        if (f.screenY < 10 || f.screenY > 120
            || f.screenX < 10 || f.screenX > 270) {
          fighters.splice(i, 1);
          continue;
        }
        if (state.antiFighterTurrets === 3 && Math.random() < dt * 3) {
          onFighterDestroyed(i);
          fighters.splice(i, 1);
          continue;
        }

        if (Math.random() < dt * 2) {
          f.firing = true;
          const spreadX = (Math.random() - 0.5) * 28;
          const spreadY = (Math.random() - 0.5) * 16;
          laserBolts.push({
            x1: f.screenX, y1: f.screenY,
            x2: 140 + spreadX, y2: 60 + spreadY,
            age: 0.1,
          });
          audio.beep(1200, 30);

          // The original has no per-bolt hit on the player: nothing in STARSHIP SIMULATOR
          // tests whether an enemy's shot reaches you. Damage is the periodic tick at 3000,
          // gated by 38205 or 38210, and ground fire, which 5098 sends into 3205 alone with
          // L = 7 so it can only touch the shields. The flash stays; the invented
          // `shields -= 0.5 + rnd * 2` and `hull -= rnd * 3` are gone.
          const dx = f.screenX - 140;
          const dy = f.screenY - 60;
          if (Math.sqrt(dx * dx + dy * dy) < 50) flashes.push({ timer: 0.08, type: 'hit' });
        } else {
          f.firing = false;
        }
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
          fighters: fighters.map(f => ({ screenX: f.screenX, screenY: f.screenY, shapeIdx: f.shapeIdx })),
          flashes: flashes.map(fl => ({ timer: fl.timer, type: fl.type })),
          surrenderMsgTimer,
          enemyAlive: enemy.alive,
          enemyPos: { x: enemy.pos.x, y: enemy.pos.y, z: enemy.pos.z },
        };
        vectorRenderer.render(state, pitchRad, headingRad, dt, showControls, overlay);
        return;
      }

      hires.hgr();

      if (state.atmosphere) {
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

      renderTargetReticle();
      renderProjectiles(cam);
      renderLaserBolts();
      renderFighters();
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
      const visibleShip = enemy.alive ? enemy.pos : null;
      if (!visibleShip || state.atmosphere) return;
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
        // The model's coordinates on the disk are absolute world coordinates, so it is
        // moved to wherever the enemy currently is and keeps its shape.
        const projection = projectShipWorld(
          enemyBytecodeOps,
          { x: state.x, y: state.y, z: state.z },
          state.heading,
          state.pitch,
          visibleShip,
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

    function renderFighters() {
      // The sprite branch here read ship-N.json, which is not a shape table; the line
      // fallback below is what the port actually has for fighters.

      for (const f of fighters) {
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

      if (!next && state.damage.pendingUpdate && transitionCooldown <= 0) {
        next = 'dmg';
      }
      if (runNextScene()) return;

      const cam = updatePhysics(dt);

      updateTransitions();
      if (runNextScene()) return;

      updateEnemyAI(dt);
      updateProjectiles(dt, cam);
      updateLaserBolts(dt);
      updateFighters(dt);
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
  if (state.missilesRemaining < 2) return;
  glog('fire', `missile missiles=${state.missilesRemaining}`);
  const fwd = forwardVector(pitchRad, headingRad);
      const startPos = v3add(v3(state.x, state.y, state.z), v3scale(fwd, 100));
      projectiles.push({
        x: startPos.x, y: startPos.y, z: startPos.z,
        vx: fwd.x * 160, vy: fwd.y * 160, vz: fwd.z * 160,
        age: 0,
      });
      state.missilesRemaining -= 2;
      state.missilesRemaining = Math.max(0, state.missilesRemaining);
      audio.beep(440, 60);
      if (state.autopilot && !state.atmosphere && enemy.alive) {
        const dist = v3len(v3sub(enemy.pos, v3(state.x, state.y, state.z)));
        if (dist < 1600) onMissileHit(true);
      }
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

      // Hit detection — if enemy is near centre of screen
      let laserDidHit = false;
      if (!state.atmosphere && enemy.alive) {
        const ep = project(
          { pos: v3(state.x, state.y, state.z), pitch: pitchRad, heading: headingRad },
          enemy.pos,
        );
        const dist = v3len(v3sub(enemy.pos, v3(state.x, state.y, state.z)));
        if ((ep.visible && Math.abs(ep.x - 140) < 40 && Math.abs(ep.y - 65) < 30)
          || (state.autopilot && dist < 900)) {
          onLaserHit();
          laserDidHit = true;
        }
      }
      if (!state.atmosphere && (!enemy.alive || !laserDidHit)) {
        for (let i = fighters.length - 1; i >= 0; i--) {
          const f = fighters[i];
          if (Math.abs(f.screenX - 140) < 40 && Math.abs(f.screenY - 65) < 30) {
            onFighterDestroyed(i);
            fighters.splice(i, 1);
            break;
          }
        }
      }

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
  // STARSHIP_SIM:1085-1088, 1200
  if (isHit) {
    glog('hit', `missile shipVit=${state.shipVitality}`);
    flashes.push({ timer: 0.3, type: 'explosion' });
        audio.beep(220, 120);

    const j1 = 10;
    const j2 = 120;
    const te = Math.max(1, state.defenseTech);
    state.planetVitality = Math.min(255, state.planetVitality + j1 / (te + 1));
    if (!state.atmosphere) {
      state.shipVitality = Math.min(255, state.shipVitality + j2 / (te + 1));
        }

        if (state.planetVitality >= state.planetVitalityLimit && state.planetVitalityLimit > 0 && !state.planetSurrendered) {
          surrenderMsgTimer = 3;
          markPlanetConquered(state);
        }

        // Check ship destruction
        if (state.shipVitality > state.shipDestructionLimit
            && state.shipKind !== 0 && !destructionPending) {
          destructionPending = true;
          next = 'ex';
        }
      } else {
        // Miss — brief sparkle (STARSHIP_SIM:1100)
        flashes.push({ timer: 0.15, type: 'hit' });
        audio.beep(660, 40);
      }
    }

function onLaserHit() {
  // Laser hit on enemy ship — STARSHIP_SIM:1535-1560
  glog('hit', `laser shipVit=${state.shipVitality}`);
  flashes.push({ timer: 0.2, type: 'explosion' });
  audio.beep(180, 100);

  const j1 = 10;
  const j2 = state.commanderMode ? 30 : 1;
  const te = Math.max(1, state.defenseTech);
  state.planetVitality = Math.min(255, state.planetVitality + j1 / (te + 1));
  if (!state.atmosphere) {
    state.shipVitality = Math.min(255, state.shipVitality + j2 / (te + 1));
  }

  if (state.planetVitality >= state.planetVitalityLimit && state.planetVitalityLimit > 0 && !state.planetSurrendered) {
    glog('surrender', `planetVit=${state.planetVitality}`);
    surrenderMsgTimer = 3;
    markPlanetConquered(state);
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

    function spawnFighter(originX: number, originY: number, originValid: boolean) {
      // STARSHIP_SIM:5000-5096
      const useOrigin = originValid && Number.isFinite(originX) && Number.isFinite(originY);
      let screenX = Math.random() * 260 + 10;
      let screenY: number;
      let vy: number;
      if (useOrigin) {
        screenX = originX + (Math.random() - 0.5) * 100;
        screenY = Math.random() >= 0.4 ? originY - 50 + Math.random() * 20 : originY + 50 - Math.random() * 20;
        screenX = clamp(screenX, 12, 268);
        screenY = clamp(screenY, 12, 118);
        vy = 3 + Math.random() * 4;
      } else {
        if (Math.random() >= 0.4) {
          screenY = 10;
          vy = Math.random() * 7;
        } else {
          screenY = 120;
          vy = -(Math.random() * 7);
        }
      }

      let vx: number;
      let shapeIdx: number;
      if (screenX > 190) { vx = -7; shapeIdx = 9; }
      else if (screenX < 91) { vx = 7; shapeIdx = 10; }
      else { vx = -2; shapeIdx = 8; if (Math.abs(vy) < 4) vy *= 2; }

      fighters.push({
        screenX, screenY, vx, vy,
        shapeIdx,
        alive: true,
        firing: false,
      });
    }

    function onFighterDestroyed(idx: number) {
      // STARSHIP_SIM:5250
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
  hires.hcolor(1);
  hires.line(123, 145, 1, 145);
  hires.line(1, 145, 1, 128);
  hires.line(1, 128, 279, 128);
  hires.line(279, 128, 279, 145);
  hires.line(279, 145, 157, 145);
  hires.line(123, 128, 123, 183);
  hires.line(157, 128, 157, 183);

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

  const pill = (px: number, py: number, on: boolean, color: number): void => {
    if (on) {
      hires.hcolor(color);
      for (let yy = py; yy <= py + 5; yy++) hires.line(px, yy, px + 11, yy);
    } else {
      hires.hcolor(3);
      hires.line(px, py, px + 11, py);
      hires.line(px + 11, py, px + 11, py + 5);
      hires.line(px + 11, py + 5, px, py + 5);
      hires.line(px, py + 5, px, py);
    }
  };

  pill(6, 152, !state.autopilot, 1);
  pill(71, 152, state.autopilot, 1);
  pill(6, 160, state.weaponMode === 'missile', 1);
  pill(71, 160, state.weaponMode === 'laser', 1);
  pill(200, 152, state.inOrbit, 1);
  const condColor = state.condition === 'green' ? 1
    : state.condition === 'blue' ? 6 : 5;
  pill(261, 152, state.damage.hullPct < 100, 5);
  pill(200, 160, true, condColor);
  pill(261, 160, state.shieldsOn, 1);
pill(6, 168, state.damage.radarPct > 0, 1);
pill(71, 168, state.damage.hyperdrivePct > 0, 1);

  hires.hcolor(1);
  hires.text(' SPEED ', 4, 18);
  hires.text('TURN', 19, 18);
  hires.text(' ENERGY ', 30, 18);
hires.text('MANUAL', 4, 20);
hires.text('AUTO', 13, 20);
hires.text('ORBIT', 24, 20);
hires.text('DAMAGE', 32, 20);
hires.text('MISSILE', 4, 21);
hires.text('LASER', 13, 21);
hires.text('COND', 24, 21);
hires.text('SHIELD', 32, 21);
hires.text('RADAR', 4, 22);
hires.text('H/DRIVE', 13, 22);

  hires.hcolor(3);
  const fmt = (n: number) => Math.round(n / 2).toString().padEnd(6);
  hires.text(fmt(state.x), 1, 23);
  hires.text(fmt(state.y), 7, 23);
  hires.text(fmt(state.z), 13, 23);
  const hd = ((headingRad * 180) / Math.PI).toFixed(0).padEnd(4);
  const pd = ((pitchRad * 180) / Math.PI).toFixed(0).padEnd(4);
  hires.text(hd, 25, 23);
  hires.text(pd, 34, 23);

  // Combat info line
  if (state.commanderMode) {
    hires.hcolor(5);
    hires.text('BOT ACTIVE - PRESS P TO DISABLE', 5, 1);
  } else if (state.autopilot) {
    hires.hcolor(5);
    hires.text('AUTOPILOT ACTIVE - PRESS A TO DISABLE', 1, 1);
  } else if (state.enemyShips > 0 && !state.atmosphere) {
    hires.hcolor(5);
    hires.text(`ENEMY:${state.enemyShips}`, 1, 1);
  }
  if (state.planetSurrendered) {
    hires.hcolor(1);
    hires.text('SURRENDERED', 1, 2);
  }
    if (state.missilesRemaining > 0) {
      hires.hcolor(1);
      hires.text(`MIS:${state.missilesRemaining}`, 30, 1);
    }

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
