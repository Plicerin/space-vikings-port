/**
 * The three sound routines, transcribed from the disk.
 *
 * A sound has no picture to diff, so the thing to reproduce is *when* the speaker is toggled.
 * Each routine ends in an access to `$C030`, and the gap between two of them in CPU cycles is
 * the half-period of what comes out - so each function here returns the cycle at which every
 * toggle happens, which is the waveform.
 *
 * | routine | loads at | bytes | entry | toggles at |
 * | --- | --- | --- | --- | --- |
 * | SOUND GEN | `$9276` | 74 | `$9276` | `$928B` |
 * | LASER | `$92D1` | 26 | `$92D1` | `$92DB` |
 * | EXPL | `$9270` | 34 | `$9276` | `$927E` |
 *
 * EXPL is the odd one. It BLOADs to `$9270`, which is SOUND GEN's parameter block, and its 34
 * bytes run to `$9291` - so it lands on the front of SOUND GEN and shares nothing with it,
 * carrying its own `RTS` at `$928E`. The BASIC calls both at 37494, because after
 * `BLOAD EXPL` that address is EXPL.
 *
 * Verified against the machine by `oracle/probe_sound.mjs` and `oracle/sound_parity.mjs`:
 * every toggle, at the cycle it happens, over nine parameter sets.
 */

/** What `$9270-$9275` hold when SOUND GEN is called. */
export interface SoundGenParams {
  /** `$9270`/`$9271` - a 16-bit shift register, rotated left once per iteration. It is not
   *  reset between calls, so consecutive calls carry on from where the last one stopped. */
  reg: number;
  /** `$9272` - the inner count. */
  count: number;
  /** `$9273` - the outer count. */
  outer: number;
  /** `$9274` - the period: the speaker is a candidate every this-many iterations. */
  period: number;
  /** `$9275` - the sweep. Zero leaves the period alone, bit 7 set raises it, anything else
   *  lowers it. STARSHIP SIMULATOR uses 129, 0 and 129 at lines 4100, 4110 and 4120. */
  sweep: number;
}

export interface SoundResult {
  /** The cycle at which each `$C030` access completes, from entry. */
  toggles: number[];
  /** Cycles to the `RTS`. */
  cycles: number;
  /** `$9270`/`$9271` and `$9274` on exit - the next call continues from these. */
  reg: number;
  period: number;
}

/**
 * Reading `$C030` returns the floating bus, so what lands in A is whatever the video scanner
 * last fetched - and A feeds straight back into the feedback chain at `$9291`. apple2js
 * returns 0 and every capture here was taken with that; on real hardware this value, and so
 * the noise, depends on what is on screen.
 */
export const FLOATING_BUS = 0;

/**
 * SOUND GEN at `$9276`.
 *
 *     $9276  SEC / INC $9273 / LDX $9274
 *     $927D  ROL $9270 / ROL $9271              ; the register, and the carry out of bit 15
 *     $9283  TXA / BEQ / DEX                    ; count down the period
 *     $9287  BNE / BCC / LDA $C030 / LDX $9274  ; toggle when the period ran out AND the
 *                                               ; register's top bit came out set
 *     $9291  ROR A x3 / EOR $9271 / ASL A x3    ; the feedback: bit 5 of that, into the carry
 *     $929A  PHP ... PLP                        ; the sweep must not disturb it
 *     $92B5  DEC $9272 / BNE / DEC $9273 / BNE
 *
 * So it is a shift register clocked once per iteration whose top bit gates a toggle, divided
 * down by `$9274`. A period of 0 never decrements - `TXA` leaves Z set and `DEX` is skipped -
 * so every iteration is a candidate, which is the widest, harshest setting.
 */
export function soundGen9276(p: SoundGenParams, floatingBus = FLOATING_BUS): SoundResult {
  let r0 = p.reg & 0xff;
  let r1 = (p.reg >> 8) & 0xff;
  let inner = p.count & 0xff;
  let outer = p.outer & 0xff;
  let period = p.period & 0xff;
  const sweep = p.sweep & 0xff;

  const toggles: number[] = [];
  let cy = 0;
  let C = 1;                                  // $9276 SEC
  cy += 2;
  outer = (outer + 1) & 0xff; cy += 6;        // $9277 INC $9273
  let X = period; cy += 4;                    // $927A LDX $9274

  for (;;) {
    const b0 = (r0 >> 7) & 1;                 // $927D ROL $9270
    r0 = ((r0 << 1) | C) & 0xff; cy += 6;
    const b1 = (r1 >> 7) & 1;                 // $9280 ROL $9271
    r1 = ((r1 << 1) | b0) & 0xff; C = b1; cy += 6;

    let A = X; cy += 2;                       // $9283 TXA
    let Z = X === 0;
    if (Z) cy += 3;                           // $9284 BEQ $9287
    else { cy += 2; X = (X - 1) & 0xff; cy += 2; Z = X === 0; }   // $9286 DEX

    if (!Z) cy += 3;                          // $9287 BNE $9291 - the period has not run out
    else {
      cy += 2;
      if (!C) cy += 3;                        // $9289 BCC $9291 - the register said no
      else {
        cy += 2;
        A = floatingBus & 0xff; cy += 4;      // $928B LDA $C030
        toggles.push(cy);
        X = period; cy += 4;                  // $928E LDX $9274
      }
    }

    for (let i = 0; i < 3; i++) {             // $9291 ROR A x3
      const bit = A & 1;
      A = ((A >> 1) | (C << 7)) & 0xff;
      C = bit;
    }
    cy += 6;
    A ^= r1; cy += 4;                         // $9294 EOR $9271 - EOR leaves the carry alone
    for (let i = 0; i < 3; i++) { C = (A >> 7) & 1; A = (A << 1) & 0xff; }   // $9297 ASL A x3
    cy += 6;
    const savedC = C; cy += 3;                // $929A PHP

    A = sweep; cy += 4;                       // $929B LDA $9275
    if (A === 0) cy += 3;                     // $929E BEQ $92B4
    else {
      cy += 2;
      const Y = A; cy += 2;                   // $92A0 TAY
      if (A & 0x80) {                         // $92A1 BMI $92AE
        cy += 3;
        period = (period + 1) & 0xff; cy += 6;   // $92AE INC $9274
        cy += 2;                                 // $92B1 AND #$7F
        cy += 2;                                 // $92B3 TAY
      } else {
        cy += 2;
        A = period; cy += 4;                  // $92A3 LDA $9274
        if (A === 0) cy += 3;                 // $92A6 BEQ $92B4
        else {
          cy += 2;
          period = (period - 1) & 0xff; cy += 6;  // $92A8 DEC $9274
          A = Y; cy += 2;                        // $92AB TYA
          if (A !== 0) cy += 3;                  // $92AC BNE $92B4
          else {
            cy += 2;
            period = (period + 1) & 0xff; cy += 6;
            cy += 2;
            cy += 2;
          }
        }
      }
    }
    C = savedC; cy += 4;                      // $92B4 PLP

    inner = (inner - 1) & 0xff; cy += 6;      // $92B5 DEC $9272
    if (inner !== 0) { cy += 3; continue; }
    cy += 2;
    outer = (outer - 1) & 0xff; cy += 6;      // $92BA DEC $9273
    if (outer !== 0) { cy += 3; continue; }
    cy += 2;
    cy += 6;                                  // $92BF RTS
    break;
  }
  return { toggles, cycles: cy, reg: (r1 << 8) | r0, period };
}

/**
 * LASER at `$92D1`.
 *
 *     $92D1  LDY #$0E                ; fourteen sweeps
 *     $92D3  LDX #$00
 *     $92D5  TXA / CLC / SBC #$01    ; a delay proportional to X
 *     $92D9  BNE $92D7
 *     $92DB  STA $C030 / INX / CPX #$8C / BNE $92D5
 *     $92E3  DEY / BNE $92D3
 *
 * The delay is not quite `X`. `CLC` then `SBC #$01` takes **two** off the first time, and the
 * loop re-enters the `SBC` without touching the carry, so every pass after the first takes
 * one - and an odd X borrows down through zero to 255 first and comes back the long way. A
 * period rising from 0 to 139, fourteen times: a falling whine repeated.
 */
export function laser92D1(): SoundResult {
  const toggles: number[] = [];
  let cy = 0;
  cy += 2;                                    // $92D1 LDY #$0E
  for (let Y = 14; Y > 0; Y--) {
    cy += 2;                                  // $92D3 LDX #$00
    for (let X = 0; X < 0x8c; X++) {
      let A = X & 0xff; cy += 2;              // $92D5 TXA
      let C = 0; cy += 2;                     // $92D6 CLC
      for (;;) {                              // $92D7 SBC #$01 / $92D9 BNE
        const d = A - 1 - (1 - C);
        C = d >= 0 ? 1 : 0;
        A = d & 0xff;
        cy += 2;
        if (A === 0) { cy += 2; break; }
        cy += 3;
      }
      cy += 4;                                // $92DB STA $C030
      toggles.push(cy);
      cy += 2;                                // $92DE INX
      cy += 2;                                // $92DF CPX #$8C
      cy += X + 1 < 0x8c ? 3 : 2;             // $92E1 BNE $92D5
    }
    cy += 2;                                  // $92E3 DEY
    cy += Y - 1 > 0 ? 3 : 2;                  // $92E4 BNE $92D3
  }
  cy += 6;                                    // $92E6 RTS
  return { toggles, cycles: cy, reg: 0, period: 0 };
}

/**
 * EXPL at `$9270`, entered at `$9276`.
 *
 *     $9272  LDA #$00 / TAY / SEC            ; never runs - the BASIC calls $9276
 *     $9276  ROL $9270 / ROL $9271
 *     $927C  BCC $9281 / LDA $C030           ; toggle on the register's top bit, no divider
 *     $9281  ROR A x3 / EOR $9271 / ASL A x3 ; the same feedback as SOUND GEN
 *     $928A  DEY / TYA / BNE $928F / RTS
 *     $928F  JMP $9276
 *
 * The three bytes of setup at `$9272` sit **below** the entry point, so `CALL 37494` skips
 * them: Y is whatever Applesoft left and the count is not 256 by construction, it is `Y` -
 * and `Y = 1` returns at once without a single toggle. `SEC` is skipped too, so the first
 * `ROL` shifts in whatever carry Applesoft left, and that alone changes the noise: the same
 * seed with the carry set diverges from the carry clear by the third toggle. The seed at
 * `$9270` is `$0414` from the file, but only on the first call; after that the register
 * carries on from where it stopped.
 *
 * What Applesoft leaves is not a guess. `CALL` is `$F1D5 JSR $DD67 / JSR $E752 /
 * JMP ($0050)`, and `$E75B` ends `LDA $A0 / LDY $A1 / STY $50 / STA $51 / RTS` - so Y is the
 * **low byte of the address called**, nothing between that and the indirect jump touching it.
 * For `CALL 37494` that is `$76`. Trapping the real call in the running game agrees: Y = 118,
 * the carry clear, the register still at `$0414` from the file. So the burst is **118
 * iterations**, and the default here is that rather than 256.
 */
export const EXPL_CALL_Y = 118;

export function expl9276(y = EXPL_CALL_Y, reg = 0x0414, floatingBus = FLOATING_BUS, carry = 0): SoundResult {
  let r0 = reg & 0xff;
  let r1 = (reg >> 8) & 0xff;
  let Y = y & 0xff;
  let C = carry & 1;
  const toggles: number[] = [];
  let cy = 0;

  for (;;) {
    const b0 = (r0 >> 7) & 1;                 // $9276 ROL $9270
    r0 = ((r0 << 1) | C) & 0xff; cy += 6;
    const b1 = (r1 >> 7) & 1;                 // $9279 ROL $9271
    r1 = ((r1 << 1) | b0) & 0xff; C = b1; cy += 6;

    let A = 0;
    if (!C) cy += 3;                          // $927C BCC $9281
    else { cy += 2; A = floatingBus & 0xff; cy += 4; toggles.push(cy); }   // $927E LDA $C030

    for (let i = 0; i < 3; i++) {             // $9281 ROR A x3
      const bit = A & 1;
      A = ((A >> 1) | (C << 7)) & 0xff;
      C = bit;
    }
    cy += 6;
    A ^= r1; cy += 4;                         // $9284 EOR $9271
    for (let i = 0; i < 3; i++) { C = (A >> 7) & 1; A = (A << 1) & 0xff; }   // $9287 ASL A x3
    cy += 6;

    Y = (Y - 1) & 0xff; cy += 2;              // $928A DEY
    cy += 2;                                  // $928B TYA
    if (Y === 0) { cy += 2; cy += 6; break; } // $928C BNE not taken, then $928E RTS
    cy += 3;
    cy += 3;                                  // $928F JMP $9276
  }
  return { toggles, cycles: cy, reg: (r1 << 8) | r0, period: 0 };
}
