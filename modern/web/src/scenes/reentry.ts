import { setScene, log as glog } from '../engine/gameLog';
import type { Hires } from '../engine/hires';
import type { SceneContext, SceneManager } from '../engine/sceneManager';

function drawPlasmaGlow(hires: Hires, intensity: number): void {
  if (intensity <= 0) return;
  const bands = Math.round(intensity * 8);
  hires.hcolor(5);
  for (let i = 0; i < bands; i++) {
    const y = i * 3;
    hires.line(0, y, 279, y);
    hires.line(0, 123 - y, 279, 123 - y);
  }
  hires.hcolor(6);
  const inner = Math.round(intensity * 4);
  for (let i = 0; i < inner; i++) {
    const x = i * 5;
    hires.line(x, 0, x, 123);
    hires.line(279 - x, 0, 279 - x, 123);
  }
}

function drawStreaks(hires: Hires, intensity: number, frame: number): void {
  if (intensity <= 0) return;
  const count = 6 + Math.round(intensity * 12);
  hires.hcolor(1);
  for (let i = 0; i < count; i++) {
    const x = (frame * 37 + i * 71) % 279;
    const y = (frame * 13 + i * 53) % 120;
    const len = 4 + Math.round(intensity * 16 * (0.3 + ((i * 7) % 10) * 0.07));
    const dx = Math.round(Math.sin(frame * 0.1 + i) * 3);
    hires.line(x, y, x + dx + len, y + 1);
  }
}

function drawShipSilhouette(hires: Hires, shakeX: number, shakeY: number): void {
  hires.hcolor(1);
  const cx = 140 + shakeX;
  const cy = 58 + shakeY;
  hires.line(cx - 8, cy + 5, cx, cy - 10);
  hires.line(cx, cy - 10, cx + 8, cy + 5);
  hires.line(cx - 8, cy + 5, cx + 8, cy + 5);
  hires.line(cx - 5, cy + 5, cx - 5, cy + 10);
  hires.line(cx + 5, cy + 5, cx + 5, cy + 10);
  hires.line(cx - 5, cy + 10, cx + 5, cy + 10);
}

function drawHeatGauge(hires: Hires, heat: number): void {
  hires.hcolor(3);
  hires.line(50, 114, 230, 114);
  hires.line(50, 114, 50, 120);
  hires.line(230, 114, 230, 120);
  const fill = Math.round(heat * 170);
  const color = heat > 0.7 ? 5 : heat > 0.4 ? 6 : 1;
  hires.hcolor(color);
  for (let y = 115; y <= 119; y++) {
    hires.line(51, y, 51 + fill, y);
  }
  hires.hcolor(3);
  hires.text('HEAT', 29, 15);
  hires.text(`${Math.round(heat * 100)}%`, 29, 16);
}

function drawFeedback(hires: Hires, intensity: number, frame: number): void {
  const shakeMag = intensity > 0.5 ? 3 : intensity > 0.2 ? 1 : 0;
  const shakeX = frame % 2 === 0 ? Math.round(Math.sin(frame * 0.7) * shakeMag) : 0;
  const shakeY = frame % 2 === 0 ? Math.round(Math.cos(frame * 1.1) * shakeMag) : 0;

  drawPlasmaGlow(hires, intensity * 0.7);
  drawStreaks(hires, intensity, frame);
  drawShipSilhouette(hires, shakeX, shakeY);

  hires.hcolor(1);
  const altDesc = Math.round((1 - intensity) * 100);
  hires.text(`ALT: ${altDesc}KM`, 2, 1);
  hires.text(`HEAT: ${Math.round(intensity * 100)}%`, 2, 2);

  const gaugeIntensity = Math.min(1, intensity * 1.1);
  drawHeatGauge(hires, gaugeIntensity);
}

export async function reentryScene(
  ctx: SceneContext,
  scenes: SceneManager,
): Promise<void> {
  const { hires, state, input } = ctx;
  setScene('reentry');

  state.atmosphere = true;
  state.inOrbit = false;
  state.heading = 20;

  glog('init', `reentry pos=(${state.x},${state.y},${state.z}) heading=${state.heading} planet=${state.planetIndex}`);

  let heat = 0;
  let progress = 0;
  let frameCount = 0;
  const maxFrames = 120;
  let done = false;

  function handleKey(key: number): void {
    const ch = String.fromCharCode(key & 0x7f).toLowerCase();
    if (ch === 'o' || ch === 'O') {
      state.y += 400;
      heat = 0;
      glog('reentry', 'aborted reentry, climbing back to orbit');
      done = true;
    }
  }

  while (!done && frameCount < maxFrames) {
    frameCount++;
    progress = frameCount / maxFrames;

    const k = input.peekKey();
    if (k !== 0) {
      input.clearKey();
      handleKey(k);
      if (done) break;
    }

    const inputPitch =
      (input.isDown('ArrowUp') || input.isDown('KeyW') ? -1 : 0) +
      (input.isDown('ArrowDown') || input.isDown('KeyS') ? 1 : 0);

    const baseHeatRate = 0.025;
    const pitchFactor = 1 + inputPitch * 0.8;
    heat += baseHeatRate * pitchFactor;
    heat -= 0.003 * (1 - progress * 0.5);

    heat = Math.max(0, Math.min(1, heat));

    hires.hgr();
    drawFeedback(hires, heat, frameCount);

    hires.hcolor(3);
    hires.text(`PITCH: ${inputPitch === 0 ? 'NEUTRAL' : inputPitch < 0 ? 'UP' : 'DOWN'}`, 2, 18);
    hires.text('UPDOWN-PITCH  O-CLIMB', 1, 24);

    await new Promise(r => setTimeout(r, 50));
  }

  if (heat >= 0.95) {
    state.damage.hullPct = Math.max(0, state.damage.hullPct - 15);
    glog('reentry', `heat critical! hull damaged to ${state.damage.hullPct}%`);
    hires.hgr();
    hires.hcolor(5);
    hires.text('HEAT CRITICAL! HULL DAMAGE!', 5, 12);
    await new Promise(r => setTimeout(r, 1500));
  }

  scenes.run('starshipSimulator');
}
