// Bootstrap — wires together Hires, Input, Audio, Loader, GameState,
// SceneManager, and every registered scene.  Entry point for the Vite app.

import { Hires } from '../engine/hires';
import { SceneManager } from '../engine/sceneManager';
import { Input } from '../engine/input';
import { Audio } from '../engine/audio';
import { Loader } from '../engine/loader';
import { GameState } from '../engine/gameState';
import { initCopyButton } from '../engine/gameLog';

// ── Scene imports ──────────────────────────────────────────────────────────
import { startScene } from '../scenes/start';
import { cockpitScene } from '../scenes/cockpit';
import { instrumentsScene } from '../scenes/instruments';
import { galaxyMapScene } from '../scenes/galaxyMap';
import { comScene } from '../scenes/com';
import { statusScene } from '../scenes/status';
import { supplyScene } from '../scenes/supply';
import { radarScene } from '../scenes/radar';
import { recallScene } from '../scenes/recall';
import { shoreLeaveScene } from '../scenes/shoreLeave';
import { groundForcesScene } from '../scenes/groundForces';
import { collectScene } from '../scenes/collect';
import { endScene } from '../scenes/end';
import { hyperdriveScene } from '../scenes/hyperdrive';
import { orbitScene } from '../scenes/orbit';
import { reentryScene } from '../scenes/reentry';
import { exScene } from '../scenes/ex';
import { playerDeathScene } from '../scenes/playerDeath';
import { dmgScene } from '../scenes/stubs';
import { shipIdScene } from '../scenes/shipId';
import { shapeDemoScene } from '../scenes/shapeDemo';
import { shipDebugScene } from '../scenes/shipDebug';
import { shipVectorDebugScene } from '../scenes/shipVectorDebug';

// ── Boot ──────────────────────────────────────────────────────────────────
function boot(): void {
  const stage = document.getElementById('stage') as HTMLCanvasElement | null;
  if (!stage) { console.error('missing #stage canvas'); return; }

  const viewport = document.getElementById('viewport');
  const stageEl = stage;
  function fitCanvas(): void {
    if (!viewport || !stageEl) return;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const ratio = 560 / 384;
    let w: number, h: number;
    if (vw / vh > ratio) {
      h = vh;
      w = h * ratio;
    } else {
      w = vw;
      h = w / ratio;
    }
    stageEl.style.width = Math.floor(w) + 'px';
    stageEl.style.height = Math.floor(h) + 'px';
  }
  fitCanvas();
  window.addEventListener('resize', fitCanvas);

  const hires = new Hires(stage);
  const input = new Input();
  const audio = new Audio();
  const loader = new Loader();
  const state = new GameState();
  const ctx = { hires, state, input, audio, loader };
  const scenes = new SceneManager(ctx);

  // Register every scene.  SceneManager.run() lowercases the name, so all
  // keys here are lowercase to match the scene-name strings used throughout
  // the codebase.
  scenes.register('start', startScene);
  scenes.register('cockpit', cockpitScene);
  scenes.register('flight', cockpitScene);          // alias used by com.ts
  scenes.register('starshipSimulator', cockpitScene); // alias used everywhere
  scenes.register('instruments', instrumentsScene);
  scenes.register('galaxyMap', galaxyMapScene);
  scenes.register('com', comScene);
  scenes.register('status', statusScene);
  scenes.register('supply', supplyScene);
  scenes.register('radar', radarScene);
  scenes.register('recall', recallScene);
  scenes.register('shoreLeave', shoreLeaveScene);
  scenes.register('groundForces', groundForcesScene);
  scenes.register('collect', collectScene);
  scenes.register('end', endScene);
  scenes.register('hyperdrive', hyperdriveScene);
  scenes.register('orbit', orbitScene);
  scenes.register('reentry', reentryScene);
  scenes.register('ex', exScene);
  scenes.register('dmg', dmgScene);
  scenes.register('playerDeath', playerDeathScene);
  scenes.register('shipId', shipIdScene);
  scenes.register('shapeDemo', shapeDemoScene);
  scenes.register('shipDebug', shipDebugScene);
  scenes.register('shipVectorDebug', shipVectorDebugScene);

  // Preload shared assets (gracefully ignore missing files).
  void preloadAssets(loader);

  // Expose state for manual and E2E debugging.
  (window as any).__spaceVikingsState = state;

  // Wire up the "COPY GAME LOG" button.
  initCopyButton();

  // Wire up touch controls.
  wireTouchControls(input);

  // ── Start the first scene ────────────────────────────────────────────
  console.log('[boot] about to call audio.resume()');
  void audio.resume().then(() => {
    console.log('[boot] audio resumed, calling scenes.run(start)');
    console.log('[boot] registered scenes:', Array.from(scenes['scenes'].keys()));
    void scenes.run('start');
    console.log('[boot] scenes.run(start) returned');
  });
}

// ── Asset preloading ──────────────────────────────────────────────────────
async function preloadAssets(loader: Loader): Promise<void> {
  // Ship bytecode shapes (indices 1-4 are the enemy ship types).
  for (let i = 1; i <= 4; i++) {
    await loadOptional(loader, `data/shapes/ship-${i}-bytecode.json`);
    await loadOptional(loader, `data/shapes/ship-${i}.json`);
    await loadOptional(loader, `data/shapes/ship-${i}-points.json`);
  }

  // Planet shapes (indices 0-19).
  for (let i = 0; i < 20; i++) {
    await loadOptional(loader, `data/shapes/planet-${i}.json`);
  }

  // Debug / reference assets.
  await loadOptional(loader, 'data/debug/applewin-space-vikings-state.json');
}

async function loadOptional(loader: Loader, path: string): Promise<void> {
  try {
    await loader.json(path);
  } catch {
    // Asset not found — scenes that need it will handle the error at runtime.
  }
}

// ── Touch controls ────────────────────────────────────────────────────────
function wireTouchControls(input: Input): void {
  const container = document.getElementById('touch-controls');
  if (!container) return;

  const held = new Set<string>();

  function bindButton(btn: HTMLButtonElement): void {
    const code = btn.getAttribute('data-code');
    if (!code) return;
    const hold = btn.getAttribute('data-hold') === '1';

    const onStart = (e: Event) => {
      e.preventDefault();
      if (hold) {
        input.pressHold(code);
        held.add(code);
      } else {
        input.press(code);
      }
    };
    const onEnd = (e: Event) => {
      e.preventDefault();
      if (hold) {
        input.releaseHold(code);
        held.delete(code);
      }
    };

    btn.addEventListener('pointerdown', onStart);
    btn.addEventListener('pointerup', onEnd);
    btn.addEventListener('pointerleave', onEnd);
    btn.addEventListener('pointercancel', onEnd);
  }

  container.querySelectorAll<HTMLButtonElement>('.touch-control').forEach(bindButton);
}

// ── Start when DOM is ready ──────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
