import type { SceneContext } from '../engine/sceneManager';
import { setScene, log as glog } from '../engine/gameLog';
import {
  drawStars8000, horizontalRows8020, fanLines9000, CENTRE_LINE,
  logoOps, OPENING_TIMING, SUBLOGIC_LINE, CREDIT_LINE,
} from '../engine/diskOpening';

/**
 * START 80's `GOSUB 1000` - the sequence that plays while the game loads itself.
 *
 * This is the opening the port did not have. It runs after the (N)EW or (O)LD answer and
 * before the game appears, and on the disk it takes **61 seconds**, nearly all of which is
 * twelve BLOADs rather than anything being drawn. The stages and their timings are measured
 * in `probe_openingart.mjs`:
 *
 * | at | what |
 * | --- | --- |
 * | 0 - 7.07 s | the stars, then the grid drawn from the horizon down |
 * | 7.07 - 20.93 s | `SUBLOGIC PRESENTS:` |
 * | 21.07 - 42.27 s | `A SIMULATION GAME BY MITCHELL ROBBINS` |
 * | 42.27 - 60 s | the `SPACE VIKINGS` wordmark, stroke by stroke |
 *
 * **A key skips it**, and that is a departure worth stating rather than hiding. The disk reads
 * no key here - it cannot, it is waiting on the drive - so there was nothing to be faithful to;
 * sixty-one seconds of load screen is the shape of a 1983 floppy, not a decision anyone made,
 * and the port has no floppy. Everything that is drawn, and the order and pace it is drawn in,
 * is the disk's.
 */
export async function openingScene(ctx: SceneContext): Promise<void> {
  const { hires, input } = ctx;
  setScene('opening');

  // 1000: `HGR2:HGR`, which clears both pages and shows the first.
  hires.hgr();

  let skipped = false;
  /** Wait, unless a key arrives - then give up on the rest of the sequence. */
  const waitUntil = async (seconds: number): Promise<boolean> => {
    const end = startedAt + seconds * 1000;
    while (performance.now() < end) {
      if (input.peekKey() > 0) { input.clearKey(); skipped = true; return false; }
      await new Promise((r) => setTimeout(r, 16));
    }
    return true;
  };

  const startedAt = performance.now();
  const t = OPENING_TIMING;

  // 1000's `HCOLOR= 5`, then 8000 and 8010.
  hires.hcolor(5);
  // 8000 and 8010 are RND-driven and this uses the browser's generator, not Applesoft's. The
  // port has a faithful RND in `diskRnd.ts`, but it needs the seed the machine held at this
  // instant and that was never captured - so the sky here follows the same law as the disk's
  // and is not the same sky. `openingart_parity.mjs` checks the stars by count and band for
  // exactly that reason; everything else on this screen is compared pixel for pixel.
  drawStars8000((x, y) => hires.hplot(x, y), Math.random);

  // 8040's `HCOLOR= 1`, then the ground. The disk draws this over about seven seconds, which
  // is Applesoft's own speed at it, so the rows go down one at a time rather than at once.
  hires.hcolor(1);
  const rows = horizontalRows8020();
  const fan = fanLines9000();
  const strokes = rows.length + fan.length + 1;
  const perStroke = (t.gridDrawnAt * 1000) / strokes;
  let drawn = 0;
  const pace = async (): Promise<boolean> => {
    drawn++;
    return waitUntil((drawn * perStroke) / 1000);
  };

  for (const y of rows) {
    hires.hplot(0, y);
    hires.hplotTo(279, y);
    if (!await pace()) break;
  }
  if (!skipped) {
    for (const l of fan) {
      hires.hplot(l.x1, l.y1);
      hires.hplotTo(l.x2, l.y2);
      if (!await pace()) break;
    }
  }
  if (!skipped) {
    hires.hplot(CENTRE_LINE.x, CENTRE_LINE.y1);          // 9085
    hires.hplotTo(CENTRE_LINE.x, CENTRE_LINE.y2);
  }

  // 1001, then 1002 wipes it; 1010, then 1011 wipes that.
  const blank = ' '.repeat(Math.max(SUBLOGIC_LINE.text.length, CREDIT_LINE.text.length));
  if (!skipped) {
    hires.hcolor(3);
    hires.text(SUBLOGIC_LINE.text, SUBLOGIC_LINE.col, SUBLOGIC_LINE.row);
    if (await waitUntil(t.subLogicTo)) {
      hires.hcolor(0);
      hires.text(blank, 1, SUBLOGIC_LINE.row);
      hires.hcolor(3);
      hires.text(CREDIT_LINE.text, CREDIT_LINE.col, CREDIT_LINE.row);
      await waitUntil(t.creditTo);
    }
    hires.hcolor(0);
    hires.text(blank, 1, CREDIT_LINE.row);
  }

  // 1020-1028: the wordmark, one stroke at a time. 1026 clicks the speaker between segments;
  // the port has no click here, which is the one thing from this screen it does not do.
  const ops = logoOps();
  let last = { x: 0, y: 0 };
  const logoSeconds = Math.max(0, t.logoDoneAt - t.logoFrom);
  const perOp = (logoSeconds * 1000) / Math.max(1, ops.length);
  let opsDone = 0;
  hires.hcolor(3);
  for (const op of ops) {
    if (op.kind === 'colour') { hires.hcolor(op.value as number); continue; }
    if (op.kind === 'move') { last = { x: op.x as number, y: op.y as number }; hires.hplot(last.x, last.y); }
    else {
      hires.hplot(last.x, last.y);
      hires.hplotTo(op.x as number, op.y as number);
      last = { x: op.x as number, y: op.y as number };
    }
    if (skipped) continue;
    opsDone++;
    if (!await waitUntil(t.logoFrom + (opsDone * perOp) / 1000)) { /* finish instantly */ }
  }

  glog('start', skipped ? 'opening skipped' : 'opening played');
  // The wordmark stays up until the game takes the screen, which START does at 60 s.
  if (!skipped) await waitUntil(t.endsAt);
}
