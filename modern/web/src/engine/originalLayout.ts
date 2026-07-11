export interface HudLabel {
  text: string;
  row: number;
  col: number;
  color: number; // palette index
}

export interface HudBar {
  startCol: number;
  endColExpr: (state: any) => number; // compute end column based on state
  rows: [number, number]; // [startRow, endRow]
  color: number;
}

export interface HudNumeric {
  format: (value: number) => string;
  cols: number[]; // columns to print each value
  row: number;
}

export interface HudInfo {
  prefix?: string;
  text?: string;
  col: number;
  row: number;
  condition: (state: any) => boolean;
  color: number;
}

export const HUD_LAYOUT = {
  labels: [
    { text: ' SPEED ', row: 18, col: 4, color: 3 },
    { text: 'TURN', row: 18, col: 19, color: 3 },
    { text: ' ENERGY ', row: 18, col: 30, color: 3 },
    { text: 'MANUAL', row: 20, col: 4, color: 3 },
    { text: 'AUTO', row: 20, col: 13, color: 3 },
    { text: 'ORBIT', row: 20, col: 24, color: 3 },
    { text: 'DAMAGE', row: 20, col: 32, color: 3 },
    { text: 'MISSILE', row: 21, col: 4, color: 3 },
    { text: 'LASER', row: 21, col: 13, color: 3 },
    { text: 'COND', row: 21, col: 24, color: 3 },
    { text: 'SHIELD', row: 21, col: 32, color: 3 },
    { text: 'RADAR', row: 22, col: 4, color: 3 },
    { text: 'H/DRIVE', row: 22, col: 13, color: 3 },
  ],
  bars: [
    {
      startCol: 5,
      endColExpr: (s: any) => 5 + Math.round(s.speed / 1.07),
      rows: [132, 144],
      color: 5, // orange
    },
    {
      startCol: 163,
      endColExpr: (s: any) => 163 + Math.round(s.energy / 17.9),
      rows: [132, 144],
      color: 1, // white
    },
  ],
  numeric: [
    {
      format: (n: number) => Math.round(n / 2).toString().padEnd(6),
      cols: [1, 7, 13],
      row: 23,
    },
    {
      format: (rad: number) => ((rad * 180) / Math.PI).toFixed(0).padEnd(4),
      cols: [25, 34],
      row: 23,
    },
  ],
  info: [
    {
      prefix: 'ENEMY:',
      col: 1,
      row: 1,
      condition: (st: any) => st.enemyShips > 0 && !st.atmosphere,
      color: 5,
    },
    {
      text: 'SURRENDERED',
      col: 1,
      row: 2,
      condition: (st: any) => st.planetSurrendered,
      color: 1,
    },
    {
      prefix: 'MIS:',
      col: 30,
      row: 1,
      condition: (st: any) => st.missilesRemaining > 0,
      color: 1,
    },
  ],
};
