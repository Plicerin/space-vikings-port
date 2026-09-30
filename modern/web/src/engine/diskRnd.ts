/**
 * Applesoft's RND, and just enough of its floating point to run it.
 *
 * Every `RND(1)` in the game goes through `$EFAE`, and without it nothing RND-driven can be
 * replayed - which is why the combat and the damage model are checked by predicate rather than
 * by replay, and why EXPL's noise can only be matched given the same floating-bus reads.
 *
 * ```
 * $EFAE  JSR $EB82                      ; the sign of FAC
 * $EFB2  BMI $EFCC                      ; a negative argument reseeds from FAC
 * $EFB4  LDA #$C9 / LDY #$00 / JSR $EAF9   ; FAC <- the seed at $00C9
 * $EFBB  TXA / BEQ $EFA5                 ; RND(0) returns the last value unchanged
 * $EFBE  LDA #$A6 / LDY #$EF / JSR $E97F   ; FAC *= the constant at $EFA6
 * $EFC5  LDA #$AA / LDY #$EF / JSR $E7BE   ; FAC += the constant at $EFAA
 * $EFCC  LDX $A1 / LDA $9E / STA $A1 / STX $9E   ; swap mantissa bytes 1 and 4
 * $EFD4  LDA #$00 / STA $A2              ; make it positive
 * $EFD8  LDA $9D / STA $AC               ; the guard byte becomes the OLD exponent
 * $EFDC  LDA #$80 / STA $9D              ; and the exponent becomes $80
 * $EFE0  JSR $E82E                       ; normalise
 * $EFE3  LDX #$C9 / LDY #$00 / JMP $EB2B ; store back over the seed, and return it
 * ```
 *
 * The constants are the well-known pair: `98 35 44 7A 68` is 11879546.40625 and
 * `68 28 B1 46 20` is 3.927677783011063e-8. What is less often said is the line at `$EFD8`:
 * the guard byte is loaded with the **old exponent** before the new one is forced to `$80`, so
 * a byte that had nothing to do with the mantissa is shifted into it by the normalise and then
 * rounded in by the store. That is deliberate mixing, and leaving it out gives a different
 * sequence within a handful of calls.
 *
 * The float is five bytes: an excess-128 exponent and a 32-bit mantissa. In memory bit 7 of
 * the first mantissa byte is the sign and the leading 1 is implied (`$EB43 LDA $A2 / ORA #$7F /
 * AND $9E`); in FAC the sign is separate at `$A2` and the mantissa's top bit is an explicit 1.
 * `$AC` is a fifth mantissa byte - the guard - which the arithmetic keeps and the store rounds
 * away, half up, through the carry chain at `$E8C6`.
 *
 * Verified against the machine by `oracle/probe_rnd.mjs` and `oracle/rnd_parity.mjs`: the seed
 * is read back after every call and compared byte for byte, from several starting seeds, and
 * every byte of every call agrees.
 *
 * Two things have to be right that are easy to miss. `$A4` is what the shifts fill from and
 * nothing sets it. And the length of FMULT's whole-byte shortcut depends on the carry it is
 * entered with - eight bits when set, nine when clear - which chains from byte to byte and
 * starts from `$EA0E`'s exponent add.
 */

/** `$EFA6`, the multiplier: 11879546.40625. */
export const RND_MULTIPLIER = [0x98, 0x35, 0x44, 0x7a, 0x68] as const;
/** `$EFAA`, the addend: 3.927677783011063e-8. */
export const RND_ADDEND = [0x68, 0x28, 0xb1, 0x46, 0x20] as const;

/** FAC: an exponent, a 40-bit mantissa (32 bits plus the guard byte), and a sign. */
export interface Fac {
  exp: number;
  /** The 32-bit mantissa shifted up eight, with `$AC` in the low byte. */
  m: bigint;
  /** 0 for positive, 0xFF for negative, as `$A2` holds it. */
  /** 0 for positive; bit 7 set for negative, as `$A2` holds it. */
  sign: number;
}

const M40 = (1n << 40n) - 1n;
const TOP = 1n << 39n;                 // bit 7 of $9E, the bit normalise shifts up to

/** Unpack the five bytes as they sit in memory. */
export function facFromBytes(b: readonly number[]): Fac {
  if (b[0] === 0) return { exp: 0, m: 0n, sign: 0 };
  const mant = ((BigInt(b[1] | 0x80) << 24n) | (BigInt(b[2]) << 16n)
    | (BigInt(b[3]) << 8n) | BigInt(b[4]));
  return { exp: b[0], m: mant << 8n, sign: b[1] & 0x80 };
}

/**
 * `$EB2B` - round on the guard byte, then store. `$EB72` rounds half up and `$E8C6` carries it
 * through the mantissa; a carry out of the top shifts right and bumps the exponent.
 */
export function facToBytes(f: Fac): number[] {
  if (f.exp === 0 || f.m === 0n) return [0, 0, 0, 0, 0];
  let exp = f.exp;
  let m = f.m;
  if ((m & 0xffn) >= 0x80n) {                     // the guard byte's top bit
    m = (m & ~0xffn) + 0x100n;
    if (m > M40) { m >>= 1n; exp += 1; if (exp > 0xff) return [0, 0, 0, 0, 0]; }
  }
  const mant = (m >> 8n) & 0xffffffffn;
  const b1 = Number((mant >> 24n) & 0xffn);
  return [exp & 0xff,
    ((f.sign & 0x80) ? (b1 | 0x80) : (b1 & 0x7f)) & 0xff,
    Number((mant >> 16n) & 0xffn), Number((mant >> 8n) & 0xffn), Number(mant & 0xffn)];
}

/** The value a five-byte float stands for, for printing. */
export function facValue(b: readonly number[]): number {
  if (b[0] === 0) return 0;
  const sign = (b[1] & 0x80) ? -1 : 1;
  const mant = ((b[1] | 0x80) * 0x1000000 + b[2] * 0x10000 + b[3] * 0x100 + b[4]) / 0x100000000;
  return sign * mant * Math.pow(2, b[0] - 128);
}

/**
 * `$E82E` - shift the mantissa up until its top bit is set, taking the count off the exponent.
 *
 * Whole bytes first (`$E832`-`$E84C`, which gives up and returns zero after four of them),
 * then single bits. Nothing is rounded here.
 */
export function normalizeE82E(f: Fac): Fac {
  let { exp, m, sign } = f;
  if (m === 0n) return { exp: 0, m: 0n, sign: 0 };
  let shifted = 0;
  while ((m >> 32n) === 0n) {                     // the top mantissa byte is empty
    m = (m << 8n) & M40;
    shifted += 8;
    if (shifted === 32) return { exp: 0, m: 0n, sign: 0 };
  }
  while ((m & TOP) === 0n) { m = (m << 1n) & M40; shifted += 1; }
  if (shifted >= exp) return { exp: 0, m: 0n, sign: 0 };   // $E885 BCS - underflow
  return { exp: exp - shifted, m, sign };
}

/**
 * `$E97F` - multiply, forty shift-and-add rounds.
 *
 * `$EA0E` adds the exponents with the excess-128 adjustment, then `$E994`-`$E9AA` walk FAC's
 * five bytes from the guard upwards, eight bits each, adding ARG's mantissa into a 40-bit
 * accumulator that rotates right once per bit. The accumulator ends up holding the top forty
 * bits of the seventy-two bit product, which is what this computes directly.
 */
export function fmultE97F(fac: Fac, arg: Fac, shiftIn = 0): Fac {
  if (fac.exp === 0 || arg.exp === 0) return { exp: 0, m: 0n, sign: 0 };

  // $EA0E adds the exponents and leaves a carry the multiply loop then depends on:
  //
  //   $EA12  CLC / ADC $9D / BCC $EA1B / BMI (overflow) / CLC / .byte $2C
  //   $EA1B  BPL (underflow)
  //   $EA1D  ADC #$80 / STA $9D
  //
  // The `.byte $2C` is `BIT abs`, swallowing the `BPL` so the carry-set path skips it. Either
  // way `ADC #$80` runs with the carry clear, so it comes out **set exactly when the sum of
  // the two exponents is under $100** - and that is what decides whether the whole-byte
  // shortcut below runs for eight bits or nine. Measured at $E9B0 on three seeds: 0, 0 and 1,
  // which is what this predicts.
  const sum = arg.exp + fac.exp;
  const exp = sum - 0x80;
  if (sum < 0x80) return { exp: 0, m: 0n, sign: 0 };         // $EA1B BPL - underflow to zero
  if (sum >= 0x180) throw new RangeError('?OVERFLOW ERROR');  // $EA17 BMI - Applesoft errors out
  const carryIn = sum < 0x100 ? 1 : 0;
  const argMant = (arg.m >> 8n) & 0xffffffffn;               // ARG keeps four bytes
  const fill = BigInt(shiftIn & 0xff);

  // $E994-$E9AA walk FAC's five bytes from the guard upwards, eight bits each, least
  // significant first, adding ARG into a 40-bit accumulator that rotates right once a bit.
  let acc = 0n;
  const bytes = [fac.m & 0xffn, (fac.m >> 8n) & 0xffn, (fac.m >> 16n) & 0xffn,
    (fac.m >> 24n) & 0xffn, (fac.m >> 32n) & 0xffn];
  // The shortcut's length depends on the carry it is entered with, so the carry has to be
  // carried between bytes. `$E9E2 RTS` is reached with the sentinel's last bit in it, so a
  // normal byte leaves it **set**; `$E911 CLC / RTS` means a shortcut leaves it **clear**.
  let carry = carryIn & 1;
  for (let bi = 0; bi < 5; bi++) {
    const b = bytes[bi];
    // $E9B0 BNE / JMP $E8DA: a zero byte skips the eight rounds. $E8DC-$E8EE shift one whole
    // byte, filling the top from $A4 - not zero - and moving the old low byte into $AC.
    if (b === 0n && bi < 4) {
      acc = ((acc >> 8n) | (fill << 32n)) & M40;
      // Then `$E8F0 ADC #$08 / BMI / BEQ / SBC #$08 / TAY / LDA $AC / BCS $E911`. Entered with
      // the carry SET that arithmetic leaves Y at 0 and the BCS exits: eight bits exactly.
      // Entered CLEAR it leaves Y at $FF, the BCS falls through, and `INY / BNE` runs the bit
      // loop once - a ninth bit. $E8FD's rotate sign-extends the top byte and shifts the four
      // bytes down; the guard is only ever in A (`$E8F9 LDA $AC`, never stored back), so it
      // does not move.
      if (carry === 0) {
        const top = (acc >> 8n) & 0xffffffffn;
        acc = (((top >> 1n) | (top & 0x80000000n)) << 8n) | (acc & 0xffn);
      }
      carry = 0;
      continue;
    }
    for (let bit = 0; bit < 8; bit++) {
      const set = ((b >> BigInt(bit)) & 1n) === 1n;
      let c = 0n;
      if (set) {
        const top = ((acc >> 8n) & 0xffffffffn) + argMant;   // $E9BB-$E9D2
        c = (top >> 32n) & 1n;
        acc = ((top & 0xffffffffn) << 8n) | (acc & 0xffn);
      }
      acc = ((acc >> 1n) | (c << 39n)) & M40;                // $E9D4-$E9DC
    }
    carry = 1;
  }
  return normalizeE82E({ exp, m: acc, sign: (fac.sign ^ arg.sign) & 0x80 });
}

/**
 * `$E8F0` and `$E8FD` - shift a mantissa right, the way the aligner does it.
 *
 * Whole bytes first, and what each of those shifts **in** is `$A4`, not zero:
 * `$E8EC LDY $A4 / STY $01,X`. The remaining bits go through `$E8FD ASL / BCC / INC / ROR`,
 * which is the sign-extending rotate, so those come from the value's own top bit.
 *
 * Nothing in FADD or FMULT sets `$A4`. It is the sign-extension byte for a shift and the
 * caller is supposed to have it right; RND's callers do not set it either, so it is whatever
 * the interpreter last left there - `$FF` throughout every capture taken here. It is not a
 * detail that can be left out: aligning a tiny addend against a large FAC shifts five bytes of
 * `$FF` into the top of it, and the add then carries where it otherwise would not.
 */
export function shiftRightE8F0(m: bigint, n: number, fill: number): bigint {
  let v = m;
  let left = n;
  const f = BigInt(fill & 0xff);
  while (left >= 8) { v = ((v >> 8n) | (f << 32n)) & M40; left -= 8; }
  for (let i = 0; i < left; i++) {
    const top = v & TOP;                                  // the sign-extending rotate
    v = ((v >> 1n) | top) & M40;
  }
  return v;
}

/**
 * `$E7BE` - add.
 *
 * Line up the exponents by shifting the smaller operand right, add or subtract depending on
 * the signs, then normalise. `$E7EE CMP #$F9 / BMI $E7B9` does **not** give up on a difference
 * of more than seven - `$E7B9 JSR $E8F0` is the whole-byte shift, and it carries on into the
 * add. Reading that as a bail is what made the first attempt at this diverge on call zero.
 */
export function faddE7BE(fac: Fac, arg: Fac, shiftIn = 0): Fac {
  if (arg.exp === 0) return fac;                             // $E7CF
  if (fac.exp === 0) return arg;
  let big = fac;
  let small = arg;
  if (arg.exp > fac.exp) { big = arg; small = fac; }
  const diff = big.exp - small.exp;
  const shifted = shiftRightE8F0(small.m, diff, shiftIn);
  let m: bigint;
  let sign = big.sign;
  if ((((big.sign ^ small.sign) & 0x80)) === 0) {             // like signs: add
    m = big.m + shifted;
    if (m > M40) {
      // $E88D: the carry out shifts the whole thing right and bumps the exponent, bringing
      // that carry into bit 39.
      m = ((m & M40) >> 1n) | TOP;
      return { exp: big.exp + 1, m, sign };
    }
  } else {                                                   // unlike: subtract
    m = big.m - shifted;
    if (m < 0n) { m = -m; sign = small.sign; }
  }
  return normalizeE82E({ exp: big.exp, m: m & M40, sign });
}

/**
 * `$EFAE` with a positive argument - one call of `RND(1)`.
 *
 * Takes the five seed bytes as they sit at `$00C9` and gives back the new ones and the value.
 */
export function rndEFAE(
  seed: readonly number[], shiftIn = 0,
): { seed: number[]; value: number } {
  let fac = facFromBytes(seed);
  fac = fmultE97F(fac, facFromBytes(RND_MULTIPLIER as unknown as number[]), shiftIn);  // $EFBE
  fac = faddE7BE(fac, facFromBytes(RND_ADDEND as unknown as number[]), shiftIn);  // $EFC5

  // $EFCC: swap mantissa bytes 1 and 4 - $9E with $A1 - leaving the guard where it is.
  const b1 = (fac.m >> 32n) & 0xffn;
  const b4 = (fac.m >> 8n) & 0xffn;
  let m = (fac.m & ~((0xffn << 32n) | (0xffn << 8n))) | (b4 << 32n) | (b1 << 8n);

  // $EFD8: the guard byte becomes the old exponent, and $EFDC forces the new one to $80.
  m = (m & ~0xffn) | BigInt(fac.exp & 0xff);

  const out = normalizeE82E({ exp: 0x80, m: m & M40, sign: 0 });                // $EFE0
  const bytes = facToBytes(out);                                                // $EFE3
  return { seed: bytes, value: facValue(bytes) };
}

/** A generator over consecutive calls, for driving anything that wants `RND(1)`. */
export function rndSequence(seed: readonly number[], shiftIn = 0): () => number {
  let s = seed.slice();
  return () => { const r = rndEFAE(s, shiftIn); s = r.seed; return r.value; };
}
