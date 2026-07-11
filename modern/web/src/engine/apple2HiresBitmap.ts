import type { Hires } from './hires';

export interface BitmapBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface Bitmap {
  width: number;
  height: number;
  pixels: Uint8Array;
}

export interface ConnectedComponent {
  pixels: Array<{ x: number; y: number }>;
  bounds: BitmapBounds;
}

const HGR_WIDTH = 280;
const HGR_HEIGHT = 192;
const HGR_BYTES_PER_ROW = 40;

export function decodeApple2HiresPage(pageBytes: number[]): Bitmap {
  const pixels = new Uint8Array(HGR_WIDTH * HGR_HEIGHT);
  for (let y = 0; y < HGR_HEIGHT; y++) {
    const rowBase = apple2HgrRowOffset(y);
    for (let column = 0; column < HGR_BYTES_PER_ROW; column++) {
      const value = pageBytes[rowBase + column] ?? 0;
      const pixelBaseX = column * 7;
      for (let bit = 0; bit < 7; bit++) {
        if ((value & (1 << bit)) !== 0) {
          const x = pixelBaseX + bit;
          if (x < HGR_WIDTH) {
            pixels[(y * HGR_WIDTH) + x] = 1;
          }
        }
      }
    }
  }
  return { width: HGR_WIDTH, height: HGR_HEIGHT, pixels };
}

export function drawBitmap(
  hires: Hires,
  bitmap: Bitmap,
  destX: number,
  destY: number,
  scale: number,
  bounds?: BitmapBounds,
): void {
  const src = bounds ?? fullBitmapBounds(bitmap);
  const s = Math.max(1, Math.round(scale));
  for (let y = src.minY; y <= src.maxY; y++) {
    for (let x = src.minX; x <= src.maxX; x++) {
      if (bitmap.pixels[(y * bitmap.width) + x] === 0) continue;
      const dx = destX + ((x - src.minX) * s);
      const dy = destY + ((y - src.minY) * s);
      for (let yy = 0; yy < s; yy++) {
        hires.line(dx, dy + yy, dx + s - 1, dy + yy);
      }
    }
  }
}

export function findLargestConnectedComponent(
  bitmap: Bitmap,
  region?: { minX: number; minY: number; maxX: number; maxY: number },
): ConnectedComponent | null {
  const minX = region?.minX ?? 0;
  const minY = region?.minY ?? 0;
  const maxX = region?.maxX ?? (bitmap.width - 1);
  const maxY = region?.maxY ?? (bitmap.height - 1);
  const visited = new Uint8Array(bitmap.width * bitmap.height);
  let best: ConnectedComponent | null = null;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const idx = (y * bitmap.width) + x;
      if (visited[idx] || bitmap.pixels[idx] === 0) continue;
      const component = floodFill(bitmap, visited, x, y, minX, minY, maxX, maxY);
      if (!best || component.pixels.length > best.pixels.length) {
        best = component;
      }
    }
  }

  return best;
}

export function componentToBitmap(bitmap: Bitmap, component: ConnectedComponent): Bitmap {
  const out = new Uint8Array(bitmap.width * bitmap.height);
  for (const pixel of component.pixels) {
    out[(pixel.y * bitmap.width) + pixel.x] = 1;
  }
  return {
    width: bitmap.width,
    height: bitmap.height,
    pixels: out,
  };
}

export function scaleToFit(bounds: BitmapBounds, maxSpan: number): number {
  const span = Math.max(bounds.width, bounds.height);
  if (span <= 0) return 1;
  return Math.max(1, Math.floor(maxSpan / span));
}

export function findBitmapBounds(bitmap: Bitmap): BitmapBounds | null {
  let minX = bitmap.width;
  let minY = bitmap.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < bitmap.height; y++) {
    for (let x = 0; x < bitmap.width; x++) {
      if (bitmap.pixels[(y * bitmap.width) + x] === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: (maxX - minX) + 1,
    height: (maxY - minY) + 1,
  };
}

function fullBitmapBounds(bitmap: Bitmap): BitmapBounds {
  return {
    minX: 0,
    minY: 0,
    maxX: bitmap.width - 1,
    maxY: bitmap.height - 1,
    width: bitmap.width,
    height: bitmap.height,
  };
}

function apple2HgrRowOffset(y: number): number {
  return ((y & 0x07) << 10) + ((y & 0x38) << 4) + ((y & 0xC0) >> 6) * HGR_BYTES_PER_ROW;
}

function floodFill(
  bitmap: Bitmap,
  visited: Uint8Array,
  startX: number,
  startY: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): ConnectedComponent {
  const queue: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];
  const pixels: Array<{ x: number; y: number }> = [];
  let head = 0;
  let minPX = startX;
  let minPY = startY;
  let maxPX = startX;
  let maxPY = startY;

  while (head < queue.length) {
    const { x, y } = queue[head++];
    const idx = (y * bitmap.width) + x;
    if (visited[idx]) continue;
    visited[idx] = 1;
    if (bitmap.pixels[idx] === 0) continue;

    pixels.push({ x, y });
    minPX = Math.min(minPX, x);
    minPY = Math.min(minPY, y);
    maxPX = Math.max(maxPX, x);
    maxPY = Math.max(maxPY, y);

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
        const nIdx = (ny * bitmap.width) + nx;
        if (!visited[nIdx]) queue.push({ x: nx, y: ny });
      }
    }
  }

  return {
    pixels,
    bounds: {
      minX: minPX,
      minY: minPY,
      maxX: maxPX,
      maxY: maxPY,
      width: (maxPX - minPX) + 1,
      height: (maxPY - minPY) + 1,
    },
  };
}
