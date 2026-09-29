// The port's STATUS against the original's, both screens.
//
// captured/status/golden.json is the original, reached from flight by C, 1, 4 and captured
// after line 50's disk read has finished. drawStatusReport() and drawTroopReport() are pure,
// so they can be called on a throwaway Hires and diffed the way COM's screen was.
//
// STATUS never touches rows 124-191, so the instrument panel is still standing underneath
// it - panel, lamps and needles, exactly as in com_parity.
import { HGR_W, HGR_H, toPng } from './hgr.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/status/golden.json', 'utf8'));
const tableJson = JSON.parse(fs.readFileSync('../public/data/shapes/shape-table.json', 'utf8'));
const B = golden.bytes;

// The disk's bytes, named by the line that reads them.
const data = {
  planetIndex: B['38209'] - 1,        // line 1235 READs PEEK(38209) names, so it is 1-based
  stardate: golden.misc.SD,
  troops: golden.misc.TR,
  credits: golden.misc.CR,
  energy: B['38199'], shields: B['38200'], condition: B['38165'],
  hull: B['38193'], missiles: B['38187'],
  computer: B['38196'], hyperdrive: B['38190'], radar: B['38195'], laser: B['38186'],
  engine1: B['38198'], engine2: B['38197'],
  morale: B['38203'], troopLocation: B['38166'],
  fighters: B['38156'], transports: B['38155'], tanks: B['38154'], groundMissiles: B['38153'],
  troopsAlive: B['38167'] * 256 + B['38159'],
  // Not STATUS's, but the panel underneath still carries the needles flight left.
  needles: { bank: B['29474'], pitch: B['29473'], speed: B['38157'], energy: B['38199'] },
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.drawStatusReport), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose drawStatusReport - is the dev server running at ' + PORT_URL + '?'); });

const shots = await page.evaluate(({ d, tj }) => {
  const sv = window.__spaceVikings;
  const shapes = sv.decodeShapeTableJson(tj);
  const draw = (fn) => {
    const c = document.createElement('canvas');
    c.width = 560; c.height = 384;
    const h = new sv.Hires(c);
    h.hgr();
    sv.drawInstruments(h);
    sv.drawPanelNeedles(h, shapes, d.needles);
    // STATUS is reached through COM, whose line 8 wipes the speed and energy tracks.
    sv.eraseComNeedleTracks(h, shapes);
    fn(h, d);
    return Array.from(h.snapshot().on);
  };
  return { screen1: draw(sv.drawStatusReport), screen2: draw(sv.drawTroopReport) };
}, { d: data, tj: tableJson });
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

fs.mkdirSync('captured/status', { recursive: true });
const REPORT_BOTTOM = 123;
for (const name of ['screen1', 'screen2']) {
  const diskOn = new Uint8Array(HGR_W * HGR_H);
  for (const [x, y] of golden[name].points) diskOn[y * HGR_W + x] = 1;
  const portOn = Uint8Array.from(shots[name]);

  const region = (from, to) => {
    let both = 0, onlyDisk = 0, onlyPort = 0, diskLit = 0, portLit = 0;
    for (let y = from; y <= to; y++) for (let x = 0; x < HGR_W; x++) {
      const k = y * HGR_W + x;
      if (diskOn[k]) diskLit++;
      if (portOn[k]) portLit++;
      if (diskOn[k] && portOn[k]) both++;
      else if (diskOn[k]) onlyDisk++;
      else if (portOn[k]) onlyPort++;
    }
    const px = (to - from + 1) * HGR_W;
    return { diskLit, portLit, both, onlyDisk, onlyPort, px, agree: 1 - (onlyDisk + onlyPort) / px };
  };
  const r = region(0, REPORT_BOTTOM);
  const panel = region(REPORT_BOTTOM + 1, HGR_H - 1);
  console.log(`${name}, the report itself (rows 0-${REPORT_BOTTOM}):`);
  console.log(`  disk ${r.diskLit} lit, port ${r.portLit} lit, ${r.both} in both`);
  console.log(`  ${r.onlyDisk + r.onlyPort} of ${r.px} differ  (${(100 * r.agree).toFixed(2)}% agree)`);
  console.log(`    ${r.onlyDisk} disk only, ${r.onlyPort} port only`);
  console.log(`  panel below: ${panel.onlyDisk + panel.onlyPort} of ${panel.px} differ  (${(100 * panel.agree).toFixed(2)}%)`);

  const perRow = new Uint16Array(HGR_H);
  for (let k = 0; k < diskOn.length; k++) {
    if (diskOn[k] !== portOn[k]) perRow[(k / HGR_W) | 0]++;
  }
  const rows = [...perRow.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  if (rows.length) {
    console.log(`  ${rows.length} rows differ; worst: ` + rows.slice(0, 6).map(([y, n]) => `${y}(${n})`).join(' '));
  }
  console.log('');
  fs.writeFileSync(`captured/status/${name}-port.png`, toPng(portOn));
  const diff = new Uint8Array(diskOn.length);
  for (let k = 0; k < diff.length; k++) diff[k] = diskOn[k] === portOn[k] ? 0 : 1;
  fs.writeFileSync(`captured/status/${name}-diff.png`, toPng(diff, { colour: [255, 0, 0] }));
}
console.log('wrote captured/status/*-port.png and *-diff.png');
