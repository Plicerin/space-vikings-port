import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';

export async function dmgScene(
  ctx: SceneContext,
  scenes: SceneManager,
): Promise<void> {
  const { hires, state, audio } = ctx;
  setScene('dmg');
  state.damage.pendingUpdate = false;
  glog('damage', `hull=${state.damage.hullPct.toFixed(0)} shields=${state.damage.shieldsPct.toFixed(0)}`);

  hires.hgr();
  hires.hcolor(5);
  hires.line(262, 153, 271, 157);

  hires.hcolor(3);
  hires.text('DAMAGE REPORT', 13, 7);
  hires.hcolor(1);

  const systems: [string, number][] = [
    ['ENGINE 1', state.damage.engine1Pct],
    ['ENGINE 2', state.damage.engine2Pct],
    ['COMPUTER', state.damage.computerPct],
    ['RADAR   ', state.damage.radarPct],
    ['ENV CTRL', state.damage.envPct],
    ['HULL    ', state.damage.hullPct],
    ['SHIELDS ', state.damage.shieldsPct],
    ['H/DRIVE ', state.damage.hyperdrivePct],
    ['MISSILE ', state.damage.missilePct],
    ['LASER   ', state.damage.laserPct],
    ['COMS    ', state.damage.comsPct],
    ['POWER   ', state.damage.powerPct],
  ];

  for (let i = 0; i < systems.length; i++) {
    const [name, pct] = systems[i];
    const row = 9 + i;
    hires.text(`${name} ${Math.round(pct)}%`, 8, row);
    if (pct < 16) {
      hires.hcolor(5);
      hires.text('NOGO', 30, row);
      hires.hcolor(1);
    }
  }

  audio.beep(220, 100);
  await new Promise(r => setTimeout(r, 3000));

  return scenes.run('starshipSimulator');
}


