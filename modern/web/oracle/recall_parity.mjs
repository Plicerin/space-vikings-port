// The port's RECALL against the original's, all five branches.
//
// RECALL draws over COM's screen by way of GROUND FORCES, which has already blanked rows
// 1-12, so the comparison replays that chain: panel, lamps, needles, COM with its line 8
// erase, then GROUND FORCES' line 12 clear, then RECALL's box and message.
//
// `captured/recall/branches.json` has all five, run on the disk by probe_recallbranches.mjs -
// 2005 needed Applesoft's own `TR` zeroed mid-startup, because it is read off the MISC FILE
// and there is no poking a DOS file.
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const branches = JSON.parse(fs.readFileSync('captured/recall/branches.json', 'utf8'));
const comGolden = JSON.parse(fs.readFileSync('captured/com/readouts.json', 'utf8'));
const tableJson = JSON.parse(fs.readFileSync('../public/data/shapes/shape-table.json', 'utf8'));
const comBytes = comGolden.healthy.bytes;
const cases = branches.branches.filter((b) => b.screen);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.drawRecall), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose drawRecall - is the dev server running at ' + PORT_URL + '?'); });

const shots = await page.evaluate(({ tj, bytes, jobs }) => {
  const sv = window.__spaceVikings;
  const shapes = sv.decodeShapeTableJson(tj);
  return jobs.map((j) => {
    const c = document.createElement('canvas');
    c.width = 560; c.height = 384;
    const h = new sv.Hires(c);
    h.hgr();
    sv.drawInstruments(h);
    sv.drawPanelNeedles(h, shapes, { bank: 0, pitch: 0, speed: 120, energy: bytes['38199'] });
    sv.drawComMainScreen(h, bytes, shapes);
    // GROUND FORCES line 12, run from line 65 on the way out: rows 1-12, columns 1-18.
    h.hcolor(1);
    for (let r = 2; r <= 13; r++) h.text(' '.repeat(18), 2, r);
    const r = sv.recallMessage(j.inputs);
    sv.drawRecall(h, r.lines);
    return { on: Array.from(h.snapshot().on), line: r.line, newLocation: r.newLocation };
  });
}, {
  tj: tableJson, bytes: comBytes,
  jobs: cases.map((b) => ({
    inputs: {
      planet: b.before['38209'], troopPlanet: b.before['38158'],
      // 2005 is the one the disk reached with TR at zero; the rest ran with the file's 2000.
      troops: b.line === 2005 ? 0 : 2000,
      location: b.before['38166'],
    },
  })),
});
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

// Rows 184 to 190 hold the DOS command line the previous program echoed when it ran RECALL -
// GROUND FORCES' own `PRINT D$;"RUN RECALL"`. It is on the page before RECALL draws anything
// and RECALL never touches it, so it is not RECALL's output and the port's replay chain does
// not produce it. 231 pixels of it, identically in all five captures.
const ECHO_ROW = 184;

let fail = 0;
console.log(`comparing rows 0-${ECHO_ROW - 1}; ${ECHO_ROW}-191 is the DOS echo of "RUN RECALL"`);
console.log('  line   disk lit   port lit   differ   agree      branch   38166');
for (let i = 0; i < cases.length; i++) {
  const b = cases[i];
  const s = shots[i];
  const diskOn = new Uint8Array(HGR_W * HGR_H);
  for (const [x, y] of b.screen.points) diskOn[y * HGR_W + x] = 1;
  const portOn = Uint8Array.from(s.on);
  let diff = 0, diskLit = 0, portLit = 0, cells = 0;
  for (let k = 0; k < diskOn.length; k++) {
    if (((k / HGR_W) | 0) >= ECHO_ROW) continue;
    cells++;
    if (diskOn[k]) diskLit++;
    if (portOn[k]) portLit++;
    if (diskOn[k] !== portOn[k]) diff++;
  }
  // The port's own branch choice, and what it says 38166 becomes, against what the disk did.
  const pokes = s.newLocation !== null;
  const expectAfter = pokes ? s.newLocation : b.before['38166'];
  const branchOk = s.line === b.line;
  const pokeOk = expectAfter === b.after;
  if (diff !== 0 || !branchOk || !pokeOk) fail++;
  console.log(`  ${b.line}   ${String(diskLit).padStart(8)}   ${String(portLit).padStart(8)}   ` +
    `${String(diff).padStart(6)}   ${(100 * (1 - diff / cells)).toFixed(3)}%   ` +
    `${branchOk ? 'ok' : `PORT SAYS ${s.line}`}       ${pokeOk ? 'ok' : `port ${expectAfter}, disk ${b.after}`}`);
  fs.writeFileSync(`captured/recall/port-${b.line}.png`, toPng(portOn));
  if (diff) {
    const d = new Uint8Array(diskOn.length);
    for (let k = 0; k < d.length; k++) d[k] = diskOn[k] === portOn[k] ? 0 : 1;
    fs.writeFileSync(`captured/recall/diff-${b.line}.png`, toPng(d, { colour: [255, 0, 0] }));
  }
}

// 2005 and 2030 are only told apart by TR, so they had better not be the same page.
const p2005 = shots[cases.findIndex((b) => b.line === 2005)];
const p2030 = shots[cases.findIndex((b) => b.line === 2030)];
if (p2005 && p2030) {
  const same = p2005.on.every((v, k) => v === p2030.on[k]);
  if (same) fail++;
  console.log('');
  console.log(`  2005 and 2030 are different pages in the port: ${same ? 'NO - FAILED' : 'yes'}`);
}

console.log('');
console.log(fail === 0 ? 'RECALL: all five branches exact' : `RECALL: ${fail} branch(es) differ`);
process.exit(fail === 0 ? 0 : 1);
