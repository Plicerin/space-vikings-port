import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { log as glog } from '../engine/gameLog';
import { getPanelShapes, drawInstruments, drawGaugeBars, gaugeStateFromGame,
  drawPanelNeedles } from './instruments';
import { eraseComNeedleTracks } from './com';
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

  // No hgr(). 2005 is `CALL 24576: CALL 37936`, and between them they clear the view and put
  // the **whole instrument panel back** - which is not obvious from the listing and is plain in
  // the capture: the radar screen has the three needles at their flight positions, SX 73 from
  // `13 + S/2`, TX 140 and EX 262 from `199 + E`, even though COM line 8 swept two of those
  // tracks on the way in, and its gauge bars are in $9602's store form rather than the one
  // GALAXY MAP's 5500 plots. Nothing in RADAR touches rows 124-191 afterwards.
  hires.hcolor(0);
  for (let y = 0; y <= 123; y++) hires.hlin(0, 279, y);
  const panelShapes = getPanelShapes();
  drawInstruments(hires, { gauges: false });
  drawGaugeBars(hires, gaugeStateFromGame(state), 'store');
  if (panelShapes) {
    drawPanelNeedles(hires, panelShapes, {
      bank: state.bank,
      pitch: state.pitch,
      speed: Math.max(0, Math.min(120, Math.round(state.speed))),
      energy: Math.round(state.energy),
    });
  }
  drawRadarScreen(hires, ops, radarCamera(state));
  // 2010: `VTAB 24: HTAB 1: PRINT <18 spaces>;: HTAB 26: PRINT <13 spaces>;` - the same two
  // blanks RE and ORBIT make, over line 155's readouts.
  hires.hcolor(0);
  hires.text(' '.repeat(18), 1, 24);
  hires.text(' '.repeat(13), 26, 24);

  // 2050, then 2056: `IF A$ <> "X" THEN 5000`, and 5005 runs the ship's own I.D. program.
  const k = await input.waitForKey();
  const ch = String.fromCharCode(k & 0x7f).toUpperCase();
  if (ch !== 'X') {
    glog('radar', 'ship id');
    return scenes.run('shipId');
  }

  // 2057, on the X path only: the needle-track erase.
  if (panelShapes) eraseComNeedleTracks(hires, panelShapes);

  // 2058 and 2059: back to COM only if COM sent us here, otherwise to flight.
  if (state.radarFromCom) {
    state.radarFromCom = false;
    glog('radar', 'return to com');
    return scenes.run('com');
  }
  glog('radar', 'return to flight');
  return scenes.run('starshipSimulator');
}
