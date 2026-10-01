// Keyboard + paddle abstraction.
// Apple II semantics: PEEK(-16384) returns the last key with high bit set
// until POKE -16368, 0 clears the strobe. Paddles return 0..255.

/** A key is on or off, so holding one is as far as the paddle goes. */
function paddleFromHeld(negative: boolean, positive: boolean): number {
  if (negative === positive) return 128;
  return negative ? 0 : 255;
}

export class Input {
  private pendingKey: number | null = null;
  /** `PDL(0)` and `PDL(1)` when a stick is pushed; null means read the keys. */
  private paddleAxis: (number | null)[] = [null, null];
  private down = new Set<string>();
  private readonly touchCodeMap: Record<string, number> = {
    ArrowLeft: 0x88,
    ArrowRight: 0x95,
    ArrowUp: 0x8b,
    ArrowDown: 0x8a,
    Escape: 0x9b,
    Space: 0xa0,
    Enter: 0x8d,
    Backspace: 0x88,
    W: (87 & 0x7f) | 0x80,
    w: (87 & 0x7f) | 0x80,
    A: (65 & 0x7f) | 0x80,
    a: (65 & 0x7f) | 0x80,
    S: (83 & 0x7f) | 0x80,
    s: (83 & 0x7f) | 0x80,
    B: (66 & 0x7f) | 0x80,
    b: (66 & 0x7f) | 0x80,
    C: (67 & 0x7f) | 0x80,
    c: (67 & 0x7f) | 0x80,
    R: (82 & 0x7f) | 0x80,
    r: (82 & 0x7f) | 0x80,
    H: (72 & 0x7f) | 0x80,
    h: (72 & 0x7f) | 0x80,
    O: (79 & 0x7f) | 0x80,
    o: (79 & 0x7f) | 0x80,
    '1': 0xb1,
    '2': 0xb2,
    '3': 0xb3,
    '4': 0xb4,
  };

  constructor() {
    window.addEventListener('keydown', e => {
      this.down.add(e.code);
      const code = this.translateKey(e.key, e.code);
      if (code !== null) this.pendingKey = code;
    });
    window.addEventListener('keyup', e => this.down.delete(e.code));
  }

  private translateKey(key: string, code: string): number | null {
    if (this.touchCodeMap[code]) return this.touchCodeMap[code];
    if (this.touchCodeMap[key]) return this.touchCodeMap[key];
    if (key.length === 1) return (key.toUpperCase().charCodeAt(0) & 0x7f) | 0x80;
    if (key === 'Enter') return 0x8d;
    if (key === 'Escape') return 0x9b;
    if (key === 'Backspace') return 0x88;
    if (key === 'ArrowLeft') return 0x88;
    if (key === 'ArrowRight') return 0x95;
    if (key === 'ArrowUp') return 0x8b;
    if (key === 'ArrowDown') return 0x8a;
    return null;
  }

  press(code: string): void {
    const keyCode = this.translateKey(code, code);
    if (keyCode !== null) this.pendingKey = keyCode;
  }

  pressHold(code: string): void {
    this.down.add(code);
  }

  releaseHold(code: string): void {
    this.down.delete(code);
  }

  // PEEK(-16384)
  peekKey(): number {
    return this.pendingKey ?? 0;
  }

  // POKE -16368, 0
  clearKey(): void {
    this.pendingKey = null;
  }

  /**
   * `PDL(n)`: 0..255, 128 at centre.
   *
   * STARSHIP SIMULATOR line 19 reads paddles 0 and 1 every pass and the control module turns
   * them into a step whose size is how far off centre they are. This returned a constant 128
   * and nothing called it, because the port steered with the arrow keys instead.
   *
   * It is real now, and it has two sources. A key is not a paddle - it is on or off - so a
   * held arrow is full deflection, which is the strongest step the table offers. A stick is a
   * paddle, so when one is pushed its own deflection is passed through and the smaller steps
   * in the table become reachable. `setPaddle` is how the pad hands them over; nothing else
   * writes them, and with no pad they stay null and the keys answer.
   */
  paddle(n: number): number {
    const axis = this.paddleAxis[n];
    if (axis !== null && axis !== undefined) return axis;
    if (n === 0) return paddleFromHeld(this.isDown('ArrowLeft'), this.isDown('ArrowRight'));
    if (n === 1) return paddleFromHeld(this.isDown('ArrowUp'), this.isDown('ArrowDown'));
    return 128;
  }

  /** A real deflection from a stick, or null to let the keys answer again. */
  setPaddle(n: number, value: number | null): void {
    this.paddleAxis[n] = value === null ? null : Math.max(0, Math.min(255, Math.round(value)));
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  // Block until any key, returning the keycode.
  async waitForKey(): Promise<number> {
    while (this.peekKey() === 0) await new Promise(r => setTimeout(r, 16));
    const k = this.peekKey();
    this.clearKey();
    return k;
  }
}
