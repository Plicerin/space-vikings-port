import type { Hires } from './hires';

export interface ShipPoint {
  x: number;
  y: number;
}

export interface ShipPointShape {
  id: number;
  length: number;
  points: ShipPoint[];
  bounds: ShipPointBounds;
}

export interface ShipPointBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

export interface ShipPointSprite {
  shapes: ShipPointShape[];
  bounds: ShipPointBounds;
}

interface ShipPointJson {
  shapes: Array<{
    id: number;
    length: number;
    points: Array<{ x: number; y: number }>;
  }>;
}

const JUMP_BREAK_THRESHOLD = 12;

export function decodeSignedByte(value: number): number {
  return value < 128 ? value : value - 256;
}

export function decodeShipPointJson(json: ShipPointJson): ShipPointSprite {
  const shapes = json.shapes
    .map((shape) => ({
      id: shape.id,
      length: shape.length,
      points: shape.points.map((point) => ({
        x: decodeSignedByte(point.x),
        y: decodeSignedByte(point.y),
      })),
      bounds: {
        minX: 0,
        maxX: 0,
        minY: 0,
        maxY: 0,
        width: 0,
        height: 0,
      },
    }))
    .filter((shape) => shape.points.length > 1);

  for (const shape of shapes) {
    shape.bounds = measureShipPointBounds([shape]);
  }

  return {
    shapes,
    bounds: measureShipPointBounds(shapes),
  };
}

export function measureShipPointBounds(shapes: ShipPointShape[]): ShipPointBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const shape of shapes) {
    for (const point of shape.points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      width: 0,
      height: 0,
    };
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function computeShipPointScale(bounds: ShipPointBounds, desiredPx: number): number {
  const span = Math.max(1, bounds.width, bounds.height);
  return Math.max(0.08, Math.min(2.5, desiredPx / span));
}

export function renderShipPointSprite(
  hires: Hires,
  sprite: ShipPointSprite,
  centerX: number,
  centerY: number,
  scale: number,
  shapeIndex = selectDominantShipPointShapeIndex(sprite),
): void {
  const shape = sprite.shapes[shapeIndex];
  if (!shape) return;
  const anchorX = centerX - ((shape.bounds.minX + shape.bounds.maxX) * 0.5 * scale);
  const anchorY = centerY - ((shape.bounds.minY + shape.bounds.maxY) * 0.5 * scale);
  drawPointShape(hires, shape, anchorX, anchorY, scale);
}

export function selectDominantShipPointShapeIndex(sprite: ShipPointSprite): number {
  let best = 0;
  let bestScore = -Infinity;

  for (let i = 0; i < sprite.shapes.length; i++) {
    const shape = sprite.shapes[i];
    const score = shape.points.length + (shape.bounds.width + shape.bounds.height) * 0.25;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }

  return best;
}

function drawPointShape(
  hires: Hires,
  shape: ShipPointShape,
  anchorX: number,
  anchorY: number,
  scale: number,
): void {
  let prev: ShipPoint | null = null;

  for (const point of shape.points) {
    const px = Math.round(anchorX + point.x * scale);
    const py = Math.round(anchorY + point.y * scale);
    hires.hplot(px, py);

    if (prev) {
      const dx = point.x - prev.x;
      const dy = point.y - prev.y;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (dist <= JUMP_BREAK_THRESHOLD) {
        const ppx = Math.round(anchorX + prev.x * scale);
        const ppy = Math.round(anchorY + prev.y * scale);
        hires.line(ppx, ppy, px, py);
      }
    }

    prev = point;
  }
}
