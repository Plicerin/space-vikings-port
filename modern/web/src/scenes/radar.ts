import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { log as glog } from '../engine/gameLog';
import { parseShipBytecode, projectShipWorld, drawShipWorld } from '../engine/shipBytecode';
import type { ShipBytecodeOp } from '../engine/shipBytecode';

/**
 * RADAR, from RADAR.bas.
 *
 * Reached from COM by 3 - COM line 133's `IF COM = 3 THEN POKE 38388,2: PRINT "RUN RADAR"`.
 *
 * This is the first program that borrows the flight renderer instead of drawing everything
 * itself. Line 2000 saves the pitch, forces it to 63, moves the ship to Y = 20000 and levels
 * the bank; line 2005 CALLs 24576 - $6000, the renderer - and then draws a reticle over what
 * comes back. Line 2045 puts pitch and bank back and 2055 restores Y, so nothing about the
 * flight state survives it. The view is the world from far overhead.
 *
 *     2000 P(1) = PEEK(P1): POKE P1,63:BV% = 20000: GOSUB 6000: POKE YI,LO%: POKE YI + 1,HI%
 *          B(1) = PEEK(B1): POKE B1,0
 *     2005 ... CALL 24576: CALL 37936 ...
 *
 * Line 10 skips the lot when the radar is out: `IF PEEK(38195) = 0 THEN 2058`.
 */

/** Line 2000's borrowed camera. X, Z and the heading are whatever flight left. */
export const RADAR_Y = 20000;
export const RADAR_PITCH = 63;

export interface RadarCamera {
  camera: { x: number; y: number; z: number };
  heading: number;
  pitch: number;
}

export function radarCamera(state: import('../engine/gameState').GameState): RadarCamera {
  return {
    camera: { x: state.x, y: RADAR_Y, z: state.z },
    heading: state.heading,
    pitch: RADAR_PITCH,
  };
}

type H = import('../engine/hires').Hires;

/**
 * Lines 2005, 2032, 2033, 2040 and 2042 - the reticle, exactly as the original plots it.
 *
 * Everything is HCOLOR 2 except the little centre box and its dot, which line 2042 draws in
 * HCOLOR 1. Two pieces the port used to be missing: line 2032's second right-hand edge at
 * x 277, and the single `HPLOT 141,63` that puts a dot inside the box.
 */
export function drawRadarOverlay(hires: H): void {
  // 2005
  hires.hcolor(2);
  hires.line(0, 0, 0, 123);
  hires.line(0, 123, 278, 123);
  hires.line(278, 123, 278, 0);
  hires.line(278, 0, 0, 0);
  // 2032
  hires.line(277, 0, 277, 123);
  // 2033
  hires.line(1, 0, 131, 59);
  hires.line(279, 0, 151, 59);
  hires.line(151, 67, 279, 123);
  hires.line(1, 123, 131, 67);
  // 2040
  hires.line(140, 1, 140, 55);
  hires.line(140, 71, 140, 123);
  hires.line(1, 63, 131, 63);
  hires.line(151, 63, 279, 63);
  // 2042
  hires.hcolor(1);
  hires.line(137, 60, 137, 66);
  hires.line(137, 66, 145, 66);
  hires.line(145, 66, 145, 60);
  hires.line(145, 60, 137, 60);
  hires.hplot(141, 63);
}

/** The whole screen: what CALL 24576 draws from the borrowed camera, then the reticle. */
export function drawRadarScreen(hires: H, ops: ShipBytecodeOp[] | null, cam: RadarCamera): void {
  if (ops) {
    hires.hcolor(3);
    drawShipWorld(hires, projectShipWorld(ops, cam.camera, cam.heading, cam.pitch, null));
  }
  drawRadarOverlay(hires);
}

export async function radarScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input, loader } = ctx;

  // Line 10.
  if (state.damage.radarPct === 0) {
    glog('radar', 'radar out');
    return scenes.run('com');
  }

  let ops: ShipBytecodeOp[] | null = null;
  try {
    const json = await loader.json<{ bytes: number[] }>(
      state.atmosphere
        ? `data/shapes/planet-${state.planetIndex + 1}-ground.json`
        : 'data/shapes/starfield-bytecode.json',
    );
    ops = parseShipBytecode(json.bytes);
  } catch {
    /* no table: the reticle still draws, with nothing behind it */
  }

  hires.hgr();
  drawRadarScreen(hires, ops, radarCamera(state));

  // 2050, then 2056: X goes back, anything else identifies the contact.
  const k = await input.waitForKey();
  const ch = String.fromCharCode(k & 0x7f).toUpperCase();
  if (ch === 'X') {
    glog('radar', 'return');
    return scenes.run('com');
  }
  glog('radar', 'ship id');
  return scenes.run('com');
}
