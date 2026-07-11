// Apple II shape-table interpreter.
//
// Format (per the Apple II Reference Manual): each non-zero byte holds up
// to three vectors. A non-zero terminator (byte == 0) ends the shape.
//
//   Vector A: bits 0-1 = direction (00=up, 01=right, 10=down, 11=left),
//             bit  2   = plot/no-plot (1 = plot, then move)
//   Vector B: bits 3-4 = direction, bit 5 = plot. Suppressed if bits 3-5 == 0.
//   Vector C: bits 6-7 = direction (no plot bit). Suppressed if bits 6-7 == 0.
//
// ROT (0..63) rotates the direction vectors in steps of 360/64 ≈ 5.625°.
// SCALE (>=1) multiplies each step's distance.
//
// On the Apple II, plot draws a single pixel and then moves one pixel in the
// direction; at SCALE=N this repeats N times, leaving a stepped raster trail.
// Preserve that behavior here instead of smoothing into modern line segments.

import type { Hires } from './hires';

export interface ShapeVector {
  dir: number; // 0=up, 1=right, 2=down, 3=left
  plot: boolean;
}

export type Shape = ShapeVector[];

export interface ShapeBounds {
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
  width: number;
  height: number;
}

export interface ShapeTable {
  shapes: Shape[];
  bounds: ShapeBounds[];
}

const DIR_DX = [0, 1, 0, -1];
const DIR_DY = [-1, 0, 1, 0];

// ROT step is 5.625° on the Apple II (each step ≈ 1/64 of 360°).
const ROT_STEP_RAD = (5.625 * Math.PI) / 180;

export function decodeShape(rawBytes: number[]): Shape {
  const vectors: Shape = [];
  for (const b of rawBytes) {
    if (b === 0) break;
    // Vector A — always emitted for a non-zero byte.
    vectors.push({ dir: b & 0x03, plot: (b & 0x04) !== 0 });
    // Vector B — emitted iff bits 3-5 are non-zero.
    if (((b >> 3) & 0x07) !== 0) {
      vectors.push({ dir: (b >> 3) & 0x03, plot: (b & 0x20) !== 0 });
    }
    // Vector C — emitted iff bits 6-7 are non-zero. No plot bit on C.
    if (((b >> 6) & 0x03) !== 0) {
      vectors.push({ dir: (b >> 6) & 0x03, plot: false });
    }
  }
  return vectors;
}

// Hex-string raw_bytes from modern/shapes_json/*.payload.json -> byte array.
export function hexToBytes(hex: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    out.push(parseInt(hex.slice(i, i + 2), 16));
  }
  return out;
}

interface ShapeJson {
  shapes: Array<{ id: number; raw_bytes: string; bounding_box?: ShapeBounds }>;
}

export function decodeShapeTableJson(json: ShapeJson): ShapeTable {
  return {
    shapes: json.shapes.map((s) => decodeShape(hexToBytes(s.raw_bytes))),
    bounds: json.shapes.map((s) => s.bounding_box ?? {
      min_x: 0,
      max_x: 0,
      min_y: 0,
      max_y: 0,
      width: 0,
      height: 0,
    }),
  };
}

export function measureShapeBounds(shape: Shape): ShapeBounds {
  let x = 0;
  let y = 0;
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;

  for (const v of shape) {
    if (v.dir === 1) x += 1;
    else if (v.dir === 3) x -= 1;
    else if (v.dir === 2) y += 1;
    else if (v.dir === 0) y -= 1;

    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  return {
    min_x: minX,
    max_x: maxX,
    min_y: minY,
    max_y: maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/** Compute the bounding box when all shapes in the table are drawn
 *  sequentially (pen continues from one shape to the next).  Individual
 *  shape bounds assume each starts at (0,0); the sequential trace follows
 *  the actual pen path through all vectors across all shapes. */
export function measureSequentialBounds(table: ShapeTable): ShapeBounds {
  let x = 0;
  let y = 0;
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;

  for (let si = 0; si < table.shapes.length; si++) {
    const shape = table.shapes[si];
    if (!shape) continue;
    for (const v of shape) {
      if (v.dir === 1) x += 1;
      else if (v.dir === 3) x -= 1;
      else if (v.dir === 2) y += 1;
      else if (v.dir === 0) y -= 1;

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  return {
    min_x: minX,
    max_x: maxX,
    min_y: minY,
    max_y: maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export class ShapeRenderer {
  rot = 0; // 0..63
  scale = 1; // 1..

  constructor(private hires: Hires) {}

  /** DRAW shape AT x, y — anchor pen at (x, y) and traverse vectors. */
  draw(table: ShapeTable, index: number, x: number, y: number): void {
    const shape = table.shapes[index];
    if (!shape) return;
    const angle = this.rot * ROT_STEP_RAD;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const s = this.scale;
    let cx = x;
    let cy = y;
    for (const v of shape) {
      const ux = DIR_DX[v.dir];
      const uy = DIR_DY[v.dir];
      // Rotate then scale.
      const dx = (ux * cosA - uy * sinA) * s;
      const dy = (ux * sinA + uy * cosA) * s;
      const nx = cx + dx;
      const ny = cy + dy;
      if (v.plot) this.plotSegment(cx, cy, nx, ny);
      cx = nx;
      cy = ny;
    }
  }

  /** Draw every shape in the table sequentially without resetting the pen
   *  between shapes — the pen position persists from one shape to the next.
   *  Apple II planet shape tables use invisible positioning shapes (moves
   *  without plots) to set up the pen before drawing-shapes trace the circle
   *  arcs.  Drawing each shape from the same anchor scatters the fragments. */
  drawSequential(table: ShapeTable, x: number, y: number): void {
    const angle = this.rot * ROT_STEP_RAD;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const s = this.scale;
    let cx = x;
    let cy = y;
    for (let si = 0; si < table.shapes.length; si++) {
      const shape = table.shapes[si];
      if (!shape) continue;
      for (const v of shape) {
        const ux = DIR_DX[v.dir];
        const uy = DIR_DY[v.dir];
        const dx = (ux * cosA - uy * sinA) * s;
        const dy = (ux * sinA + uy * cosA) * s;
        const nx = cx + dx;
        const ny = cy + dy;
        if (v.plot) this.plotSegment(cx, cy, nx, ny);
        cx = nx;
        cy = ny;
      }
    }
  }

  /** XDRAW — Apple II's XOR variant. Modern port: same as draw. The original
   *  uses XOR for sprite movement (draw, move, draw to erase). For the modern
   *  port we'll re-render frames whole rather than XOR-blitting, so XDRAW
   *  collapses to DRAW. */
  xdraw(table: ShapeTable, index: number, x: number, y: number): void {
    this.draw(table, index, x, y);
  }

  /** Draw a wireframe outline by plotting every discrete point along each plot
   *  vector. This keeps ship silhouettes readable at small scales. */
  drawOutline(table: ShapeTable, index: number, x: number, y: number): void {
    const shape = table.shapes[index];
    if (!shape) return;
    const angle = this.rot * ROT_STEP_RAD;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const s = this.scale;
    let cx = x;
    let cy = y;
    for (const v of shape) {
      const ux = DIR_DX[v.dir];
      const uy = DIR_DY[v.dir];
      const dx = (ux * cosA - uy * sinA) * s;
      const dy = (ux * sinA + uy * cosA) * s;
      const nx = cx + dx;
      const ny = cy + dy;
      if (v.plot) {
        this.plotSegment(cx, cy, nx, ny);
      }
      cx = nx;
      cy = ny;
    }
  }

  private plotSegment(x1: number, y1: number, x2: number, y2: number): void {
    const stepCount = Math.max(1, Math.ceil(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1))));
    const inv = 1 / stepCount;
    for (let i = 0; i <= stepCount; i++) {
      this.hires.hplot(
        Math.round(x1 + (x2 - x1) * i * inv),
        Math.round(y1 + (y2 - y1) * i * inv),
      );
    }
  }
}
