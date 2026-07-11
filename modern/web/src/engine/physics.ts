/**
 * Constants translated from STARSHIP SIMULATOR.bas
 * DI = 32768 (Division factor)
 * HH = 256 (High byte multiplier)
 * W1 = 20000, W2 = -20000 (Boundaries)
 */
const DI = 32768;
const HH = 256;
const W1 = 20000;
const W2 = -20000;

export interface ShipPhysicsState {
  x: number;
  y: number;
  z: number;
  xh: number; // X Heading
  yh: number; // Y Heading
  zh: number; // Z Heading
  zp: number; // Z Position (used in X/Z calc)
  yp: number; // Y Position (used in Y calc)
  p: number;  // Ship State/Mode
  s: number;  // Speed
}

/**
 * Translates the BASIC movement logic:
 * 129 YP = YP / DI:ZH = ZH / DI:XH = XH / DI:ZP = ZP / DI:X1 = S * (ZP * XH):Z1 = S * ZP * ZH:X = X + X1:Z = Z + Z1:Y1 = S * YP:Y = Y + Y1: IF P > 190 OR P < 64 THEN Y = Y - 2 * Y1
 */
export function updateShipPhysics(state: ShipPhysicsState): ShipPhysicsState {
  // Normalize components
  const normYP = state.yp / DI;
  const normZH = state.zh / DI;
  const normXH = state.xh / DI;
  const normZP = state.zp / DI;

  // Calculate velocities
  const x1 = state.s * (normZP * normXH);
  const z1 = state.s * normZP * normZH;
  let y1 = state.s * normYP;

  // Update positions
  let newX = state.x + x1;
  let newZ = state.z + z1;
  let newY = state.y + y1;

  // Y-axis inversion logic: IF P > 190 OR P < 64 THEN Y = Y - 2 * Y1
  if (state.p > 190 || state.p < 64) {
    newY = newY - (2 * y1);
  }

  // Boundary checks: IF X < W2 THEN X = W1, etc.
  if (newX < W2) newX = W1;
  if (newX > W1) newX = W2;
  if (newY < W2) newY = W1;
  if (newY > W1) newY = W2;
  if (newZ < W2) newZ = W1;
  if (newZ > W1) newZ = W2;

  return {
    ...state,
    x: newX,
    y: newY,
    z: newZ,
    // Note: Headings (xh, yh, zh) are not updated by this specific block 
    // in the BASIC, they are likely handled by the "trim" inputs.
  };
}
