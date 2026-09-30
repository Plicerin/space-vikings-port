import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';
import { SHIP_ID_PROGRAMS } from './shipIdData';

// RADAR 2056 `IF A$ <> "X" THEN 5000` reaches this on any key but X, and 5005 runs
// `SHIP # n I.D.` for the ship at 38205. It draws from its own coordinate list rather than
// through the renderer at $6000 - measured, not assumed: `oracle/probe_objectscale.mjs` watched
// the screen load and run and counted zero instructions executed anywhere in $6000-$6FFF.

/**
 * SHIP # 0, 1, 3 and 4 I.D. - four near-identical programs.
 *
 * RADAR line 2056 sends any key but X to line 5000, and 5005 is
 * `J = PEEK(38205): POKE 38151,5: PRINT "RUN SHIP # ";J;" I.D."`, so the ship-kind byte picks
 * the program. Line 5002 maps kind 2 to SHIP # 3.
 *
 * Each draws a dotted grid, then one or two wireframe views from its own DATA, then a
 * description down the right. The window is set by the program itself -
 * `POKE 32,0: POKE 33,40: POKE 34,0: POKE 35,16` - so the sixteen rows of forty spaces blank
 * columns 0-39 outright, the left-margin-0 case. `$3CD` is 0 and `$E4` reads 127 for
 * HCOLOR 3 by the time the drawing is done.
 */

/** Line 12's frame and lines 13-14's grid, all in HCOLOR 1. */
export function drawShipIdGrid(hires: import('../engine/hires').Hires): void {
  hires.hcolor(1);
  hires.line(1, 1, 161, 1);
  hires.line(161, 1, 161, 123);
  hires.line(161, 123, 1, 123);
  hires.line(1, 123, 1, 1);
  for (let j = 7; j <= 161; j += 5) hires.line(j, 1, j, 123);
  for (let j = 5; j <= 123; j += 5) hires.line(1, j, 161, j);
}

/**
 * The drawing loop at 1000-1050, shared by all four:
 *
 *     1020 X = X1 - (X * 2): Y = Y1 - (Y * 2)
 *     1030 IF C = 1 THEN HPLOT X,Y
 *     1040 IF C = 2 THEN HPLOT TO X,Y
 *
 * `X1` is 80 throughout; `Y1` starts at 40 and line 1003 moves it down for the second view.
 * HPLOT truncates, and every coordinate these tables produce is a whole number because the
 * fractions are all halves and they are doubled.
 */
export function drawShipIdWireframe(
  hires: import('../engine/hires').Hires,
  program: { data: number[]; secondY: number | null },
): void {
  hires.hcolor(3);
  const x1 = 80;
  let y1 = 40;
  let penX = 0;
  let penY = 0;
  let i = 0;
  while (i < program.data.length) {
    const c = program.data[i++];
    if (c === 77) { y1 = program.secondY ?? y1; continue; }
    if (c === 127) break;
    const dx = program.data[i++];
    const dy = program.data[i++];
    const x = Math.trunc(x1 - dx * 2);
    const y = Math.trunc(y1 - dy * 2);
    if (c === 1) { hires.hplot(x, y); }
    else if (c === 2) { hires.line(penX, penY, x, y); }
    penX = x;
    penY = y;
  }
}

/** Line 1060's description, down the right-hand side at HTAB 25. */
export function drawShipIdText(
  hires: import('../engine/hires').Hires,
  text: Array<[number, number, string]>,
): void {
  hires.hcolor(3);
  for (const [row, col, s] of text) hires.text(s, col + 1, row + 1);
}

/** Lines 10-14 and 1000-1060 together. */
export function drawShipId(hires: import('../engine/hires').Hires, kind: number): void {
  const program = SHIP_ID_PROGRAMS[kind] ?? SHIP_ID_PROGRAMS[0];
  // 10/11: sixteen rows of forty spaces from column 0.
  hires.hcolor(1);
  for (let r = 1; r <= 16; r++) hires.text(' '.repeat(40), 1, r);
  drawShipIdGrid(hires);
  if (program.data.length) drawShipIdWireframe(hires, program);
  drawShipIdText(hires, program.text);
}

export async function shipIdScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input } = ctx;
  setScene('shipId');

  // RADAR line 5002 sends kind 2 to SHIP # 3.
  const raw = state.shipKind as number;
  const kind = raw === 2 ? 3 : raw;
  drawShipId(hires, kind);
  glog('shipId', `ship # ${kind}`);

  // 1070's GET, then RUN RADAR.
  await input.waitForKey();
  return scenes.run('radar');
}
