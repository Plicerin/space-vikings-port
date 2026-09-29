import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { log as glog } from '../engine/gameLog';
import { clearPendingConquestCollection } from '../engine/commander';
import { EXTRACTED_ARRIVAL_STATE_BY_PLANET, getFallbackArrivalState } from '../engine/extractedOriginalData';

interface WarpLine {
  angle: number;
  length: number;
  speed: number;
  phase: number;
  color: number;
}

function drawStarfield(hires: import('../engine/hires').Hires, seed: number): void {
  hires.hcolor(3);
  for (let i = 0; i < 40; i++) {
    const x = (seed * 17 + i * 41) % 279;
    const y = (seed * 11 + i * 29) % 120;
    if ((i + seed) % 4 === 0) continue;
    hires.hplot(x, y);
  }
}

export async function hyperdriveScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input, audio } = ctx;

  if (
    state.atmosphere ||
    state.navDestination === null ||
    state.navDestination === state.planetIndex
  ) {
    return scenes.run('starshipSimulator');
  }

  if (state.energy === 0) {
    hires.hgr();
    hires.hcolor(2);
    hires.text('OUT OF ENERGY', 14, 12);
    await new Promise((r) => setTimeout(r, 2000));
    hires.text('ORBIT DECAYING', 14, 12);
    await new Promise((r) => setTimeout(r, 2000));
    return scenes.run('playerDeath');
  }

  const src = state.planets[state.planetIndex];
  const dst = state.planets[state.navDestination!];
  const sourcePlanet = state.planetIndex;
  const dx = Math.abs(src.x - dst.x);
  const dy = Math.abs(src.y - dst.y);
  const dz = Math.abs(src.z - dst.z);
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // The jump cost, H/D lines 10010 and 10020:
  //
  //   10010 X1 = ABS(PEEK(38366 + PEEK(38209))) - ABS(PEEK(38366 + PEEK(38163)))
  //         Y1 = <the same expression>: Z1 = <the same expression>
  //   10020 D1 = INT(SQR(X1 ^ 2 + Y1 ^ 2 + Z1 ^ 2) + .6)
  //
  // 38366 is the X table - GALAXY MAP 3020 reads X, Y and Z from M, M - 21 and M - 42 with
  // M = 38366 - and line 10010 reads the X expression into all three variables. Y and Z
  // never enter the cost, so the sum under the root is 3 * X1 ^ 2 and D1 comes out as
  // |dX| * sqrt(3), rounded. Copy-paste, by the look of it, but it is what the disk does.
  const dxByte = dst.x - src.x;
  const jumpCost = Math.floor(Math.sqrt(3 * dxByte * dxByte) + 0.6);
  state.jumpDistance = distance;
  glog('hyperdrive', `jumping to ${dst.name} dist=${distance.toFixed(1)}`);

  const cx = 140;
  const cy = 60;
  const lines: WarpLine[] = [];
  const linePool = 80;
  for (let i = 0; i < linePool; i++) {
    lines.push({
      angle: Math.random() * Math.PI * 2,
      length: 2 + Math.random() * 8,
      speed: 40 + Math.random() * 120,
      phase: Math.random(),
      color: 3,
    });
  }

  let elapsed = 0;
  const CHARGE_DURATION = 0.6;
  const WARP_DURATION = 1.8;
  const TOTAL_DURATION = CHARGE_DURATION + WARP_DURATION + 0.3;
  let lastT = performance.now();
  let done = false;

  input.clearKey();

  await new Promise<void>((resolve) => {
    function frame(now: number) {
      if (done) { resolve(); return; }
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      elapsed += dt;
      if (elapsed >= TOTAL_DURATION) { done = true; resolve(); return; }

      hires.hgr();

      if (elapsed < CHARGE_DURATION) {
        const p = elapsed / CHARGE_DURATION;
        const chargeLines = Math.round(p * 30);
        hires.hcolor(1);
        for (let i = 0; i < chargeLines; i++) {
          const a = Math.random() * Math.PI * 2;
          const len = 4 + p * 20;
          hires.line(cx, cy,
            cx + Math.round(Math.cos(a) * len),
            cy + Math.round(Math.sin(a) * len));
        }
        if (p > 0.3) {
          hires.hcolor(6);
          hires.text('HYPERDRIVE CHARGE', 11, 12);
        }
        const beepHz = Math.round(80 + p * 400);
        audio.beep(beepHz, 30);
      } else if (elapsed < CHARGE_DURATION + WARP_DURATION) {
        const p = (elapsed - CHARGE_DURATION) / WARP_DURATION;

        for (const line of lines) {
          line.length += line.speed * dt;
          line.phase += dt * (0.5 + p * 2);
          const a = line.angle + line.phase * 0.3;

          if (Math.random() < dt * 3) {
            line.color = Math.random() < 0.3 ? 1 : Math.random() < 0.5 ? 6 : 3;
          }

          const len = Math.min(line.length % 120, 140);
          hires.hcolor(line.color);
          const x1 = cx + Math.round(Math.cos(a) * (len * 0.15));
          const y1 = cy + Math.round(Math.sin(a) * (len * 0.15));
          const x2 = cx + Math.round(Math.cos(a) * len);
          const y2 = cy + Math.round(Math.sin(a) * len);
          hires.line(x1, y1, x2, y2);
        }

        if (Math.random() < dt * 20) {
          audio.beep(800 + Math.round(Math.random() * 1200), 15);
        }

        hires.hcolor(5);
        hires.text('WARP DRIVE ENGAGED', 10, 12);
      } else {
        const flash = (elapsed - CHARGE_DURATION - WARP_DURATION) / 0.3;
        if (flash < 0.5) {
          hires.hcolor(1);
          for (let y = 0; y < 124; y++) hires.line(0, y, 279, y);
        } else {
          drawStarfield(hires, Math.round(performance.now()));
          hires.hcolor(1);
          hires.text('JUMP COMPLETE', 13, 12);
        }
        audio.beep(200, 40);
      }

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });

  // H/D line 6: SD = SD + D1 + .3 - the same D1, not the true distance.
  state.stardate += jumpCost + 0.3;
  state.planetIndex = state.navDestination;
  state.navDestination = null;
  state.commanderMapTarget = null;
  state.planetSurrendered = false;
  state.planetVitality = 0;
  state.shipVitality = 0;
  state.atmosphere = false;
  state.inOrbit = false;
  state.planetSurrendered = state.planets[state.planetIndex]?.surrendered ?? false;
  clearPendingConquestCollection(state, sourcePlanet);

  const arrivalState = EXTRACTED_ARRIVAL_STATE_BY_PLANET[state.planetIndex]
    ?? getFallbackArrivalState(state.planetIndex);
  state.planetVitalityLimit = arrivalState.planetVitalityLimit;
  state.shipDestructionLimit = arrivalState.shipDestructionLimit;
  state.shipKind = arrivalState.shipKind;
  state.enemyShips = arrivalState.enemyShips;
  state.planetSurrendered = arrivalState.planetSurrendered;
  state.atmosphere = arrivalState.atmosphere;

  state.planets[state.planetIndex].visited = true;

  state.x = Math.round(10000 - Math.random() * 20000);
  state.y = Math.round(5000 - Math.random() * 10000);
  let z = 0;
  do {
    z = Math.round(10000 - Math.random() * 20000);
  } while (Math.abs(z) < 7000);
  state.z = z;
  state.heading = Math.floor(Math.random() * 256);
  state.pitch = 0;
  state.bank = 0;

  state.energy = Math.max(0, state.energy - jumpCost);

  return scenes.run('starshipSimulator');
}
