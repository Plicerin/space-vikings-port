import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';

interface DebrisParticle {
  angle: number;
  speed: number;
  dist: number;
  size: number;
  color: number;
}

function drawDebrisParticles(hires: import('../engine/hires').Hires, cx: number, cy: number, particles: DebrisParticle[]): void {
  for (const p of particles) {
    const x = cx + Math.round(Math.cos(p.angle) * p.dist);
    const y = cy + Math.round(Math.sin(p.angle) * p.dist * 0.7);
    if (x < 0 || x > 279 || y < 0 || y > 123) continue;
    hires.hcolor(p.color);
    hires.line(x - p.size, y, x + p.size, y);
    hires.line(x, y - p.size, x, y + p.size);
  }
}

export async function exScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, audio } = ctx;
  setScene('ex');
  glog('destroy', 'enemy ship explosion (EX)');

  const cx = 140;
  const cy = 60;

  const particles: DebrisParticle[] = [];
  for (let i = 0; i < 40; i++) {
    particles.push({
      angle: Math.random() * Math.PI * 2,
      speed: 2 + Math.random() * 6,
      dist: 2 + Math.random() * 5,
      size: 1 + Math.floor(Math.random() * 2),
      color: Math.random() < 0.3 ? 5 : Math.random() < 0.5 ? 6 : 1,
    });
  }

  audio.beep(60, 100);
  for (let frame = 0; frame < 4; frame++) {
    hires.hgr();
    hires.hcolor(5);
    for (let y = 0; y < 124; y++) hires.line(0, y, 279, y);
    hires.hcolor(3);
    hires.line(cx - 10, cy, cx + 10, cy);
    hires.line(cx, cy - 8, cx, cy + 8);
    await new Promise(r => setTimeout(r, 40));
  }

  audio.beep(120, 50);
  for (let frame = 0; frame < 12; frame++) {
    hires.hgr();
    for (const p of particles) {
      p.dist += p.speed;
      if (frame > 3 && frame < 7) p.speed += 0.5;
      if (frame >= 7) p.speed = Math.max(0.5, p.speed - 0.4);
    }
    drawDebrisParticles(hires, cx, cy, particles);
    if (frame % 2 === 0) audio.beep(150 - frame * 8, 20);
    await new Promise(r => setTimeout(r, 45));
  }

  for (let frame = 0; frame < 8; frame++) {
    hires.hgr();
    const survivors = particles.filter((_, i) => (i + frame) % 2 === 0);
    for (const p of survivors) {
      p.dist += p.speed;
      p.color = 3;
    }
    drawDebrisParticles(hires, cx, cy, survivors);
    audio.beep(40 + frame * 6, 15);
    await new Promise(r => setTimeout(r, 50));
  }

  hires.hgr();
  hires.hcolor(3);
  hires.text('ENEMY SHIP DESTROYED', 9, 12);
  await new Promise(r => setTimeout(r, 1500));

  state.shipKind = 0;
  state.shipVitality = 0;
  state.enemyShips = Math.floor(state.enemyShips / 2);
  if (state.enemyShips === 0) {
    state.planets[state.planetIndex].defender = 0;
  }

  scenes.run('starshipSimulator');
}
