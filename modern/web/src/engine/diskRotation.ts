/**
 * The renderer's rotation matrix, transcribed from $6000.
 *
 * The fitted `toCameraSpace()` that used to live in `diskProjection.ts` built its matrix from a
 * pair of Q15 tables read back as floats and rotated by heading and pitch only. The machine
 * rotates by three angles and never leaves fixed point, which is why this replaced it and why
 * that file is gone. The
 * nine Q15 entries at $7E-$8F come from a 65-entry quarter-cosine table at $609A, and both
 * that table and the code that reads it are lossy in ways that move pixels - so a float
 * rotation cannot reproduce the disk even in principle. Over a sweep of 357 angle triples a
 * float version of the same formula is out by as much as 0.035 in Q15.
 *
 * The chain, from the display list inwards:
 *
 *   $62CB  INY / LDA ($9B),Y / STA $008F,Y / CPY #$09 / BNE     ; nine bytes -> $90-$98
 *   $62D5  JSR $654E                                            ; build the matrix
 *
 * so $90-$95 are the camera position and $96/$97/$98 are pitch, bank and heading, copied
 * out of the display list rather than read from $731B-$7323 directly.
 *
 *   $654E  LDA $96 / JSR $64F8 / STA $60 / STX $61              ; sin pitch
 *          ...the same for $97 -> $62, $98 -> $64               ; sin bank, sin heading
 *          LDA $96 / JSR $64FB / STA $66 / STX $67              ; cos pitch
 *          ...the same for $97 -> $68, $98 -> $6A
 *   $6584  JSR $633D five times, then adds and subtracts        ; the nine entries
 *
 * `$633D` is `dest = src1 * src2` with all three addresses passed in registers, over the
 * 16-bit signed multiply at `$635C`. `$64FB` is cosine; `$64F8` subtracts $40 first and falls
 * into it, which is sine.
 *
 * Verified against the machine: all 256 angles through both `$64FB` and `$64F8`, 768 operand
 * pairs through `$635C`, and the nine matrix entries over a sweep of pitch, bank and heading,
 * by `oracle/probe_rottrig.mjs` and `oracle/rotation_parity.mjs`.
 */

/**
 * $609A - a quarter cosine, 65 entries of Q15, indexed by angle in 256ths of a turn.
 *
 * Read off the flight snapshot. Entry 25 is 26489 where a true cosine gives 26790, which is
 * an error in the shipped table rather than in the reading of it; it is kept as it is.
 */
export const COS_TABLE: readonly number[] = [
  32767, 32757, 32727, 32678, 32609, 32521, 32412, 32284,
  32137, 31971, 31785, 31580, 31356, 31113, 30851, 30571,
  30272, 29955, 29621, 29268, 28897, 28510, 28105, 27683,
  27244, 26489, 26318, 25831, 25329, 24811, 24278, 23731,
  23169, 22594, 22004, 21402, 20787, 20159, 19519, 18867,
  18204, 17530, 16845, 16150, 15446, 14732, 14009, 13278,
  12539, 11792, 11039, 10278, 9511, 8739, 7961, 7179,
  6393, 5601, 4807, 4011, 3212, 2410, 1607, 804, 0,
];

const s16 = (v: number): number => (v > 32767 ? v - 65536 : v);

/**
 * $6509 - the negated fetch, which is not a negation.
 *
 * `SEC / LDA #$00 / SBC $609B,Y / TAX / SBC $609A,Y` subtracts the **high** byte first, keeps
 * that in X as the result's high byte, then subtracts the low byte from it into A. So the low
 * byte comes out as `-high - low`, not as `-low`, and the answer is short of a true negation
 * by a few hundred: -cos(45 degrees) reads back as -23004 where the table holds 23169.
 */
function negatedEntry(entry: number): number {
  const lo = entry & 0xff;
  const hi = (entry >> 8) & 0xff;
  const t = (0 - hi) & 0xff;            // SBC $609B,Y with carry set
  const borrow = hi === 0 ? 0 : 1;      // ...and the borrow it leaves
  const a = (t - lo - borrow) & 0xff;   // SBC $609A,Y, from X rather than from zero
  return s16((t << 8) | a);
}

/** $64FB - cosine of an angle byte, 256 to the turn. */
export function cos64FB(angle: number): number {
  let a = angle & 0xff;
  if (a & 0x80) {                       // $64FC BMI $651D
    a = (-a) & 0xff;                    // EOR #$FF / CLC / ADC #$01
    if (a & 0x80) return negatedEntry(COS_TABLE[((a << 1) & 0xff) >> 1]); // $6524, a = $80
  }
  if (a < 0x40) return s16(COS_TABLE[a]);                       // $6514
  return negatedEntry(COS_TABLE[(((a + 0x7f) ^ 0xff) & 0xff)]); // $6502
}

/** $64F8 - `SEC / SBC #$40` and fall into the cosine, which makes it a sine. */
export function sin64F8(angle: number): number {
  return cos64FB((angle - 0x40) & 0xff);
}

/**
 * $635C - the 16-bit signed multiply, fifteen shift-and-add rounds.
 *
 * It is **not** `a * b / 32768`. The first thing it does to `a` is turn it into `-|a| - 1`
 * (one's complement when positive, decrement when negative), so a clear bit means a set bit
 * of the magnitude, exactly as $691E does in the projection. The first six rounds carry an
 * eight-bit accumulator and add only b's high byte; the remaining nine carry sixteen bits.
 * Bit 15 is never tested. The result is a magnitude, negated at the end if the signs differed.
 */
export function mul635C(a16: number, b16: number): number {
  let s78 = a16 & 0xff;
  let s79 = (a16 >> 8) & 0xff;
  let s7a = b16 & 0xff;
  let s7b = (b16 >> 8) & 0xff;
  const negate = ((s79 ^ s7b) & 0x80) !== 0;      // $635C-$6360, tested by $6453 CPY #$00

  if (s79 & 0x80) {                               // $6373 - a is negative, decrement
    if (s78 === 0) s79 = (s79 - 1) & 0xff;
    s78 = (s78 - 1) & 0xff;
  } else {                                        // $6365 - a is positive, complement
    s78 = ~s78 & 0xff;
    s79 = ~s79 & 0xff;
  }
  if (s7b & 0x80) {                               // $637F - b becomes its magnitude
    const n = -((s7b << 8) | s7a) & 0xffff;
    s7a = n & 0xff;
    s7b = (n >> 8) & 0xff;
  }

  let A = s7b;
  let C = 0;
  let a5 = 0;
  const lsrMem = (v: number): number => { C = v & 1; return (v >> 1) & 0xff; };
  const rorMem = (v: number): number => {
    const b0 = v & 1;
    const r = ((v >> 1) | (C << 7)) & 0xff;
    C = b0;
    return r;
  };
  const lsrA = (): void => { C = A & 1; A = (A >> 1) & 0xff; };
  const adcA = (v: number): void => { const s = A + v + C; C = s > 0xff ? 1 : 0; A = s & 0xff; };

  // $638C - the eight-bit half: six bits of a against b's high byte alone.
  s78 = lsrMem(s78);
  if (C) A = 0;                                   // $6390 LDA #$00
  for (let i = 0; i < 5; i++) {                   // $6392, $6399, $63A0, $63A7, $63AE
    lsrA();
    s78 = rorMem(s78);
    if (!C) adcA(s7b);
  }
  lsrA();                                         // $63B5

  // $63BA - the sixteen-bit half, nine rounds: two more of $78, then seven of $79.
  for (let i = 0; i < 9; i++) {
    if (i < 2) s78 = lsrMem(s78); else s79 = lsrMem(s79);
    if (!C) {
      const x = A;
      const lo = a5 + s7a + C;
      a5 = lo & 0xff;
      C = lo > 0xff ? 1 : 0;
      const hi = x + s7b + C;
      C = hi > 0xff ? 1 : 0;
      A = hi & 0xff;
    }
    lsrA();
    const b0 = a5 & 1;
    a5 = ((a5 >> 1) | (C << 7)) & 0xff;
    C = b0;
  }

  if (negate) {                                   // $6457
    const n = -((A << 8) | a5) & 0xffff;
    a5 = n & 0xff;
    A = (n >> 8) & 0xff;
  }
  return s16(((A & 0xff) << 8) | a5);
}

/** The nine entries at $7E-$8F, in the order the transform reads them: rows of three. */
export type RotationMatrix = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

/**
 * $654E - build the matrix from pitch, bank and heading.
 *
 * Six table reads, five multiplies into scratch, four more, then the adds and subtracts at
 * $65CC-$662E. Writing Sp/Cp for the pitch pair and Sb/Cb, Sh/Ch for the others, and with
 * every product taken through `mul635C` rather than multiplied outright:
 *
 *     [ Ch.Cb + Sp.Sh.Sb    Sb.Cp    Sp.Ch.Sb - Sh.Cb ]
 *     [ Sp.Sh.Cb - Ch.Sb    Cp.Cb    Sh.Sb + Sp.Ch.Cb ]
 *     [ Sh.Cp               -Sp      Ch.Cp            ]
 *
 * At all three angles zero this is the identity $6140 preloads, except that the machine's
 * identity is $7FFD and the table's is $7FFF - a two-bit difference the first render erases.
 */
export function buildMatrix654E(pitch: number, bank: number, heading: number): RotationMatrix {
  const sp = sin64F8(pitch);    // $60
  const sb = sin64F8(bank);     // $62
  const sh = sin64F8(heading);  // $64
  const cp = cos64FB(pitch);    // $66
  const cb = cos64FB(bank);     // $68
  const ch = cos64FB(heading);  // $6A

  const m = mul635C;
  const z6c = m(ch, cb);        // $6584
  const z6e = m(sh, sb);        // $658D
  const z70 = m(ch, sb);        // $6596
  const z72 = m(sh, cb);        // $659F
  const z74 = m(sp, z6e);       // $65A8
  const z76 = m(sp, z72);       // $65B1
  const zb3 = m(z70, sp);       // $65BA
  const zb5 = m(sp, z6c);       // $65C3

  const w = (v: number): number => s16(v & 0xffff);
  return [
    w(z6c + z74), w(m(sb, cp)), w(zb3 - z72),   // $65CC, $65E6, $660E
    w(z76 - z70), w(m(cp, cb)), w(z6e + zb5),   // $65D9, $65F8, $661B
    w(m(sh, cp)), w(-sp), w(m(ch, cp)),         // $65EF, $6601, $6628
  ];
}

/**
 * $6730-$67D3 - `camera = M . (p - origin)`, with every product through the same multiply.
 *
 * $675B onwards is three blocks of `dx * M[row][0]`, `dy * M[row][1]`, `dz * M[row][2]`
 * summed by $67D4 and stored through the moving pointer at $B2.
 */
export function toCameraSpace6730(
  p: readonly [number, number, number],
  origin: readonly [number, number, number],
  mat: RotationMatrix,
): [number, number, number] {
  const d = [s16((p[0] - origin[0]) & 0xffff), s16((p[1] - origin[1]) & 0xffff),
    s16((p[2] - origin[2]) & 0xffff)];
  const out: number[] = [];
  for (let r = 0; r < 3; r++) {
    const sum = mul635C(d[0], mat[r * 3]) + mul635C(d[1], mat[r * 3 + 1])
      + mul635C(d[2], mat[r * 3 + 2]);
    out.push(s16(sum & 0xffff));
  }
  return [out[0], out[1], out[2]];
}

/**
 * $6631 - the per-object scale, three 16-bit factors from `$600E-$6013`.
 *
 * Row 0 of the matrix is multiplied by the first, row 1 by the second, row 2 by the third, so
 * it scales the three **camera-space axes** rather than the model. Each row is skipped when
 * its factor is `$7FFF`, which is why the middle one usually costs nothing.
 *
 * This is where the port's fitted focal lengths came from. `$68A1` divides x by z and scales
 * by 69, and `$6DD5` doubles the result, so across the screen the focal length is
 * `2 * 69 * factor0 / factor2`; down it is `62 * factor1 / factor2`. For the flight snapshot's
 * 16000 / 32767 / 9541 those are 231.42 and 212.93, against the 230.90 and 212.80 that were
 * fitted to captures.
 */
export function applyObjectScale(
  m: RotationMatrix,
  scale: readonly [number, number, number],
): RotationMatrix {
  const out = m.slice() as number[];

  // $6631 has a bug, and it is load-bearing. Each row starts
  //
  //     LDX $600F / CPX #$7F / BNE $663F / LDA $600E / CMP #$FF / BEQ (skip row)
  //     $663F  STA $78 / STX $79
  //
  // and the `BNE` jumps straight to the store. So unless the factor's high byte happens to be
  // $7F, `LDA $600E` never runs and the factor's **low byte is whatever A last held**. Only
  // the row's first multiply is affected; the other two reload the factor properly. In the
  // flight snapshot that turns factor 16000 into 16125 for row 0, which is a 0.8% stretch
  // across the screen, so it cannot be tidied away.
  //
  // A arrives holding the low byte of $8E, from the last `$633D` in $654E, and then follows
  // every multiply's low byte through the block.
  let acc = out[8] & 0xff;

  for (let row = 0; row < 3; row++) {
    const hi = (scale[row] >> 8) & 0xff;
    if (hi === 0x7f) {
      acc = scale[row] & 0xff;                        // $6638 LDA $600E
      if (acc === 0xff) continue;                     // $663D BEQ - the row is left alone
    }
    const effective = s16(((hi << 8) | acc) & 0xffff); // $663F STA $78 / STX $79

    for (let c = 0; c < 3; c++) {
      // $635C is not symmetric - it complements its first operand and takes the magnitude of
      // the second - and the block does not load them consistently. Row 0's columns 1 and 2
      // put the matrix entry in $78 ($6656, $666F); every other multiply puts the factor
      // there. Swapping the two changes the answer.
      const f = c === 0 ? effective : scale[row];
      const res = row === 0 && c > 0
        ? mul635C(out[row * 3 + c], f)
        : mul635C(f, out[row * 3 + c]);
      out[row * 3 + c] = res;
      acc = res & 0xff;
    }
  }
  return out as unknown as RotationMatrix;
}


/**
 * The scale the flight snapshot's one object carries, read at `$6631` by
 * `oracle/probe_pipeline.mjs`. It is patched per object from the model stream at `$690F`, so
 * this is a default rather than a constant of the renderer.
 */
export const SNAPSHOT_SCALE: readonly [number, number, number] = [16000, 32767, 9541];
