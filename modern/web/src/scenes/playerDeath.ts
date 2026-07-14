import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';

interface Debris {
  angle: number;
  speed: number;
  dist: number;
  size: number;
  color: number;
}

function drawDebris(hires: import('../engine/hires').Hires, cx: number, cy: number, debris: Debris[]): void {
  for (const d of debris) {
    const x = cx + Math.round(Math.cos(d.angle) * d.dist);
    const y = cy + Math.round(Math.sin(d.angle) * d.dist * 0.7);
    if (x < 0 || x > 279 || y < 0 || y > 123) continue;
    hires.hcolor(d.color);
    hires.line(x - d.size, y, x + d.size, y);
    hires.line(x, y - d.size, x, y + d.size);
  }
}

function computeStats(state: import('../engine/gameState').GameState): { planetsOwned: number; kills: number } {
  let planetsOwned = 0;
  for (const p of state.planets) {
    if (p.surrendered) planetsOwned++;
  }
  const kills = Math.max(0, 20 - state.enemyShips);
  return { planetsOwned, kills };
}

export async function playerDeathScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input, audio } = ctx;
  setScene('playerDeath');
  glog('destroy', 'player ship destroyed (S_X)');

  const cx = 140;
  const cy = 60;

  const debris: Debris[] = [];
  for (let i = 0; i < 50; i++) {
    debris.push({
      angle: Math.random() * Math.PI * 2,
      speed: 1 + Math.random() * 8,
      dist: 1 + Math.random() * 4,
      size: 1 + Math.floor(Math.random() * 3),
      color: Math.random() < 0.3 ? 5 : Math.random() < 0.5 ? 6 : 1,
    });
  }

  audio.beep(50, 150);
  for (let frame = 0; frame < 4; frame++) {
    hires.hgr();
    hires.hcolor(5);
    for (let y = 0; y < 124; y++) hires.line(0, y, 279, y);
    hires.hcolor(1);
    hires.line(cx - 12, cy, cx + 12, cy);
    hires.line(cx, cy - 10, cx, cy + 10);
    await new Promise(r => setTimeout(r, 50));
  }

  audio.beep(100, 80);
  for (let frame = 0; frame < 16; frame++) {
    hires.hgr();
    for (const d of debris) {
      d.dist += d.speed;
      if (frame < 8) d.speed += 0.3;
      else d.speed = Math.max(0.3, d.speed - 0.3);
    }
    drawDebris(hires, cx, cy, debris);
    if (frame % 2 === 0) audio.beep(120 + frame * 6, 25);
    await new Promise(r => setTimeout(r, 40));
  }

  for (let frame = 0; frame < 10; frame++) {
    hires.hgr();
    const survivors = debris.filter((_, i) => (i + frame) % 2 === 0);
    for (const d of survivors) {
      d.dist += d.speed * 0.5;
      d.color = 3;
    }
    drawDebris(hires, cx, cy, survivors);
    audio.beep(30 + frame * 4, 20);
    await new Promise(r => setTimeout(r, 60));
  }

  hires.hgr();
  hires.hcolor(5);
  hires.text('YOUR SHIP HAS BEEN', 9, 6);
  hires.text('DESTROYED!!', 13, 7);

  const stats = computeStats(state);
  hires.hcolor(1);
  hires.text(`SYSTEMS CONQUERED: ${stats.planetsOwned}/20`, 4, 10);
  hires.text(`ENEMY SHIPS DESTROYED: ${stats.kills}`, 4, 11);

  hires.hcolor(3);
  hires.text('PRESS SPACE TO CONTINUE', 8, 20);

  await input.waitForKey();

  scenes.run('start');
}
