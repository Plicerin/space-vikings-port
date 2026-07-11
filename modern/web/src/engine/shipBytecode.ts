import type { Hires } from './hires';

export interface ShipBytecodeHeaderOp {
  kind: 'set-state';
  opcode: 4;
  state: number;
  offset: number;
  length: 2;
}

export interface ShipBytecodeVectorOp {
  kind: 'vector';
  opcode: 0 | 1 | 2 | 3;
  x: number;
  y: number;
  z: number;
  offset: number;
  length: 7;
}

export interface ShipBytecodeUnknownOp {
  kind: 'unknown';
  opcode: number;
  offset: number;
  length: 1;
}

export type ShipBytecodeOp = ShipBytecodeHeaderOp | ShipBytecodeVectorOp | ShipBytecodeUnknownOp;

export interface ShipWireframeSegment {
  opcode: 0 | 1 | 2 | 3;
  from: ShipProjectedPoint;
  to: ShipProjectedPoint;
}

export interface ShipProjectedPoint {
  x: number;
  y: number;
}

export interface ShipWireframeProjection {
  points: ShipProjectedPoint[];
  segments: ShipWireframeSegment[];
  contours: Array<{
    points: ShipProjectedPoint[];
    fill: boolean;
  }>;
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
}

export interface ShipWireframeProjectionOptions {
  yaw?: number;
  pitch?: number;
  roll?: number;
  cameraDepth?: number;
}

export const COCKPIT_SHIP_WIREFRAME_VIEW: Required<Pick<ShipWireframeProjectionOptions, 'yaw' | 'pitch' | 'roll'>> = {
  yaw: -1.05,
  pitch: -0.27,
  roll: 0.05,
};

const FOCAL_LENGTH = 280;

export function parseShipBytecode(bytes: number[]): ShipBytecodeOp[] {
  const ops: ShipBytecodeOp[] = [];

  for (let offset = 0; offset < bytes.length;) {
    const opcode = bytes[offset] ?? 0;
    if (opcode === 4 && offset + 1 < bytes.length) {
      ops.push({
        kind: 'set-state',
        opcode: 4,
        state: bytes[offset + 1],
        offset,
        length: 2,
      });
      offset += 2;
      continue;
    }
    if ((opcode === 0 || opcode === 1 || opcode === 2 || opcode === 3) && offset + 6 < bytes.length) {
      const x = decodeSignedWord(bytes[offset + 1], bytes[offset + 2]);
      const y = decodeSignedWord(bytes[offset + 3], bytes[offset + 4]);
      const z = decodeSignedWord(bytes[offset + 5], bytes[offset + 6]);
      if (!isPlausibleVector(x, y, z)) {
        break;
      }
      ops.push({
        kind: 'vector',
        opcode,
        x,
        y,
        z,
        offset,
        length: 7,
      });
      offset += 7;
      continue;
    }

    ops.push({
      kind: 'unknown',
      opcode,
      offset,
      length: 1,
    });
    break;
  }

  return ops;
}

export function projectShipBytecode(
  ops: ShipBytecodeOp[],
  desiredSpan: number,
  options: ShipWireframeProjectionOptions = {},
): ShipWireframeProjection | null {
  const vectorOps = ops.filter((op): op is ShipBytecodeVectorOp => op.kind === 'vector');
  if (vectorOps.length === 0) return null;

  const modelBounds = measureModelVectors(vectorOps);
  const centerX = (modelBounds.minX + modelBounds.maxX) * 0.5;
  const centerY = (modelBounds.minY + modelBounds.maxY) * 0.5;
  const centerZ = (modelBounds.minZ + modelBounds.maxZ) * 0.5;
  const cameraDepth = options.cameraDepth ?? Math.max(1, -centerZ);

  const rawPoints = vectorOps.map((op) => {
    const p = rotatePoint(op.x - centerX, op.y - centerY, op.z - centerZ, options);
    p.z -= cameraDepth;
    return {
      x: (p.x / Math.max(1, -p.z)) * FOCAL_LENGTH,
      y: (-p.y / Math.max(1, -p.z)) * FOCAL_LENGTH,
    };
  });

  const rawBounds = measurePoints(rawPoints);
  const rawSpan = Math.max(rawBounds.width, rawBounds.height, 1);
  const scale = desiredSpan / rawSpan;

  const points = rawPoints.map((point) => ({
    x: (point.x - (rawBounds.minX + rawBounds.maxX) * 0.5) * scale,
    y: (point.y - (rawBounds.minY + rawBounds.maxY) * 0.5) * scale,
  }));

  const segments: ShipWireframeSegment[] = [];
  const contours: Array<{ points: ShipProjectedPoint[]; fill: boolean }> = [];
  let currentContour: ShipProjectedPoint[] = [];
  let currentFill = true;
  let previous: ShipProjectedPoint | null = null;
  for (let i = 0; i < vectorOps.length; i++) {
    const op = vectorOps[i];
    const point = points[i];
    if (op.opcode === 0 || op.opcode === 1 || previous === null) {
      pushContour(contours, currentContour, currentFill);
      currentContour = [point];
      currentFill = true;
    } else {
      currentContour.push(point);
    }
    if (op.opcode === 3) currentFill = false;
    if (previous && (op.opcode === 2 || op.opcode === 3)) {
      segments.push({
        opcode: op.opcode,
        from: previous,
        to: point,
      });
    }
    previous = point;
  }
  pushContour(contours, currentContour, currentFill);

  return {
    points,
    segments,
    contours,
    bounds: measurePoints(points),
  };
}

function rotatePoint(
  x: number,
  y: number,
  z: number,
  options: ShipWireframeProjectionOptions,
): { x: number; y: number; z: number } {
  const yaw = options.yaw ?? 0;
  const pitch = options.pitch ?? 0;
  const roll = options.roll ?? 0;

  if (yaw !== 0) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const nx = x * c + z * s;
    const nz = -x * s + z * c;
    x = nx;
    z = nz;
  }

  if (pitch !== 0) {
    const c = Math.cos(pitch);
    const s = Math.sin(pitch);
    const ny = y * c - z * s;
    const nz = y * s + z * c;
    y = ny;
    z = nz;
  }

  if (roll !== 0) {
    const c = Math.cos(roll);
    const s = Math.sin(roll);
    const nx = x * c - y * s;
    const ny = x * s + y * c;
    x = nx;
    y = ny;
  }

  return { x, y, z };
}

export function drawShipWireframe(
  hires: Hires,
  projection: ShipWireframeProjection,
  centerX: number,
  centerY: number,
): void {
  for (const segment of projection.segments) {
    hires.line(
      Math.round(centerX + segment.from.x),
      Math.round(centerY + segment.from.y),
      Math.round(centerX + segment.to.x),
      Math.round(centerY + segment.to.y),
    );
  }
}

export function formatShipBytecodeOp(op: ShipBytecodeOp): string {
  const addr = op.offset.toString(16).toUpperCase().padStart(4, '0');
  if (op.kind === 'set-state') {
    return `${addr} 04 ${op.state.toString(16).toUpperCase().padStart(2, '0')}  ST=${op.state}`;
  }
  if (op.kind === 'vector') {
    return `${addr} ${op.opcode} (${op.x},${op.y},${op.z})`;
  }
  return `${addr} ${op.opcode.toString(16).toUpperCase().padStart(2, '0')}  ?`;
}

function decodeSignedWord(lo: number, hi: number): number {
  let value = (lo & 0xFF) | ((hi & 0xFF) << 8);
  if ((value & 0x8000) !== 0) {
    value -= 0x10000;
  }
  return value;
}

function measurePoints(points: ShipProjectedPoint[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0,
    };
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function measureModelVectors(points: ShipBytecodeVectorOp[]) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    minZ = Math.min(minZ, point.z);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    maxZ = Math.max(maxZ, point.z);
  }

  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function pushContour(
  contours: Array<{ points: ShipProjectedPoint[]; fill: boolean }>,
  points: ShipProjectedPoint[],
  fill: boolean,
): void {
  if (points.length < 2) return;
  const first = points[0];
  const last = points[points.length - 1];
  const dx = first.x - last.x;
  const dy = first.y - last.y;
  const closed = Math.hypot(dx, dy) <= 6;
  contours.push({ points, fill: fill && closed });
}

function isPlausibleVector(x: number, y: number, z: number): boolean {
  if (z >= -500 || z <= -10000) return false;
  if (Math.abs(x) > 4000 || Math.abs(y) > 4000) return false;
  return true;
}
