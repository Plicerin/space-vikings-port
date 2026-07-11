// Small helper for the text-menu scenes (COM, STATUS, SUPPLY, etc.).
// The original game draws menus by VTAB/HTAB-ing PRINT statements through
// the HCG; we render through hires.text() at the same logical 24x40 grid
// so the layouts translate one-to-one.

import type { Hires } from './hires';
import type { Input } from './input';

export interface MenuOption {
  /** Hotkey, normally a single digit '1'..'9'. */
  key: string;
  label: string;
}

export function writeLines(
  hires: Hires,
  col: number,
  row: number,
  lines: string[],
  color = 1,
): void {
  // Clear the area where the lines will be drawn to avoid overlapping text.
  // Apple II screens are 40 columns wide; we clear the full width of the block.
  const width = 40 - col + 1;
  clearLines(hires, col, row, width, lines.length);
  hires.hcolor(color);
  for (let i = 0; i < lines.length; i++) {
    hires.text(lines[i], col, row + i);
  }
}

export function clearLines(hires: Hires, col: number, row: number, width: number, count: number): void {
  const blank = ' '.repeat(Math.max(0, width));
  hires.hcolor(0);
  for (let i = 0; i < count; i++) {
    hires.text(blank, col, row + i);
  }
}

export function drawTitle(hires: Hires, row: number, col: number, title: string): void {
  // Clear the line before drawing the title to avoid overlap.
  clearLines(hires, col, row, 40 - col + 1, 1);
  hires.hcolor(3);
  hires.text(title, col, row);
}

export function drawOptions(
  hires: Hires,
  options: MenuOption[],
  startRow: number,
  col: number,
): void {
  // Clear the block before drawing options to avoid overlap.
  const width = 40 - col + 1;
  clearLines(hires, col, startRow, width, options.length);
  hires.hcolor(1);
  for (let i = 0; i < options.length; i++) {
    hires.text(`${options[i].key}) ${options[i].label}`, col, startRow + i);
  }
}

export function drawPrompt(hires: Hires, row: number, col: number, prompt = 'COMMAND?'): void {
  hires.hcolor(5);
  hires.text(prompt, col, row);
}

/** Wait for a keypress and validate it's a digit in [min..max].
 *  Returns the digit as an integer, or shows an error and re-prompts. */
export async function getChoice(
  input: Input,
  hires: Hires,
  min: number,
  max: number,
  errorRow = 21,
  errorCol = 1,
): Promise<number> {
  for (;;) {
    const k = await input.waitForKey();
    const ch = (k & 0x7f).toString().slice(-1);
    const n = parseInt(String.fromCharCode(k & 0x7f), 10);
    if (!isNaN(n) && n >= min && n <= max) return n;
    // Error feedback at the bottom. The original prints "PLEASE ENTER YOUR
    // COMMAND AGAIN." for ~3 seconds at SPEED=127 (slow scroll).
    hires.hcolor(2);
    hires.text('PLEASE ENTER YOUR', errorCol, errorRow);
    hires.text('COMMAND AGAIN.    ', errorCol, errorRow + 1);
    await new Promise((r) => setTimeout(r, 1500));
    hires.text('                  ', errorCol, errorRow);
    hires.text('                  ', errorCol, errorRow + 1);
    void ch;
  }
}

/** Box outline (canvas line, not text). Useful for menu frames. */
export function drawBox(
  hires: Hires,
  x: number,
  y: number,
  w: number,
  h: number,
  color = 1,
): void {
  hires.hcolor(color);
  hires.line(x, y, x + w, y);
  hires.line(x + w, y, x + w, y + h);
  hires.line(x + w, y + h, x, y + h);
  hires.line(x, y + h, x, y);
}
