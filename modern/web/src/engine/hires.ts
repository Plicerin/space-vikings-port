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
   * A line drawn by the renderer at $6000, not by Applesoft.
   *
   * These are two different routines on the disk and they do not agree. `line()` reproduces
   * HPLOT TO, measured off RADAR's reticle. The 3D renderer plots its own segments in
   * machine code, and that code has not been disassembled - so this keeps the textbook
   * Bresenham the port has always used here rather than assuming the two match. Applying the
   * HPLOT rule to ship wireframes cost 0.2 points of within-one-pixel agreement, which is
   * the evidence that they are not the same routine.
   */
  segment(x1: number, y1: number, x2: number, y2: number): void {
    let x0 = Math.round(x1);
    let y0 = Math.round(y1);
    const xe = Math.round(x2);
    const ye = Math.round(y2);
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
   * HPLOT TO.
   *
   * Not textbook Bresenham. Applesoft advances the major axis one step at a time and, in the
   * column (or row) where the minor axis changes, lights **both** sides of the change, so the
   * line is 4-connected rather than 8-connected. Measured off RADAR's reticle, which is the
   * first diagonal line work on this disk: along `HPLOT 1,0 TO 131,59` the original lights 7
   * and 8 at x 18, 14 and 15 at x 34, 18 and 19 at x 42, and a single pixel everywhere else.
   * The doubles fall exactly where `floor(y(x + 1)) > floor(y(x))`, and it is floor, not
   * round - at x 66 the true y is 29.50 and the original lights 29.
   *
   * Nothing before RADAR caught this, because every line COM, STATUS and GALAXY MAP draw is
   * axis-aligned, where the two algorithms agree.
   *
   * The extra pixel is not emitted on the last step, which is what the original's endpoint
   * does: `HPLOT 1,0 TO 131,59` lights 58 at x 130 and not 59.
   */
  line(x1: number, y1: number, x2: number, y2: number): void {
    const ax = Math.round(x1);
    const ay = Math.round(y1);
    const bx = Math.round(x2);
    const by = Math.round(y2);
    const dx = bx - ax;
    const dy = by - ay;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const steps = Math.max(adx, ady);
    const buf = this.buf;
    const put = (x: number, y: number): void => {
      if (x >= 0 && x < W && y >= 0 && y < H) buf[y * W + x] = this.argbAt(x);
    };
    if (steps === 0) { put(ax, ay); this.dirty = true; return; }
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);
    const majorIsX = adx >= ady;
    const minorLen = majorIsX ? ady : adx;
    for (let i = 0; i <= steps; i++) {
      const cur = Math.floor((i * minorLen) / steps);
      if (majorIsX) put(ax + i * sx, ay + cur * sy);
      else put(ax + cur * sx, ay + i * sy);
      if (i + 1 < steps) {
        // Only when the row actually changes *inside* this column. If the ideal line crosses
        // exactly on the boundary - `(i + 1) * minorLen` divisible by `steps` - the new row
        // belongs to the next column and the original does not double. That is every 16th
        // step of RADAR's `HPLOT 151,67 TO 279,123`, where 56/128 is exactly 7/16.
        const nn = (i + 1) * minorLen;
        const next = Math.floor(nn / steps);
        if (next !== cur && nn % steps !== 0) {
          if (majorIsX) put(ax + i * sx, ay + next * sy);
          else put(ax + next * sx, ay + i * sy);
        }
      }
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
            if (x >= 0 && x < W && py + gy >= 0 && py + gy < H) buf[rowOffset + x] = fgArgb;
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
            buf[y * W + x] = on ? (opts?.invert ? bgArgb : fgArgb) : (opts?.invert ? fgArgb : bgArgb);
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
