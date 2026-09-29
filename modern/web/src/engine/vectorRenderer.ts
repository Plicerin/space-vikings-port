import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { ShipBytecodeOp } from './shipBytecode';
import { parseShipBytecode } from './shipBytecode';
import type { GameState } from './gameState';
import { getPanelShapes, panelNeedlePixels } from '../scenes/instruments';
import type { Loader } from './loader';

const SHIP_CORE = 0xf6fbff;
const SHIP_HALO = 0x72dfff;
const SHIP_ACCENT = 0xffab57;

export interface VectorOverlayData {
  projectiles: Array<{ x: number; y: number; z: number }>;
  laserBolts: Array<{ x1: number; y1: number; x2: number; y2: number; age: number }>;
  fighters: Array<{ screenX: number; screenY: number; shapeIdx: number }>;
  flashes: Array<{ timer: number; type: string }>;
  surrenderMsgTimer: number;
  enemyAlive: boolean;
  enemyPos: { x: number; y: number; z: number };
}

function createVectorLineMaterial(color: number, opacity: number): THREE.LineBasicMaterial {
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  (material as any).userData = { baseOpacity: opacity };
  return material;
}

function buildSegments(ops: ShipBytecodeOp[]): Array<{ from: THREE.Vector3; to: THREE.Vector3 }> {
  const vectorOps = ops.filter((op): op is Extract<ShipBytecodeOp, { kind: 'vector' }> => op.kind === 'vector');
  if (vectorOps.length === 0) return [];
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const op of vectorOps) {
    minX = Math.min(minX, op.x); maxX = Math.max(maxX, op.x);
    minY = Math.min(minY, op.y); maxY = Math.max(maxY, op.y);
    minZ = Math.min(minZ, op.z); maxZ = Math.max(maxZ, op.z);
  }
  const center = { x: (minX + maxX) * 0.5, y: (minY + maxY) * 0.5, z: (minZ + maxZ) * 0.5 };
  const scale = 0.0022;
  const points = vectorOps.map((op) => new THREE.Vector3(
    (op.x - center.x) * scale,
    (op.y - center.y) * scale,
    (op.z - center.z) * scale,
  ));

  const segments: Array<{ from: THREE.Vector3; to: THREE.Vector3 }> = [];
  let previous: THREE.Vector3 | null = null;
  for (let i = 0; i < vectorOps.length; i++) {
    const op = vectorOps[i];
    const point = points[i];
    if (op.opcode === 0 || op.opcode === 1 || previous === null) {
      previous = point;
      continue;
    }
    if (op.opcode === 2 || op.opcode === 3) {
      segments.push({ from: previous.clone(), to: point.clone() });
    }
    previous = point;
  }
  return segments;
}

function buildShipModel(ops: ShipBytecodeOp[]): THREE.Group {
  const group = new THREE.Group();
  const segments = buildSegments(ops);
  if (segments.length === 0) return group;

  let span = 1;
  {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const seg of segments) {
      for (const p of [seg.from, seg.to]) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
      }
    }
    span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
  }

  const modelScale = 3.8 / span;
  const linePoints = new Float32Array(segments.length * 2 * 3);
  segments.forEach((seg, index) => {
    const a = seg.from.clone().multiplyScalar(modelScale);
    const b = seg.to.clone().multiplyScalar(modelScale);
    const stride = index * 6;
    linePoints[stride + 0] = a.x; linePoints[stride + 1] = a.y; linePoints[stride + 2] = a.z;
    linePoints[stride + 3] = b.x; linePoints[stride + 4] = b.y; linePoints[stride + 5] = b.z;
  });

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePoints, 3));

  const outerGlow = new THREE.LineSegments(lineGeo, createVectorLineMaterial(SHIP_HALO, 0.1));
  outerGlow.scale.setScalar(1.03);
  group.add(outerGlow);

  const innerGlow = new THREE.LineSegments(lineGeo, createVectorLineMaterial(SHIP_HALO, 0.24));
  innerGlow.scale.setScalar(1.015);
  group.add(innerGlow);

  const core = new THREE.LineSegments(lineGeo, createVectorLineMaterial(SHIP_CORE, 0.96));
  group.add(core);

  const accent = new THREE.LineSegments(lineGeo, createVectorLineMaterial(SHIP_ACCENT, 0.42));
  accent.scale.setScalar(0.994);
  group.add(accent);

  return group;
}

function createLatitudeLoop(radius: number, latitude: number, segments: number): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  const bandRadius = Math.cos(latitude) * radius;
  const height = Math.sin(latitude) * radius;
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(t) * bandRadius, height, Math.sin(t) * bandRadius));
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

function createMeridianLoop(radius: number, longitude: number, segments: number): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(
      Math.cos(t) * radius,
      Math.sin(t) * radius * Math.cos(longitude),
      Math.sin(t) * radius * Math.sin(longitude),
    ));
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

function createPlanetModel(): THREE.Group {
  const group = new THREE.Group();
  const lineMat = (color: number, opacity: number) => createVectorLineMaterial(color, opacity);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(5.0, 18, 12),
    new THREE.MeshBasicMaterial({
      color: 0x6fd8ff, transparent: true, opacity: 0.04,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  group.add(glow);

  const latitudes = [-0.78, -0.42, -0.08, 0.3, 0.66];
  for (const lat of latitudes) {
    const geo = createLatitudeLoop(4.0, lat, 36);
    group.add(new THREE.Line(geo, lineMat(0xf6fbff, 0.6)));
    group.add(new THREE.Line(geo, lineMat(0x67d4ff, 0.12)));
  }

  const meridians = [0, Math.PI / 3, (Math.PI * 2) / 3, Math.PI];
  for (const lon of meridians) {
    const geo = createMeridianLoop(3.9, lon, 36);
    group.add(new THREE.Line(geo, lineMat(0xf6fbff, 0.5)));
    group.add(new THREE.Line(geo, lineMat(0x67d4ff, 0.1)));
  }

  const equator = createLatitudeLoop(4.1, 0, 48);
  group.add(new THREE.Line(equator, lineMat(0xf6fbff, 0.8)));

  const ringGeo = createLatitudeLoop(7.0, 0, 48);
  const ring = new THREE.Line(ringGeo, lineMat(0xffab57, 0.3));
  ring.rotation.x = 0.62;
  ring.rotation.z = -0.45;
  group.add(ring);

  return group;
}

function createStarField(): THREE.Group {
  const group = new THREE.Group();
  const layers = [
    { count: 280, spread: 80, color: 0xa5e8ff, opacity: 0.45, size: 0.7 },
    { count: 180, spread: 160, color: 0xf6fbff, opacity: 0.2, size: 0.9 },
    { count: 140, spread: 220, color: 0x72dfff, opacity: 0.08, size: 1.2 },
  ];
  for (const layer of layers) {
    const positions = new Float32Array(layer.count * 3);
    for (let i = 0; i < layer.count; i++) {
      const idx = i * 3;
      positions[idx + 0] = (Math.random() * 2 - 1) * layer.spread;
      positions[idx + 1] = (Math.random() * 2 - 1) * layer.spread * 0.66;
      positions[idx + 2] = -Math.random() * 220;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: layer.color,
      size: layer.size,
      sizeAttenuation: false,
      transparent: true,
      opacity: layer.opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    group.add(new THREE.Points(geometry, material));
  }
  return group;
}

function projectToScreen(
  camPos: THREE.Vector3,
  lookDir: THREE.Vector3,
  upDir: THREE.Vector3,
  point: THREE.Vector3,
  fov: number,
  aspect: number,
): { x: number; y: number; visible: boolean } {
  const rel = point.clone().sub(camPos);
  const fwdDist = rel.dot(lookDir);
  if (fwdDist <= 0) return { x: 0, y: 0, visible: false };

  const right = new THREE.Vector3().crossVectors(lookDir, upDir).normalize();
  const screenUp = new THREE.Vector3().crossVectors(right, lookDir).normalize();

  const xOffset = rel.dot(right);
  const yOffset = rel.dot(screenUp);

  const halfFov = (fov * Math.PI) / 360;
  const scale = (280 * 0.5) / (Math.tan(halfFov) * fwdDist);

  return {
    x: 140 + xOffset * scale,
    y: 96 - yOffset * scale * aspect,
    visible: true,
  };
}

export class VectorRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private canvas: HTMLCanvasElement;
  private hudCanvas: HTMLCanvasElement;
  private hudCtx: CanvasRenderingContext2D;
  private container: HTMLElement;
  private stage: HTMLCanvasElement | null;
  private time = 0;

  private starField: THREE.Group;
  private shipModel: THREE.Group = new THREE.Group();
  private planetModel: THREE.Group = new THREE.Group();
  private world: THREE.Group;

  private enemyShipGroup: THREE.Group = new THREE.Group();
  private activeShipOps: ShipBytecodeOp[] | null = null;
  private atmosphere = false;
  private lookDir = new THREE.Vector3();
  private upDir = new THREE.Vector3(0, 1, 0);

  constructor(container: HTMLElement, stage: HTMLCanvasElement | null) {
    this.container = container;
    this.stage = stage;

    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.inset = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'none';
    this.canvas.style.zIndex = '2';

    this.hudCanvas = document.createElement('canvas');
    this.hudCanvas.style.position = 'absolute';
    this.hudCanvas.style.inset = '0';
    this.hudCanvas.style.width = '100%';
    this.hudCanvas.style.height = '100%';
    this.hudCanvas.style.display = 'none';
    this.hudCanvas.style.zIndex = '3';
    this.hudCanvas.style.pointerEvents = 'none';
    this.hudCtx = this.hudCanvas.getContext('2d')!;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.82;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x000000, 0.0035);

    this.camera = new THREE.PerspectiveCamera(55, 280 / 192, 0.1, 3000);

    const ambient = new THREE.AmbientLight(0xcde6ff, 0.65);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0x88dfff, 1.2);
    key.position.set(-2, 3, 5);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0xffb06a, 0.18);
    rim.position.set(3, -1.2, -4);
    this.scene.add(rim);

    const composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.28, 0.19, 0.84);
    const outputPass = new OutputPass();
    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.addPass(outputPass);
    this.composer = composer;

    this.starField = createStarField();
    this.scene.add(this.starField);

    this.world = new THREE.Group();
    this.scene.add(this.world);

    this.planetModel = createPlanetModel();
    this.planetModel.position.set(0, 0, 0);
    this.world.add(this.planetModel);

    this.enemyShipGroup = new THREE.Group();
    this.world.add(this.enemyShipGroup);

    container.appendChild(this.canvas);
    container.appendChild(this.hudCanvas);
    window.addEventListener('resize', this.handleResize);
  }

  private handleResize = () => {
    const rect = this.container.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w < 1 || h < 1) return;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.hudCanvas.width = w;
    this.hudCanvas.height = h;
  };

  async loadShip(loader: Loader, shipKind: number): Promise<void> {
    if (shipKind === 0) return;
    try {
      const json = await loader.json<{ bytes: number[] }>(`data/shapes/ship-${shipKind}-bytecode.json`);
      this.activeShipOps = parseShipBytecode(json.bytes);
    } catch {
      this.activeShipOps = null;
    }
  }

  setAtmosphere(atmosphere: boolean): void {
    this.atmosphere = atmosphere;
  }

  show(): void {
    this.canvas.style.display = 'block';
    this.hudCanvas.style.display = 'block';
    if (this.stage) this.stage.style.display = 'none';
    this.handleResize();
  }

  hide(): void {
    this.canvas.style.display = 'none';
    this.hudCanvas.style.display = 'none';
    if (this.stage) this.stage.style.display = 'block';
  }

  get visible(): boolean {
    return this.canvas.style.display !== 'none';
  }

  render(
    state: GameState,
    pitchRad: number,
    headingRad: number,
    dt: number,
    showControls: boolean,
    overlay: VectorOverlayData,
  ): void {
    this.updateScene(state, pitchRad, headingRad, overlay);
    this.composer.render();
    this.drawOverlay(state, pitchRad, headingRad, dt, showControls, overlay);
  }

  private updateScene(
    state: GameState,
    pitchRad: number,
    headingRad: number,
    overlay: VectorOverlayData,
  ): void {
    this.camera.position.set(state.x * 0.001, state.y * 0.001, state.z * 0.001);

    const cosP = Math.cos(pitchRad);
    this.lookDir.set(
      cosP * Math.sin(headingRad),
      Math.sin(pitchRad),
      cosP * Math.cos(headingRad),
    ).normalize();
    const lookTarget = this.camera.position.clone().add(this.lookDir);
    this.camera.lookAt(lookTarget);

    this.planetModel.visible = !this.atmosphere;
    if (!this.atmosphere) {
      const openingAnchor = this.camera.position.clone().add(this.lookDir.clone().multiplyScalar(10));
      const cameraRight = new THREE.Vector3().crossVectors(this.lookDir, this.camera.up).normalize();
      const cameraUp = this.camera.up.clone().normalize();
      this.planetModel.position.copy(openingAnchor)
        .addScaledVector(cameraRight, -1.8)
        .addScaledVector(cameraUp, 0.7);
      const planetDist = this.camera.position.length();
      const planetTooClose = planetDist < 8 && state.z >= -5000;
      if (planetTooClose) {
        this.planetModel.visible = false;
      } else {
        const planetScale = state.z < -5000 ? 1.8 : Math.max(0.05, Math.min(4, 50 / planetDist));
        this.planetModel.scale.setScalar(planetScale);
      }
    }

    if (overlay.enemyAlive && this.activeShipOps) {
      const modelNeedsRebuild = this.enemyShipGroup.children.length === 0;
      if (modelNeedsRebuild) {
        while (this.enemyShipGroup.children.length) {
          const c = this.enemyShipGroup.children[0];
          this.enemyShipGroup.remove(c);
          (c as any).geometry?.dispose?.();
        }
        const shipModel = buildShipModel(this.activeShipOps);
        this.enemyShipGroup.add(shipModel);
      }

      const ePos = new THREE.Vector3(overlay.enemyPos.x * 0.001, overlay.enemyPos.y * 0.001, overlay.enemyPos.z * 0.001);
      this.enemyShipGroup.position.copy(ePos);

      const dist = this.camera.position.distanceTo(ePos);
      const visibleScale = Math.max(0.5, Math.min(6, 12 / Math.max(0.1, dist)));
      this.enemyShipGroup.scale.setScalar(visibleScale);
      this.enemyShipGroup.visible = true;
    } else {
      this.enemyShipGroup.visible = false;
    }

    this.time += 0.016;
    this.planetModel.rotation.y = this.time * 0.07;
    this.planetModel.rotation.x = 0.18 + Math.sin(this.time * 0.2) * 0.04;
  }

  private drawOverlay(
    state: GameState,
    pitchRad: number,
    headingRad: number,
    _dt: number,
    showControls: boolean,
    overlay: VectorOverlayData,
  ): void {
    const ctx = this.hudCtx;
    const w = this.hudCanvas.width;
    const h = this.hudCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const gw = Math.round(h * (280 / 192));
    const gx = Math.round((w - gw) / 2);
    const sx = (x: number) => gx + Math.round((x / 280) * gw);
    const sy = (y: number) => Math.round((y / 192) * h);

    if (!state.atmosphere && state.z < -5000) {
      ctx.fillStyle = '#f6fbff';
      const planetX = 70;
      const planetY = 55;
      const radiusX = 27;
      const radiusY = 19;
      for (let i = 0; i < 48; i += 1) {
        const a = (i / 48) * Math.PI * 2;
        ctx.fillRect(sx(planetX + Math.cos(a) * radiusX), sy(planetY + Math.sin(a) * radiusY), 2, 2);
      }
      for (const latitude of [-0.55, -0.2, 0.18, 0.52]) {
        const halfWidth = radiusX * Math.cos(latitude);
        const y = planetY + Math.sin(latitude) * radiusY;
        for (let i = 0; i < 20; i += 1) {
          const a = (i / 20) * Math.PI * 2;
          ctx.fillRect(sx(planetX + Math.cos(a) * halfWidth), sy(y + Math.sin(a) * 2.5), 2, 2);
        }
      }
    }

    ctx.font = `${Math.max(7, Math.round(h / 24))}px Consolas, monospace`;
    ctx.textBaseline = 'top';

    const txt = (text: string, col: number, row: number, color = '#22dd55') => {
      ctx.fillStyle = color;
      ctx.fillText(text, sx((col - 1) * 7), sy((row - 1) * 8));
    };

    const line = (x1: number, y1: number, x2: number, y2: number, color = '#22dd55') => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx(x1), sy(y1));
      ctx.lineTo(sx(x2), sy(y2));
      ctx.stroke();
    };

    const fillLine = (x1: number, x2: number, y: number, color = '#22dd55') => {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(sx(x1), sy(y));
      ctx.lineTo(sx(x2), sy(y));
      ctx.stroke();
    };

    // ---- Instrument panel ----
    line(123, 145, 1, 145);
    line(1, 145, 1, 128);
    line(1, 128, 279, 128);
    line(279, 128, 279, 145);
    line(279, 145, 157, 145);
    line(123, 128, 123, 183);
    line(157, 128, 157, 183);

    // STARSHIP SIMULATOR lines 159, 170, 173 and 180 - the four needles, same as drawHUD.
    //
    // What stood here was a second copy of the port's own reading of this part of the panel:
    // speed and energy as filled bars, and the bank and pitch needles as rate-of-change
    // markers at 140 + dHeading * 8 and 155 + dPitch * 6, with both deltas hardcoded to 0 so
    // they never moved at all. The disk drives all four off bytes - TX off the bank byte, VY
    // off the pitch byte, SX off PEEK(38157) and EX off PEEK(38199).
    //
    // No erase pass here: this overlay repaints from scratch every frame, so line 159's
    // shapes 25 and 26 have nothing to rub out.
    const panelShapes = getPanelShapes();
    if (panelShapes) {
      const dot = Math.max(1, Math.round(gw / 280));
      ctx.fillStyle = '#ffffff';   // line 175 sets HCOLOR= 3 before line 180 draws
      for (const [nx, ny] of panelNeedlePixels(panelShapes, {
        bank: state.bank,
        pitch: state.pitch,
        speed: Math.max(0, Math.min(120, Math.round(state.speed))),
        energy: Math.round(state.energy),
      })) {
        ctx.fillRect(sx(nx), sy(ny), dot, dot);
      }
    }

    const pill = (px: number, py: number, on: boolean, color: string): void => {
      if (on) {
        ctx.fillStyle = color;
        ctx.fillRect(sx(px), sy(py), sx(px + 11) - sx(px), sy(py + 6) - sy(py));
      } else {
        ctx.strokeStyle = '#ffffff';
        ctx.strokeRect(sx(px), sy(py), sx(px + 11) - sx(px), sy(py + 6) - sy(py));
      }
    };

    pill(6, 152, !state.autopilot, '#22dd55');
    pill(71, 152, state.autopilot, '#22dd55');
    pill(6, 160, state.weaponMode === 'missile', '#22dd55');
    pill(71, 160, state.weaponMode === 'laser', '#22dd55');
    pill(200, 152, state.inOrbit, '#22dd55');
    const condColor = state.condition === 'green' ? '#22dd55' : state.condition === 'blue' ? '#3a8cff' : '#ff8a2a';
    pill(261, 152, state.damage.hullPct < 100, '#ff8a2a');
    pill(200, 160, true, condColor);
    pill(261, 160, state.shieldsOn, '#22dd55');
    pill(6, 168, state.damage.radarPct > 0, '#22dd55');
    pill(71, 168, state.damage.hyperdrivePct > 0, '#22dd55');

    txt(' SPEED ', 4, 18);
    txt('TURN', 19, 18);
    txt(' ENERGY ', 30, 18);
    txt('MANUAL', 4, 20);
    txt('AUTO', 13, 20);
    txt('ORBIT', 24, 20);
    txt('DAMAGE', 32, 20);
    txt('MISSILE', 4, 21);
    txt('LASER', 13, 21);
    txt('COND', 24, 21);
    txt('SHIELD', 32, 21);
    txt('RADAR', 4, 22);
    txt('H/DRIVE', 13, 22);

    const fmt = (n: number) => String(Math.round(n / 2)).padEnd(6);
    txt(fmt(state.x), 1, 23, '#ffffff');
    txt(fmt(state.y), 7, 23, '#ffffff');
    txt(fmt(state.z), 13, 23, '#ffffff');
    const hd = ((headingRad * 180) / Math.PI).toFixed(0).padEnd(4);
    const pd = ((pitchRad * 180) / Math.PI).toFixed(0).padEnd(4);
    txt(hd, 25, 23, '#ffffff');
    txt(pd, 34, 23, '#ffffff');

    if (state.enemyShips > 0 && !state.atmosphere) {
      txt(`ENEMY:${state.enemyShips}`, 1, 1, '#ff8a2a');
    }
    if (state.planetSurrendered) {
      txt('SURRENDERED', 1, 2, '#22dd55');
    }
    if (state.missilesRemaining > 0) {
      txt(`MIS:${state.missilesRemaining}`, 30, 1, '#22dd55');
    }
    if (state.shipVitality > state.shipDestructionLimit && state.shipKind !== 0) {
      txt('SHIP DMG', 1, 3, '#ff8a2a');
    }

    // ---- Gameplay overlay ----
    // Target reticle
    txt('-[ ]-', 18, 8, '#ff8a2a');

    // Projectiles
    ctx.fillStyle = '#ffffff';
    for (const p of overlay.projectiles) {
      const pp = this.projectToOverlay(p.x, p.y, p.z);
      if (pp.visible && pp.y >= 0 && pp.y < 124) {
        ctx.fillRect(sx(Math.round(pp.x)), sy(Math.round(pp.y)), 2, 1);
      }
    }

    // Laser bolts
    for (const b of overlay.laserBolts) {
      ctx.strokeStyle = b.age < 0.08 ? '#ff8a2a' : '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx(b.x1), sy(b.y1));
      ctx.lineTo(sx(b.x2), sy(b.y2));
      ctx.stroke();
    }

    // Fighters
    for (const f of overlay.fighters) {
      const fx = sx(Math.round(f.screenX));
      const fy = sy(Math.round(f.screenY));
      ctx.strokeStyle = '#22dd55';
      ctx.lineWidth = 1;
      if (f.shapeIdx === 8) {
        ctx.beginPath();
        ctx.moveTo(fx - 3, fy); ctx.lineTo(fx + 3, fy);
        ctx.stroke();
      } else if (f.shapeIdx === 9) {
        ctx.beginPath();
        ctx.moveTo(fx, fy - 3); ctx.lineTo(fx, fy + 3);
        ctx.moveTo(fx - 2, fy); ctx.lineTo(fx + 2, fy);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(fx - 2, fy); ctx.lineTo(fx + 2, fy);
        ctx.moveTo(fx, fy - 2); ctx.lineTo(fx, fy + 2);
        ctx.stroke();
      }
    }

    // Flashes
    for (const fl of overlay.flashes) {
      if (fl.type === 'explosion') {
        ctx.fillStyle = '#ff8a2a';
        for (let fy = 0; fy < 40; fy++) {
          ctx.fillRect(
            sx(Math.round(Math.random() * 279)),
            sy(Math.round(Math.random() * 124)),
            2, 2,
          );
        }
      } else {
        line(0, 60, 279, 60, '#ff8a2a');
        line(0, 64, 279, 64, '#ff8a2a');
      }
    }

    // Surrender message
    if (overlay.surrenderMsgTimer > 0) {
      txt('THE PLANET HAS SURRENDERED', 4, 13, '#ffffff');
    }

    // Controls overlay
    if (showControls) {
      const key = (k: string, desc: string, r: number) => {
        txt(` ${k} = ${desc}`, 2, r, '#ff8a2a');
      };
      key('V', 'TOGGLE 3D MODE', 3);
      key('\u2190\u2192', 'TURN', 4);
      key('\u2191\u2193', 'PITCH', 5);
      key('1-4', 'SPEED', 6);
      key('SPC', 'FIRE', 7);
      key('W', 'WEAPON', 8);
      key('S', 'SHIELD', 9);
      key('B', 'CONDITION', 10);
      key('R', 'RADAR', 11);
      key('H', 'HYPERDRIVE', 12);
      key('C', 'COM', 13);
      key('O', 'ORBIT', 14);
      key('A', 'AUTO', 15);
      key('ESC', 'HIDE', 16);
    }

    ctx.font = `${Math.max(6, Math.round(h / 28))}px Consolas, monospace`;
    txt('VECTOR MODE PRESS V TO EXIT', 6, 1, '#3a8cff');
  }

  private projectToOverlay(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const aspect = 280 / 192;
    const rel = new THREE.Vector3(x * 0.001, y * 0.001, z * 0.001).sub(this.camera.position);
    const fwdDist = rel.dot(this.lookDir);
    if (fwdDist <= 0) return { x: 0, y: 0, visible: false };

    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const screenUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);

    const xOffset = rel.dot(right);
    const yOffset = rel.dot(screenUp);

    const halfFov = (55 * Math.PI) / 360;
    const scale = (280 * 0.5) / (Math.tan(halfFov) * fwdDist);

    return {
      x: 140 + xOffset * scale,
      y: 96 - yOffset * scale * aspect,
      visible: true,
    };
  }

  destroy(): void {
    this.hide();
    window.removeEventListener('resize', this.handleResize);
    this.renderer.dispose();
    this.canvas.remove();
    this.hudCanvas.remove();
  }
}
