import { glyphFor } from './diskFont';
const W = 560;
const H = 384;

const PALETTE: Record<number, string> = {
  0: '#000000',
  1: '#22dd55',
  2: '#cc44ff',
  3: '#ffffff',
  4: '#000000',
  5: '#ff8a2a',
  6: '#3a8cff',
  7: '#ffffff',
};

/**
 * Which pixel columns each HCOLOR lights, measured from the Applesoft ROM by
 * oracle/probe_hcolor.mjs: black lights none, green and orange the odd columns, violet and
 * blue the even ones, white all of them.
 */
const enum Phase { None = 0, Odd = 1, Even = 2, All = 3 }
const HCOLOR_PHASE: readonly Phase[] = [
  Phase.None,  // 0 black1
  Phase.Odd,   // 1 green
  Phase.Even,  // 2 violet
  Phase.All,   // 3 white1
  Phase.None,  // 4 black2
  Phase.Odd,   // 5 orange
  Phase.Even,  // 6 blue
  Phase.All,   // 7 white2
];

const PALETTE_ARGB = new Map<number, number>();
for (let i = 0; i <= 7; i++) {
  const hex = PALETTE[i]!;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  PALETTE_ARGB.set(i, (0xff << 24) | (r << 16) | (g << 8) | b);
}


/**
 * $6BC2 and $6C4E - where a half-column lands, and which bits it lights.
 *
 * $6DD5 does not work in the Apple's 280 columns. Its two endpoints are the bytes $68A1
 * produced, mapped by `x + 70` and `95 - y`, so x runs 1..139 - and $6DB5 turns that into a
 * screen address and a mask through a pair of 140-entry tables:
 *
 *     $6DC8  LDX $B3 / LDA $6BC2,X    ; the byte within the row
 *     $6DD1  LDA $6C4E,X              ; and the bits to OR into it
 *
 * Every one of the first 140 masks has exactly two bits set, which is what makes a point two
 * pixels wide. Twenty of them set bit 7, and bit 7 is not a pixel - it picks the palette pair
 * - which $6D8F handles by carrying the second dot into the next byte, so the pair stays
 * contiguous either way and a half-column lights screen pixels 2x and 2x + 1.
 *
 * 256 entries are kept because $B3 is a byte and the machine indexes it with no bound: past
 * 139 each table simply runs into whatever follows it, which for $6BC2 is the mask table at
 * $6C4E. Nothing $68A1 can return reaches there - it clamps x to +/-69, so a half-column is
 * 1 to 139 - but transcribing the bytes costs nothing and avoids inventing a limit the
 * routine does not have.
 *
 * Read off the flight snapshot.
 */
export const HALF_COLUMN_BYTE: readonly number[] = [
  0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4, 4, 5, 5,
  5, 6, 6, 6, 6, 7, 7, 7, 8, 8, 8, 8, 9, 9, 9, 10, 10, 10, 10, 11,
  11, 11, 12, 12, 12, 12, 13, 13, 13, 14, 14, 14, 14, 15, 15, 15, 16, 16, 16, 16,
  17, 17, 17, 18, 18, 18, 18, 19, 19, 19, 20, 20, 20, 20, 21, 21, 21, 22, 22, 22,
  22, 23, 23, 23, 24, 24, 24, 24, 25, 25, 25, 26, 26, 26, 26, 27, 27, 27, 28, 28,
  28, 28, 29, 29, 29, 30, 30, 30, 30, 31, 31, 31, 32, 32, 32, 32, 33, 33, 33, 34,
  34, 34, 34, 35, 35, 35, 36, 36, 36, 36, 37, 37, 37, 38, 38, 38, 38, 39, 39, 39,
  3, 12, 48, 192, 6, 24, 96, 3, 12, 48, 192, 6, 24, 96, 3, 12, 48, 192, 6, 24,
  96, 3, 12, 48, 192, 6, 24, 96, 3, 12, 48, 192, 6, 24, 96, 3, 12, 48, 192, 6,
  24, 96, 3, 12, 48, 192, 6, 24, 96, 3, 12, 48, 192, 6, 24, 96, 3, 12, 48, 192,
  6, 24, 96, 3, 12, 48, 192, 6, 24, 96, 3, 12, 48, 192, 6, 24, 96, 3, 12, 48,
  192, 6, 24, 96, 3, 12, 48, 192, 6, 24, 96, 3, 12, 48, 192, 6, 24, 96, 3, 12,
  48, 192, 6, 24, 96, 3, 12, 48, 192, 6, 24, 96, 3, 12, 48, 192,
];

export const HALF_COLUMN_MASK: readonly number[] = [
  3, 12, 48, 192, 6, 24, 96, 3, 12, 48, 192, 6, 24, 96, 3, 12, 48, 192, 6, 24,
  96, 3, 12, 48, 192, 6, 24, 96, 3, 12, 48, 192, 6, 24, 96, 3, 12, 48, 192, 6,
  24, 96, 3, 12, 48, 192, 6, 24, 96, 3, 12, 48, 192, 6, 24, 96, 3, 12, 48, 192,
  6, 24, 96, 3, 12, 48, 192, 6, 24, 96, 3, 12, 48, 192, 6, 24, 96, 3, 12, 48,
  192, 6, 24, 96, 3, 12, 48, 192, 6, 24, 96, 3, 12, 48, 192, 6, 24, 96, 3, 12,
  48, 192, 6, 24, 96, 3, 12, 48, 192, 6, 24, 96, 3, 12, 48, 192, 6, 24, 96, 3,
  12, 48, 192, 6, 24, 96, 3, 12, 48, 192, 6, 24, 96, 3, 12, 48, 192, 6, 24, 96,
  162, 0, 169, 0, 157, 0, 64, 157, 0, 65, 157, 0, 66, 157, 0, 67, 157, 0, 68, 157,
  0, 69, 157, 0, 70, 157, 0, 71, 157, 0, 72, 157, 0, 73, 157, 0, 74, 157, 0, 75,
  157, 0, 76, 157, 0, 77, 157, 0, 78, 157, 0, 79, 157, 0, 80, 157, 0, 81, 157, 0,
  82, 157, 0, 83, 157, 0, 84, 157, 0, 85, 157, 0, 86, 157, 0, 87, 157, 0, 88, 157,
  0, 89, 157, 0, 90, 157, 0, 91, 157, 0, 92, 157, 0, 93, 157, 0, 94, 157, 0, 95,
  232, 232, 232, 208, 155, 96, 200, 177, 155, 240, 9, 170, 202, 240, 40, 202,
];

/** 1..139 is everything $68A1 can produce; past that the tables run into their neighbours. */
export const HALF_COLUMNS = 140;

/**
 * $6B92 - the row table, and the bytes just past it.
 *
 * `$6DB5` turns a row into a screen address:
 *
 *     $6DB5  LDA $B4 / ROR A / ROR A / AND #$3E / TAY      ; 2 * ((y >> 3) & 31)
 *     $6DBC  LDA $B4 / AND #$07 / ASL A / ASL A            ; (y & 7) * 4
 *     $6DC2  CLC / ADC $6B93,Y / STA $9A                   ; + the row's high byte
 *     $6DC8  LDX $B3 / LDA $6BC2,X / ADC $6B92,Y / TAY     ; + its low byte, + that carry
 *
 * The table holds 24 entries, $4000 to $43D0 - hi-res page 2 - and the index is masked to 31,
 * not 23. A row of 192 or more therefore reads **past the end of it**, into the half-column
 * byte table at $6BC2, and computes an address from whatever is there. That is not a guard
 * that fails safe; it is arithmetic on the wrong bytes, and the renderer draws at the result.
 *
 * 64 bytes are kept here so any row byte 0..255 can be indexed the way the machine does.
 */
const ROW_TABLE: readonly number[] = [
  0, 64, 128, 64, 0, 65, 128, 65, 0, 66, 128, 66, 0, 67, 128, 67,
  40, 64, 168, 64, 40, 65, 168, 65, 40, 66, 168, 66, 40, 67, 168, 67,
  80, 64, 208, 64, 80, 65, 208, 65, 80, 66, 208, 66, 80, 67, 208, 67,
  0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4,
];

/** Page 2, which is where $6B92 points and where the renderer draws. */
const PAGE_LO = 0x4000;
const PAGE_HI = 0x6000;

/**
 * Screen address back to a row and a byte, or -1 for one of the eight bytes per block that
 * the display never fetches. Built from the same interleave the table encodes.
 */
const ADDR_TO_CELL = (() => {
  const m = new Int32Array(PAGE_HI - PAGE_LO).fill(-1);
  for (let y = 0; y < 192; y++) {
    const base = ((y & 7) << 10) | (((y >> 3) & 7) << 7) | ((y >> 6) * 40);
    for (let b = 0; b < 40; b++) m[base + b] = y * 40 + b;
  }
  return m;
})();

/**
 * How many columns a PRINT of the "full width" actually fills.
 *
 * `WNDWDTH` at `$21` is not a width. The hi-res character generator START BLOADs to `$9300`
 * keeps the cursor column in `CH` at `$24` as an **absolute** screen column, and its wrap is
 *
 * ```
 * $93D6  INC CH
 * $93D8  LDA CH
 * $93DA  CMP WNDWDTH
 * $93DC  BCC ...            ; still inside
 * $93DE  LDA WNDLFT
 * $93E0  STA CH             ; otherwise back to the left margin, on the next line
 * ```
 *
 * so the window is columns `WNDLFT .. WNDWDTH - 1` and holds `WNDWDTH - WNDLFT` of them. (The
 * Apple II monitor's own `COUT1` does the same thing with the same two bytes; the generator
 * reproduces its geometry rather than inventing one.)
 *
 * That is the whole of the "full-width PRINT behaves differently at left margin 0 and 1"
 * puzzle. GROUND FORCES line 100 sets `POKE 32,0: POKE 33,40`, so the window really does hold
 * forty columns and its forty spaces blank all of them. SUPPLY line 10 sets
 * `POKE 32,1: POKE 33,39`, which holds **38**, so the thirty-ninth space wraps to the next row
 * and column 39 is never written - it keeps whatever was under it.
 *
 * Measured over sixteen window settings in `oracle/probe_printmargin.mjs`, every one of which
 * lands where this predicts.
 */
export function windowColumns(wndLeft: number, wndWidth: number): number {
  return Math.max(0, wndWidth - wndLeft);
}

export class Hires {
  private displayCtx: CanvasRenderingContext2D;
  private offscreen: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private colorArgb = 0xffffffff;
  private colorIndex = 3;
  private phase: Phase = Phase.All;
  penX = 0;
  penY = 0;

  private buf: Uint32Array;
  private imageData: ImageData;
  private dirty = true;

  constructor(canvas: HTMLCanvasElement) {
    this.offscreen = document.createElement('canvas');
    this.offscreen.width = W;
    this.offscreen.height = H;
    const offCtx = this.offscreen.getContext('2d')!;
    offCtx.imageSmoothingEnabled = false;
    this.offCtx = offCtx;

    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    this.displayCtx = ctx;

    this.buf = new Uint32Array(W * H);
    this.imageData = new ImageData(W, H);

    const autoPresent = () => {
      this.present();
      requestAnimationFrame(autoPresent);
    };
    requestAnimationFrame(autoPresent);
  }

  /**
   * The screen at the Apple II's own resolution, for comparing against the disk.
   *
   * The game content lives in the top-left 280x192 of the 560x384 buffer at 1:1 - hplot()
   * writes Apple coordinates straight in, and present() sources only that region - so this
   * reads that corner rather than sampling. `on` is 1 wherever the pixel is not black,
   * which is the comparison that does not depend on how either side resolves hi-res colour
   * fringing.
   */
  snapshot(): { w: number; h: number; on: Uint8Array; argb: Uint32Array } {
    const w = 280, h = 192;
    const on = new Uint8Array(w * h);
    const argb = new Uint32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const px = this.buf[y * W + x];
        argb[y * w + x] = px;
        on[y * w + x] = (px & 0x00ffffff) !== 0 ? 1 : 0;
      }
    }
    return { w, h, on, argb };
  }

  hgr(): void {
    this.buf.fill(0);
    this.dirty = true;
  }

  hcolor(idx: number): void {
    this.colorIndex = idx & 7;
    this.colorArgb = PALETTE_ARGB.get(this.colorIndex) ?? 0xffffffff;
    this.phase = HCOLOR_PHASE[this.colorIndex];
  }

  /**
   * Does this HCOLOR light pixel column x?
   *
   * On the Apple II a non-white HCOLOR lights only alternate columns, so its lines come
   * out dotted at half density. HPLOT *writes* the bit either way, so plotting green over
   * white erases the even columns rather than leaving them - hence returning a colour to
   * store rather than a yes/no.
   *
   * Measured on the real Applesoft ROM by oracle/probe_hcolor.mjs, all eight values.
   */
  private argbAt(x: number): number {
    switch (this.phase) {
      case Phase.None: return 0;
      case Phase.All: return this.colorArgb;
      case Phase.Odd: return (x & 1) ? this.colorArgb : 0;
      default: return (x & 1) ? 0 : this.colorArgb;
    }
  }

  /**
   * Write one hi-res screen byte: seven pixels at x = col * 7 + bit, LSB leftmost.
   *
   * This is below HCOLOR rather than beside it. The panel lamps that CALL 38402 ($9602)
   * draws are stored as raw bytes by a self-modifying STA, not plotted, so they can hold
   * patterns no HCOLOR produces - and they clear the bits they do not set, which is why
   * this writes all seven pixels instead of only the lit ones.
   *
   * Bit 7 is not a pixel. It picks the palette pair, so a lit pixel is green or violet with
   * it clear and orange or blue with it set, by the same odd/even split HCOLOR_PHASE
   * records: green and orange on odd columns, violet and blue on even.
   */
  hbyte(col: number, row: number, value: number): void {
    if (row < 0 || row >= H) return;
    const shifted = (value & 0x80) !== 0;
    const off = row * W;
    for (let bit = 0; bit < 7; bit++) {
      const x = col * 7 + bit;
      if (x < 0 || x >= W) continue;
      if (!((value >> bit) & 1)) { this.buf[off + x] = 0; continue; }
      const idx = (x & 1) ? (shifted ? 5 : 1) : (shifted ? 6 : 2);
      this.buf[off + x] = PALETTE_ARGB.get(idx)!;
    }
    this.dirty = true;
  }


  hplot(x: number, y: number): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= W || iy < 0 || iy >= H) return;
    this.buf[iy * W + ix] = this.argbAt(ix);
    this.dirty = true;
  }

  hplotTo(x: number, y: number): void {
    this.line(this.penX, this.penY, x, y);
    this.penX = x;
    this.penY = y;
  }

  /**
   * A line drawn by the renderer at $6000, not by Applesoft - and they are not the same.
   *
   * $6000 never calls the ROM: a scan of $6000-$9000 finds no JSR or JMP anywhere into
   * $F400-$F7FF. Its clipper falls through to `JSR $6DD5`, which takes two endpoints from
   * $B3-$B6, one byte each, maps them into screen space itself (`ADC #$46` on x, and
   * `EOR #$FF: ADC #$60` on y, so x + 70 and 95 - y) and dispatches to an octant-specialised
   * inner loop through a self-modifying JMP at $6FED.
   *
   * Measured by calling it with ten different slopes and directions rather than reading the
   * self-modifying code - `probe_line6000.mjs`:
   *
   * - Every point is **two pixels wide**, which is where drawShipWorld's doubling comes from.
   * - It is **8-connected**: a 45 degree line gives one logical pixel per row, not the two
   *   the ROM's HLIN would give. So this really is textbook Bresenham and `line()` is not.
   * - **It always draws left to right.** `$6DF5 LDA $B5: SEC: SBC $B3: BCC $6E38` swaps the
   *   endpoints when x2 < x1, so a segment and its reverse light the same pixels. Without
   *   that swap one case in ten came out a row off.
   */
  /**
   * OR one byte into the page, at a raw address, the way `ORA ($99),Y / STA ($99),Y` does.
   *
   * `$99` is zero - `$6140` clears `$7C-$9C` and nothing in the renderer ever writes it - so
   * the address is simply `$9A` and Y. An address that is not a byte the display fetches,
   * which includes every address outside page 2, is written in memory and never seen; the
   * capture cannot see it either, so it is dropped here.
   */
  private orByte(hi: number, lo: number, mask: number): void {
    const cell = ADDR_TO_CELL[(((hi << 8) | lo) - PAGE_LO) & 0xffff];
    if (cell === undefined || cell < 0) return;
    const y = (cell / 40) | 0;
    const base = (cell % 40) * 7;
    for (let bit = 0; bit < 7; bit++) {
      if (!(mask & (1 << bit))) continue;
      const x = base + bit;
      if (x < 0 || x >= W) continue;
      const argb = this.argbAt(x);
      if (argb) this.buf[y * W + x] = argb;
    }
  }

  /** $6DB5 - a half-column and a row byte into `$9A` and Y. */
  private address6DB5(xh: number, yByte: number): { hi: number; lo: number } {
    const y = yByte & 0xff;
    const t = 2 * ((y >> 3) & 0x1f);
    const sum = ((y & 7) * 4) + ROW_TABLE[t + 1];
    const hi = sum & 0xff;
    const lo = (HALF_COLUMN_BYTE[xh] + ROW_TABLE[t] + (sum > 0xff ? 1 : 0)) & 0xff;
    return { hi, lo };
  }

  /**
   * One row down or up, as the plot loops do it: by address, not by recomputing from y.
   *
   * `$70DF ADC #$04 / CMP #$60 / BCS $711F` adds $400 and, past the end of the page, folds:
   *
   *     $7123  SEC / TYA / SBC #$80 / TAY / LDA $9A / SBC #$1B      ; - $1B80
   *     $7134  SBC #$58 / TAY / LDA $9A / SBC #$1F                  ; - $1F58, at $9A = $63
   *
   * and `$705D` is the mirror, `SBC #$04 / CMP #$40 / BCC $709D`, adding $1B80 or $1F58 back.
   * `$6FEA` does the same for the shallow loops through a byte patched at `$6FED`.
   *
   * Both folds read `$9A` **before** the add or subtract - the store only happens after - so
   * the step is `old - $1B80`, not `old + $400 - $1B80`. That reproduces row 7 to row 8:
   * $5C00 becomes $4080, which is $1B80 down, and not $1780.
   */
  private stepRow(hi: number, lo: number, down: boolean): { hi: number; lo: number } {
    if (down) {
      const a = (hi + 4) & 0xff;
      if (a < 0x60) return { hi: a, lo };                       // $701C BCC
      if (a === 0x63 && lo >= 0x80) {                           // $7033 CMP #$80, BMI takes the other
        const nl = (lo - 0x58) & 0xff;
        return { hi: (hi - 0x1f - (lo >= 0x58 ? 0 : 1)) & 0xff, lo: nl };
      }
      const nl = (lo - 0x80) & 0xff;
      return { hi: (hi - 0x1b - (lo >= 0x80 ? 0 : 1)) & 0xff, lo: nl };
    }
    const a = (hi - 4) & 0xff;
    if (a >= 0x40 && hi >= 4) return { hi: a, lo };              // $7064 BCC
    if (a === 0x3c && lo < 0x80) {                               // $70B0 BPL takes the other
      const s2 = lo + 0x58;
      return { hi: (hi + 0x1f + (s2 > 0xff ? 1 : 0)) & 0xff, lo: s2 & 0xff };
    }
    const s2 = lo + 0x80;
    return { hi: (hi + 0x1b + (s2 > 0xff ? 1 : 0)) & 0xff, lo: s2 & 0xff };
  }

  /**
   * One half-column: the pair of pixels $6DB5's tables name.
   *
   * Twenty of the 140 masks set bit 7, and bit 7 is not a pixel. $6D8F carries the second dot
   * into the next byte - `$6DA9 ORA / $6DAD INY / LDA #$01 / ORA` - so the pair stays
   * contiguous; a half-column lights screen pixels `2x` and `2x + 1`.
   */
  halfColumn(xh: number, y: number): void {
    if (xh < 0 || xh >= HALF_COLUMN_BYTE.length) return;
    const { hi, lo } = this.address6DB5(xh, y);
    const mask = HALF_COLUMN_MASK[xh];
    this.orByte(hi, lo, mask);
    if (mask & 0x80) this.orByte(hi, (lo + 1) & 0xff, 0x01);     // $6DAD INY
    this.dirty = true;
  }

  /**
   * $6DD5's line, in the units and with the error term it actually uses.
   *
   * **The octant split.** `$6E07 SEC / SBC $B9 / BCC $6E2B` compares |dy| against dx after
   * `$6E38` has swapped the ends so x always runs left to right. Shallow goes to `$6E4F`,
   * steep to `$70C6` or `$7044` depending on the sign.
   *
   * **The error term is an eight-bit accumulator, not a signed remainder.**
   *
   *     $6E4F  LDA #$00 / SEC / SBC $B9 / SEC / ROR A / STA $B8   ; shallow: ((-dx) >> 1) | $80
   *     $70C6  LDA $BA / CLC / ROR A / STA $B8                    ; steep:   |dy| >> 1
   *
   * Shallow adds |dy| per half-column and, on the carry out, steps the row and takes dx back
   * off. The threshold is 256 and the correction is dx, which is not the same as letting the
   * byte wrap: 255 + 28 leaves 214, not 27. Over dx columns that crosses exactly |dy| times.
   * Steep subtracts dx per row and advances a half-column on the borrow, adding |dy| back.
   * Both run `dx + 1` or `|dy| + 1` times, counted by `DEX / BEQ` straight after the plot.
   *
   * Those deltas were read off the machine rather than the page - watching $B8 through one
   * shallow line gives -13, +15, +28, +56, -41 for dx 69 and dy 28, which is |dy| per column
   * and dx off at each crossing and nothing else.
   *
   * **The address is walked, not recomputed.** `$6E58` calls `$6DB5` once; after that the
   * loops add or subtract $400 and fold at the page edges. A line whose end is a row of -1 -
   * which is where an endpoint clipped against `y = z` lands - therefore does not stop, it
   * carries on into whatever the fold produces.
   *
   * The disk does not plot a half-column at a time either: `$6E58` hands the mask to one of
   * seven run builders - `$6E9A`, `$6EAD`, `$6F03`, `$6F35`, `$6F49`, `$6F9C`, `$6FD5`,
   * chosen by `$6E60-$6E92` on which bits the mask starts at - which walk this same
   * recurrence accumulating bits so `$6E95` can `ORA` a whole run in with one store, and the
   * steep loops rotate the mask two bits at a time (`$70FC ROL A / ROL A`) instead of
   * re-indexing. That is a store-count optimisation; the pixels are whatever the recurrence
   * names, which is what this walks directly.
   */
  segment6DD5(x1: number, y1: number, x2: number, y2: number): void {
    let x0 = Math.round(x1);
    let y0 = Math.round(y1);
    let xe = Math.round(x2);
    let ye = Math.round(y2);
    // $6DF5's BCC $6E38: the ends are swapped so x runs left to right.
    if (xe < x0) { const tx = x0; x0 = xe; xe = tx; const ty = y0; y0 = ye; ye = ty; }
    const dx = xe - x0;
    // $6DFE LDA $B6 / SEC / SBC $B4 / BCC $6E1C is an eight-bit subtract of eight-bit rows,
    // and that is not the same as subtracting the signed numbers. A row of -1 is 255 to the
    // machine, so a line from row 61 to row -1 runs 194 rows **down** and off the bottom of
    // the page, not 62 rows up. Getting this wrong draws a different line entirely.
    const y0b = y0 & 0xff;
    const yeb = ye & 0xff;
    const dyRaw = yeb - y0b;
    const dy = Math.abs(dyRaw);
    const ydir = dyRaw < 0 ? -1 : 1;    // $6E1C negates dy and takes the other row step
    let x = x0;
    if (x < 0 || x >= HALF_COLUMN_BYTE.length) return;
    // $6E58 JSR $6DB5 - the address is taken once and then walked, which is why a row past
    // the end of the page keeps going somewhere rather than stopping.
    let addr = this.address6DB5(x, y0b);
    const down = ydir > 0;
    const paint = (): void => {
      const mask = HALF_COLUMN_MASK[x];
      this.orByte(addr.hi, addr.lo, mask);
      if (mask & 0x80) this.orByte(addr.hi, (addr.lo + 1) & 0xff, 0x01);
    };
    const nextColumn = (): void => {
      if (x + 1 < HALF_COLUMN_BYTE.length) {
        addr.lo = (addr.lo + HALF_COLUMN_BYTE[x + 1] - HALF_COLUMN_BYTE[x]) & 0xff;  // the INY
      }
      x++;
    };

    if (dy < dx) {                      // $6E07 BCC $6E2B - shallow
      let err = ((((256 - dx) & 0xff) >> 1) | 0x80) & 0xff;
      for (let n = dx + 1; n > 0; n--) {
        paint();
        nextColumn();
        if (x >= HALF_COLUMN_BYTE.length) break;
        err += dy;                      // $6EA0 CLC / ADC $BA
        if (err > 0xff) {               // $6EA2 BCS - the run ends here
          addr = this.stepRow(addr.hi, addr.lo, down);
          err -= dx;                    // and the carry path takes dx back off
        }
      }
    } else {                            // $6E0C JMP $70C6 / $6E28 JMP $7044 - steep
      let err = (dy >> 1) & 0xff;
      for (let n = dy + 1; n > 0; n--) {
        paint();
        addr = this.stepRow(addr.hi, addr.lo, down);   // $70DF - a row every time round
        const diff = err - dx;          // $70EA SEC / SBC $B9
        if (diff >= 0) err = diff;      // $70F1 BCS $70D4 - the same half-column
        else {                          // $70F3 ADC $BA, then ROL A / ROL A
          err = (diff + dy) & 0xff;
          nextColumn();
          if (x >= HALF_COLUMN_BYTE.length) break;
        }
      }
    }
    this.dirty = true;
  }

  segment(x1: number, y1: number, x2: number, y2: number): void {
    let x0 = Math.round(x1);
    let y0 = Math.round(y1);
    let xe = Math.round(x2);
    let ye = Math.round(y2);
    // $6DF5's BCC $6E38: the routine swaps so x always runs left to right.
    if (xe < x0) { const tx = x0; x0 = xe; xe = tx; const ty = y0; y0 = ye; ye = ty; }
    const dx = Math.abs(xe - x0);
    const dy = -Math.abs(ye - y0);
    const sx = x0 < xe ? 1 : -1;
    const sy = y0 < ye ? 1 : -1;
    let err = dx + dy;
    const buf = this.buf;
    for (;;) {
      if (x0 >= 0 && x0 < W && y0 >= 0 && y0 < H) buf[y0 * W + x0] = this.argbAt(x0);
      if (x0 === xe && y0 === ye) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    this.dirty = true;
  }

  /**
   * HPLOT TO, transcribed from the ROM.
   *
   * Applesoft's line is HLIN at $F53A, and it is one loop that plots a pixel and then
   * advances **one axis only**: `dx + dy + 1` pixels, 4-connected, every corner doubled,
   * no exceptions. The error term starts at `dx`, loses `dy` on each x step and regains
   * `dx` on each y step - and the y step skips the subtraction, which is why the two
   * branches are not symmetric.
   *
   *     F581  LDA $D4 / ADC $D2 / STA $D4 / LDA $D5 / SBC #$00   ; err -= dy
   *     F58D  LDA ($26),Y / EOR $1C / AND $30 / EOR ($26),Y / STA ($26),Y   ; plot
   *     F597  INX / BNE / INC $1D / BEQ                          ; dx + dy + 1 times
   *     F59E  LDA $D3 / BCS $F57C                                ; carry -> step x
   *     F5A2  JSR $F4D3 / CLC / LDA $D4 / ADC $D0 ...            ; else step y, err += dx
   *
   * `$D2` holds `-(dy + 1)`, so adding it with the carry set is `err -= dy`.
   *
   * This replaced a rule fitted to RADAR's reticle - that a crossing landing exactly on a
   * column boundary does not double. That was fitting noise: RADAR's diagonals are drawn in
   * HCOLOR 2, which lights only the even columns, so half of the corner pixels were masked
   * away and never appeared in the capture at all. The ship I.D. wireframes are HCOLOR 3,
   * all columns, and they show the corners the ROM really draws.
   */
  line(x1: number, y1: number, x2: number, y2: number): void {
    const ax = Math.round(x1);
    const ay = Math.round(y1);
    const bx = Math.round(x2);
    const by = Math.round(y2);
    const dx = Math.abs(bx - ax);
    const dy = Math.abs(by - ay);
    const sx = bx >= ax ? 1 : -1;
    const sy = by >= ay ? 1 : -1;
    const buf = this.buf;
    const put = (x: number, y: number): void => {
      if (x >= 0 && x < W && y >= 0 && y < H) buf[y * W + x] = this.argbAt(x);
    };

    // $D2 = -(dy + 1) as a byte; $D4/$D5 = the error, starting at dx.
    const d2 = (0x100 - ((dy + 1) & 0xff)) & 0xff;
    const dyHi = (dy + 1) > 0xff ? 1 : 0;
    let errLo = dx & 0xff;
    let errHi = (dx >> 8) & 0xff;
    let x = ax;
    let y = ay;
    let n = dx + dy + 1;
    let carry = 1;
    let skipErr = false;   // the y branch re-enters at the plot, past the subtraction

    for (;;) {
      if (!skipErr) {
        // err -= dy, as ADC $D2 then SBC #$00 on the high byte.
        const lo = errLo + d2 + carry;
        const c1 = lo > 0xff ? 1 : 0;
        errLo = lo & 0xff;
        const hi = errHi - dyHi - (1 - c1);
        carry = hi >= 0 ? 1 : 0;
        errHi = hi & 0xff;
      }
      skipErr = false;

      put(x, y);
      if (--n <= 0) break;

      if (carry) {
        x += sx;
        carry = 1;            // the SEC at $F580
        continue;
      }
      y += sy;
      // err += dx
      const lo = errLo + (dx & 0xff);
      const c1 = lo > 0xff ? 1 : 0;
      errLo = lo & 0xff;
      const hi = errHi + ((dx >> 8) & 0xff) + c1;
      carry = hi > 0xff ? 1 : 0;
      errHi = hi & 0xff;
      skipErr = true;
    }
    this.dirty = true;
  }

  hlin(x1: number, x2: number, y: number): void {
    this.line(x1, y, x2, y);
  }

  clearRect(x: number, y: number, width: number, height: number): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(W, Math.round(x + width));
    const y1 = Math.min(H, Math.round(y + height));
    const buf = this.buf;
    for (let row = y0; row < y1; row++) {
      const offset = row * W;
      for (let col = x0; col < x1; col++) {
        buf[offset + col] = 0;
      }
    }
    this.dirty = true;
  }

  /**
   * Blank a rectangle of character cells, the way the original's HOME does.
   *
   * The hi-res character generator at $9300 writes whole cells - text is opaque, see
   * text() - so clearing a text window paints black over whatever was under it. COM floods
   * the view with HCOLOR 6 and then clears its window over the fill, which is why its menu
   * area is black where the port's was solid blue.
   *
   * Columns and rows are the 1-based ones text() takes.
   */
  clearTextCells(col: number, row: number, cols: number, rows: number): void {
    const cellW = 7, cellH = 8;
    const x0 = Math.max(0, (col - 1) * cellW);
    const y0 = Math.max(0, (row - 1) * cellH);
    const x1 = Math.min(W, x0 + cols * cellW);
    const y1 = Math.min(H, y0 + rows * cellH);
    for (let y = y0; y < y1; y++) {
      const off = y * W;
      for (let x = x0; x < x1; x++) this.buf[off + x] = 0;
    }
    this.dirty = true;
  }

  text(s: string, col: number, row: number, opts?: { invert?: boolean }): void {
    const cellW = 7;
    const cellH = 8;
    if (col < 1 || col > 40 || row < 1 || row > 24) return;
    const maxChars = 41 - col;
    if (maxChars <= 0) return;
    const visible = s.slice(0, maxChars);
    if (visible.length === 0) return;
    const px = (col - 1) * cellW;
    const py = (row - 1) * cellH;
    const buf = this.buf;
    const bgArgb = 0;
    const fgArgb = this.colorArgb;
    // Inverse does not use HCOLOR. Measured two ways: STATUS clears with inverse spaces
    // under `HCOLOR= 1` and the rows come out fully lit - 266 of 266 pixels across columns
    // 1-38, not the 133 half-density green would give - and S/X prints its message under
    // `HCOLOR= 0`, where the cell stays white and only the 433 glyph pixels go dark. So an
    // inverse cell is white behind a black glyph whatever HCOLOR happens to be.
    const inverseArgb = PALETTE_ARGB.get(3)!;

    for (let i = 0; i < visible.length; i++) {
      const ch = visible[i];
      const glyph = glyphFor(ch.toUpperCase());
      // Inverse video fills the whole character cell and knocks the glyph out of it, so
      // the background has to be laid down across all 7x8 first - the glyph itself is only
      // 5 wide and 7 tall, and painting just those columns left gaps the original does not
      // have. On the disk an inverse run is solid: INSTRUMENTS 170 under POKE 973,255
      // shows as an unbroken row of lit pixels.
      if (opts?.invert) {
        for (let gy = 0; gy < cellH; gy++) {
          const rowOffset = (py + gy) * W;
          for (let gx = 0; gx < cellW; gx++) {
            const x = px + gx + i * cellW;
            if (x >= 0 && x < W && py + gy >= 0 && py + gy < H) buf[rowOffset + x] = inverseArgb;
          }
        }
      }
      for (let gy = 0; gy < glyph.length; gy++) {
        const bits = glyph[gy];
        const rowOffset = (py + gy) * W;
        for (let gx = 0; gx < cellW; gx++) {
          // The disk's glyphs are 7 wide with bit 0 the leftmost pixel, the same order
          // hi-res bytes use. They carry their own left margin (bit 0 is blank on every
          // letter), so unlike the old 5-wide set there is no +1 to add here.
          const on = (bits & (1 << gx)) !== 0;
          const x = px + gx + i * cellW;
          const y = py + gy;
          if (x >= 0 && x < W && y >= 0 && y < H) {
            // Text is opaque. The Apple's character generator writes whole bytes, so a
            // character erases whatever was under its cell - INSTRUMENTS 200 prints X, Y,
            // Z, XHDNG and YHDNG at text row 23, straight over the orange rule line 70
            // drew at y177, and on the disk the rule is gone beneath them. Drawing only
            // the lit pixels left it showing through.
            buf[y * W + x] = opts?.invert
              ? (on ? bgArgb : inverseArgb)
              : (on ? fgArgb : bgArgb);
          }
        }
      }
    }
    this.dirty = true;
  }

  private dw = 0;
  private dh = 0;

  present(): void {
    if (this.dirty) {
      this.dirty = false;

      const buf = this.buf;
      const data = this.imageData.data;
      const centerGlow = 0.06;

      for (let y = 0; y < H; y++) {
        const row = y * W;
        const cy = Math.abs(y - H / 2) / (H / 2);
        const glowDim = 1.0 + centerGlow * (1.0 - cy * cy);

        for (let x = 0; x < W; x++) {
          const argb = buf[row + x];
          const i = (row + x) * 4;
          const r = ((argb >> 16) & 0xff) * glowDim;
          const g = ((argb >> 8) & 0xff) * glowDim;
          const b = (argb & 0xff) * glowDim;
          data[i] = Math.min(255, Math.round(r));
          data[i + 1] = Math.min(255, Math.round(g));
          data[i + 2] = Math.min(255, Math.round(b));
          data[i + 3] = 0xff;
        }
      }

      this.offCtx.putImageData(this.imageData, 0, 0);
    }

    const canvas = this.displayCtx.canvas;
    const rect = canvas.getBoundingClientRect();
    const cw = Math.round(rect.width);
    const ch = Math.round(rect.height);
    if (cw < 1 || ch < 1) return;

    if (cw !== this.dw || ch !== this.dh) {
      canvas.width = cw;
      canvas.height = ch;
      this.dw = cw;
      this.dh = ch;
    }

    this.displayCtx.clearRect(0, 0, cw, ch);

    // The Apple II game content lives in the top-left 280×192 of the
    // 560×384 offscreen buffer.  Source only that region and fill the
    // display with correct aspect ratio (35:24).
    const GW = 280;
    const GH = 192;
    const gameAspect = GW / GH;
    const displayAspect = cw / ch;

    let gw: number, gh: number, gx: number, gy: number;
    if (displayAspect > gameAspect) {
      gh = ch;
      gw = Math.round(ch * gameAspect);
      gx = Math.round((cw - gw) / 2);
      gy = 0;
    } else {
      gw = cw;
      gh = Math.round(cw / gameAspect);
      gx = 0;
      gy = Math.round((ch - gh) / 2);
    }

    // Smooth bilinear upscale — turns blocky pixels into a soft retro look
    this.displayCtx.imageSmoothingEnabled = true;

    this.displayCtx.drawImage(this.offscreen, 0, 0, GW, GH, gx, gy, gw, gh);

    // CRT bloom wash — soft glow over bright areas
    this.displayCtx.globalCompositeOperation = 'screen';
    this.displayCtx.drawImage(this.offscreen, 0, 0, GW, GH, gx, gy, gw, gh);
    this.displayCtx.globalCompositeOperation = 'source-over';

    // Display-resolution scanlines — always 1px every other row at the
    // output pixel grid, so they stay crisp at any scale.
    for (let sy = gy; sy < gy + gh; sy += 2) {
      this.displayCtx.fillStyle = 'rgba(0,0,0,0.15)';
      this.displayCtx.fillRect(gx, sy, gw, 1);
    }
  }
}
