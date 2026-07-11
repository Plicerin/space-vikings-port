import { log as glog } from './gameLog';
import type { GameState } from './gameState';

export function hasCargoLoot(state: GameState): boolean {
  const loot = state.loot;
  return Object.values(loot).some(v => v > 0);
}

export function needsCommanderService(state: GameState): boolean {
  return state.missilesRemaining < 12
    || state.damage.hullPct < 65
    || state.damage.shieldsPct < 35
    || state.damage.laserPct < 35
    || state.damage.hyperdrivePct < 50
    || state.energy < 250
    || state.forces.transports < 2
    || state.forces.troops < 500;
}

export function chooseCommanderTarget(state: GameState): number {
  let best = -1;
  const current = state.planets[state.planetIndex];
  const failedPlanet = state.pendingGroundForcesDefeatPlanet;
  const unconquered = state.planets
    .map((planet, index) => ({ planet, index }))
    .filter(({ planet, index }) => index !== state.planetIndex && !planet.surrendered);

  const hasAlternatives = unconquered.some(({ index }) => index !== failedPlanet);

  for (let i = 0; i < state.planets.length; i++) {
    const candidate = state.planets[i];
    if (i === state.planetIndex || candidate.surrendered) continue;
    if (hasAlternatives && failedPlanet !== null && i === failedPlanet) continue;

    if (best < 0) {
      best = i;
      continue;
    }

    const incumbent = state.planets[best];
    if (compareCommanderTarget(current, candidate, incumbent) < 0) {
      best = i;
    }
  }
  return best;
}

export function chooseCommanderBase(state: GameState): number {
  let best = -1;
  let bestDistance = Infinity;
  const current = state.planets[state.planetIndex];
  for (let i = 0; i < state.planets.length; i++) {
    const candidate = state.planets[i];
    if (!candidate.hasBase) continue;
    if (i === state.planetIndex && state.planets.length > 1) continue;
    const dist = planetDistance(current, candidate);
    if (dist < bestDistance) {
      best = i;
      bestDistance = dist;
    }
  }
  return best;
}

export function serviceCommanderShip(state: GameState): void {
  const beforeCredits = state.credits;
  state.missilesRemaining = 60;
  state.energy = Math.max(state.energy, 2000);
  state.damage.engine1Pct = 100;
  state.damage.engine2Pct = 100;
  state.damage.computerPct = 100;
  state.damage.radarPct = 100;
  state.damage.envPct = 100;
  state.damage.hullPct = 100;
  state.damage.shieldsPct = 100;
  state.damage.hyperdrivePct = 100;
  state.damage.missilePct = 100;
  state.damage.laserPct = 100;
  state.damage.comsPct = 100;
  state.damage.powerPct = 100;
  state.damage.laserOperational = true;
  state.damage.pendingUpdate = false;
  state.laserOperational = true;
  state.shieldsOn = true;
  state.condition = 'green';
  state.antiFighterTurrets = 0;

  const troopTarget = 8000;
  const troopBudget = Math.min(state.credits, Math.max(0, troopTarget - state.forces.troops));
  state.forces.troops = Math.min(20000, state.forces.troops + troopBudget);
  state.forces.transports = Math.max(state.forces.transports, 10);
  state.forces.fighters = Math.max(state.forces.fighters, 24);
  state.forces.tanks = Math.max(state.forces.tanks, 24);
  state.forces.groundMissiles = Math.max(state.forces.groundMissiles, 24);
  state.forces.troopLocation = 0;
  state.forces.troopPlanetIndex = -1;
  state.credits = Math.max(0, Math.floor(state.credits - 500 - troopBudget));

  glog('commander', `repair/restock at ${state.planets[state.planetIndex].name} credits=${beforeCredits}->${state.credits}`);
}

export function chooseCommanderScene(state: GameState): string | null {
  const planet = state.planets[state.planetIndex];
  const troopPlanet = state.forces.troopPlanetIndex;
  const troopsDeployed = state.forces.troopLocation === 1 || state.forces.troopLocation === 2;

  if (troopsDeployed && troopPlanet >= 0 && troopPlanet !== state.planetIndex) {
    state.navDestination = troopPlanet;
    state.commanderMapTarget = troopPlanet;
    glog('commander', `returning to recover troops at ${state.planets[troopPlanet].name}`);
    return 'galaxyMap';
  }

  if (troopsDeployed && troopPlanet === state.planetIndex) {
    glog('commander', `recover troops from ${planet.name}`);
    return 'recall';
  }

  if (state.pendingConquestCollectionPlanet === state.planetIndex) {
    if (planet.looted || state.planetIndex === 0) {
      clearPendingConquestCollection(state, state.planetIndex);
    } else {
      glog('commander', `collect pending at ${planet.name}`);
      return 'collect';
    }
  }

  // After a failed landing, force one recovery pass before re-attempting the
  // same assault. This prevents rapid Ground Forces loops on stubborn planets.
  if (
    state.pendingGroundForcesDefeatPlanet === state.planetIndex
    && state.pendingGroundForcesNeedsRecovery
  ) {
    state.pendingGroundForcesNeedsRecovery = false;
    glog('commander', `skip immediate assault after defeat at ${planet.name}`);
    const base = chooseCommanderBase(state);
    if (base >= 0) {
      state.navDestination = base;
      state.commanderMapTarget = base;
      glog('commander', `re-route before re-assault: ${state.planets[base].name}`);
      return 'galaxyMap';
    }
    return 'starshipSimulator';
  }

  const conquered = isCurrentPlanetConquered(state);

  if (conquered && !planet.surrendered) {
    markPlanetConquered(state);
  }

  if (!conquered) {
    if (shouldAvoidCommanderAssaultAfterDefeat(state)) {
      if (needsCommanderService(state)) {
        const base = chooseCommanderBase(state);
        if (base >= 0) {
          state.navDestination = base;
          state.commanderMapTarget = base;
          glog('commander', `service before renewed siege: ${state.planets[base].name}`);
          return 'galaxyMap';
        }
      }
      return state.autopilot ? 'starshipSimulator' : null;
    }

    if (shouldPreferPlanetaryBombardment(state)) {
      if (needsCommanderService(state)) {
        const base = chooseCommanderBase(state);
        if (base >= 0) {
          state.navDestination = base;
          state.commanderMapTarget = base;
          glog('commander', `service before bombardment: ${state.planets[base].name}`);
          return 'galaxyMap';
        }
      }
      // Don't force a troop landing immediately. In autopilot flow, return to
      // cockpit so AI can continue orbital bombardment.
      return state.autopilot ? 'starshipSimulator' : null;
    }

    if (!hasCommanderAssaultReadiness(state)) {
      const base = chooseCommanderBase(state);
      if (base >= 0) {
        state.navDestination = base;
        state.commanderMapTarget = base;
        glog('commander', `replenish before assault: ${state.planets[base].name}`);
        return 'galaxyMap';
      }
    }

    glog('commander', `assault ${planet.name}`);
    return 'groundForces';
  }

  const allConquered = state.planets.every((p, i) => {
    if (i === state.planetIndex) return isCurrentPlanetConquered(state);
    return p.surrendered;
  });
  if (allConquered) return 'end';

  if (conquered && !planet.looted && state.planetIndex !== 0) {
    glog('commander', `collect loot at ${planet.name}`);
    return 'collect';
  }

  if (hasCargoLoot(state) && planet.hasBase) {
    state.shoreLeaveMode = 2;
    glog('commander', `sell loot at ${planet.name}`);
    return 'shoreLeave';
  }

  if (needsCommanderService(state)) {
    if (planet.hasBase) {
      serviceCommanderShip(state);
    } else {
      const base = chooseCommanderBase(state);
      if (base >= 0) {
        state.navDestination = base;
        state.commanderMapTarget = base;
        glog('commander', `service course to ${state.planets[base].name}`);
        return 'galaxyMap';
      }
    }
  }

  const nextTarget = chooseCommanderTarget(state);
  if (nextTarget >= 0) {
    state.navDestination = nextTarget;
    state.commanderMapTarget = nextTarget;
    glog('commander', `plotting course to ${state.planets[nextTarget].name}`);
    return 'galaxyMap';
  }

  return 'end';
}

export function isCurrentPlanetConquered(state: GameState): boolean {
  const planet = state.planets[state.planetIndex];
  if (!planet) return false;
  if (planet.surrendered) return true;
  if (state.planetSurrendered) return true;
  if (state.planetVitalityLimit > 0 && state.planetVitality >= state.planetVitalityLimit) return true;
  return false;
}

export function markPlanetConquered(state: GameState): void {
  const planet = state.planets[state.planetIndex];
  if (!planet) return;
  state.planetSurrendered = true;
  planet.surrendered = true;
  planet.groundAssaultFailed = false;
  state.pendingConquestCollectionPlanet = planet.looted || state.planetIndex === 0
    ? null
    : state.planetIndex;
  state.pendingGroundForcesDefeatPlanet = null;
  state.pendingGroundForcesNeedsRecovery = false;
}

export function clearPendingConquestCollection(state: GameState, planetIndex: number): void {
  if (state.pendingConquestCollectionPlanet === planetIndex) {
    state.pendingConquestCollectionPlanet = null;
  }
}

function hasCommanderAssaultReadiness(state: GameState): boolean {
  // Need transport plus at least one offensive stack so assaults don't just
  // stall out indefinitely.
  if (state.forces.transports <= 0) return false;
  if (state.forces.fighters <= 0 && state.forces.troops <= 0 && state.forces.tanks <= 0) return false;
  return true;
}

export function shouldPreferPlanetaryBombardment(state: GameState): boolean {
  const planet = state.planets[state.planetIndex];
  if (!planet) return false;
  if (planet.defense <= 1) return false;

  if (state.planetVitalityLimit <= 0) return false;

  const assaultPower = (state.forces.fighters * 1.5)
    + (state.forces.tanks * 2)
    + (state.forces.troops / 1000);
  const readiness = hasCommanderAssaultReadiness(state);

  // Keep high-defense worlds from repeated risky troop drops.
  if (planet.defense >= 4) {
    return !readiness || assaultPower < 10;
  }

  if (planet.defense === 3) {
    return !readiness || assaultPower < 4;
  }

  return false;
}

function shouldAvoidCommanderAssaultAfterDefeat(state: GameState): boolean {
  const planet = state.planets[state.planetIndex];
  if (!planet.groundAssaultFailed && state.pendingGroundForcesDefeatPlanet !== state.planetIndex) {
    return false;
  }
  return state.planetVitalityLimit > 0;
}

function planetDistance(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function compareCommanderTarget(
  current: { x: number; y: number; z: number },
  candidate: { defense: number; hasBase: boolean; x: number; y: number; z: number },
  incumbent: { defense: number; hasBase: boolean; x: number; y: number; z: number },
): number {
  const candidateScore = commanderTargetScore(current, candidate);
  const incumbentScore = commanderTargetScore(current, incumbent);
  return candidateScore - incumbentScore;
}

function commanderTargetScore(
  current: { x: number; y: number; z: number },
  planet: { defense: number; hasBase: boolean; x: number; y: number; z: number },
): number {
  const defenseWeight = planet.defense * 1000;
  const basePenalty = planet.hasBase ? 250 : 0;
  return defenseWeight + basePenalty + planetDistance(current, planet);
}
