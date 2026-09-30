import type { Hires } from './hires';
import { type Vec3 as ProjVec3 } from './math3d';
import {
  viewMatrix, toCameraSpaceFixed, projectCameraSpaceFixed, outcode67EF, clipFrustum61B7,
  SNAPSHOT_VIEW, type ObjectView,
} from './diskPipeline';

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

  // $7F ends a model - SHIP # 0 on the disk is that one byte and nothing else - and it
  // falls through to the 'unknown' branch below, which stops the walk. That terminator is
  // the only thing needed to know where a model ends.
  //
  // There used to be an isPlausibleVector() guard here that broke out of the loop on any
  // vertex with z outside -10000..-500. Ship models sit around z -3500 so it never fired
  // for them, but PLANET # 0 - the star table, the same bytecode - spans -10000..+10000,
  // and the guard threw away all 195 of its points at the first star.
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
    hires.segment(
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



// ---------------------------------------------------------------------
// World-space projection, the way the disk does it
// ---------------------------------------------------------------------
//
// projectShipBytecode() above centres the model on its own bounds, views it from a fixed
// three-quarter angle and rescales it to a span the caller picks. That is a sprite, not a
// projection: measured against the original it came out 2.30x too tall (see
// oracle/DISK_TRUTH.md, "Ship render parity").
//
// This projects every vertex through the camera instead, with the transform derived from
// the original renderer in oracle/fit_projection.mjs. The model's coordinates on the disk
// are already absolute world coordinates, so with no `origin` the ship sits exactly where
// the disk puts it; passing an origin moves it there, keeping its shape.

export interface ShipWorldSegment {
  from: ShipProjectedPoint;
  to: ShipProjectedPoint;
}

export interface ShipWorldProjection {
  /** Already clipped to the view the original clips to. */
  segments: ShipWorldSegment[];
  /** Opcode-0 vertices, which stand alone - DEBRIS is nothing but these. */
  dots: ShipProjectedPoint[];
  /** Vertices that fell at or behind the camera and were dropped. */
  culled: number;
  /** Segments the clipper rejected outright. */
  clippedAway: number;
}

/** The centre of a model's own coordinates, for placing it somewhere else. */
export function measureModelCentre(ops: ShipBytecodeOp[]): ProjVec3 | null {
  const v = ops.filter((o): o is ShipBytecodeVectorOp => o.kind === 'vector');
  if (!v.length) return null;
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of v) {
    min.x = Math.min(min.x, p.x); max.x = Math.max(max.x, p.x);
    min.y = Math.min(min.y, p.y); max.y = Math.max(max.y, p.y);
    min.z = Math.min(min.z, p.z); max.z = Math.max(max.z, p.z);
  }
  return { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
}

/**
 * Project a ship's vertices through the camera.
 *
 * Opcode 1 starts a run and opcode 2 continues it, which is how the models read: ships are
 * mostly 1 followed by a string of 2s. Opcode 0 is a lone point (DEBRIS is nothing but
 * those) and opcode 3 ends a run - it is drawn as a line like 2, but the pen lifts after,
 * which is the reading that matches the shapes the disk produces.
 *
 * Opcode 3 is a spur and opcode 0 does not lift the pen; see the dispatch table below.
 * The transform is the disk's own, in fixed point: `diskPipeline.ts` builds the matrix the
 * way $654E and $6631 do and divides the way $68A1 does. `view` carries the two things the
 * display list supplies per object that the camera arguments do not - the bank angle and the
 * camera-axis scale - and defaults to what the flight snapshot carried.
 */
export function projectShipWorld(
  ops: ShipBytecodeOp[],
  camera: ProjVec3,
  headingByte: number,
  pitchByte: number,
  origin?: ProjVec3 | null,
  view?: Partial<Omit<ObjectView, 'camera' | 'pitch' | 'heading'>>,
): ShipWorldProjection {
  const objectView: ObjectView = {
    camera,
    pitch: pitchByte,
    heading: headingByte,
    bank: view?.bank ?? SNAPSHOT_VIEW.bank,
    scale: view?.scale ?? SNAPSHOT_VIEW.scale,
    ops: view?.ops ?? SNAPSHOT_VIEW.ops,
  };
  // $62D5 and the fall-through at $6631: built once per object, not once per vertex.
  const matrix = viewMatrix(objectView);
  const centre = origin ? measureModelCentre(ops) : null;
  const shift = origin && centre
    ? { x: origin.x - centre.x, y: origin.y - centre.y, z: origin.z - centre.z }
    : { x: 0, y: 0, z: 0 };

  const segments: ShipWorldSegment[] = [];
  const dots: ShipProjectedPoint[] = [];
  let culled = 0;
  let clippedAway = 0;

  // $6162's dispatch: `LDA ($9B),Y / CMP #$12 / ASL A / TAX / JMP ($6076,X)`, eighteen
  // handlers. Four of them make up a model:
  //
  //   0  $622E  a lone point - transformed into slot A, plotted if its outcode is clear,
  //             and the run is left alone. It does not lift the pen.
  //   1  $61B7  a fresh line: slot A from this vertex, slot B from the NEXT one, and the
  //             next one's own opcode byte is never read. It consumes fourteen bytes.
  //   2  $61EC  continue: `LDA $6F,X / STA $5F,X` puts the saved endpoint in slot A and
  //             this vertex in slot B, then saves this vertex as the new endpoint.
  //   3  $6212  `LDA $6F,X / STA $67,X` puts the saved endpoint in slot **B** and this
  //             vertex in slot A, and $618E never runs - so the endpoint does not move.
  //             It is a spur: draw out to somewhere and stay where you were.
  //   4  $62BE  `STA $7C`, and $61CA/$61D9 read it: with it set, a segment that needs
  //             clipping is dropped instead. The ships carry 0 and DEBRIS carries 1.
  //
  // The endpoint is saved by $618E before the clipper touches anything, so a run continues
  // from the unclipped vertex.
  let savedEnd: ProjVec3 | null = null;         // $70-$76
  let noClip = 0;                               // $7C

  const toCam = (op: ShipBytecodeVectorOp): ProjVec3 => toCameraSpaceFixed(
    { x: op.x + shift.x, y: op.y + shift.y, z: op.z + shift.z }, camera, matrix,
  );
  const drawSeg = (a: ProjVec3, b: ProjVec3): void => {
    const kept = clipFrustum61B7(a, b, noClip);
    if (!kept) { clippedAway++; return; }
    const pa = projectCameraSpaceFixed(kept.a, objectView.ops);
    const pb = projectCameraSpaceFixed(kept.b, objectView.ops);
    if (!pa || !pb) { culled++; return; }
    segments.push({ from: pa, to: pb });
  };

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op.kind === 'set-state') { noClip = op.state; continue; }   // $62BE
    if (op.kind !== 'vector') break;                                // $7F ends the model
    const v = toCam(op);

    if (op.opcode === 0) {                                          // $622E
      const q = outcode67EF(v) ? null : projectCameraSpaceFixed(v, objectView.ops);
      if (q) dots.push(q); else culled++;
      continue;
    }
    if (op.opcode === 1) {                                          // $61B7
      const next = ops[i + 1];
      if (!next || next.kind !== 'vector') break;
      const b = toCam(next);
      savedEnd = b;                                                 // $618E, before the clip
      drawSeg(v, b);
      i++;                                                          // both vertices consumed
      continue;
    }
    if (!savedEnd) continue;                                        // no run to continue
    if (op.opcode === 2) { drawSeg(savedEnd, v); savedEnd = v; continue; }   // $61EC
    drawSeg(v, savedEnd);                                           // $6212 - the endpoint stays
  }

  return { segments, dots, culled, clippedAway };
}

/** Draw a world-space projection. Coordinates are already screen coordinates. */
export function drawShipWorld(hires: Hires, projection: ShipWorldProjection): void {
  // $6DD5 works in half-columns, so hand it back the x $68A1 produced rather than the
  // doubled screen one. projectCameraSpaceFixed() always returns an even x, so this is exact.
  for (const s of projection.segments) {
    hires.segment6DD5(Math.round(s.from.x) / 2, Math.round(s.from.y),
      Math.round(s.to.x) / 2, Math.round(s.to.y));
  }
  // A lone point is two pixels wide on the disk, not one. probe_project.mjs put a single
  // vertex through the real renderer 54 times and it came back as a 2-pixel blob every
  // time, at x and x+1 on the same row. Plotting one pixel left the starfield at half the
  // original's density - 142 pixels against 278.
  for (const p of projection.dots) {
    hires.halfColumn(Math.round(p.x) / 2, Math.round(p.y));
  }
}
