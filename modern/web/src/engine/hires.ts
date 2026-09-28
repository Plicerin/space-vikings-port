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

const TEXT_GLYPHS: Record<string, readonly number[]> = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '!': [0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100, 0],
  '"': [0b01010, 0b01010, 0, 0, 0, 0, 0],
  '#': [0b01010, 0b11111, 0b01010, 0b01010, 0b11111, 0b01010, 0],
  '%': [0b11001, 0b11010, 0b00100, 0b01011, 0b10011, 0, 0],
  "'": [0b00100, 0b00100, 0, 0, 0, 0, 0],
  '(': [0b00010, 0b00100, 0b01000, 0b01000, 0b00100, 0b00010, 0],
  ')': [0b01000, 0b00100, 0b00010, 0b00010, 0b00100, 0b01000, 0],
  '*': [0, 0b10101, 0b01110, 0b11111, 0b01110, 0b10101, 0],
  '+': [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
  ',': [0, 0, 0, 0, 0b00100, 0b00100, 0b01000],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0],
  '/': [0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0, 0],
  ':': [0, 0b00100, 0, 0, 0b00100, 0, 0],
  ';': [0, 0b00100, 0, 0, 0b00100, 0b00100, 0b01000],
  '<': [0b00010, 0b00100, 0b01000, 0b10000, 0b01000, 0b00100, 0],
  '=': [0, 0, 0b11111, 0, 0b11111, 0, 0],
  '>': [0b01000, 0b00100, 0b00010, 0b00001, 0b00010, 0b00100, 0],
  '?': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0, 0b00100],
  '[': [0b01110, 0b01000, 0b01000, 0b01000, 0b01000, 0b01110, 0],
  ']': [0b01110, 0b00010, 0b00010, 0b00010, 0b00010, 0b01110, 0],
  '_': [0, 0, 0, 0, 0, 0, 0b11111],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b10000, 0b11110, 0b00001, 0b00001, 0b11110],
  '6': [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'B': [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  'J': [0b00111, 0b00010, 0b00010, 0b00010, 0b10010, 0b10010, 0b01100],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'Q': [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b01010, 0b00100],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  'X': [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  'Z': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
};

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

  line(x1: number, y1: number, x2: number, y2: number): void {
    let x0 = Math.round(x1);
    let y0 = Math.round(y1);
    const x1r = Math.round(x2);
    const y1r = Math.round(y2);
    const dx = Math.abs(x1r - x0);
    const dy = -Math.abs(y1r - y0);
    const sx = x0 < x1r ? 1 : -1;
    const sy = y0 < y1r ? 1 : -1;
    let err = dx + dy;
    const buf = this.buf;

    for (;;) {
      if (x0 >= 0 && x0 < W && y0 >= 0 && y0 < H) {
        buf[y0 * W + x0] = this.argbAt(x0);
      }
      if (x0 === x1r && y0 === y1r) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
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
      const glyph = TEXT_GLYPHS[ch] ?? TEXT_GLYPHS[ch.toUpperCase()] ?? TEXT_GLYPHS['?'];
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
        for (let gx = 0; gx < 5; gx++) {
          const on = (bits & (1 << (4 - gx))) !== 0;
          const x = px + 1 + gx + i * cellW;
          const y = py + gy;
          if (x >= 0 && x < W && y >= 0 && y < H) {
            // The cell is already filled above in inverse mode, so knock the glyph out.
            if (opts?.invert) {
              if (on) buf[y * W + x] = bgArgb;
            } else {
              if (on) buf[y * W + x] = fgArgb;
            }
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
