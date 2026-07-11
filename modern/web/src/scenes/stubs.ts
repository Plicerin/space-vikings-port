import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';

export async function reentryScene(
  ctx: SceneContext,
  scenes: SceneManager,
): Promise<void> {
  const { hires, state, audio } = ctx;
  setScene('reentry');

  // RE.bas
  // POKE 38210,1 then BLOAD PLANET # currentSystem, then RUN STARSHIP SIMULATOR.
  state.atmosphere = true;
  state.inOrbit = false;

  // The BASIC overlay does not rewrite the live XYZ bytes the way ORBIT.bas
  // does; it keeps the current simulator state and switches into atmospheric
  // mode. Preserve current position/orientation here and only mark the mode.
  glog('init', `reentry pos=(${state.x},${state.y},${state.z}) heading=${state.heading} planet=${state.planetIndex}`);

  audio.beep(440, 200);
  const frames = state.commanderMode ? 4 : 18;
  for (let i = 0; i < frames; i++) {
    hires.hgr();
    drawBackdropStars(hires, 17 + i * 3);
    drawReentryBands(hires, i);
    drawHorizonArc(hires, 104 + Math.sin(i * 0.25) * 2, 44 + i * 0.4);
    hires.hcolor(3);
    hires.text('REENTRY SEQUENCE START', 10, 7);
    await wait(state.commanderMode ? 60 : 90);
  }

  return scenes.run('starshipSimulator');
}

export async function orbitScene(
  ctx: SceneContext,
  scenes: SceneManager,
): Promise<void> {
  const { hires, state, audio } = ctx;
  setScene('orbit');

  // ORBIT.bas:25-37
  // POKE 38210,0
  state.atmosphere = false;
  state.inOrbit = true;

  // ORBIT.bas:27
  // X1 = 188:X2 = 2:Y1 = 200:Y2 = 0:Z1 = 208:Z2 = 7
  // These are the low/high bytes written into XI/YI/ZI.
  state.x = 188 + (2 * 256);
  state.y = 200 + (0 * 256);
  state.z = 208 + (7 * 256);

  // ORBIT.bas:28-29
  // Preserve pitch/bank, force heading to 190 for insertion.
  state.heading = 190;

  // ORBIT.bas:30-32
  // BLOAD PLANET # 0, and if 38205 != 0 then BLOAD SHIP # J with 2 -> 3 remap.
  // Live opening capture shows the opening orbit scene carrying ship type 3.
  if (state.shipKind === 0) {
    state.shipKind = 3;
    state.enemyShips = Math.max(state.enemyShips, 30);
  } else if ((state.shipKind as number) === 2) {
    state.shipKind = 3;
  }

  glog('init', `orbit pos=(${state.x},${state.y},${state.z}) heading=${state.heading} ship=${state.shipKind}`);

  audio.beep(660, 200);
  const frames = state.commanderMode ? 4 : 12;
  for (let i = 0; i < frames; i++) {
    hires.hgr();
    hires.hcolor(6);
    for (let y = 0; y <= 125; y++) hires.line(0, y, 279, y);
    hires.hcolor(1);
    hires.text('ORBITAL INSERTION START', 10, 7);
    await wait(state.commanderMode ? 60 : 90);
  }

  return scenes.run('starshipSimulator');
}

export async function exScene(
  ctx: SceneContext,
  scenes: SceneManager,
): Promise<void> {
  const { hires, state, audio } = ctx;
  setScene('ex');
  glog('destroy', 'enemy ship explosion (EX)');
  for (let frame = 0; frame < 18; frame++) {
    hires.hgr();
    drawBackdropStars(hires, 53 + frame * 5);
    drawExplosionBurst(hires, 140, 60, frame, 1);
    audio.beep(80 + frame * 8, 12);
    await wait(30);
  }
  for (let frame = 0; frame < 10; frame++) {
    hires.hgr();
    drawBackdropStars(hires, 121 + frame * 3);
    drawExplosionBurst(hires, 140, 60, 18 + frame, 2);
    await wait(24);
  }

  // EX.bas:30 — POKE 38205,0 (enemy gone), POKE EN,127 (debris loaded)
  // EX.bas:56 — F = PEEK(38207)/2: POKE 38207,F (halve enemy count)
  state.shipKind = 0;
  state.shipVitality = 0;
  state.enemyShips = Math.floor(state.enemyShips / 2);
  if (state.enemyShips === 0) {
    state.planets[state.planetIndex].defender = 0;
  }

  // EX.bas:60 — RUN STARSHIP SIMULATOR (return to cockpit)
  return scenes.run('starshipSimulator');
}

export async function playerDeathScene(
  ctx: SceneContext,
  scenes: SceneManager,
): Promise<void> {
  const { hires, state, audio } = ctx;
  setScene('playerDeath');
  glog('destroy', 'player ship destroyed (S_X)');
  for (let frame = 0; frame < 18; frame++) {
    hires.hgr();
    drawBackdropStars(hires, 67 + frame * 4);
    drawExplosionBurst(hires, 140, 60, frame, 3);
    audio.beep(80 + frame * 8, 12);
    await wait(30);
  }
  for (let frame = 0; frame < 10; frame++) {
    hires.hgr();
    drawBackdropStars(hires, 131 + frame * 3);
    drawExplosionBurst(hires, 140, 60, 18 + frame, 4);
    await wait(24);
  }

  // S_X.bas:40 — VTAB 22: HTAB 5: SPEED= 127: PRINT "YOUR SHIP HAS BEEN DESTROYED!!"
  hires.hcolor(3);
  hires.text('YOUR SHIP HAS BEEN DESTROYED!!', 5, 22);

  // S_X.bas:50 — two GETs (wait for any keypress twice, then reboot)
  await ctx.input.waitForKey();
  await ctx.input.waitForKey();

  // S_X.bas:50 — PR#6 = reboot → start scene
  return scenes.run('start');
}

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

function drawBackdropStars(hires: SceneContext['hires'], seed: number): void {
  hires.hcolor(3);
  for (let i = 0; i < 32; i++) {
    const x = Math.round((seed * 17 + i * 41) % 280);
    const y = Math.round((seed * 11 + i * 29) % 124);
    if ((i + seed) % 5 === 0) continue;
    hires.hplot(x, y);
  }
}

function drawReentryBands(hires: SceneContext['hires'], frame: number): void {
  hires.hcolor(5);
  for (let y = 18; y < 124; y += 5) {
    const bend = Math.sin((y * 0.08) + frame * 0.22) * 6;
    hires.line(0, y, 279, y + bend);
  }
}

function drawOrbitalBands(hires: SceneContext['hires'], frame: number): void {
  hires.hcolor(6);
  for (let x = 0; x < 280; x += 8) {
    const wave = Math.sin((x * 0.06) + frame * 0.28) * 3;
    hires.line(x, 20 + wave, x, 118 - wave);
  }
}

function drawHorizonArc(
  hires: SceneContext['hires'],
  centerY: number,
  radius: number,
): void {
  hires.hcolor(3);
  let prevX = 0;
  let prevY = centerY;
  for (let x = 0; x <= 279; x += 4) {
    const dx = (x - 140) / radius;
    const y = centerY + Math.round(Math.max(-12, Math.min(12, dx * dx * 7 - 8)));
    if (x > 0) hires.line(prevX, prevY, x, y);
    prevX = x;
    prevY = y;
  }
}

function drawOrbitRing(
  hires: SceneContext['hires'],
  cx: number,
  cy: number,
  radius: number,
): void {
  hires.hcolor(3);
  let prevX = cx + radius;
  let prevY = cy;
  for (let i = 1; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * radius * 1.8);
    const y = Math.round(cy + Math.sin(a) * radius * 0.9);
    hires.line(prevX, prevY, x, y);
    prevX = x;
    prevY = y;
  }
}

function drawExplosionBurst(
  hires: SceneContext['hires'],
  cx: number,
  cy: number,
  frame: number,
  seed: number,
): void {
  hires.hcolor(frame % 2 === 0 ? 5 : 3);
  const outer = 10 + frame * 2;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + seed * 0.12;
    const wobble = Math.sin(frame * 0.3 + i) * 2;
    const len = outer + (i % 5) + wobble;
    hires.line(
      cx + Math.round(Math.cos(a) * 3),
      cy + Math.round(Math.sin(a) * 2),
      cx + Math.round(Math.cos(a) * len),
      cy + Math.round(Math.sin(a) * len * 0.7),
    );
  }
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
