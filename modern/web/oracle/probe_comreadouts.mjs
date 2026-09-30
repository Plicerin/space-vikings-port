// COM's twelve readout bytes, on the machine and in the port, at the same point in a new game.
//
// `com_parity.mjs` compares the drawn screen and passes, but it draws from `COM_FRESH_SHIP`, a
// fixture in the source. What it cannot see is whether the *game's own state* holds the same
// twelve values - and it did not. 38185, COM's twelfth readout, is **1** on the machine and the
// port's opening state had 100. Both are non-zero so the cell renders the same, and no pixel
// harness could ever have told them apart.
//
// The twelve are COM line 15140's ST() array, in the order lines 40 and 50 place them:
//
//   ST(1) = 38198  ST(2) = 38197  ST(3) = 38196  ST(4) = 38195
//   ST(5) = 38194  ST(6) = 38193  ST(7) = 38199  ST(8) = 38200
//   ST(9) = 38190  ST(10) = 38187 ST(11) = 38186 ST(12) = 38185
//
// Reading which programs write them is the other half of the picture, and it is short. The
// damage tick at 3205-3350 touches 38200, 38195, 38198, 38197, 38196, 38186 and 38193 and
// nothing else; H/D 15 spends 38199; the simulator's 1090 spends 38187; SHORE LEAVE's repair
// covers eleven of the twelve through its line 2500 DATA. **Nothing anywhere writes 38185**, and
// 38194 sits at 128, which line 2520's `IF D < 100` will not repair. So of the twelve cells,
// ENV, HYPER DRIVE and COM can never change at all.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';

/** ST(1)..ST(12), with the label pair lines 15000-15030 supply for each. */
const READOUTS = [
  [38198, '  1   / ENG '], [38197, '  2   / ENG '], [38196, ' COMP/NO/GO'],
  [38195, 'RADAR/NO/GO'], [38194, ' ENV /NO/GO'], [38193, ' HULL/ DMG '],
  [38199, 'POWER/ LOW '], [38200, ' SHLD/NO/GO'], [38190, 'HYPER/DRIVE'],
  [38187, ' MSL /NO/GO'], [38186, 'LASER/NO/GO'], [38185, ' COM /NO/GO'],
];

const disk = openDisk(DISK);
const simText = (() => {
  const r = disk.read(disk.files.find((f) => f.name === 'STARSHIP SIMULATOR'));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => `${l.num} ${l.text}`).join('\n');
})();

const a2 = await openOracle();
await a2.boot();
await a2.key('N');
const inSim = async () => {
  const b = await a2.readRange(0x800, 0x2000);
  const m = {};
  for (let k = 0; k < b.length; k++) m[0x800 + k] = b[k];
  try { return listProgram(m, 0x801, 0x2000).map((l) => `${l.num} ${l.text}`).join('\n') === simText; }
  catch { return false; }
};
console.log('waiting for STARSHIP SIMULATOR...');
let ok = false;
for (let i = 0; i < 900; i++) { await a2.frames(20); if (await inSim()) { ok = true; break; } }
if (!ok) { await a2.close(); throw new Error('the simulator never started'); }
await a2.frames(300);

const bytes = await a2.readRange(38185, 38201);
const diskOf = (addr) => bytes[addr - 38185];
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();

// --- the port, driven to the same place ---------------------------------------------------
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikingsState),
  null, { timeout: 30000 });
const portBytes = await page.evaluate(async () => {
  const press = (key) => new Promise((res) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, code: 'Key' + key.toUpperCase(), bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key, code: 'Key' + key.toUpperCase(), bubbles: true }));
    setTimeout(res, 700);
  });
  for (let i = 0; i < 7; i++) await press('N');
  await new Promise((r) => setTimeout(r, 2500));
  const s = window.__spaceVikingsState;
  const d = s.damage;
  return {
    38198: d.engine1Pct, 38197: d.engine2Pct, 38196: d.computerPct, 38195: d.radarPct,
    38194: d.envPct, 38193: d.hullPct, 38199: Math.round(s.energy), 38200: d.shieldsPct,
    38190: d.hyperdrivePct, 38187: s.missilesRemaining, 38186: d.laserPct, 38185: d.comsPct,
  };
});
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

console.log('');
console.log('  addr    readout        disk   port');
let bad = 0;
const rows = [];
for (const [addr, label] of READOUTS) {
  const want = diskOf(addr);
  const got = portBytes[addr];
  const same = want === got;
  if (!same) bad++;
  rows.push({ addr, label, disk: want, port: got });
  console.log(`  ${addr}  ${label.padEnd(13)} ${String(want).padStart(5)}  ${String(got).padStart(5)}` +
    (same ? '' : '   <-- differs'));
}

fs.mkdirSync('captured/comreadouts', { recursive: true });
fs.writeFileSync('captured/comreadouts/golden.json', JSON.stringify({
  source: "COM's ST() bytes read off the machine early in a new game, against the port's own state",
  readouts: rows,
}) + String.fromCharCode(10));
console.log('');
console.log(bad === 0 ? 'com readouts: all twelve agree'
  : `com readouts: ${bad} of 12 differ`);
process.exit(bad === 0 ? 0 : 1);
