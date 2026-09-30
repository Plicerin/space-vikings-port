import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';
import { ShapeRenderer, decodeShapeTableJson } from '../engine/shapeTable';
import type { ShapeTable } from '../engine/shapeTable';

/**
 * GALAXY MAP, from GALAXY MAP.bas lines 3000-3320.
 *
 * Reached from COM by 1 for CENTRAL COMPUTER then 3 - COM line 265's
 * `IF C = 3 THEN GOSUB 3000`, and COM 3000 is `PRINT " ": PRINT "RUN GALAXY MAP"`.
 *
 * The three coordinate tables are one block read three ways (line 3020):
 *
 *     M = 38366
 *     X(P) = PEEK(M + P)   Y(P) = PEEK((M + P) - 21)   Z(P) = PEEK((M + P) - 42)
 *
 * which is the same `M` the hyperdrive cost uses, and the reason that cost only sees X.
 */

/** Lines 15100-15130. COM's spelling; STATUS line 10000 has 16 as GROOMBRIDGE 1618. */
const STAR_NAMES = [
  'SOL', 'ALPHA CENTAURI', "BARNARD'S STAR", 'WOLF 359', 'LUYTEN',
  'LALANDE 21185', 'SIRIUS', 'VARCAR', 'XANADON', 'EPSILON ERIDANA',
  'CYGNI', 'PROCYON', 'TAU CETI', 'LACAILLE 9352', 'LARSEN-C',
  'GROOMBRIDGE 168', 'KRUGER 60', 'EPSILON INDI', 'ARGO', 'SHIVANDA',
];

export interface GalaxyStar {
  /** PEEK(38366 + P), PEEK(38345 + P), PEEK(38324 + P). */
  x: number;
  y: number;
  z: number;
  /** PEEK(38219 + P). Line 3066 tests it against 1 exactly - see the note below. */
  secured: number;
}

export interface GalaxyMapData {
  /** Twenty stars, P = 1..20 in order. */
  stars: GalaxyStar[];
  /** PEEK(38209), 1-based - the one line 3075 boxes. */
  here: number;
}

/** Lines 3030-3050: which shape a star gets, by its Z. BASIC shape numbers. */
export function starShape(z: number): number {
  if (z < 12) return 6;
  if (z > 11 && z < 16) return 5;
  return 1;
}

/** Lines 3060 and 3065. */
export function starPosition(s: GalaxyStar): { x: number; y: number } {
  return { x: s.x * 10 - 35, y: s.y * 5 };
}

type H = import('../engine/hires').Hires;

/**
 * Lines 3010-3100, in order. Pure, so oracle/galaxymap_parity.mjs can diff it against the
 * original's page.
 *
 * The cursor is not part of this. Line 3120 XDRAWs shape 12 at the paddle position and line
 * 3200 XDRAWs it away again, so it toggles forever - drawGalaxyCursor does that separately.
 */
export function drawGalaxyMap(hires: H, shapes: ShapeTable, d: GalaxyMapData): void {
  // Line 3000, which listed as `PRINT ""` until control characters were made visible and is
  // really `PRINT "^L"` - a form feed. The generator's form feed fills 8192 bytes from the base
  // of the page with $00, or with $FF when 973 is 255, and it ignores the text window the same
  // line sets. Measured entering the map: 973 is 0 and 974 is 32, so the whole of page 1 goes
  // black, which is what hgr() does. See oracle/probe_galaxyclear.mjs.
  hires.hgr();

  // 3010
  hires.hcolor(1);
  hires.line(1, 1, 1, 190);
  hires.line(1, 190, 279, 190);
  hires.line(279, 190, 279, 1);
  hires.line(279, 1, 1, 1);

  const r = new ShapeRenderer(hires);
  r.rot = 0;
  r.scale = 1;

  // 3025-3080
  for (let p = 1; p <= 20; p++) {
    const s = d.stars[p - 1];
    if (!s) continue;
    hires.hcolor(3);
    const { x, y } = starPosition(s);
    // 3066. The test is `= 1`, not "non-zero": SOL's byte reads 100 on a fresh disk, so it
    // is drawn white like any other star and only the box at 3075 marks it.
    if (s.secured === 1) hires.hcolor(2);
    r.draw(shapes, starShape(s.z) - 1, x, y);
    // 3075
    if (p === d.here) {
      hires.hcolor(2);
      hires.line(x - 5, y + 5, x + 5, y + 5);
      hires.line(x + 5, y + 5, x + 5, y - 5);
      hires.line(x + 5, y - 5, x - 5, y - 5);
      hires.line(x - 5, y - 5, x - 5, y + 5);
    }
  }

  // 3090. Nothing changes HCOLOR after this, so line 3100's text is orange too.
  hires.hcolor(5);
  hires.line(1, 150, 279, 150);

  // 3100. The window is rows 19-23 (POKE 34,19 / POKE 35,23) and VTAB 20 puts the cursor on
  // row 19; HTAB is absolute, so HTAB 15 and HTAB 8 are 0-based columns 14 and 7.
  hires.text('GALAXY MAP', 15, 20);
  hires.text('--PRESS SPACE TO RETURN--', 8, 21);
}

/**
 * Line 3120's XDRAW 12. Over the map's black background that is a plain draw.
 *
 * PX is a float - line 3110 is `PX = PDL(0) * 1.19` - and Applesoft truncates the AT
 * coordinates to integers before drawing. Passing the float through and letting each plotted
 * pixel round put the whole cursor one column right at PX = 148.75.
 */
export function drawGalaxyCursor(hires: H, shapes: ShapeTable, px: number, py: number): void {
  const r = new ShapeRenderer(hires);
  r.rot = 0;
  r.scale = 1;
  hires.hcolor(3);
  r.draw(shapes, 11, Math.trunc(px), Math.trunc(py));
}

/** Lines 3115-3117, the clamps on the paddle reading. */
export function clampCursor(px: number, py: number): { px: number; py: number } {
  let x = px;
  let y = py;
  if (y > 145) y = 145;
  if (x < 10) x = 10;
  if (x > 270) x = 270;
  if (y < 10) y = 10;
  return { px: x, py: y };
}

/**
 * Lines 3215-3240: which star, if any, the cursor is over. 0 for none.
 *
 * Line 3215 adds 35 back to PX before testing, undoing the shift line 3065 applied when
 * drawing. The Y test is asymmetric - `<= Y(P)` and `>= Y(P) - 1` - so it catches the star's
 * own row and the one above, while X is plus or minus 1.
 */
export function starUnderCursor(stars: GalaxyStar[], px: number, py: number): number {
  const x = Math.floor((px + 35) / 10);
  const y = Math.floor(py / 5);
  for (let p = 1; p <= 20; p++) {
    const s = stars[p - 1];
    if (!s) continue;
    if (x <= s.x + 1 && x >= s.x - 1 && y <= s.y && y >= s.y - 1) return p;
  }
  return 0;
}

/** Lines 3300-3320. Unlike the hyperdrive's D1, this one really does use all three axes. */
export function lightYears(stars: GalaxyStar[], from: number, to: number): number {
  const a = stars[from - 1];
  const b = stars[to - 1];
  if (!a || !b) return 0;
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const dz = Math.abs(a.z - b.z);
  return Math.floor(Math.sqrt(dx * dx + dy * dy + dz * dz));
}

export function galaxyMapDataFrom(state: import('../engine/gameState').GameState): GalaxyMapData {
  return {
    stars: state.planets.map((p) => ({
      x: p.x,
      y: p.y,
      z: p.z,
      // The port keeps this as a boolean; the disk's byte is not one - SOL's reads 100, and
      // line 3066 only colours a star when it is exactly 1.
      secured: p.surrendered ? 1 : 0,
    })),
    here: state.planetIndex + 1,
  };
}

export async function galaxyMapScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input, loader } = ctx;
  setScene('galaxyMap');

  let shapes: ShapeTable | null = null;
  try {
    shapes = decodeShapeTableJson(await loader.json('data/shapes/shape-table.json'));
  } catch {
    /* without the table there are no stars to draw */
  }
  if (!shapes) return scenes.run('com');

  const d = galaxyMapDataFrom(state);
  let px = 140;
  let py = 75;

  for (;;) {
    drawGalaxyMap(hires, shapes, d);
    drawGalaxyCursor(hires, shapes, px, py);
    const k = await input.waitForKey();
    const ch = String.fromCharCode(k & 0x7f).toUpperCase();

    if (ch === ' ') {
      glog('galaxyMap', 'return');
      return scenes.run('com');
    }

    if (ch === 'I') py -= 5;
    else if (ch === 'M') py += 5;
    else if (ch === 'J') px -= 5;
    else if (ch === 'K') px += 5;
    else if (k === 13) {
      const p = starUnderCursor(d.stars, px, py);
      hires.hcolor(5);
      if (p === 0) {
        // 3240
        hires.text('THERE IS NO STAR SYSTEM THERE, SIR.', 2, 22);
        await new Promise((res) => setTimeout(res, 1200));
        continue;
      }
      const s = d.stars[p - 1];
      // 3250, 3320
      hires.text(`STAR SYSTEM : ${STAR_NAMES[p - 1]}`, 2, 22);
      hires.text(`LOC. : ${s.x} ${s.y} ${s.z} : DISTANCE = ${lightYears(d.stars, d.here, p)} L/Y`, 2, 23);
      // 3260
      hires.text('DO YOU WISH FURTHER INFORMATION?', 2, 24);
      const a = await input.waitForKey();
      if (String.fromCharCode(a & 0x7f).toUpperCase() === 'Y') {
        state.commanderMapTarget = p - 1;
        glog('galaxyMap', `info on ${STAR_NAMES[p - 1]}`);
        return scenes.run('com');
      }
      continue;
    }
    ({ px, py } = clampCursor(px, py));
  }
}
