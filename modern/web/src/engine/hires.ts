// Apple II hi-res abstraction over Canvas 2D.
// Logical resolution stays at the Apple II's native 280x192 so all the
// coordinates from the BASIC source translate directly. The canvas itself
// renders at devicePixelRatio * cssScale for crisp anti-aliased output.

const W = 280;
const H = 192;

const PALETTE: Record<number, string> = {
  0: '#000000',
  1: '#22dd55', // green
  2: '#cc44ff', // violet
  3: '#ffffff', // white
  4: '#000000',
  5: '#ff8a2a', // orange
  6: '#3a8cff', // blue
  7: '#ffffff',
};

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
  private ctx: CanvasRenderingContext2D;
  private color = '#ffffff';
  private penX = 0;
  private penY = 0;
  private cssScale = 3;
  private dpr = window.devicePixelRatio || 1;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('hires: 2d context unavailable');
    this.ctx = ctx;
    this.fitToViewport();
    this.resize();
    window.addEventListener('resize', () => {
      this.fitToViewport();
      this.resize();
    });
  }

  get width(): number { return W; }
  get height(): number { return H; }

  private fitToViewport(): void {
    const compact = window.innerWidth <= 840;
    const horizontalGutter = compact ? 32 : 48;
    const verticalReserve = compact ? 300 : 140;
    const maxW = Math.max(W, window.innerWidth - horizontalGutter);
    const maxH = Math.max(H, window.innerHeight - verticalReserve);
    const scale = Math.max(1, Math.min(maxW / W, maxH / H));
    this.cssScale = scale;
  }

  private resize(): void {
    const cssWidth = W * this.cssScale;
    const cssHeight = H * this.cssScale;
    // Set canvas to logical resolution — CSS handles display scaling.
    this.canvas.width = W;
    this.canvas.height = H;
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.canvas.style.transform = 'none';
    this.canvas.style.transformOrigin = 'auto';
    // Scale the parent container (#viewport) to match so the canvas fits.
    const frame = this.canvas.parentElement;
    if (frame instanceof HTMLElement) {
      frame.style.transform = 'none';
      frame.style.transformOrigin = 'auto';
      frame.style.width = `${cssWidth}px`;
      frame.style.height = `${cssHeight}px`;
      frame.style.position = 'relative';
      // Remove overflow:hidden so the scaled canvas isn't clipped.
      frame.style.overflow = 'visible';
      // Scale the parent's parent (#container) to accommodate.
      const container = frame.parentElement;
      if (container instanceof HTMLElement) {
        container.style.width = `${cssWidth}px`;
        container.style.height = `${cssHeight}px`;
      }
    }
    const cpuPanel = document.getElementById('cpu-panel');
    if (cpuPanel instanceof HTMLElement) {
      cpuPanel.style.width = `${cssWidth}px`;
    }
    // Context stays at identity — all drawing uses logical (280x192) coords.
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.fillBlack();
  }

  private fillBlack(): void {
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // HGR — clear hi-res screen
  hgr(): void { this.fillBlack(); }

  // HCOLOR= n
  hcolor(idx: number): void {
    this.color = PALETTE[idx & 7] ?? '#ffffff';
  }

  // HPLOT x, y — single point
  hplot(x: number, y: number): void {
    this.penX = x;
    this.penY = y;
    this.ctx.fillStyle = this.color;
    this.ctx.fillRect(x, y, 1, 1);
  }

  // HPLOT TO x, y — line from pen to (x, y)
  hplotTo(x: number, y: number): void {
    this.ctx.beginPath();
    this.ctx.moveTo(this.penX + 0.5, this.penY + 0.5);
    this.ctx.lineTo(x + 0.5, y + 0.5);
    this.ctx.strokeStyle = this.color;
    this.ctx.lineWidth = 1;
    this.ctx.stroke();
    this.penX = x;
    this.penY = y;
  }

  // HPLOT x1,y1 TO x2,y2 — convenience
  line(x1: number, y1: number, x2: number, y2: number): void {
    this.hplot(x1, y1);
    this.hplotTo(x2, y2);
  }

  // HLIN x1, x2 AT y
  hlin(x1: number, x2: number, y: number): void {
    this.line(x1, y, x2, y);
  }

  clearRect(x: number, y: number, width: number, height: number): void {
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(x, y, width, height);
  }

  // VTAB / HTAB style text. Apple II text grid is 40 cols x 24 rows.
  // We use 1-based coordinates to match the BASIC convention.
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

    this.ctx.save();
    this.ctx.fillStyle = opts?.invert ? this.color : '#000';
    this.ctx.fillRect(px, py, visible.length * cellW, cellH);
    this.ctx.fillStyle = opts?.invert ? '#000' : this.color;

    for (let i = 0; i < visible.length; i++) {
      this.drawTextChar(visible[i], px + i * cellW, py);
    }

    this.ctx.restore();
  }

  private drawTextChar(ch: string, x: number, y: number): void {
    const glyph = TEXT_GLYPHS[ch] ?? TEXT_GLYPHS[ch.toUpperCase()] ?? TEXT_GLYPHS['?'];
    for (let row = 0; row < glyph.length; row++) {
      const bits = glyph[row];
      for (let col = 0; col < 5; col++) {
        if (bits & (1 << (4 - col))) {
          this.ctx.fillRect(x + 1 + col, y + row, 1, 1);
        }
      }
    }
  }
}
