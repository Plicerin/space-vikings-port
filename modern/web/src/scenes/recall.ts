import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';

/**
 * RECALL, from RECALL.bas - twelve lines of it.
 *
 * GROUND FORCES option 2 chains here (its line 2000 is `PRINT "RUN RECALL"`). It redraws the
 * same box COM does and prints one of five messages, then goes straight back to GROUND
 * FORCES. There is no key to press and no status panel.
 *
 * It never clears and never sets the window, so both come from COM by way of GROUND FORCES:
 * left 1, width 21, `$3CD` 0 and `$E4` 42 - HCOLOR 1, normal video. Rows 1-12 are already
 * blank because GROUND FORCES line 65 ran `R = 5: GOSUB 12` on the way out.
 *
 * The message lands on 0-based rows 4 and 5. GROUND FORCES' dispatch and RECALL's own file
 * reads leave the cursor on row 3, and line 2000's leading `PRINT` drops it to 4 - measured,
 * not traced.
 */

/** Lines 2000-2030, in the order the original tests them. */
export interface RecallInputs {
  /** PEEK(38209) and PEEK(38158). */
  planet: number;
  troopPlanet: number;
  /** TR, from the MISC file. */
  troops: number;
  /** PEEK(38166): 0 on board, 1 planetside, 2 shore leave, 3 cryogenic sleep. */
  location: number;
}

export interface RecallResult {
  lines: string[];
  /** The value lines 2005 and 2010 poke into 38166, or null when nothing is written. */
  newLocation: number | null;
  /** Which line printed, for the record. */
  line: number;
}

export function recallMessage(i: RecallInputs): RecallResult {
  if (i.planet !== i.troopPlanet && i.location > 0 && i.location < 3) {
    return { lines: ['TROOPS ARE NOT ON', '', 'THIS PLANET, SIR!'], newLocation: null, line: 2000 };
  }
  if (i.troops === 0) {
    return { lines: ['WE HAVE NO TROOPS', 'LEFT, SIR!'], newLocation: 0, line: 2005 };
  }
  if (i.location === 1 || i.location === 2) {
    return { lines: ['TROOPS ARE BEING', 'RECALLED, SIR!'], newLocation: 0, line: 2010 };
  }
  if (i.location === 3) {
    return { lines: ['TROOPS ARE IN', 'CRYOGENIC SLEEP!'], newLocation: null, line: 2020 };
  }
  return { lines: ['TROOPS ARE ALREADY', 'ON BOARD, SIR!'], newLocation: null, line: 2030 };
}

/** Line 20's box and the message. */
export function drawRecall(hires: import('../engine/hires').Hires, lines: string[]): void {
  hires.hcolor(1);
  hires.line(1, 1, 139, 1);
  hires.line(139, 1, 139, 110);
  hires.line(139, 110, 1, 110);
  hires.line(1, 110, 1, 1);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]) hires.text(lines[i], 2, 5 + i);
  }
}

export async function recallScene(ctx: SceneContext, scenes: SceneManager): Promise<void> {
  const { hires, state } = ctx;
  setScene('recall');

  const r = recallMessage({
    planet: state.planetIndex,
    troopPlanet: state.forces.troopPlanetIndex,
    troops: state.forces.troops,
    location: state.forces.troopLocation,
  });
  drawRecall(hires, r.lines);
  if (r.newLocation !== null) {
    state.forces.troopLocation = r.newLocation as 0 | 1 | 2 | 3;
    if (r.newLocation === 0) state.forces.troopPlanetIndex = -1;
  }
  glog('recall', `line ${r.line}: ${r.lines.filter(Boolean).join(' ')}`);

  // Line 2050 chains straight on - the message is only up for as long as GROUND FORCES takes
  // to load, which the capture put at about two seconds.
  await new Promise((res) => setTimeout(res, 1800));
  return scenes.run('groundForces');
}
