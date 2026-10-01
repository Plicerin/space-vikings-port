/**
 * The flight controls: STARSHIP SIMULATOR line 19 and the module at `$9023`.
 *
 * This is the one part of the game a player touches every single pass, and until now the port
 * did not have it. It steered by adding `TURN_RATE * dt` to a heading in radians, which is a
 * yaw, derived from nothing. The disk does something quite different, and `probe_controls.mjs`
 * measures all of it on the real 6502 - the module written into memory with no DOS and no game
 * so nothing else can move the values, and `$921E` (`JSR $6000`, the renderer) patched to
 * `RTS` so only the control logic runs.
 *
 * ```
 *  15 FOR OO = 0 TO 1: IF PEEK(38164) = 1 THEN 20
 *  19 J = PDL(1):K = PDL(0): POKE 38397,J: POKE 38398,K
 *  20 P = PEEK(P1):B = PEEK(B1):H = PEEK(H1)
 * 129 ... X = X + X1:Z = Z + Z1:Y = Y + Y1 ...
 * 150 CALL CA
 * ```
 *
 * `CA` is 36899, which is `$9023`. So the order inside one pass is: read the paddles, move
 * with the orientation you already had, *then* update the orientation. `applyControls` is
 * line 150 and belongs after the position step, not before it.
 *
 * ## What it does
 *
 * **The paddles are not the ship.** They set a rate. Each pass the module adds a step to pitch
 * and to bank, sized by how far the paddle is from centre, with a wide dead zone in the middle.
 * Let go and the deflection stops changing - but pitch and bank keep whatever they reached.
 *
 * **Bank drives heading.** Heading is not steered directly at all: `$912E` turns the current
 * bank into a heading change. That is what makes a turn a roll - you bank, the nose comes
 * round, and it keeps coming round until you bank back. A yaw cannot reproduce that, which is
 * why the port felt nothing like the original.
 *
 * All three tables below are the measurement, as run lengths. `controls_parity.mjs` expands
 * them to 256 entries each and compares against `captured/controls/golden.json` value by
 * value, so the ranges cannot drift from the machine without the suite saying so.
 */

/** 0..255 from `PDL(n)`; 128 is centre and the dead zone is wide. */
export const PADDLE_CENTRE = 128;

type Run = { to: number; value: number };

function fromRuns(runs: readonly Run[]): readonly number[] {
  const out: number[] = [];
  for (const r of runs) while (out.length <= r.to) out.push(r.value);
  return out;
}

/**
 * Pitch step per pass, by `PDL(1)` (`$95FD`). Measured across all 256.
 *
 * Note the first break: **31**, where bank's is 30. That one-value asymmetry is `CMP #$1F`
 * against bank's `CMP #$1E`, and it is in the disassembly and the measurement both.
 */
export const PITCH_STEP = fromRuns([
  { to: 30, value: +4 }, { to: 49, value: +3 }, { to: 69, value: +2 }, { to: 89, value: +1 },
  { to: 169, value: 0 },
  { to: 189, value: -1 }, { to: 209, value: -2 }, { to: 229, value: -3 }, { to: 255, value: -4 },
]);

/** Bank step per pass, by `PDL(0)` (`$95FE`). The first break is at 30. */
export const BANK_STEP = fromRuns([
  { to: 29, value: +4 }, { to: 49, value: +3 }, { to: 69, value: +2 }, { to: 89, value: +1 },
  { to: 169, value: 0 },
  { to: 189, value: -1 }, { to: 209, value: -2 }, { to: 229, value: -3 }, { to: 255, value: -4 },
]);

/**
 * Heading change per pass, by bank, indexed by the raw byte - `$912E`.
 *
 * The table has a +-4 row, and **play can never reach it**. Bank saturates at +47 going up and
 * -48 going down (below), so raw 48 and raw 49-207 are both outside anything the clamp allows.
 * The strongest turn a player can hold is +-3.
 */
export const HEADING_STEP = fromRuns([
  { to: 4, value: 0 }, { to: 16, value: -1 }, { to: 32, value: -2 }, { to: 47, value: -3 },
  { to: 48, value: -4 },
  { to: 207, value: +4 },
  { to: 223, value: +3 }, { to: 239, value: +2 }, { to: 250, value: +1 }, { to: 255, value: 0 },
]);

/**
 * Where bank stops. Asymmetric by one, which is what a signed compare against 48 gives:
 * +4 from 44 saturates to 47, -4 from -44 saturates to -48.
 */
export const BANK_MAX = 47;
export const BANK_MIN = -48;

/**
 * The steep-pitch heading flip at `$90F2`.
 *
 * Pitch 64 to 191 is the half of the circle where the nose points backwards. Crossing into it
 * flips the heading, and crossing back out flips it again; a latch holds which side you are on
 * so it fires on the change and not every pass.
 *
 * The flip is `(heading + 126) mod 253`, which is **not** modulo 256 - checked against all 256
 * headings. Everything else here steps modulo 256. So the flip is not quite half a turn and
 * does not undo itself exactly: flipping twice moves the heading by one. That is the machine's
 * arithmetic, not a rounding choice made here.
 */
export const STEEP_FROM = 64;
export const STEEP_TO = 191;
export const FLIP_ADD = 126;
export const FLIP_MOD = 253;

export const isSteepPitch = (pitch: number): boolean =>
  pitch >= STEEP_FROM && pitch <= STEEP_TO;

export const flipHeading = (heading: number): number => (heading + FLIP_ADD) % FLIP_MOD;

/** The three bytes at 29473-29475 plus the latch at `$952F`, which is all the module owns. */
export interface ControlState {
  /** 29473, `P1`. */
  pitch: number;
  /** 29474, `B1`. */
  bank: number;
  /** 29475, `H1`. */
  heading: number;
  /** `$952F`, 1 while the nose is in the backwards half. */
  steepLatch: number;
}

const byte = (v: number): number => ((v % 256) + 256) % 256;
const signed = (v: number): number => (v > 127 ? v - 256 : v);

/**
 * One `CALL $9023`: line 150, after the move.
 *
 * `pdl1` is `PDL(1)` and drives pitch; `pdl0` is `PDL(0)` and drives bank. Centre both and
 * pitch and bank hold still while heading keeps turning, which is the behaviour a paddle gives
 * you and a key tapped once does not.
 */
export function applyControls(st: ControlState, pdl1: number, pdl0: number): void {
  st.pitch = byte(st.pitch + PITCH_STEP[byte(pdl1)]);

  // Bank saturates rather than wrapping. Values already outside the clamp are left alone by
  // the machine, but nothing can produce one: bank starts at 0 and this range is closed.
  const bank = signed(st.bank);
  if (bank >= BANK_MIN && bank <= BANK_MAX) {
    const next = bank + BANK_STEP[byte(pdl0)];
    st.bank = byte(Math.min(BANK_MAX, Math.max(BANK_MIN, next)));
  }

  st.heading = byte(st.heading + HEADING_STEP[byte(st.bank)]);

  // $90F2, on the change only.
  const steep = isSteepPitch(st.pitch) ? 1 : 0;
  if (steep !== st.steepLatch) {
    st.heading = flipHeading(st.heading);
    st.steepLatch = steep;
  }
}

/**
 * Lines 175 and 177, which run every pass just after the controls.
 *
 * ```
 * 175 IF PEEK(P1) > 59 AND PEEK(P1) < 127 THEN POKE P1,59
 * 177 IF PEEK(P1) < 195 AND PEEK(P1) > 127 THEN POKE P1,195
 * ```
 *
 * So pitch lives in 0-59 and 195-255: +59 one way and -61 the other, asymmetric by two. It
 * has a consequence worth knowing. The steep-pitch flip wants pitch in 64-191, and the clamp
 * means a pass can only ever present 63 at the top (59 + 4) - never steep - but **191 at the
 * bottom** (195 - 4), which is steep by exactly one. So the flip is reachable nose-down and
 * unreachable nose-up, and the latch then holds it until the pitch comes back off the stop.
 */
export function clampPitch175(pitch: number): number {
  if (pitch > 59 && pitch < 127) return 59;
  if (pitch < 195 && pitch > 127) return 195;
  return pitch;
}

