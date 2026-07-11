import {
  componentToBitmap,
  decodeApple2HiresPage,
  findLargestConnectedComponent,
  type BitmapBounds,
  type Bitmap,
  type ConnectedComponent,
} from './apple2HiresBitmap';

export interface AppleWinStateJson {
  source: string;
  cpu: {
    pc: number;
  };
  keyRanges: {
    hiresPage1: { bytes: number[] };
    shipBuffer: { bytes: number[]; hexLines: Array<{ addr: string; hex: string }> };
    shipOpcodeRecord: { bytes?: number[]; hexLines: Array<{ addr: string; hex: string }> };
  };
}

export interface ExtractedShipBitmap {
  frame: Bitmap;
  component: ConnectedComponent;
  ship: Bitmap;
  planet: Bitmap;
  planetBounds: BitmapBounds;
}

export function extractShipBitmapFromAppleWinState(
  state: AppleWinStateJson,
): ExtractedShipBitmap | null {
  const frame = decodeApple2HiresPage(state.keyRanges.hiresPage1.bytes);
  const component = findLargestConnectedComponent(frame, {
    minX: 50,
    minY: 18,
    maxX: 210,
    maxY: 118,
  });
  if (!component) return null;
  const planetExtraction = extractPlanetBitmap(frame, component);
  return {
    frame,
    component,
    ship: componentToBitmap(frame, component),
    planet: planetExtraction.bitmap,
    planetBounds: planetExtraction.bounds,
  };
}

function extractPlanetBitmap(
  frame: Bitmap,
  shipComponent: ConnectedComponent,
): { bitmap: Bitmap; bounds: BitmapBounds } {
  const bounds = {
    minX: Math.max(0, shipComponent.bounds.minX - 42),
    minY: Math.max(0, shipComponent.bounds.minY - 40),
    maxX: Math.min(frame.width - 1, shipComponent.bounds.maxX + 42),
    maxY: Math.min(frame.height - 1, shipComponent.bounds.maxY + 20),
    width: 0,
    height: 0,
  };
  bounds.width = (bounds.maxX - bounds.minX) + 1;
  bounds.height = (bounds.maxY - bounds.minY) + 1;

  const out = new Uint8Array(frame.width * frame.height);
  const shipPadding = 2;
  const horizonCutoff = bounds.maxY - 9;

  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const idx = (y * frame.width) + x;
      if (frame.pixels[idx] === 0) continue;
      if (y >= horizonCutoff) continue;
      if (
        x >= shipComponent.bounds.minX - shipPadding
        && x <= shipComponent.bounds.maxX + shipPadding
        && y >= shipComponent.bounds.minY - shipPadding
        && y <= shipComponent.bounds.maxY + shipPadding
      ) {
        continue;
      }
      if (countNearbyLit(frame, x, y, 4) < 3) continue;
      out[idx] = 1;
    }
  }

  return {
    bitmap: {
      width: frame.width,
      height: frame.height,
      pixels: out,
    },
    bounds,
  };
}

function countNearbyLit(bitmap: Bitmap, x: number, y: number, radius: number): number {
  let count = 0;
  for (let yy = y - radius; yy <= y + radius; yy++) {
    if (yy < 0 || yy >= bitmap.height) continue;
    for (let xx = x - radius; xx <= x + radius; xx++) {
      if (xx < 0 || xx >= bitmap.width) continue;
      if (xx === x && yy === y) continue;
      if (bitmap.pixels[(yy * bitmap.width) + xx] !== 0) {
        count += 1;
      }
    }
  }
  return count;
}
