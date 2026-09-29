import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';

/**
 * STATUS, the ship status report - STATUS.bas, reached from COM by 1 then 4 (COM line 270's
 * ON C GOTO 800,900,30,1200,20000 landing on 1200's RUN STATUS).
 *
 * Two screens. Line 1315's GET I$ holds the first; then R = 4 sends line 1230 through its
 * blanking loop and straight back out at 1232, and the troop report is drawn over the same
 * cleared rows.
 *
 * The screen is set up by lines 12-20: POKE 32,1 / POKE 33,39 puts the text window at
 * column 1, 39 wide, and HCOLOR= 1 flooding rows 0 to 123 is the background. Nothing changes
 * HCOLOR afterwards, so the whole report is green. Line 1230 clears with printed spaces -
 * FOR C = 1 TO 15: VTAB C: HTAB 2: PRINT <38 spaces> - which is 0-based rows 0-14, columns
 * 1-38.
 *
 * TAB( ) and HTAB are absolute screen columns here, the same as in COM, so TAB(22) is
 * 0-based column 21 and TAB(18)/TAB(24) are columns 17 and 23.
 */

/** STATUS line 10000's own DATA. Note GROOMBRIDGE **1618** - COM line 15130 calls the same
 *  planet GROOMBRIDGE 168. The two programs disagree; this list is STATUS's. */
const PLANET_NAMES = [
  'SOL', 'ALPHA CENTAURI', "BARNARD'S STAR", 'WOLF 359', 'LUYTEN',
  'LALANDE 21185', 'SIRIUS', 'VARCAR', 'XANADON', 'EPSILON ERIDANA',
  'CYGNI', 'PROCYON', 'TAU CETI', 'LACAILLE 9352', 'LARSEN-C',
  'GROOMBRIDGE 1618', 'KRUGER 60', 'EPSILON INDI', 'ARGO', 'SHIVANDA',
];
/** Lines 1350-1360, indexed by PEEK(38203). */
const MORALE = ['', 'AWFUL!!!', 'POOR', 'SO-SO', 'FAIR', 'GOOD', 'EXCELLENT!'];
/** Lines 1380-1384, indexed by PEEK(38166). Note 3 is CRYOGENIC SLEEP, tested first. */
const LOCATION = ['ON BOARD', 'PLANETSIDE', 'SHORE LEAVE', 'CRYOGENIC SLEEP'];
/** Lines 1290-1294, indexed by PEEK(38165). */
const CONDITION = ['', 'GREEN', 'BLUE', 'RED'];

/** Everything the report prints, so the draw is pure and can be compared against the disk. */
export interface StatusData {
  /** 0-based. The disk's PEEK(38209) is 1-based and line 1235 READs that many names. */
  planetIndex: number;
  /** SD, TR and CR are not bytes - line 50 INPUTs them from the MISC file. */
  stardate: number;
  troops: number;
  credits: number;
  energy: number;      // 38199
  shields: number;     // 38200
  condition: number;   // 38165
  hull: number;        // 38193, printed as 100 - it
  missiles: number;    // 38187
  computer: number;    // 38196
  hyperdrive: number;  // 38190
  radar: number;       // 38195
  laser: number;       // 38186
  engine1: number;     // 38198
  engine2: number;     // 38197
  morale: number;      // 38203
  troopLocation: number; // 38166
  fighters: number;    // 38156
  transports: number;  // 38155
  tanks: number;       // 38154
  groundMissiles: number; // 38153
  /** Line 1386: (PEEK(38167) * 256) + PEEK(38159). A different quantity from TR. */
  troopsAlive: number;
}

/** Applesoft PRINT of a number: nine significant digits, no trailing zeros, no sign space. */
function num(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toPrecision(9)));
}

type H = import('../engine/hires').Hires;

/**
 * Line 30's POKE 973,255, and it stays that way until line 1396 resets it just before
 * RUN COM - so the whole report is inverse video.
 *
 * $3CD is the character generator's inverse flag. That is measurable: row 40 of the
 * original's page reads `.#.#.#.` across text column 0 and then solid to column 38, and
 * 38 columns x 7 pixels is the 266 per row the port was missing. A space printed in inverse
 * is a solid block, which is what line 1230's 38 spaces put down.
 */
const INVERSE = { invert: true } as const;

/** Lines 15-20 and 1230: the green flood, then the printed-space clear over rows 0-14. */
function background(hires: H): void {
  hires.hcolor(1);
  for (let y = 0; y <= 123; y++) hires.hlin(0, 279, y);
  // Line 1230's FOR C = 1 TO 15: VTAB C: HTAB 2: PRINT <38 spaces>. In inverse those are
  // solid blocks over the flood, not blanked cells.
  for (let r = 1; r <= 15; r++) hires.text(' '.repeat(38), 2, r, INVERSE);
}

/** Lines 1240-1310 and the GOSUB at 5100. */
export function drawStatusReport(hires: H, d: StatusData): void {
  background(hires);
  hires.text('-SHIP STATUS REPORT-', 9, 1, INVERSE);
  hires.text(`LOCATION :${PLANET_NAMES[d.planetIndex] ?? ''}`, 2, 3, INVERSE);
  hires.text(`STARDATE :${num(d.stardate)}`, 2, 5, INVERSE);

  // Line 1255 divides by 62 while a full tank is 63, so a full tank computes 101 - and line
  // 1256 clamps it back to 100. Both halves matter: without the clamp the original would
  // read 101%, and on the machine it reads 100%.
  let energyPct = Math.floor((d.energy / 62) * 100);
  if (energyPct > 100) energyPct = 100;

  const left = (text: string, row: number) => hires.text(text, 2, row, INVERSE);
  const right = (text: string, row: number) => hires.text(text, 22, row, INVERSE);

  left(`ENERGY  :${energyPct}%`, 7);
  right(`CREDITS  :${Math.floor(d.credits)}`, 7);
  left(`SHIELDS :${num(d.shields)}%`, 8);
  right(`CONDITION:${CONDITION[d.condition] ?? ''}`, 8);
  left(`HULL DMG:${100 - d.hull}%`, 9);
  right(`MISSILES :${num(d.missiles)}`, 9);
  left(`COMPUTER:${num(d.computer)}%`, 10);
  right(`H-DRIVE  :${num(d.hyperdrive)}%`, 10);
  left(`RADAR   :${num(d.radar)}%`, 11);
  right('ENV.     :100%', 11);          // 5110 prints this literally, ignoring 38194
  left(`LASER   :${num(d.laser)}%`, 12);
  right('NAV.COMP.:100%', 12);          // 5120 prints the constant 100, ignoring 38184
  left(`ENGINE#1:${num(d.engine1)}%`, 13);
  right(`ENGINE#2 :${num(d.engine2)}%`, 13);
}

/** Lines 1320-1386 and the GOSUB at 5200. */
export function drawTroopReport(hires: H, d: StatusData): void {
  background(hires);
  hires.text('-TROOP STATUS-', 12, 2, INVERSE);
  const row = (label: string, value: string, r: number) => {
    hires.text(label, 2, r, INVERSE);
    hires.text('-', 18, r, INVERSE);
    hires.text(value, 24, r, INVERSE);
  };
  row('NO. OF TROOPS', num(d.troops), 4);
  row('TROOP MORALE', MORALE[d.morale] ?? '', 5);
  row('TROOP LOCATION', LOCATION[d.troopLocation] ?? '', 6);
  row('FIGHTERS', num(d.fighters), 7);
  row('TRANSPORTS', num(d.transports), 8);
  row('TANKS', num(d.tanks), 9);
  row('GROUND MISSILES', num(d.groundMissiles), 10);
  if (d.troopsAlive === 0) hires.text('THE TROOPS ARE ALL DEAD!', 2, 11, INVERSE);
}

export function statusDataFrom(state: import('../engine/gameState').GameState): StatusData {
  const d = state.damage;
  const f = state.forces;
  return {
    planetIndex: state.planetIndex,
    stardate: state.stardate,
    troops: f.troops,
    credits: state.credits,
    energy: Math.round(state.energy),
    shields: d.shieldsPct,
    // The disk stores 1/2/3 in $954D-ish ($9515 region: 38165); the port keeps the word.
    condition: CONDITION.indexOf(state.condition.toUpperCase()),
    hull: d.hullPct,
    missiles: state.missilesRemaining,
    computer: d.computerPct,
    hyperdrive: d.hyperdrivePct,
    radar: d.radarPct,
    laser: d.laserPct,
    engine1: d.engine1Pct,
    engine2: d.engine2Pct,
    morale: f.morale,
    troopLocation: f.troopLocation,
    fighters: f.fighters,
    transports: f.transports,
    tanks: f.tanks,
    groundMissiles: f.groundMissiles,
    troopsAlive: f.troops,
  };
}

export async function statusScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state, input } = ctx;
  setScene('status');
  const d = statusDataFrom(state);

  drawStatusReport(hires, d);
  glog('status', `page=1 energy=${d.energy} credits=${Math.floor(d.credits)}`);
  await input.waitForKey();

  drawTroopReport(hires, d);
  glog('status', `page=2 troops=${d.troops} morale=${d.morale}`);
  await input.waitForKey();

  return scenes.run('com');
}
