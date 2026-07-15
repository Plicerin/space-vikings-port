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

  hgr(): void {
    this.buf.fill(0);
    this.dirty = true;
  }

  hcolor(idx: number): void {
    this.colorIndex = idx & 7;
    this.colorArgb = PALETTE_ARGB.get(this.colorIndex) ?? 0xffffffff;
  }

  hplot(x: number, y: number): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= W || iy < 0 || iy >= H) return;
    this.buf[iy * W + ix] = this.colorArgb;
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
    const col = this.colorArgb;
    const buf = this.buf;

    for (;;) {
      if (x0 >= 0 && x0 < W && y0 >= 0 && y0 < H) {
        buf[y0 * W + x0] = col;
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
      for (let gy = 0; gy < glyph.length; gy++) {
        const bits = glyph[gy];
        const rowOffset = (py + gy) * W;
        for (let gx = 0; gx < 5; gx++) {
          const on = (bits & (1 << (4 - gx))) !== 0;
          const x = px + 1 + gx + i * cellW;
          const y = py + gy;
          if (x >= 0 && x < W && y >= 0 && y < H) {
            if (opts?.invert) {
              buf[y * W + x] = on ? bgArgb : fgArgb;
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
    if (!this.dirty) return;
    this.dirty = false;

    const buf = this.buf;
    const data = this.imageData.data;
    const scanAlpha = 0.12;
    const centerGlow = 0.06;

    for (let y = 0; y < H; y++) {
      const row = y * W;
      const scanDim = y % 2 === 0 ? 1.0 - scanAlpha : 1.0;
      const cy = Math.abs(y - H / 2) / (H / 2);
      const glowDim = 1.0 + centerGlow * (1.0 - cy * cy);

      for (let x = 0; x < W; x++) {
        const argb = buf[row + x];
        const i = (row + x) * 4;
        const r = ((argb >> 16) & 0xff) * scanDim * glowDim;
        const g = ((argb >> 8) & 0xff) * scanDim * glowDim;
        const b = (argb & 0xff) * scanDim * glowDim;
        data[i] = Math.min(255, Math.round(r));
        data[i + 1] = Math.min(255, Math.round(g));
        data[i + 2] = Math.min(255, Math.round(b));
        data[i + 3] = 0xff;
      }
    }

    this.offCtx.putImageData(this.imageData, 0, 0);

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
    this.displayCtx.drawImage(this.offscreen, 0, 0, cw, ch);
  }
}
