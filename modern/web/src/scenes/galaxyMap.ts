import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { drawInstruments, drawGaugeBars, gaugeStateFromGame } from './instruments';
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
 * Line 3120's XDRAW 12, and 3200 XDRAWs it away again.
 *
 * This used to be a plain draw, on the reasoning that the map's background is black. It is
 * black at the paddles' resting position - the thirteen cursor pixels land on nothing there,
 * which is why the existing capture could never tell a DRAW from an XDRAW - but the cursor
 * roams x 10-270 and y 10-145, which is where the stars are. Driven onto one
 * (`oracle/probe_galaxycursor.mjs`): **11 pixels on and 2 off**, and a DRAW cannot turn a
 * pixel off.
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
  r.xdraw(shapes, 11, Math.trunc(px), Math.trunc(py));
}

/**
 * Line 3210, which is **not** an XDRAW: `HCOLOR= 0: DRAW 12 AT PX,PY`.
 *
 * 3130 jumps here with the cursor still on the screen, and painting it black forces those
 * pixels dark rather than restoring what was under them. So selecting a star leaves a small
 * cursor-shaped hole wherever it overlapped the map - measured against the clean map: 0 pixels
 * on, **2 off**, and they stay gone until 3270's `GOTO 3000` redraws the whole thing.
 */
export function eraseGalaxyCursor3210(hires: H, shapes: ShapeTable, px: number, py: number): void {
  const r = new ShapeRenderer(hires);
  r.rot = 0;
  r.scale = 1;
  hires.hcolor(0);
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

/**
 * Lines 3240, 3250, 3255 and 3260 - what a pick puts in the text band.
 *
 * Where these land is decided by 3000 and 3100. 3000 sets the window to rows 19-23 with
 * `POKE 34,19: POKE 35,23` and leaves the cursor on row 19; 3100's two PRINTs take rows 19 and
 * 20 and leave it on row 21. So a miss prints on row 21, and a hit's `VTAB 21` goes back **up**
 * to row 20, over "--PRESS SPACE TO RETURN--", which its 39 spaces blank first.
 *
 * 3250 ends `LOC. : ";X(P);" ";Y(P);" ";Z(P);` with a semicolon, so 3320's
 * `" : DISTANCE = "; INT(D1);" L/Y"` continues the same row.
 */
export function drawStarPickMiss(hires: H): void {
  hires.hcolor(5);
  hires.text('THERE IS NO STAR SYSTEM THERE, SIR.', 2, 22);
}

/** 3240's own `VTAB 22: PRINT <38 spaces>` after the pause. */
export function clearStarPickMiss(hires: H): void {
  hires.hcolor(0);
  hires.text(' '.repeat(38), 2, 22);
}

export function drawStarPick(hires: H, d: GalaxyMapData, p: number): void {
  const s = d.stars[p - 1];
  hires.hcolor(0);
  hires.text(' '.repeat(38), 2, 21);
  hires.hcolor(5);
  hires.text(`STAR SYSTEM : ${STAR_NAMES[p - 1]}`, 2, 21);
  hires.text(`LOC. : ${s.x} ${s.y} ${s.z} : DISTANCE = ${lightYears(d.stars, d.here, p)} L/Y`, 2, 22);
  // 3260
  hires.text('DO YOU WISH FURTHER INFORMATION?', 2, 23);
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

  // Line 2: `IF PEEK(38391) = 77 THEN POKE 38391,0: GOSUB 5000: POKE -16300,0: RUN STARSHIP
  // SIMULATOR`. The saved-game sentinel is tested before line 5 draws anything, so on that path
  // the map never appears at all - it paints the eight gauge bars and goes straight to flight.
  // Measured: END's `2) CONTINUE PRESENT GAME` runs GALAXY MAP and comes out in the simulator
  // without the map ever showing (oracle/probe_endmenu.mjs).
  //
  // Line 1 is the same test with 38388 also at 7, which goes to COM instead; that is the path
  // out of the map's own key handler below, and it is taken there rather than here.
  if (state.savedGameSentinel === 77) {
    state.savedGameSentinel = 0;
    drawGaugeBars(hires, gaugeStateFromGame(state), 'plot');   // GOSUB 5000
    glog('galaxyMap', 'saved-game sentinel: straight to flight');
    return scenes.run('starshipSimulator');
  }

  const d = galaxyMapDataFrom(state);
  let px = 140;
  let py = 75;

  // The map is drawn once and the cursor is toggled over it, the way 3000-3100 and then
  // 3110-3200 do it. Redrawing the map on every pass - which is what this used to do - hides
  // both of the cursor's effects: the star pixels it inverts while it sits on one, and the hole
  // 3210 leaves when a star is picked. 3270's `GOTO 3000` is the only thing that repaints.
  for (;;) {
    drawGalaxyMap(hires, shapes, d);

    for (;;) {
      drawGalaxyCursor(hires, shapes, px, py);           // 3120
      const k = await input.waitForKey();
      const ch = String.fromCharCode(k & 0x7f).toUpperCase();

      if (ch === ' ') {
        // 3125 is `IF PEEK(-16384) > 127 THEN POKE 38391,77: POKE 38388,7: RUN INSTRUMENTS`,
        // so a key press does not go to COM: it runs INSTRUMENTS, which repaints the panel;
        // 210 finds 38391 at 77 and falls through to 220's `RUN GALAXY MAP`; and line 1 finds
        // 38391 = 77 with 38388 = 7 and runs COM. Three programs, and the middle one redraws
        // the bottom of the screen.
        //
        // Measured on the machine (oracle/probe_comband.mjs): the map's caption band is 703
        // lit pixels in rows 152-191 and COM shows 1808 there with only 203 in common, so the
        // panel really is painted over it. Going straight to COM left the map's "PRESS SPACE
        // TO RETURN" sitting under COM's menu, which is what playing it showed.
        //
        // INSTRUMENTS line 210 is `IF PEEK(38391) <> 77 THEN POKE 38189,10: CALL 38402: ...`
        // and this is the path that arrives with 38391 = 77, so it draws the gauge boxes and
        // never calls $9602. What fills them is GALAXY MAP's own line 1: `GOSUB 5000`, whose
        // 5500 plots each bar as a line instead of storing two byte columns - which is why the
        // boxes' vertical edges at x 17, 71, 82 and 272 are still there on this screen and are
        // not on the one COM shows coming from flight.
        glog('galaxyMap', 'return');
        hires.hgr();
        drawInstruments(hires, { gauges: false });
        drawGaugeBars(hires, gaugeStateFromGame(state), 'plot');
        // GALAXY MAP leaves the text window at rows 19 to 23 - the band its caption uses - and
        // COM line 20's fourteen blanks land there rather than at the top of the screen.
        state.textWindow = { top: 19, bottom: 23 };
        return scenes.run('com');
      }

      if (ch === 'I' || ch === 'M' || ch === 'J' || ch === 'K') {
        drawGalaxyCursor(hires, shapes, px, py);         // 3200, the same XDRAW taking it off
        if (ch === 'I') py -= 5;
        else if (ch === 'M') py += 5;
        else if (ch === 'J') px -= 5;
        else px += 5;
        const c = clampCursor(px, py);
        px = c.px;
        py = c.py;
        continue;
      }

      if (k === 13) {
        eraseGalaxyCursor3210(hires, shapes, px, py);   // 3210
        const p = starUnderCursor(d.stars, px, py);
        hires.hcolor(5);
        // Where these land is decided by 3000 and 3100. 3000 sets the window to rows 19-23
        // with `POKE 34,19: POKE 35,23` and leaves the cursor on row 19; 3100's two PRINTs use
        // rows 19 and 20 and leave it on row 21. So a miss prints on row 21, and a hit's
        // `VTAB 21` goes back up to row 20 - **over "--PRESS SPACE TO RETURN--"**, which it
        // blanks first with 39 spaces.
        if (p === 0) {
          drawStarPickMiss(hires);
          await new Promise((res) => setTimeout(res, 1200));
          clearStarPickMiss(hires);
          continue;
        }
        drawStarPick(hires, d, p);
        const a = await input.waitForKey();
        if (String.fromCharCode(a & 0x7f).toUpperCase() === 'Y') {
          state.commanderMapTarget = p - 1;
          glog('galaxyMap', `info on ${STAR_NAMES[p - 1]}`);
          return scenes.run('com');
        }
        // 3270: `VTAB 21: PRINT ...: GOTO 3000` - answering anything but Y repaints the whole
        // map, which is what takes 3210's hole away again.
        break;
      }
    }
  }
}
