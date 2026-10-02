/**
 * The opening sequence: START lines 1000-1029, 8000-9090 and the DATA at 10000-10140.
 *
 * There are two openings on this disk. Line 40's `GOSUB 7500` is the asterisk card, which the
 * port has had all along. This is the other one, and it was missing entirely: line 80's
 * `GOSUB 1000`, drawn **after** you answer (N)EW or (O)LD, while the game BLOADs its modules.
 *
 * ```
 * 1000 HGR2:HGR: HCOLOR= 5:X1 = 80:Y1 = 40: GOSUB 8000: SPEED= 127: POKE 38191,0
 * 1001 VTAB 11: HTAB 12: PRINT "SUBLOGIC PRESENTS:"
 * 1010 VTAB 11: HTAB 2: PRINT "A SIMULATION GAME BY MITCHELL ROBBINS"
 * 1020 SPEED= 255:Y1 = 85:X1 = 140      ... then the wordmark, from the DATA
 * ```
 *
 * Two things worth noticing before the code. The game's publisher is **subLOGIC** and its
 * author is **Mitchell Robbins** - neither appears on the asterisk card, which says only
 * `G.M. ROBBINS`, so this screen is the only place the disk credits either properly. And the
 * `SPACE VIKINGS` wordmark is not text at all: it is a stroke font, 494 numbers of pen-up and
 * pen-down, drawn a segment at a time with a click of the speaker between each.
 *
 * Everything below is checked against the machine by `openingart_parity.mjs`.
 */

/**
 * Lines 8000 and 8010: fifty-one stars below the horizon and fifty-one above, each one three
 * pixels - the point, the one to its right, and the one below it.
 *
 * `rnd` is the game's own RND, so a port that reproduces Applesoft's generator draws the same
 * sky. The parity harness does not require that; it counts them by band instead, because a
 * starfield that matches in law but not in seed is still the right starfield.
 */
export function drawStars8000(
  plot: (x: number, y: number) => void,
  rnd: () => number,
): void {
  for (let j = 0; j <= 50; j++) {
    const x = Math.floor(rnd() * 278);
    const y = 96 + Math.floor(rnd() * 81);
    plot(x, y); plot(x + 1, y); plot(x, y + 1);
  }
  for (let j = 0; j <= 50; j++) {
    const x = Math.floor(rnd() * 278);
    const y = 2 + Math.floor(rnd() * 70);
    plot(x, y); plot(x + 1, y); plot(x, y + 1);
  }
}

/**
 * Lines 8020-8070: the horizon and the ground lines running away from it.
 *
 * `J` starts at 100 and the gap grows by `C = .4` each time, so the lines bunch at the horizon
 * and spread toward the bottom. Measured on the machine the rows are 100, 101, 102, 104, 106,
 * 108, 111, 114, 118, 122, 126, 131, 136, 142, 148, 154, 161, 168, 176, 184 - and this
 * reproduces them exactly, including the two plots that both land on row 100.
 */
export function horizontalRows8020(): number[] {
  const rows: number[] = [];
  let j = 100;
  let b = 0;
  const c = 0.4;
  for (;;) {
    rows.push(Math.floor(j));          // HPLOT truncates
    if (j + (b + c) > 189) break;
    b += c;
    j += b;
  }
  return rows;
}

/** One line of the fan at 9010-9080: from the horizon out to the bottom of the screen. */
export interface FanLine { x1: number; y1: number; x2: number; y2: number; }

/**
 * Lines 8090-9085: the verticals, fanning from the horizon down.
 *
 * `X2` steps out by 19 a time until it hits 138 and stops there; from then on each pair is
 * drawn a little higher as `D` is taken off `Y` and `E = .22` off `D`. That is what closes the
 * fan up at the sides instead of running it off the screen.
 */
export function fanLines9000(): FanLine[] {
  const out: FanLine[] = [];
  let x2 = 0;
  let d = 8;
  const e = 0.22;
  let y = 189;
  for (let j = 0; j <= 39; j += 2) {
    const x1 = 140;                     // 9020 sets it again every time round
    out.push({ x1: x1 + j, y1: 100, x2: 140 + x2, y2: Math.floor(y) });
    out.push({ x1: x1 - j, y1: 100, x2: 140 - x2, y2: Math.floor(y) });
    // 9050 tests J > 138, which a loop running 0 to 39 can never reach. Left here because it
    // is in the listing and its absence would look like an omission.
    x2 += 19;
    if (x2 > 138) { x2 = 138; d -= e; y -= d; }
  }
  return out;
}

/** 9085, the one line straight down the middle - and it is at 141, not 140. */
export const CENTRE_LINE = { x: 141, y1: 100, y2: 189 } as const;

/**
 * The wordmark, as the DATA at 10000-10140 holds it, read by 1021-1027.
 *
 * ```
 * 1021 READ C: IF C = 77 THEN Y1 = 20: GOTO 1021
 * 1022 IF C = 127 THEN POKE 974,64: GOTO 1028
 * 1023 IF C > 5 THEN HCOLOR= C - 5: GOTO 1021
 * 1024 READ X,Y:X = X1 +(X * 2):Y = Y1 -(Y * 2): IF C = 1 THEN HPLOT X,Y
 * 1025 IF C = 2 THEN HPLOT TO X,Y
 * 1026 L = PEEK( - 16336) + PEEK( - 16336)
 * ```
 *
 * So: 77 moves to the second row, 127 ends it, anything above 5 is a colour, and 1 and 2 are
 * pen-up and pen-down. Line 1026 is the speaker, clicked twice a segment - the wordmark draws
 * with a buzz. Nothing in this table is 77, so the second row is never used.
 */
export const LOGO_DATA: readonly number[] = [
  8, 1, -51, 4, 2, -52, 5, 2, -59, 5, 2, -60, 4, 2, -60, 0, 2, -59,
  -1, 2, -54, -1, 2, -54, -3, 2, -57, -3, 2, -57, -2, 2, -60, -2, 2, -60,
  -4, 2, -59, -5, 2, -52, -5, 2, -51, -4, 2, -51, 0, 2, -52, 1, 2, -57,
  1, 2, -57, 3, 2, -54, 3, 2, -54, 2, 2, -51, 2, 2, -51, 4, 1, -50,
  5, 2, -50, -5, 2, -47, -5, 2, -47, -2, 2, -42, -2, 2, -41, -1, 2, -41,
  4, 2, -42, 5, 2, -50, 5, 1, -47, 3, 2, -47, 0, 2, -44, 0, 2, -44,
  3, 2, -47, 3, 1, -39, 5, 2, -43, -5, 2, -40, -5, 2, -39, -2, 2, -35,
  -2, 2, -34, -5, 2, -31, -5, 2, -35, 5, 2, -39, 5, 1, -38, 0, 2, -36,
  0, 2, -37, 2, 2, -38, 0, 1, -22, 5, 2, -29, 5, 2, -30, 4, 2, -30,
  -4, 2, -29, -5, 2, -22, -5, 2, -21, -4, 2, -21, -2, 2, -24, -2, 2, -24,
  -3, 2, -27, -3, 2, -27, 3, 2, -24, 3, 2, -24, 2, 2, -21, 2, 2, -21,
  4, 2, -22, 5, 1, -20, 5, 2, -20, -5, 2, -11, -5, 2, -11, -3, 2, -17,
  -3, 2, -17, -1, 2, -12, -1, 2, -12, 1, 2, -17, 1, 2, -17, 3, 2, -11,
  3, 2, -11, 5, 2, -20, 5, 1, -1, 5, 2, 2, -5, 2, 6, -5, 2, 9,
  5, 2, 6, 5, 2, 4, -2, 2, 2, 5, 2, -1, 5, 1, 10, 5, 2, 10,
  -5, 2, 13, -5, 2, 13, 5, 2, 10, 5, 1, 14, 5, 2, 14, -5, 2, 17,
  -5, 2, 17, -1, 2, 21, -5, 2, 24, -5, 2, 20, 0, 2, 24, 5, 2, 21,
  5, 2, 17, 1, 2, 17, 5, 2, 14, 5, 1, 25, 5, 2, 25, -5, 2, 28,
  -5, 2, 28, 5, 2, 25, 5, 1, 29, 5, 2, 29, -5, 2, 32, -5, 2, 32,
  0, 2, 35, -5, 2, 38, -5, 2, 38, 5, 2, 35, 5, 2, 35, 0, 2, 32,
  5, 2, 29, 5, 1, 47, 5, 2, 40, 5, 2, 39, 4, 2, 39, -4, 2, 40,
  -5, 2, 47, -5, 2, 47, -4, 2, 48, -5, 2, 48, 0, 2, 43, 0, 2, 43,
  -2, 2, 45, -2, 2, 45, -3, 2, 42, -3, 2, 42, 3, 2, 45, 3, 2, 45,
  2, 2, 48, 2, 2, 48, 4, 2, 47, 5, 1, 57, 5, 2, 50, 5, 2, 49,
  4, 2, 49, 0, 2, 50, -1, 2, 55, -1, 2, 55, -3, 2, 52, -3, 2, 52,
  -2, 2, 49, -2, 2, 49, -4, 2, 50, -5, 2, 57, -5, 2, 58, -4, 2, 58,
  0, 2, 57, 1, 2, 52, 1, 2, 52, 3, 2, 55, 3, 2, 55, 2, 2, 58,
  2, 2, 58, 4, 2, 57, 5, 127
];

/** Where 1020 anchors the wordmark. */
export const LOGO_ORIGIN = { x1: 140, y1: 85 } as const;

export interface LogoOp {
  kind: 'colour' | 'move' | 'draw';
  /** For `colour`, the HCOLOR. For the others, the point. */
  value?: number;
  x?: number;
  y?: number;
}

/** Walk the DATA the way 1021-1027 does, into something a renderer can replay. */
export function logoOps(data: readonly number[] = LOGO_DATA): LogoOp[] {
  const out: LogoOp[] = [];
  const x1 = LOGO_ORIGIN.x1;
  let y1: number = LOGO_ORIGIN.y1;
  let i = 0;
  while (i < data.length) {
    const c = data[i++];
    if (c === 77) { y1 = 20; continue; }                                  // 1021
    if (c === 127) break;                                                 // 1022
    if (c > 5) { out.push({ kind: 'colour', value: c - 5 }); continue; }  // 1023
    const dx = data[i++];
    const dy = data[i++];
    const x = x1 + dx * 2;                                                // 1024
    const y = y1 - dy * 2;
    out.push({ kind: c === 1 ? 'move' : 'draw', x, y });
  }
  return out;
}

/**
 * How long each stage lasts, measured on the machine from the moment N is pressed.
 *
 * Nearly all of it is the disk: twelve BLOADs between the three screens. The drawing itself is
 * the first seven seconds, which is Applesoft plotting a grid at Applesoft speed.
 */
/**
 * What the machine took, and what the port plays.
 *
 * The emulator ran the whole sequence in **61.2 s** from the keypress, and that number is not
 * one to hang a default on. Most of it is twelve BLOADs, and disk latency is the one thing in
 * this emulator that is not cycle-accurate - unlike the 2.55 s main loop, which is CPU-bound
 * and trustworthy. Reproducing it would mean treating the emulator's drive speed as the disk's,
 * which is a claim the measurement does not support.
 *
 * So the port plays the parts that are **computation** at the pace they were measured at, and
 * does not sit through the waiting:
 *
 * | | machine | port | why |
 * | --- | --- | --- | --- |
 * | the grid | 7.07 s | 7.07 s | Applesoft plotting, CPU-bound |
 * | `SUBLOGIC PRESENTS:` | 13.9 s | 2 s | BLOADs |
 * | the credit line | ~11 s | 2 s | BLOADs, and 1011's slow erase |
 * | the wordmark | 10.2 s | 10.2 s | 164 strokes and 328 speaker clicks, CPU-bound |
 * | held at the end | 18 s | 1.5 s | BLOADs |
 *
 * Everything *drawn* is the disk's, to the pixel - `openingart_parity.mjs` holds that. It is
 * the dead air that is not reproduced, and a key skips the rest at any point.
 */
export const OPENING_TIMING = {
  /** 0 to here, the stars and then the grid going down. Measured, and kept. */
  gridDrawnAt: 7.07,
  subLogicFrom: 7.07,
  subLogicTo: 9.07,
  creditFrom: 9.2,
  creditTo: 11.2,
  /** 164 strokes at the machine's own rate, which is the other half worth watching. */
  logoFrom: 11.2,
  logoDoneAt: 21.4,
  endsAt: 22.9,
} as const;

/** What the machine actually took, kept because it is the measurement. */
export const MACHINE_TIMING = {
  gridDrawnAt: 7.07,
  subLogicFrom: 7.07,
  subLogicTo: 20.93,
  creditFrom: 21.07,
  creditTo: 32,
  logoFrom: 32,
  logoDoneAt: 42.27,
  endsAt: 61.2,
} as const;

export const SUBLOGIC_LINE = { text: 'SUBLOGIC PRESENTS:', col: 12, row: 11 } as const;
export const CREDIT_LINE = {
  text: 'A SIMULATION GAME BY MITCHELL ROBBINS', col: 2, row: 11,
} as const;
