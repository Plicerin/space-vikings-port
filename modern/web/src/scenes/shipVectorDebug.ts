import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene } from '../engine/gameLog';
import { SHIP_MODELS, type ShipModelKind } from '../engine/shipModels';
import { parseShipBytecode, type ShipBytecodeOp } from '../engine/shipBytecode';

interface BytecodeJson {
  bytes: number[];
}

type VectorShip = {
  kind: ShipModelKind;
  name: string;
  ops: ShipBytecodeOp[];
};

type ShipBuild = {
  group: THREE.Group;
  ghosts: THREE.Group[];
  trail: TrailSample[];
};

type PlanetBuild = {
  group: THREE.Group;
  ghosts: THREE.Group[];
  trail: TrailSample[];
  update: (time: number) => void;
  lineMaterials: THREE.LineBasicMaterial[];
  glowMaterials: THREE.MeshBasicMaterial[];
};

type PlanetPalette = {
  surface: number;
  rim: number;
  atmosphere: number;
  glow: number;
  line: number;
  accent: number;
  light: number;
};

type TrailSample = {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: number;
};

const SHIP_CORE = 0xf6fbff;
const SHIP_HALO = 0x72dfff;
const SHIP_ACCENT = 0xffab57;
const SHIP_DIM = 0x8aa6c9;
const BG = 0x000000;

export async function shipVectorDebugScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { input, loader } = ctx;
  setScene('shipVectorDebug');

  const viewport = document.getElementById('viewport');
  const stage = document.getElementById('stage') as HTMLCanvasElement | null;
  if (!viewport) return;

  const canvas = document.createElement('canvas');
  canvas.id = 'ship-vector-debug-3d';
  canvas.style.position = 'absolute';
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.zIndex = '2';

  const hud = document.createElement('div');
  hud.style.position = 'absolute';
  hud.style.inset = '0';
  hud.style.pointerEvents = 'none';
  hud.style.zIndex = '3';
  hud.style.fontFamily = 'inherit';
  hud.style.color = '#c9f6ff';
  hud.style.textShadow = '0 0 10px rgba(70, 200, 255, 0.4)';

  const title = document.createElement('div');
  title.textContent = 'VECTOR / GLOW STYLE STUDY';
  title.style.position = 'absolute';
  title.style.left = '12px';
  title.style.top = '10px';
  title.style.fontSize = '12px';
  title.style.letterSpacing = '0.16em';
  title.style.color = '#7de8ff';

  const subtitle = document.createElement('div');
  subtitle.textContent = 'BLUE GLOW SHELLS / LAYERED PLANETS / 3D SHIP STUDY';
  subtitle.style.position = 'absolute';
  subtitle.style.left = '12px';
  subtitle.style.top = '28px';
  subtitle.style.fontSize = '12px';
  subtitle.style.letterSpacing = '0.05em';
  subtitle.style.color = '#a6f0ff';

  const status = document.createElement('div');
  status.style.position = 'absolute';
  status.style.left = '12px';
  status.style.bottom = '10px';
  status.style.fontSize = '12px';
  status.style.letterSpacing = '0.05em';
  status.style.color = '#bff8ff';
  status.style.whiteSpace = 'nowrap';
  status.textContent = 'ESC RETURN  |  1 / 3 / 4 SELECT  |  ARROWS TRIM  |  SPACE PAUSE';

  hud.append(title, subtitle, status);
  viewport.append(canvas, hud);
  if (stage) stage.style.display = 'none';

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(BG, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.82;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(BG, 0.0025);

  const camera = new THREE.PerspectiveCamera(46, 280 / 192, 0.1, 500);
  camera.position.set(0, 2.2, 20);
  camera.lookAt(0, 0.2, 0);

  const ambient = new THREE.AmbientLight(0xcde6ff, 0.65);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0x88dfff, 1.2);
  key.position.set(-2, 3, 5);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xffb06a, 0.18);
  rim.position.set(3, -1.2, -4);
  scene.add(rim);

  const backLight = new THREE.PointLight(0x6fd8ff, 1.8, 120, 1.4);
  backLight.position.set(0, 3, -20);
  scene.add(backLight);

  const world = new THREE.Group();
  scene.add(world);

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.28, 0.19, 0.84);
  const outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(outputPass);

  const starField = createStarField();
  world.add(starField);

  const ships = await Promise.all(
    SHIP_MODELS.map(async (ship) => ({
      ...ship,
      ops: parseShipBytecode(
        (await loader.json<BytecodeJson>(`data/shapes/ship-${ship.kind}-bytecode.json`)).bytes,
      ),
    })),
  ) as VectorShip[];

  const shipBuilds = ships.map((ship, index) => buildShip(ship, index === 0));
  const shipSpots = [
    new THREE.Vector3(-8.4, -3.8, -5),
    new THREE.Vector3(0, -3.8, -5),
    new THREE.Vector3(8.4, -3.8, -5),
  ];

  shipBuilds.forEach((build, index) => {
    build.ghosts.forEach((ghost) => world.add(ghost));
    build.group.position.copy(shipSpots[index]);
    build.group.scale.setScalar(index === 0 ? 1.15 : 0.82);
    world.add(build.group);
  });

  const heroShip = shipBuilds[0];
  heroShip.group.position.set(-7.6, 2.2, -8);
  heroShip.group.scale.setScalar(1.22);

  const planet = createPlanet({
    surface: 0x87e6ff,
    rim: 0x67d4ff,
    atmosphere: 0x9aefff,
    glow: 0x6fd8ff,
    line: 0xf6fbff,
    accent: 0xffab57,
    light: 0x84e7ff,
  });
  planet.group.position.set(7.3, 1.5, -24);
  planet.ghosts.forEach((ghost) => world.add(ghost));
  world.add(planet.group);

  const secondaryPlanet = createPlanet({
    surface: 0xc4ff9a,
    rim: 0x88ff7c,
    atmosphere: 0xdaffbf,
    glow: 0x90ffad,
    line: 0xf7fff1,
    accent: 0xffcf6e,
    light: 0xb6ff9a,
  });
  secondaryPlanet.group.position.set(-12.8, 5.0, -43);
  secondaryPlanet.group.scale.setScalar(0.46);
  secondaryPlanet.ghosts.forEach((ghost) => world.add(ghost));
  world.add(secondaryPlanet.group);

  const tertiaryPlanet = createPlanet({
    surface: 0xffb28b,
    rim: 0xff8b64,
    atmosphere: 0xffceb2,
    glow: 0xff9d70,
    line: 0xfff6ee,
    accent: 0x89dbff,
    light: 0xffb48b,
  });
  tertiaryPlanet.group.position.set(13.5, -4.8, -49);
  tertiaryPlanet.group.scale.setScalar(0.34);
  tertiaryPlanet.ghosts.forEach((ghost) => world.add(ghost));
  world.add(tertiaryPlanet.group);

  const planetBeacon = createBeacon();
  planetBeacon.position.set(7.3, 1.5, -24);
  world.add(planetBeacon);

  const orbitRing = createOrbitRing();
  orbitRing.position.set(7.3, 1.5, -24);
  world.add(orbitRing);

  const highlight = createHighlightArc();
  highlight.position.set(7.3, 1.5, -24);
  world.add(highlight);

  const params = new URLSearchParams(window.location.search);
  const selectedFromQuery = Number(params.get('ship') ?? '0');
  let selectedIndex = Number.isFinite(selectedFromQuery)
    ? Math.max(0, Math.min(2, Math.floor(selectedFromQuery)))
    : 0;
  let paused = false;
  let yawTrim = 0;
  let pitchTrim = 0;
  let raf = 0;
  let resolveScene: (() => void) | null = null;
  const clock = new THREE.Clock();

  const resize = () => {
    const width = Math.max(1, viewport.clientWidth);
    const height = Math.max(1, viewport.clientHeight);
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    bloomPass.setSize(width, height);
  };

  const cleanup = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    canvas.remove();
    hud.remove();
    if (stage) stage.style.display = '';
    for (const build of shipBuilds) disposeObject(build.group);
    disposeObject(scene);
    composer.dispose();
    renderer.dispose();
  };

  const exitToClassic = () => {
    cleanup();
    resolveScene?.();
    void scenes.run('starshipSimulator');
  };

  const frame = () => {
    const dt = Math.min(clock.getDelta(), 0.05);
    const keyCode = input.peekKey();
    if (keyCode !== 0) {
      input.clearKey();
      if (keyCode === 0x9b || input.isDown('Escape')) {
        exitToClassic();
        return;
      }
      if (keyCode === 0xa0) paused = !paused;
      if (keyCode === 0xb1) selectedIndex = 0;
      if (keyCode === 0xb3) selectedIndex = 1;
      if (keyCode === 0xb4) selectedIndex = 2;
      if (keyCode === 0x88) yawTrim -= 0.02;
      if (keyCode === 0x95) yawTrim += 0.02;
      if (keyCode === 0x8b) pitchTrim -= 0.015;
      if (keyCode === 0x8a) pitchTrim += 0.015;
    }

    const elapsed = paused ? 0 : clock.elapsedTime;
    const yaw = -0.55 + elapsed * 0.34 + yawTrim;
    const pitch = -0.18 + Math.sin(elapsed * 0.7) * 0.1 + pitchTrim;
    const roll = 0.04 + Math.sin(elapsed * 0.45) * 0.05;

    heroShip.group.rotation.set(pitch * 0.42, yaw * 0.58, roll * 0.34);
    heroShip.group.position.set(0, 0, 0); // Physics-driven position coming soon

    shipBuilds.forEach((build, index) => {
      const spin = elapsed * (index === selectedIndex ? 0.68 : 0.38);
      build.group.rotation.set(
        pitch * 0.1 + (index - 1) * 0.06,
        yaw * 0.24 + spin,
        roll * 0.42 + (index - 1) * 0.05,
      );
      const bob = Math.sin(elapsed * 0.8 + index) * 0.14;
      build.group.position.y = shipSpots[index].y + bob;
      build.group.position.x = shipSpots[index].x + Math.sin(elapsed * 0.34 + index) * 0.16;
      build.group.position.z = shipSpots[index].z + Math.cos(elapsed * 0.28 + index) * 0.1;
      build.group.scale.setScalar(index === selectedIndex ? 1.18 : 0.82);
    });

    orbitRing.rotation.z = 0.55 + Math.sin(elapsed * 0.18) * 0.08;
    highlight.rotation.z = 0.2 + Math.sin(elapsed * 0.12) * 0.02;
    planetBeacon.rotation.y = elapsed * 0.08;
    starField.rotation.z = elapsed * 0.018;
    starField.rotation.y = -elapsed * 0.008;

    planet.update(elapsed);
    secondaryPlanet.update(elapsed);
    tertiaryPlanet.update(elapsed);
    updateTrails(shipBuilds, planet, elapsed);
    updateTrails(shipBuilds, secondaryPlanet, elapsed);
    updateTrails(shipBuilds, tertiaryPlanet, elapsed);

    camera.lookAt(0, -0.2, -10);
    composer.render();
    status.textContent = `SHIP ${ships[selectedIndex].kind}  |  YAW ${formatAngle(yaw)}  |  PITCH ${formatAngle(pitch)}  |  ${paused ? 'HOLD' : 'SPIN'}`;
    raf = requestAnimationFrame(frame);
  };

  resize();
  window.addEventListener('resize', resize);
  raf = requestAnimationFrame(frame);

  return new Promise<void>((resolve) => {
    resolveScene = resolve;
  });
}

function buildShip(ship: VectorShip, selected: boolean): ShipBuild {
  const group = new THREE.Group();
  const segments = buildSegments(ship.ops);
  const points = collectPoints(segments);
  const span = measureSpan(points);
  const scale = 3.8 / Math.max(span, 1);

  const linePoints = new Float32Array(segments.length * 2 * 3);
  segments.forEach((seg, index) => {
    const a = centerAndScale(seg.from, span, scale);
    const b = centerAndScale(seg.to, span, scale);
    const stride = index * 6;
    linePoints[stride + 0] = a.x;
    linePoints[stride + 1] = a.y;
    linePoints[stride + 2] = a.z;
    linePoints[stride + 3] = b.x;
    linePoints[stride + 4] = b.y;
    linePoints[stride + 5] = b.z;
  });

  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePoints, 3));

  const coreMaterial = createVectorLineMaterial(SHIP_CORE, selected ? 0.96 : 0.88);
  const innerGlowMaterial = createVectorLineMaterial(SHIP_HALO, selected ? 0.24 : 0.16);
  const outerGlowMaterial = createVectorLineMaterial(SHIP_HALO, selected ? 0.1 : 0.06);
  const accentMaterial = createVectorLineMaterial(SHIP_ACCENT, selected ? 0.42 : 0.26);

  const outerGlow = new THREE.LineSegments(lineGeo, outerGlowMaterial);
  outerGlow.scale.setScalar(1.03);
  outerGlow.renderOrder = 1;
  group.add(outerGlow);

  const innerGlow = new THREE.LineSegments(lineGeo, innerGlowMaterial);
  innerGlow.scale.setScalar(1.015);
  innerGlow.renderOrder = 2;
  group.add(innerGlow);

  const core = new THREE.LineSegments(lineGeo, coreMaterial);
  core.renderOrder = 3;
  group.add(core);

  const accent = new THREE.LineSegments(lineGeo, accentMaterial);
  accent.scale.setScalar(0.994);
  accent.renderOrder = 4;
  group.add(accent);

  const dotGeo = new THREE.BufferGeometry();
  const dotPositions = new Float32Array(points.length * 3);
  points.forEach((point, index) => {
    const p = centerAndScale(point, span, scale);
    const stride = index * 3;
    dotPositions[stride + 0] = p.x;
    dotPositions[stride + 1] = p.y;
    dotPositions[stride + 2] = p.z;
  });
  dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPositions, 3));

  const brightDots = new THREE.Points(
    dotGeo,
    new THREE.PointsMaterial({
      color: SHIP_CORE,
      size: selected ? 0.22 : 0.18,
      sizeAttenuation: false,
      transparent: true,
      opacity: selected ? 0.92 : 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  (brightDots.material as THREE.PointsMaterial).userData.baseOpacity = selected ? 0.92 : 0.7;
  group.add(brightDots);

  const haloDots = new THREE.Points(
    dotGeo,
    new THREE.PointsMaterial({
      color: SHIP_HALO,
      size: selected ? 0.34 : 0.28,
      sizeAttenuation: false,
      transparent: true,
      opacity: selected ? 0.28 : 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  (haloDots.material as THREE.PointsMaterial).userData.baseOpacity = selected ? 0.28 : 0.18;
  haloDots.renderOrder = 0;
  group.add(haloDots);

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(1.2, span * scale * 0.5), 14, 10),
    new THREE.MeshBasicMaterial({
      color: selected ? SHIP_HALO : SHIP_DIM,
      transparent: true,
      opacity: selected ? 0.06 : 0.04,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  (shell.material as THREE.MeshBasicMaterial).userData.baseOpacity = selected ? 0.06 : 0.04;
  shell.scale.setScalar(1.0);
  group.add(shell);

  return {
    group,
    ghosts: createTrailGhosts(group, 3, selected ? 0.24 : 0.16, 1.01),
    trail: [],
  };
}

function createPlanet(palette: PlanetPalette): PlanetBuild {
  const group = new THREE.Group();
  const lineMaterials: THREE.LineBasicMaterial[] = [];
  const glowMaterials: THREE.MeshBasicMaterial[] = [];

  const surfaceGlow = new THREE.Mesh(
    new THREE.SphereGeometry(4.35, 20, 14),
    createCausticMaterial(palette.surface),
  );
  (surfaceGlow.material as THREE.ShaderMaterial).userData.baseOpacity = 1;
  group.add(surfaceGlow);

  const rimGlow = new THREE.Mesh(
    new THREE.SphereGeometry(4.55, 20, 14),
    createRimMaterial(palette.rim, 0.3),
  );
  (rimGlow.material as THREE.ShaderMaterial).userData.baseOpacity = 1;
  group.add(rimGlow);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(4.88, 20, 14),
    createAtmosphereMaterial(palette.atmosphere, 1.02, 2.45, 0.055),
  );
  (atmosphere.material as THREE.ShaderMaterial).userData.baseOpacity = 1;
  group.add(atmosphere);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(5.15, 18, 12),
    new THREE.MeshBasicMaterial({
      color: palette.glow,
      transparent: true,
      opacity: 0.022,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  (glow.material as THREE.MeshBasicMaterial).userData.baseOpacity = 0.022;
  glowMaterials.push(glow.material as THREE.MeshBasicMaterial);
  group.add(glow);

  const latitudes = [-0.78, -0.42, -0.08, 0.3, 0.66];
  const meridians = [0, Math.PI / 3, (Math.PI * 2) / 3, Math.PI];
  for (const lat of latitudes) {
    const ring = createLatitudeLoop(4.18, lat, 48);
    const coreLine = new THREE.LineLoop(ring, createVectorLineMaterial(palette.line, 0.9));
    const haloLine = new THREE.LineLoop(ring, createVectorLineMaterial(palette.rim, 0.18));
    const outerLine = new THREE.LineLoop(ring, createVectorLineMaterial(palette.glow, 0.07));
    coreLine.renderOrder = 4;
    haloLine.renderOrder = 3;
    outerLine.renderOrder = 2;
    group.add(outerLine, haloLine, coreLine);
    lineMaterials.push(
      outerLine.material as THREE.LineBasicMaterial,
      haloLine.material as THREE.LineBasicMaterial,
      coreLine.material as THREE.LineBasicMaterial,
    );
  }

  for (const lon of meridians) {
    const ring = createMeridianLoop(4.08, lon, 48);
    const coreLine = new THREE.LineLoop(ring, createVectorLineMaterial(palette.line, 0.82));
    const haloLine = new THREE.LineLoop(ring, createVectorLineMaterial(palette.rim, 0.16));
    const outerLine = new THREE.LineLoop(ring, createVectorLineMaterial(palette.glow, 0.06));
    coreLine.renderOrder = 4;
    haloLine.renderOrder = 3;
    outerLine.renderOrder = 2;
    group.add(outerLine, haloLine, coreLine);
    lineMaterials.push(
      outerLine.material as THREE.LineBasicMaterial,
      haloLine.material as THREE.LineBasicMaterial,
      coreLine.material as THREE.LineBasicMaterial,
    );
  }

  const equator = new THREE.LineLoop(
    createLatitudeLoop(4.2, 0, 64),
    createVectorLineMaterial(palette.line, 0.96),
  );
  equator.renderOrder = 5;
  group.add(equator);
  lineMaterials.push(equator.material as THREE.LineBasicMaterial);

  const ring = new THREE.LineLoop(
    createRingLoop(7.8, 1.4, 72),
    createVectorLineMaterial(palette.accent, 0.42),
  );
  ring.rotation.x = 0.62;
  ring.rotation.z = -0.45;
  ring.renderOrder = 6;
  group.add(ring);
  lineMaterials.push(ring.material as THREE.LineBasicMaterial);

  const ringGlow = new THREE.LineLoop(
    createRingLoop(8.2, 1.65, 72),
    createVectorLineMaterial(palette.glow, 0.14),
  );
  ringGlow.rotation.x = 0.62;
  ringGlow.rotation.z = -0.45;
  ringGlow.renderOrder = 5;
  group.add(ringGlow);
  lineMaterials.push(ringGlow.material as THREE.LineBasicMaterial);

  const light = new THREE.PointLight(palette.light, 2.0, 32, 1.5);
  light.position.set(2.8, 2.4, 4.5);
  group.add(light);

  const update = (time: number) => {
    group.rotation.y = time * 0.07;
    group.rotation.x = 0.18 + Math.sin(time * 0.2) * 0.04;
    const flicker = 0.98 + Math.sin(time * 41.0) * 0.012;
    for (let i = 0; i < lineMaterials.length; i++) {
      const material = lineMaterials[i];
      if (!material) continue;
      const baseOpacity = typeof material.userData.baseOpacity === 'number'
        ? material.userData.baseOpacity
        : material.opacity;
      material.opacity = baseOpacity * flicker;
    }
    for (const material of glowMaterials) {
      const baseOpacity = typeof material.userData.baseOpacity === 'number'
        ? material.userData.baseOpacity
        : 0.045;
      material.opacity = baseOpacity * (0.95 + Math.sin(time * 0.8) * 0.05);
    }
  };

  return {
    group,
    ghosts: createTrailGhosts(group, 3, 0.14, 1.008),
    trail: [],
    update,
    lineMaterials,
    glowMaterials,
  };
}

function createCausticMaterial(glowColor: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec3 vWorldNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPos.xyz;
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uRingCenter;
      uniform float uRingWidth;
      uniform float uChromatic;
      uniform float uBloom;
      uniform float uRingBrightness;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec3 vWorldNormal;
      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vViewPosition);
        float d = dot(N, V);
        float ringR = exp(-pow((d - uRingCenter + uChromatic) / uRingWidth, 2.0));
        float ringG = exp(-pow((d - uRingCenter) / uRingWidth, 2.0));
        float ringB = exp(-pow((d - uRingCenter - uChromatic) / uRingWidth, 2.0));
        vec3 wn = normalize(vWorldNormal);
        float angle = atan(wn.y, wn.x);
        float rayMod = 0.72 + 0.28 * pow(max(0.0, sin(angle * 6.0)), 2.5);
        vec3 ring = vec3(ringR, ringG, ringB) * uColor * rayMod * uRingBrightness;
        float bloom = exp(-pow((d - uRingCenter) / (uRingWidth * 3.5), 2.0)) * uBloom;
        ring += bloom * uColor;
        float peak = max(max(ringR, ringG), ringB);
        float alpha = (peak * rayMod + bloom) * uIntensity;
        gl_FragColor = vec4(ring, alpha);
      }
    `,
    uniforms: {
      uColor: { value: new THREE.Color(glowColor) },
      uIntensity: { value: 0.62 },
      uRingCenter: { value: 0.18 },
      uRingWidth: { value: 0.065 },
      uChromatic: { value: 0.05 },
      uBloom: { value: 0.18 },
      uRingBrightness: { value: 1.18 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
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
  material.userData.baseOpacity = opacity;
  return material;
}

function createTrailGhosts(
  source: THREE.Group,
  count: number,
  opacityBase: number,
  scaleStep: number,
): THREE.Group[] {
  const ghosts: THREE.Group[] = [];
  for (let i = 0; i < count; i++) {
    const ghost = source.clone(true);
    const factor = opacityBase * Math.pow(0.62, i);
    ghost.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      const material = mesh.material;
      if (!material) return;
      if (Array.isArray(material)) {
        mesh.material = material.map((item) => cloneGhostMaterial(item, factor));
      } else {
        mesh.material = cloneGhostMaterial(material, factor);
      }
    });
    ghost.scale.multiplyScalar(Math.pow(scaleStep, i + 1));
    ghost.userData.trailFactor = factor;
    ghost.renderOrder = i;
    ghosts.push(ghost);
  }
  return ghosts;
}

function cloneGhostMaterial<T extends THREE.Material>(material: T, opacityFactor: number): T {
  const clone = material.clone() as T & { opacity?: number; transparent?: boolean; depthWrite?: boolean; blending?: THREE.Blending };
  if ('opacity' in clone) {
    const baseOpacity = typeof (material as THREE.Material & { userData?: { baseOpacity?: number } }).userData?.baseOpacity === 'number'
      ? (material as THREE.Material & { userData?: { baseOpacity?: number } }).userData!.baseOpacity!
      : clone.opacity ?? 1;
    clone.opacity = Math.max(0.01, baseOpacity * opacityFactor);
    clone.transparent = true;
    clone.depthTest = false;
    clone.depthWrite = false;
    clone.blending = THREE.AdditiveBlending;
  }
  clone.userData = { ...(material.userData ?? {}), baseOpacity: (material.userData ?? {}).baseOpacity, trailGhost: true };
  return clone;
}

function updateTrails(shipBuilds: ShipBuild[], planet: PlanetBuild, elapsed: number): void {
  for (const build of shipBuilds) {
    updateTrailForObject(build.group, build.ghosts, build.trail, elapsed);
  }
  updateTrailForObject(planet.group, planet.ghosts, planet.trail, elapsed);
}

function updateTrailForObject(
  source: THREE.Group,
  ghosts: THREE.Group[],
  trail: TrailSample[],
  elapsed: number,
): void {
  trail.unshift(captureTrailSample(source));
  const maxSamples = ghosts.length + 1;
  if (trail.length > maxSamples) trail.length = maxSamples;

  ghosts.forEach((ghost, index) => {
    const sample = trail[index + 1];
    if (!sample) {
      ghost.visible = false;
      return;
    }
    applyTrailSample(ghost, sample);
    ghost.visible = true;
    const trailFactor = typeof ghost.userData.trailFactor === 'number' ? ghost.userData.trailFactor : 0.1;
    const flicker = 0.96 + Math.sin(elapsed * 37.0 + index) * 0.01;
    ghost.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      const material = mesh.material;
      if (!material) return;
      const mats = Array.isArray(material) ? material : [material];
      for (const item of mats) {
        const baseOpacity = typeof item.userData.baseOpacity === 'number'
          ? item.userData.baseOpacity
          : item.opacity ?? 1;
        item.opacity = Math.max(0.01, baseOpacity * trailFactor * flicker);
      }
    });
  });
}

function captureTrailSample(source: THREE.Object3D): TrailSample {
  return {
    position: source.position.clone(),
    rotation: source.rotation.clone(),
    scale: source.scale.x,
  };
}

function applyTrailSample(target: THREE.Object3D, sample: TrailSample): void {
  target.position.copy(sample.position);
  target.rotation.copy(sample.rotation);
  target.scale.setScalar(sample.scale);
}

function createLatitudeLoop(radius: number, latitude: number, segments: number): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  const bandRadius = Math.cos(latitude) * radius;
  const height = Math.sin(latitude) * radius;
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(
      Math.cos(t) * bandRadius,
      height,
      Math.sin(t) * bandRadius,
    ));
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

function createRingLoop(radius: number, minorRadius: number, segments: number): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const x = Math.cos(t) * radius;
    const y = Math.sin(t) * minorRadius;
    points.push(new THREE.Vector3(x, y, 0));
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

function createRimMaterial(glowColor: number, intensity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vViewPosition);
        float d = dot(N, V);
        float rim = pow(1.0 - clamp(d, 0.0, 1.0), 3.7);
        vec3 color = uColor * rim;
        float alpha = pow(1.0 - clamp(d, 0.0, 1.0), 2.7) * uIntensity;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    uniforms: {
      uColor: { value: new THREE.Color(glowColor) },
      uIntensity: { value: intensity },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

function createAtmosphereMaterial(glowColor: number, intensity: number, falloff: number, opacity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - worldPosition.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uGlowColor;
      uniform float uIntensity;
      uniform float uFalloff;
      uniform float uOpacity;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        float edge = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), uIntensity);
        float softGlow = pow(edge, uFalloff);
        float halo = smoothstep(0.2, 1.0, edge);
        vec3 color = uGlowColor * (softGlow * 0.8 + halo * 0.2);
        float alpha = clamp((softGlow * 0.28 + halo * 0.12) * uOpacity, 0.0, 1.0);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    uniforms: {
      uGlowColor: { value: new THREE.Color(glowColor) },
      uIntensity: { value: intensity },
      uFalloff: { value: falloff },
      uOpacity: { value: opacity },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}

function createBeacon(): THREE.PointLight {
  const beacon = new THREE.PointLight(0x73ddff, 1.4, 40, 1.8);
  beacon.position.set(5.4, 4.5, -14);
  return beacon;
}

function createOrbitRing(): THREE.Mesh {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(5.8, 8.4, 96),
    new THREE.MeshBasicMaterial({
      color: 0x2b78ff,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
  );
  ring.rotation.x = 0.62;
  ring.rotation.z = 0.24;
  return ring;
}

function createHighlightArc(): THREE.Line {
  const points = [];
  for (let i = 0; i <= 28; i++) {
    const t = (i / 28) * Math.PI * 1.25;
    points.push(new THREE.Vector3(Math.cos(t) * 7.8, Math.sin(t) * 0.45, 0));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color: 0xfff5df,
    transparent: true,
    opacity: 0.5,
  }));
  line.rotation.x = 0.6;
  line.rotation.z = -0.45;
  return line;
}

function createStarField(): THREE.Group {
  const group = new THREE.Group();
  group.add(createStarLayer(280, 80, 0xa5e8ff, 0.45, 0.7));
  group.add(createStarLayer(180, 160, 0xf6fbff, 0.2, 0.9));
  group.add(createStarLayer(140, 220, 0x72dfff, 0.08, 1.2));
  return group;
}

function createStarLayer(
  count: number,
  spread: number,
  color: number,
  opacity: number,
  size: number,
): THREE.Points {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const idx = i * 3;
    positions[idx + 0] = (Math.random() * 2 - 1) * spread;
    positions[idx + 1] = (Math.random() * 2 - 1) * spread * 0.66;
    positions[idx + 2] = -Math.random() * 220;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color,
    size,
    sizeAttenuation: false,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return new THREE.Points(geometry, material);
}

function buildSegments(ops: ShipBytecodeOp[]): Array<{ from: THREE.Vector3; to: THREE.Vector3; opcode: number }> {
  const vectorOps = ops.filter((op): op is Extract<ShipBytecodeOp, { kind: 'vector' }> => op.kind === 'vector');
  if (vectorOps.length === 0) return [];
  const center = measureCenter(vectorOps);
  const scale = 0.0022;
  const points = vectorOps.map((op) => new THREE.Vector3(
    (op.x - center.x) * scale,
    (op.y - center.y) * scale,
    (op.z - center.z) * scale,
  ));

  const segments: Array<{ from: THREE.Vector3; to: THREE.Vector3; opcode: number }> = [];
  let previous: THREE.Vector3 | null = null;
  for (let i = 0; i < vectorOps.length; i++) {
    const op = vectorOps[i];
    const point = points[i];
    if (op.opcode === 0 || op.opcode === 1 || previous === null) {
      previous = point;
      continue;
    }
    if (op.opcode === 2 || op.opcode === 3) {
      segments.push({ from: previous.clone(), to: point.clone(), opcode: op.opcode });
    }
    previous = point;
  }
  return segments;
}

function collectPoints(segments: Array<{ from: THREE.Vector3; to: THREE.Vector3 }>): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (const seg of segments) {
    points.push(seg.from, seg.to);
  }
  return points;
}

function measureCenter(vectorOps: Array<Extract<ShipBytecodeOp, { kind: 'vector' }>>): { x: number; y: number; z: number } {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const op of vectorOps) {
    minX = Math.min(minX, op.x);
    minY = Math.min(minY, op.y);
    minZ = Math.min(minZ, op.z);
    maxX = Math.max(maxX, op.x);
    maxY = Math.max(maxY, op.y);
    maxZ = Math.max(maxZ, op.z);
  }
  return {
    x: (minX + maxX) * 0.5,
    y: (minY + maxY) * 0.5,
    z: (minZ + maxZ) * 0.5,
  };
}

function measureSpan(points: THREE.Vector3[]): number {
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
  return Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
}

function centerAndScale(point: THREE.Vector3, span: number, scale: number): THREE.Vector3 {
  return new THREE.Vector3(point.x * scale, point.y * scale, point.z * scale);
}

function orientCylinder(mesh: THREE.Mesh, direction: THREE.Vector3, midpoint: THREE.Vector3): void {
  mesh.position.copy(midpoint);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    const geom = mesh.geometry;
    if (geom) geom.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) {
      for (const item of material) item.dispose();
    } else if (material) {
      material.dispose();
    }
  });
}

function formatAngle(rad: number): string {
  const deg = Math.round((rad * 180) / Math.PI) % 360;
  return `${deg}`.padStart(4);
}
