import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { log as glog } from '../engine/gameLog';

const ENEMY_POS = { x: 400, y: -100, z: -3500 };

interface RadarBlip {
  angle: number;
  dist: number;
  label: string;
}

function headingToRadians(headingByte: number): number {
  return (headingByte / 256) * Math.PI * 2;
}

function relativePolar(px: number, py: number, pz: number, headingRad: number): RadarBlip | null {
  const dist = Math.sqrt(px * px + py * py + pz * pz);
  if (dist < 100) return null;
  const worldAngle = Math.atan2(pz, px);
  const relativeAngle = worldAngle - headingRad;
  const normalized = ((relativeAngle % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);
  return { angle: normalized, dist, label: '?' };
}

function drawRadarFrame(hires: import('../engine/hires').Hires): void {
  hires.hcolor(2);
  hires.line(0, 0, 0, 123);
  hires.line(0, 123, 278, 123);
  hires.line(278, 123, 278, 0);
  hires.line(278, 0, 0, 0);
  hires.line(140, 1, 140, 55);
  hires.line(140, 71, 140, 123);
  hires.line(1, 63, 131, 63);
  hires.line(151, 63, 279, 63);
  hires.line(1, 0, 131, 59);
  hires.line(279, 0, 151, 59);
  hires.line(151, 67, 279, 123);
  hires.line(1, 123, 131, 67);

  hires.hcolor(1);
  hires.line(137, 60, 137, 66);
  hires.line(137, 66, 145, 66);
  hires.line(145, 66, 145, 60);
  hires.line(145, 60, 137, 60);
}

function drawBlip(hires: import('../engine/hires').Hires, cx: number, cy: number, angle: number, dist: number, maxDist: number, color: number, size: number): void {
  const r = Math.min(55, (dist / maxDist) * 55);
  const x = cx + Math.round(Math.cos(angle) * r);
  const y = cy + Math.round(Math.sin(angle) * r);
  if (x < 5 || x > 274 || y < 5 || y > 118) return;
  hires.hcolor(color);
  hires.line(x - size, y, x + size, y);
  hires.line(x, y - size, x, y + size);
}

export async function radarScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input } = ctx;

  if (state.damage.radarPct === 0) {
    return scenes.run('starshipSimulator');
  }

  glog('radar', `scan at planet ${state.planetIndex} enemy=${state.enemyShips}`);

  let done = false;
  let sweepAngle = 0;
  let lastT = performance.now();

  input.clearKey();

  await new Promise<void>((resolve) => {
    function frame(now: number) {
      if (done) { resolve(); return; }
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;

      const k = input.peekKey();
      if (k !== 0) {
        input.clearKey();
        const ch = String.fromCharCode(k & 0x7f).toUpperCase();
        if (ch === 'X') { done = true; return; }
        if (ch === ' ') {
          input.clearKey();
          scenes.run('shipId');
        }
      }

      sweepAngle += dt * 3;
      if (sweepAngle > Math.PI * 2) sweepAngle -= Math.PI * 2;

      hires.hgr();
      drawRadarFrame(hires);

      const cx = 140;
      const cy = 63;
      const headingRad = headingToRadians(state.heading);

      const rx = -state.x;
      const ry = -state.y;
      const rz = -state.z;
      const planetBlip = relativePolar(rx, ry, rz, headingRad);
      if (planetBlip) {
        const planetColor = state.atmosphere ? 1 : 6;
        drawBlip(hires, cx, cy, planetBlip.angle, planetBlip.dist, 20000, planetColor, 2);
        if (sweepAngle > planetBlip.angle - 0.1 && sweepAngle < planetBlip.angle + 0.1) {
          hires.hcolor(planetColor);
          hires.text(`PLANET ${Math.round(planetBlip.dist / 2)}`, 2, 3);
        }
      }

      const ex = ENEMY_POS.x - state.x;
      const ey = ENEMY_POS.y - state.y;
      const ez = ENEMY_POS.z - state.z;
      const enemyBlip = relativePolar(ex, ey, ez, headingRad);
      if (enemyBlip && state.shipKind !== 0 && !state.atmosphere) {
        drawBlip(hires, cx, cy, enemyBlip.angle, enemyBlip.dist, 20000, 5, 3);
        if (sweepAngle > enemyBlip.angle - 0.1 && sweepAngle < enemyBlip.angle + 0.1) {
          hires.hcolor(5);
          hires.text(`ENEMY ${Math.round(enemyBlip.dist / 2)}`, 2, 4);
        }
      }

      const sweepEndX = cx + Math.round(Math.cos(sweepAngle) * 58);
      const sweepEndY = cy + Math.round(Math.sin(sweepAngle) * 56);
      hires.hcolor(3);
      hires.line(cx, cy, sweepEndX, sweepEndY);

      hires.hcolor(1);
      hires.text(`RADAR ${Math.round(state.damage.radarPct)}%`, 1, 1);
      hires.text(`ENEMY:${state.enemyShips}`, 30, 1);
      hires.text('X-EXIT', 31, 24);
      hires.text('SPACE-SCAN', 1, 24);

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });

  scenes.run('starshipSimulator');
}
