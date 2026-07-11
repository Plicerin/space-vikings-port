import type { SceneContext, SceneManager } from '../engine/sceneManager';
import {
  drawBitmap,
  scaleToFit,
} from '../engine/apple2HiresBitmap';
import {
  extractShipBitmapFromAppleWinState,
  type AppleWinStateJson,
  type ExtractedShipBitmap,
} from '../engine/applewinState';
import {
  COCKPIT_SHIP_WIREFRAME_VIEW,
  drawShipWireframe,
  parseShipBytecode,
  projectShipBytecode,
  type ShipBytecodeOp,
} from '../engine/shipBytecode';
import { SHIP_MODELS, type ShipModelKind } from '../engine/shipModels';
import { setScene } from '../engine/gameLog';

interface BytecodeJson {
  bytes: number[];
}

export async function shipDebugScene(ctx: SceneContext, _scenes: SceneManager): Promise<void> {
  const { hires, loader, input } = ctx;
  setScene('shipDebug');

  const [sourceState, shipBytecodes] = await Promise.all([
    loader.json<AppleWinStateJson>('data/debug/applewin-space-vikings-state.json'),
    Promise.all(
      SHIP_MODELS.map(async (ship) => ({
        ...ship,
        ops: parseShipBytecode(
          (await loader.json<BytecodeJson>(`data/shapes/ship-${ship.kind}-bytecode.json`)).bytes,
        ),
      })),
    ),
  ]);

  const sourceShip = extractShipBitmapFromAppleWinState(sourceState);
  const shipComponent = sourceShip?.component ?? null;
  const shipBitmap = sourceShip?.ship ?? null;
  const planetBitmap = sourceShip?.planet ?? null;
  const planetBounds = sourceShip?.planetBounds ?? null;

  return new Promise<void>((resolve) => {
    const params = new URLSearchParams(window.location.search);
    let selectedIndex = parseShipIndex(params.get('ship')) ?? 1;
    let paused = params.has('hold');
    const initialYaw = parseAngleParam(params.get('yaw')) ?? COCKPIT_SHIP_WIREFRAME_VIEW.yaw;
    const initialPitch = parseAngleParam(params.get('pitch')) ?? COCKPIT_SHIP_WIREFRAME_VIEW.pitch;
    const roll = parseAngleParam(params.get('roll')) ?? COCKPIT_SHIP_WIREFRAME_VIEW.roll;
    let manualYaw = 0;
    let manualPitch = 0;
    let raf = 0;
    const startedAt = performance.now();

    const frame = (now: number) => {
      const key = input.peekKey();
      if (key !== 0) {
        input.clearKey();
        if (key === 0x9b) {
          cancelAnimationFrame(raf);
          void _scenes.run('starshipSimulator').then(() => resolve());
          return;
        }
        if (key === 0xa0) paused = !paused;
        if (key === 0xb1) selectedIndex = 0;
        if (key === 0xb3) selectedIndex = 1;
        if (key === 0xb4) selectedIndex = 2;
      }

      if (input.isDown('ArrowLeft')) manualYaw -= 0.035;
      if (input.isDown('ArrowRight')) manualYaw += 0.035;
      if (input.isDown('ArrowUp')) manualPitch -= 0.025;
      if (input.isDown('ArrowDown')) manualPitch += 0.025;

      const elapsed = paused ? 0 : (now - startedAt) * 0.001;
      const spin = initialYaw + (paused ? 0 : elapsed * 0.28) + manualYaw;
      const pitch = initialPitch + (paused ? 0 : Math.sin(elapsed * 0.7) * 0.12) + manualPitch;

      drawDebugFrame(
        ctx,
        shipBitmap,
        shipComponent,
        planetBitmap,
        planetBounds,
        shipBytecodes,
        selectedIndex,
        spin,
        pitch,
        roll,
        paused,
      );

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
  });
}

function drawDebugFrame(
  ctx: SceneContext,
  shipBitmap: import('../engine/apple2HiresBitmap').Bitmap | null,
  shipComponent: ExtractedShipBitmap['component'] | null,
  planetBitmap: import('../engine/apple2HiresBitmap').Bitmap | null,
  planetBounds: import('../engine/apple2HiresBitmap').BitmapBounds | null,
  shipBytecodes: Array<{ kind: ShipModelKind; name: string; shortName: string; ops: ShipBytecodeOp[] }>,
  selectedIndex: number,
  yaw: number,
  pitch: number,
  roll: number,
  paused: boolean,
): void {
  const { hires } = ctx;
  const selected = shipBytecodes[selectedIndex];

  hires.hgr();
  hires.hcolor(3);
  hires.text('3D SHIP MODEL DEBUG', 11, 1);

  drawPanel(hires, 4, 14, 108, 72, 'SOURCE');
  drawPanel(hires, 116, 14, 160, 112, `${selected.name} ROTATING`);
  drawPanel(hires, 4, 130, 272, 52, 'BYTECODE MODELS');

  hires.hcolor(3);
  if (planetBitmap && planetBounds) {
    drawBitmap(hires, planetBitmap, 10, 22, 1, planetBounds);
  }
  if (shipBitmap && shipComponent) {
    const scale = scaleToFit(shipComponent.bounds, 70);
    drawBitmap(hires, shipBitmap, 20, 34, scale, shipComponent.bounds);
  }

  drawRotatingShip(hires, selected.ops, 196, 76, 84, yaw, pitch, roll);
  hires.hcolor(5);
  hires.text(`YAW ${formatAngle(yaw)} PITCH ${formatAngle(pitch)}`, 17, 15);
  hires.text(`ROLL ${formatAngle(roll)} ${paused ? 'HOLD' : 'SPIN'}`, 17, 16);

  const previewX = [48, 140, 232];
  for (let i = 0; i < shipBytecodes.length; i++) {
    const ship = shipBytecodes[i];
    const selectedMarker = i === selectedIndex ? 5 : 3;
    hires.hcolor(selectedMarker);
    hires.text(ship.shortName, Math.max(1, Math.floor((previewX[i] - 30) / 7)), 18);
    drawRotatingShip(
      hires,
      ship.ops,
      previewX[i],
      162,
      ship.kind === 1 ? 42 : 48,
      yaw,
      pitch,
      0,
    );
  }

  hires.hcolor(1);
  hires.text('1 3 4 SELECT   ARROWS TRIM   SPACE HOLD   ESC COCKPIT', 1, 23);
}

function drawRotatingShip(
  hires: SceneContext['hires'],
  ops: ShipBytecodeOp[],
  centerX: number,
  centerY: number,
  desiredSpan: number,
  yaw: number,
  pitch: number,
  roll: number,
): void {
  const projection = projectShipBytecode(ops, desiredSpan, { yaw, pitch, roll });
  hires.hcolor(3);
  if (projection) drawShipWireframe(hires, projection, centerX, centerY);
}

function formatAngle(rad: number): string {
  const deg = Math.round((rad * 180) / Math.PI) % 360;
  return `${deg}`.padStart(4);
}

function parseShipIndex(value: string | null): number | null {
  if (value === '1') return 0;
  if (value === '3') return 1;
  if (value === '4') return 2;
  return null;
}

function parseAngleParam(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const trimmed = value.trim().toLowerCase();
  const radians = trimmed.endsWith('rad');
  const numeric = Number(radians ? trimmed.slice(0, -3) : trimmed);
  if (!Number.isFinite(numeric)) return null;
  return radians ? numeric : (numeric * Math.PI) / 180;
}

function drawPanel(
  hires: SceneContext['hires'],
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
): void {
  hires.hcolor(2);
  hires.line(x, y, x + width, y);
  hires.line(x, y, x, y + height);
  hires.line(x + width, y, x + width, y + height);
  hires.line(x, y + height, x + width, y + height);
  hires.hcolor(3);
  hires.text(title, Math.max(1, Math.floor(x / 7) + 2), Math.max(1, Math.floor((y + 10) / 8)));
}
