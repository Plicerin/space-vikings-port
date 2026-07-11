import { GameState } from './gameState';
import { Vec3, v3sub, v3len } from './math3d';
import { log as glog } from './gameLog';
import { shouldPreferPlanetaryBombardment } from './commander';

export interface AIInput {
  dPitch: number;
  dHeading: number;
  fire: boolean;
  speed?: number;
}

export class AIController {
  private fireTimer = 0;
  private lastIntent = '';

  update(
    state: GameState,
    pitchRad: number,
    headingRad: number,
    enemy: { pos: Vec3; alive: boolean },
    dt: number
  ): AIInput {
    const input: AIInput = { dPitch: 0, dHeading: 0, fire: false };

    let targetPitch = 0;
    let targetHeading = headingRad;
    let targetDistance = Infinity;
    let hasTarget = false;
    let wantsFire = false;
    let desiredSpeed = 45;
    const speedScale = 0.72;
    const planet = state.planets[state.planetIndex];
    const preferBombardmentApproach = Boolean(
      planet
      && !state.planetSurrendered
      && state.planetVitalityLimit > 0
      && !state.atmosphere
      && (planet.groundAssaultFailed || shouldPreferPlanetaryBombardment(state)),
    );

    // 1. Commander bombardment priority. Reenter the atmosphere instead of
    // getting pinned in a long space duel with the local defender.
    if (preferBombardmentApproach) {
      const rel = v3sub({ x: 0, y: 200, z: 0 }, { x: state.x, y: state.y, z: state.z });
      targetDistance = v3len(rel);
      this.intent(`reentering for bombardment at dist~${Math.round(targetDistance / 500) * 500}`);
      targetHeading = Math.atan2(rel.x, rel.z);
      targetPitch = Math.atan2(rel.y, Math.hypot(rel.x, rel.z));
      hasTarget = true;
      desiredSpeed = targetDistance > 2500 ? 105 : targetDistance > 1200 ? 72 : 28;
    }
    // 2. Enemy Ship Priority
    else if (enemy.alive && !state.atmosphere) {
      const rel = v3sub(enemy.pos, { x: state.x, y: state.y, z: state.z });
      targetDistance = v3len(rel);
      this.intent(`tracking enemy at dist=${targetDistance.toFixed(0)}`);
      targetHeading = Math.atan2(rel.x, rel.z);
      targetPitch = Math.atan2(rel.y, Math.hypot(rel.x, rel.z));
      hasTarget = true;
      wantsFire = true;

      if (targetDistance > 2400) desiredSpeed = 52;
      else if (targetDistance > 1200) desiredSpeed = 28;
      else desiredSpeed = 0;

      if (state.missilesRemaining > 0 && targetDistance < 3500) {
        if (state.weaponMode !== 'missile') {
          this.intent('selecting missiles for long-range engagement');
          state.weaponMode = 'missile';
          state.missileMode = true;
        }
      } else {
        if (state.weaponMode !== 'laser') {
          this.intent('selecting lasers for close-range combat');
          state.weaponMode = 'laser';
          state.missileMode = false;
        }
      }
    } 
    // 3. Planetary Bombardment Priority
    else if (state.atmosphere && !state.planetSurrendered) {
      // Dive slightly to hit the surface
      targetPitch = -25 * (Math.PI / 180);
      // Avoid crashing!
      if (state.y < 500) targetPitch = 15 * (Math.PI / 180);
      hasTarget = true;
      wantsFire = true;
      desiredSpeed = state.y < 700 ? 14 : 24;
      if (state.weaponMode !== 'laser') {
        this.intent('selecting lasers for planetary bombardment');
        state.weaponMode = 'laser';
        state.missileMode = false;
      }
    }
    // 3b. After conquest, climb back to orbit so the commander can jump.
    else if (state.atmosphere && state.planetSurrendered) {
      this.intent('climbing to orbit after surrender');
      targetPitch = 35 * (Math.PI / 180);
      targetHeading = headingRad;
      hasTarget = true;
      desiredSpeed = 58;
    }
    // 4. Navigation Priority. The planet is at local origin; fly there for
    // reentry when this system still needs to be conquered.
    else if (!state.planetSurrendered && !state.inOrbit) {
       const rel = v3sub({ x: 0, y: 200, z: 0 }, { x: state.x, y: state.y, z: state.z });
       targetDistance = v3len(rel);
       this.intent(`approaching planet at dist~${Math.round(targetDistance / 500) * 500}`);
       targetHeading = Math.atan2(rel.x, rel.z);
       targetPitch = Math.atan2(rel.y, Math.hypot(rel.x, rel.z));
       hasTarget = true;
       desiredSpeed = targetDistance > 2500 ? 50 : targetDistance > 1200 ? 30 : 16;
    }

    if (hasTarget) {
      let diffH = Math.atan2(Math.sin(targetHeading - headingRad), Math.cos(targetHeading - headingRad));
      const diffP = targetPitch - pitchRad;
      const turnRate = 1.35;

      input.dHeading = Math.max(-1, Math.min(1, diffH * 1.5)) * turnRate;
      input.dPitch = Math.max(-1, Math.min(1, diffP * 1.5)) * turnRate;


      // Auto-fire logic
      const closeCombat = enemy.alive && targetDistance < 1300;
      const weaponReady = state.weaponMode !== 'missile' || targetDistance < 3500;
      if (wantsFire && weaponReady
        && (closeCombat || (Math.abs(diffH) < 0.16 && Math.abs(diffP) < 0.16))) {
        this.fireTimer -= dt;
        if (this.fireTimer <= 0) {
          input.fire = true;
          this.fireTimer = state.atmosphere ? 0.8 : 0.5;
        }
      } else {
        this.fireTimer = Math.min(this.fireTimer, 0.2);
      }

      input.speed = Math.max(0, Math.min(120, Math.round(desiredSpeed * speedScale)));

      // Auto-Shields and Condition
      if (state.condition === 'green') {
        state.condition = 'blue';
      }
      if (input.fire && state.condition !== 'red') {
        state.condition = 'red';
        state.antiFighterTurrets = 3;
      }
      if (!state.shieldsOn && state.damage.shieldsPct > 0) {
        state.shieldsOn = true;
      }
    } else {
      // Cruise mode
      if (state.speed < 44) input.speed = 44;
      if (state.shieldsOn) state.shieldsOn = false;
      if (state.condition !== 'green') {
        state.condition = 'green';
        state.antiFighterTurrets = 0;
      }
    }

    return input;
  }

  private intent(message: string): void {
    if (message === this.lastIntent) return;
    this.lastIntent = message;
    glog('ai', message);
  }
}
