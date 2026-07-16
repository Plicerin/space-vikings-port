import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { ShipBytecodeOp } from './shipBytecode';
import { parseShipBytecode } from './shipBytecode';
import type { GameState } from './gameState';
import type { Loader } from './loader';

const SHIP_CORE = 0xf6fbff;
const SHIP_HALO = 0x72dfff;
const SHIP_ACCENT = 0xffab57;

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

export class VectorRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private canvas: HTMLCanvasElement;
  private container: HTMLElement;
  private stage: HTMLCanvasElement | null;
  private running = false;
  private animFrame = 0;
  private time = 0;

  private starField: THREE.Group;
  private shipModel: THREE.Group = new THREE.Group();
  private planetModel: THREE.Group = new THREE.Group();
  private world: THREE.Group;

  private enemyShipGroup: THREE.Group = new THREE.Group();
  private activeShipOps: ShipBytecodeOp[] | null = null;
  private enemyPos = new THREE.Vector3(400, -100, -3500);

  containerRect: { width: number; height: number } = { width: 280, height: 192 };

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
    this.camera.rotation.order = 'YXZ';

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
    window.addEventListener('resize', this.handleResize);
  }

  private handleResize = () => {
    const rect = this.container.getBoundingClientRect();
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (w < 1 || h < 1) return;
    this.containerRect = { width: w, height: h };
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
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

  setEnemyPos(x: number, y: number, z: number): void {
    this.enemyPos.set(x, y, z);
  }

  show(): void {
    this.canvas.style.display = 'block';
    if (this.stage) this.stage.style.display = 'none';
    if (!this.running) {
      this.running = true;
      this.handleResize();
      this.renderLoop(performance.now());
    }
  }

  hide(): void {
    this.canvas.style.display = 'none';
    if (this.stage) this.stage.style.display = 'block';
    this.running = false;
    cancelAnimationFrame(this.animFrame);
  }

  get visible(): boolean {
    return this.canvas.style.display !== 'none';
  }

  update(state: GameState, pitchRad: number, headingRad: number, enemyAlive: boolean): void {
    this.camera.position.set(state.x * 0.001, state.y * 0.001, state.z * 0.001);
    this.camera.rotation.y = headingRad;
    this.camera.rotation.x = pitchRad;

    this.planetModel.position.set(0, 0, 0);
    const planetDist = this.camera.position.length();
    const planetTooClose = planetDist < 8;
    this.planetModel.visible = !planetTooClose;
    if (!planetTooClose) {
      const planetScale = Math.max(0.05, Math.min(4, 50 / planetDist));
      this.planetModel.scale.setScalar(planetScale);
    }

    if (enemyAlive && this.activeShipOps) {
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

      const ePos = this.enemyPos.clone().multiplyScalar(0.001);
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

  private renderLoop = (now: number) => {
    if (!this.running) return;
    this.composer.render();
    this.animFrame = requestAnimationFrame(this.renderLoop);
  };

  destroy(): void {
    this.hide();
    window.removeEventListener('resize', this.handleResize);
    this.renderer.dispose();
    this.canvas.remove();
  }
}
