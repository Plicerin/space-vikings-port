import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { ShapeRenderer, shapePixels } from '../engine/shapeTable';
import { setScene, log as glog } from '../engine/gameLog';

/**
 * The cockpit panel, exactly INSTRUMENTS.bas lines 10-200.
 *
 * Exported because it is a pure draw with no state and no RNG, which makes it the one
 * screen that can be compared against the original pixel for pixel. oracle/frame_parity.mjs
 * calls it on a fresh Hires and diffs the result against the disk's hi-res page.
 */
const INVERSE = { invert: true } as const;


/**
 * The panel lamps - CALL 38402 ($9602), which INSTRUMENTS line 210 runs right after the
 * panel is drawn (`POKE 38189,10: CALL 38402`) and STARSHIP SIMULATOR line 500 runs every
 * pass of the main loop.
 *
 * $9602 reads $952D (38189): 10 draws all six, anything else updates only the one $9517
 * selects. Each lamp has two appearances picked by its own flag byte, and four of the six
 * flip that flag as they draw, so those blink as the main loop turns over.
 *
 * The drawing is $9754, which is self-modifying - $9773 and $9774 are the low and high
 * operand bytes of the STA at $9772. The high byte comes from $9789 (25 29 2d 31 35) or
 * $978E (26 2a 2e 32 36) depending on $9601, which works out as rows 153-157 and 161-165;
 * the low byte is the caller's, bumped once, so each lamp is two byte columns wide and the
 * same byte repeats down all five rows. Verified by running $9602 on a blank page 1 with
 * every flag both ways - oracle/probe_gauges.mjs.
 */
const LAMP_BYTES = [
  0x7f, 0x07, 0x55, 0x02, 0x28, 0x15, 0x7c, 0x1f, 0x20, 0x55,
  0x70, 0x7f, 0xa0, 0xd5, 0x50, 0x2a, 0xd0, 0xaa, 0x78, 0x3f,
];
const BAND_A = [153, 154, 155, 156, 157];   // $9601 = 0, the $9789 table
const BAND_B = [161, 162, 163, 164, 165];   // $9601 = 1, the $978E table

/** The six flag bytes, by the address each lamp reads. */
export interface PanelLamps {
  /** $9539 - band B, column 37. Flips on every draw. */
  a: number;
  /** $953A - band B, columns 1 and 10. Flips on every draw. */
  b: number;
  /** $9515 - band B, column 28. Three-way: 2 -> 3 -> 1 -> 2. */
  c: number;
  /** $9514 - band A, columns 1 and 10. Flips on every draw. */
  d: number;
  /** $9542 - band A, column 28. The atmosphere flag RE sets; read, never written. */
  atmosphere: number;
  /** $95F9 - band A, column 37. Read, never written. */
  f: number;
}

/**
 * The phase the COM capture caught.
 *
 * The blinking four have no canonical state - a capture shows whichever phase the main loop
 * happened to leave - so this is read back off the original's page rather than assumed, and
 * it is what lets the panel be compared at all. Two of the six cannot be pinned down this
 * way: $95F9's two appearances are $50/$2a and $d0/$aa, and two of $9515's are $20/$55 and
 * $a0/$d5, and each pair differs only in bit 7. That bit is the palette, not a pixel, so
 * both look identical to a lit-pixel comparison.
 */
export const LAMPS_AT_CAPTURE: PanelLamps = { a: 1, b: 0, c: 3, d: 1, atmosphere: 0, f: 0 };

function lamp(
  hires: import('../engine/hires').Hires,
  band: readonly number[], col: number, x: number,
): void {
  for (const row of band) {
    hires.hbyte(col, row, LAMP_BYTES[x]);
    hires.hbyte(col + 1, row, LAMP_BYTES[x + 1]);
  }
}

/** Mutates `st`, because four of the six routines write their flag back as they draw. */
export function drawPanelLamps(
  hires: import('../engine/hires').Hires,
  st: PanelLamps = LAMPS_AT_CAPTURE,
): void {
  // $9643
  if (st.a === 0) { lamp(hires, BAND_B, 37, 0x0e); st.a = 1; }
  else { lamp(hires, BAND_B, 37, 0x12); st.a = 0; }
  // $966A
  if (st.b === 0) { lamp(hires, BAND_B, 1, 0x02); lamp(hires, BAND_B, 10, 0x06); st.b = 1; }
  else { lamp(hires, BAND_B, 1, 0x00); lamp(hires, BAND_B, 10, 0x04); st.b = 0; }
  // $96A5, the three-way one
  if (st.c === 2) { lamp(hires, BAND_B, 28, 0x0c); st.c = 3; }
  else if (st.c === 3) { lamp(hires, BAND_B, 28, 0x08); st.c = 1; }
  else { lamp(hires, BAND_B, 28, 0x10); st.c = 2; }
  // $96DF
  if (st.d === 0) { lamp(hires, BAND_A, 1, 0x00); lamp(hires, BAND_A, 10, 0x04); st.d = 1; }
  else { lamp(hires, BAND_A, 1, 0x02); lamp(hires, BAND_A, 10, 0x06); st.d = 0; }
  // $971A - the atmosphere flag, read only
  lamp(hires, BAND_A, 28, st.atmosphere === 0 ? 0x08 : 0x0a);
  // $9737 - read only
  lamp(hires, BAND_A, 37, st.f === 0 ? 0x0e : 0x10);
}

/**
 * The eight gauge bars, and the two ways the disk paints them.
 *
 * GALAXY MAP has them in BASIC, which is what makes them readable at all:
 *
 *     5500 HCOLOR= CH: FOR J = LY TO LY + 4: HPLOT LX,J TO LX + 9,J: NEXT: RETURN
 *
 * Ten pixels wide, five rows tall, at (7,153) (72,153) (200,153) (262,153) and the same four
 * at 161 - one under each of the labels MANUAL/AUTO, ORBIT/DAMAGE, MISSILE/LASER and
 * COND/SHIELD. Lines 5000-5160 choose each bar's HCOLOR from a byte of game state, and those
 * bytes are the same ones $9602 reads: 38164 is $9514, 38165 is $9515, 38210 is $9542.
 *
 * So `LAMP_BYTES` is not a table of lamp shapes at all - it is these eight bars, in white or
 * green, plus blue and orange for COND, written out as the bytes they land on.
 *
 * The two painters differ in one way that the captures show plainly. $9602 **stores** two whole
 * byte columns, so it takes out whatever else was in them: the gauge boxes' own vertical edges
 * at x 17, 71, 82 and 272 vanish under it. 5500 **plots a line**, so only x LX..LX+9 is touched
 * and those edges survive. Measured on the machine, `oracle/probe_panelpath.mjs`: entering COM
 * from flight row 153 reads c0=$40 c1=$55 c2=$02, and coming back through INSTRUMENTS and
 * GALAXY MAP it reads c0=$00 c1=$55 c2=$0a - the $08 being the box edge at x 17.
 */
export type GaugeColor = 1 | 3 | 5 | 6;

/** The four gauge columns, by the x GALAXY MAP 5500 starts them at. */
const GAUGE_X = [7, 72, 200, 262] as const;

/**
 * The six bytes 5000-5160 read.
 *
 * Which value means which colour is the disk's, from the listing. Which *state* each value
 * stands for is taken from the captures, not from the labels: the disk's flight screen has
 * 38164 and 38201 both at something other than 1, with the ship in manual and the shields
 * down, so 0 is the resting value of both and 1 is the other one. Guessing from the words
 * MANUAL and AUTO would have got this backwards - white marks AUTO on the resting screen.
 */
export interface GaugeState {
  /** PEEK(38201) - SHIELD, at (262,161). 1 draws it green, anything else white. */
  shields: number;
  /** PEEK(38202) - MISSILE at (7,161) and LASER at (72,161). */
  weapon: number;
  /** PEEK(38165), $9515 - COND at (200,161). 1 green, 2 blue, 3 orange, else nothing. */
  condition: number;
  /** PEEK(38164), $9514 - MANUAL at (7,153) and AUTO at (72,153). */
  manual: number;
  /**
   * PEEK(38210), $9542 - the gauge under ORBIT at (200,153). 0 green, 1 white.
   *
   * Despite the label it is not "in orbit": **RE line 25 sets it to 1** on the way down and
   * ORBIT line 25 sets it back to 0 on the way up, and each of them paints this very bar to
   * match - RE white at its line 22, ORBIT green at its line 21. It is the atmosphere flag,
   * which is also how STARSHIP SIMULATOR 156 and 158 use it.
   */
  orbit: number;
  /** PEEK(38393) - DAMAGE at (262,153). 0 green, 1 orange. */
  damage: number;
}

/**
 * One bar.
 *
 * `store` is $9602's form: after the line is plotted, the rest of the two byte columns the bar
 * sits in is cleared, because the machine wrote those bytes whole. `plot` is 5500's, which
 * leaves them. Everything inside LX..LX+9 is the same either way - hplot() writes black on the
 * columns a phased HCOLOR does not paint, exactly as Applesoft's does.
 */
function gaugeBar(
  hires: import('../engine/hires').Hires,
  lx: number, ly: number, ch: GaugeColor, mode: 'store' | 'plot',
): void {
  hires.hcolor(ch);
  for (let j = ly; j <= ly + 4; j++) hires.line(lx, j, lx + 9, j);
  if (mode !== 'store') return;
  const from = Math.floor(lx / 7) * 7;
  const to = Math.floor((lx + 9) / 7) * 7 + 6;
  hires.hcolor(0);
  for (let j = ly; j <= ly + 4; j++) {
    for (let x = from; x < lx; x++) hires.hplot(x, j);
    for (let x = lx + 10; x <= to; x++) hires.hplot(x, j);
  }
}

/** GALAXY MAP lines 5000-5160, in their order. */
export function drawGaugeBars(
  hires: import('../engine/hires').Hires,
  g: GaugeState,
  mode: 'store' | 'plot',
): void {
  // 5000-5020
  gaugeBar(hires, GAUGE_X[3], 161, g.shields === 1 ? 1 : 3, mode);
  // 5030-5040
  if (g.weapon !== 1) {
    gaugeBar(hires, GAUGE_X[0], 161, 3, mode);
    gaugeBar(hires, GAUGE_X[1], 161, 1, mode);
  } else {
    gaugeBar(hires, GAUGE_X[1], 161, 3, mode);
    gaugeBar(hires, GAUGE_X[0], 161, 1, mode);
  }
  // 5050-5080. Nothing is drawn for a condition byte outside 1-3, which is the disk's own
  // behaviour: 5060, 5065 and 5070 each test one value and there is no else.
  const cond: Record<number, GaugeColor> = { 1: 1, 2: 6, 3: 5 };
  if (cond[g.condition]) gaugeBar(hires, GAUGE_X[2], 161, cond[g.condition], mode);
  // 5090-5100
  if (g.manual !== 1) {
    gaugeBar(hires, GAUGE_X[1], 153, 3, mode);
    gaugeBar(hires, GAUGE_X[0], 153, 1, mode);
  } else {
    gaugeBar(hires, GAUGE_X[0], 153, 3, mode);
    gaugeBar(hires, GAUGE_X[1], 153, 1, mode);
  }
  // 5110-5130
  gaugeBar(hires, GAUGE_X[2], 153, g.orbit === 1 ? 3 : 1, mode);
  // 5140-5160
  gaugeBar(hires, GAUGE_X[3], 153, g.damage === 1 ? 5 : 1, mode);
}

/** The six state bytes, read off the port's own state rather than out of a page of RAM. */
export function gaugeStateFromGame(state: import('../engine/gameState').GameState): GaugeState {
  return {
    shields: state.shieldsOn ? 1 : 0,
    weapon: state.weaponMode === 'missile' ? 1 : 0,
    condition: state.condition === 'green' ? 1 : state.condition === 'blue' ? 2 : 3,
    manual: state.autopilot ? 1 : 0,
    orbit: state.atmosphere ? 1 : 0,
    damage: state.damage.hullPct < 100 ? 1 : 0,
  };
}

export function drawInstruments(
  hires: import('../engine/hires').Hires,
  opts: { gauges?: boolean } = {},
): void {
  // All instruments drawn instantly — no artificial delays.
  hires.hcolor(1);

  hires.line(123, 145, 1, 145);
  hires.line(1, 145, 1, 128);
  hires.line(1, 128, 279, 128);
  hires.line(279, 128, 279, 145);
  hires.line(279, 145, 157, 145);

  hires.line(123, 128, 123, 183);
  hires.line(123, 183, 133, 183);
  hires.line(133, 183, 133, 189);
  hires.line(133, 189, 147, 189);
  hires.line(147, 189, 147, 183);
  hires.line(147, 183, 157, 183);
  hires.line(157, 183, 157, 128);

  hires.line(13, 131, 13, 130);
  hires.line(13, 130, 77, 130);
  hires.line(77, 130, 77, 131);
  hires.line(45, 131, 45, 131);
  hires.line(261, 131, 261, 130);
  hires.line(261, 130, 199, 130);
  hires.line(199, 130, 199, 131);
  hires.line(231, 131, 231, 131);
  hires.line(129, 131, 129, 130);
  hires.line(129, 130, 151, 130);
  hires.line(151, 130, 151, 131);
  hires.line(139, 131, 141, 131);
  hires.line(139, 152, 141, 152);
  hires.line(141, 152, 141, 184);
  hires.line(141, 184, 139, 184);
  hires.line(139, 167, 139, 167);

  hires.hcolor(5);
  hires.line(5, 177, 117, 177);
  hires.line(163, 177, 277, 177);

  // INSTRUMENTS 90-160: eight boxes, at y152 and y160 for x = 6, 71, 200 and 261. There
  // used to be a ninth and tenth at y168; the original draws no such thing, and frame
  // parity showed them as 64 pixels the port lit and the disk did not.
  hires.hcolor(3);
  for (const [x, y] of [[6, 152], [71, 152], [6, 160], [71, 160], [200, 152], [261, 152], [200, 160], [261, 160]] as Array<[number, number]>) {
    hires.line(x, y, x + 11, y);
    hires.line(x + 11, y, x + 11, y + 5);
    hires.line(x + 11, y + 5, x, y + 5);
    hires.line(x, y + 5, x, y);
  }

  hires.hcolor(1);
  // INSTRUMENTS 165 does POKE 973,255 and 177 does POKE 973,0, so 973 ($3CD) is the
  // hi-res character generator's inverse flag and it covers exactly these nine labels.
  // Everything from line 180 on is printed normally.
  hires.text(' SPEED ', 4, 18, INVERSE);
  hires.text('TURN', 19, 18, INVERSE);
  hires.text(' ENERGY ', 30, 18, INVERSE);

  hires.text('V', 22, 20, INVERSE);
  hires.text('E', 22, 21, INVERSE);
  hires.text('R', 22, 22, INVERSE);
  hires.text('T', 22, 23, INVERSE);
  hires.text('C', 19, 20, INVERSE);
  hires.text('D', 19, 23, INVERSE);
  hires.text('MANUAL', 4, 20);
  hires.text('AUTO', 13, 20);
  hires.text('ORBIT', 24, 20);
  hires.text('DAMAGE', 32, 20);
  hires.text('MISSILE', 4, 21);
  hires.text('LASER', 13, 21);
  hires.text('COND', 24, 21);
  hires.text('SHIELD', 32, 21);
  hires.text('X', 3, 23);
  hires.text('Y', 9, 23);
  hires.text('Z', 15, 23);
  hires.text('XHDNG', 25, 23);
  hires.text('YHDNG', 34, 23);

  // INSTRUMENTS line 210: POKE 38189,10: CALL 38402 - but only `IF PEEK(38391) <> 77`, which
  // is false on the way back from the galaxy map. `gauges: false` is that path: the boxes go
  // down bare and GALAXY MAP's own GOSUB 5000 paints the bars over them a moment later.
  if (opts.gauges !== false) drawPanelLamps(hires, { ...LAMPS_AT_CAPTURE });
}

export async function instrumentsScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state } = ctx;
  setScene('instruments');

  hires.hgr();

  drawInstruments(hires);

  glog('instruments', `transition to ${state.savedGameSentinel !== 77 ? 'starshipSimulator' : 'galaxyMap'}`);

  if (state.savedGameSentinel !== 77) {
    return scenes.run('starshipSimulator');
  }
  return scenes.run('galaxyMap');
}



/**
 * The four panel needles - STARSHIP SIMULATOR lines 159, 170, 173 and 180.
 *
 *     159 HCOLOR= 0: DRAW 25 AT TT,133: DRAW 26 AT 136,VV: DRAW 25 AT EE,133: DRAW 25 AT SS,133
 *         TX = 140 + ((HL - B) / 5.7): IF B < 127 THEN TX = 140 - (B / 5.7)
 *     170 VY = INT(167 - ((HL - P) / 4)): IF P < 127 THEN VY = INT(167 + (P / 4))
 *     173 SX = 13 + (S / 2): EX = 199 + E
 *     180 DRAW 13 AT TX,133: DRAW 14 AT 136,VY: DRAW 13 AT SX,133: DRAW 13 AT EX,133
 *
 * `HL` is 255 (line 1). Line 159 erases the previous positions with the wider shapes 25 and
 * 26 before line 175 sets HCOLOR 3 and line 180 draws the new ones with 13 and 14. These are
 * not INSTRUMENTS' - they are redrawn every pass of the flight loop, which is why they are
 * on the page when COM takes over.
 *
 * Line 159 writes the `>= 127` form first and overrides it below 127, so B and P are the
 * same signed bytes the rest of the flight model uses. `S` and `E` are plain:
 * `S = PEEK(38157)`, clamped to 0-120 by lines 207 and 208, and `E = PEEK(38199)` - the
 * energy byte COM's POWER LOW readout gates on. Their two scales line up exactly with the
 * ranges COM line 8 erases, 13-73 and 200-260.
 */
export interface PanelNeedles {
  /** B - $7322. */
  bank: number;
  /** P - $7321. */
  pitch: number;
  /** S - PEEK(38157), 0-120. */
  speed: number;
  /** E - PEEK(38199), 0-63. */
  energy: number;
}

const HL = 255;


export function needlePositions(n: PanelNeedles): { tx: number; vy: number; sx: number; ex: number } {
  return {
    tx: n.bank < 127 ? 140 - n.bank / 5.7 : 140 + (HL - n.bank) / 5.7,
    vy: n.pitch < 127 ? Math.floor(167 + n.pitch / 4) : Math.floor(167 - (HL - n.pitch) / 4),
    sx: 13 + n.speed / 2,
    ex: 199 + n.energy,
  };
}

/** Line 180. Shape numbers are the BASIC ones, so 13 is index 12. */
export function drawPanelNeedles(
  hires: import('../engine/hires').Hires,
  shapes: import('../engine/shapeTable').ShapeTable,
  n: PanelNeedles,
): void {
  const { tx, vy, sx, ex } = needlePositions(n);
  const r = new ShapeRenderer(hires);
  r.rot = 0; r.scale = 1;
  hires.hcolor(3);
  r.draw(shapes, 12, tx, 133);
  r.draw(shapes, 13, 136, vy);
  r.draw(shapes, 12, sx, 133);
  r.draw(shapes, 12, ex, 133);
}

/** Line 159 - the same four at their previous positions, in HCOLOR 0 and the wider shapes. */
export function erasePanelNeedles(
  hires: import('../engine/hires').Hires,
  shapes: import('../engine/shapeTable').ShapeTable,
  previous: PanelNeedles,
): void {
  const { tx, vy, sx, ex } = needlePositions(previous);
  const r = new ShapeRenderer(hires);
  r.rot = 0; r.scale = 1;
  hires.hcolor(0);
  r.draw(shapes, 24, tx, 133);
  r.draw(shapes, 25, 136, vy);
  r.draw(shapes, 24, ex, 133);
  r.draw(shapes, 24, sx, 133);
}

/** The same four needles as pixels, for targets that are not a Hires. */
export function panelNeedlePixels(
  shapes: import('../engine/shapeTable').ShapeTable,
  n: PanelNeedles,
): Array<[number, number]> {
  const { tx, vy, sx, ex } = needlePositions(n);
  return [
    ...shapePixels(shapes, 12, tx, 133),
    ...shapePixels(shapes, 13, 136, vy),
    ...shapePixels(shapes, 12, sx, 133),
    ...shapePixels(shapes, 12, ex, 133),
  ];
}

/**
 * Where the loaded shape table lives once a scene has fetched it.
 *
 * The canvas overlay needs the same table the cockpit does, and threading it through the
 * overlay's own data interface would mean changing that interface. The cockpit sets this
 * when it loads its assets; anything that draws the panel reads it.
 */
let loadedPanelShapes: import('../engine/shapeTable').ShapeTable | null = null;
export function setPanelShapes(t: import('../engine/shapeTable').ShapeTable): void {
  loadedPanelShapes = t;
}
export function getPanelShapes(): import('../engine/shapeTable').ShapeTable | null {
  return loadedPanelShapes;
}
