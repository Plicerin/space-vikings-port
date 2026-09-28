// The planet tables, decoded from the master files and indexed the way the game indexes
// them.
//
// Every table below is located by a use site in the BASIC, not by pattern-matching the
// bytes. That matters because the tables do NOT share a base: the galaxy map reads flags
// at PEEK(38219+P) — offset P-1 — while flight reads the defence level at
// PEEK(38282+PEEK(38209)) — offset 62+P. Guessing one base for all of them puts half the
// data off by one.
//
// Planets are numbered 1..20: GALAXY MAP loops FOR P = 1 TO 20, and PEEK(38209) (the
// current planet) is compared against P inside that loop and used to index X()/Y()/Z().
import { openDisk, DISK } from './dsk.mjs';
import fs from 'fs';

const PF = 0x954c;                                     // where PLANET FILE BLOADs
const d = openDisk(DISK);
const pf = d.read(d.files.find((f) => f.name === 'PLANET FILE-M')).data;
const at = (addr) => pf[addr - PF];

const PLANETS = [];
for (let p = 1; p <= 20; p++) {
  PLANETS.push({
    planet: p,
    // GALAXY MAP 3066: IF PEEK(38219 + P) = 1 THEN HCOLOR= 2
    flag: at(38219 + p),
    // GALAXY MAP 3020: X(P)=PEEK(M+P), Y(P)=PEEK((M+P)-21), Z(P)=PEEK((M+P)-42), M=38366
    x: at(38366 + p), y: at(38345 + p), z: at(38324 + p),
    // STARSHIP SIMULATOR 8: TE = PEEK(38282 + PEEK(38209))
    // STARSHIP SIMULATOR 189: IF PEEK(38282 + PEEK(38209)) < 2 THEN (no enemies)
    defence: at(38282 + p),
  });
}

// --- P/F: one record per planet, copied into the ship's working block at runtime --------
//
// START line 220 does POKE 38823,PEEK(38392): POKE 38824,0: CALL 38825 — all three inside
// TRANLIT.OBJ0's load area — and afterwards $953C-$9541 holds the current planet's P/F
// record verbatim. probe_shipdata.mjs measured that: at the start of a new game the block
// reads 96 03 64 1e 01 01, which is P/F record 1 byte for byte.
//
// So these are six separate bytes, not a 16-bit word and some spares. Each name below
// comes from where the BASIC reads it once TRANLIT has copied it into place.
const PF_FIELDS = [
  ['destructionLimit', 38204],   //    unnamed in BASIC; the port's shipDestructionLimit
  ['shipKind', 38205],           // +1 START 230: J = PEEK(38205): IF J = 2 THEN J = 3
  ['b2', 38206],                 // +2 no use site read yet
  ['enemyShips', 38207],         // +3 STARSHIP SIMULATOR 190/192: spawn needs > 0
  ['noSpawn', 38208],            // +4 STARSHIP SIMULATOR 190/192: spawn needs = 0
  ['planet', 38209],             // +5 GALAXY MAP 3075: IF P = PEEK(38209)
];
const pfm = d.read(d.files.find((f) => f.name === 'P/F-M')).data;
const RECORDS = [];
for (let i = 0; i + 16 <= pfm.length; i += 16) {
  const r = pfm.subarray(i, i + 16);
  if (r[5] === 0 || r[5] > 20) continue;               // the trailing filler record
  const rec = { at: i };
  PF_FIELDS.forEach(([name], k) => { rec[name] = r[k]; });
  RECORDS.push(rec);
}

// There is no SHIP # 2 on the disk, which is exactly why START line 230 remaps it.
const shipFiles = new Set(d.files.filter((f) => /^SHIP # \d+$/.test(f.name)).map((f) => +f.name.slice(7)));
const resolveShip = (k) => (k === 2 ? 3 : k);          // START 230

const out = { planets: PLANETS, pf: RECORDS, notes: {
  'PLANET FILE base': '$954C (38220)',
  'unused offset 62': `at $9586 = ${at(38282)} — offset 62 is never read: the defence table is indexed 38282+P for P=1..20, so it starts at offset 63`,
  'save sentinel $95F7': `${at(38391)} (77 once a game has been saved; START line 26)`,
  'ship files on disk': [...shipFiles].sort((a, b) => a - b).join(', '),
} };
fs.writeFileSync('captured/planet_data.json', JSON.stringify(out, null, 2) + '\n');

console.log('PLANET FILE-M, indexed as the game indexes it');
console.log('');
console.log(' P  flag    X   Y   Z   defence');
for (const p of PLANETS) console.log(`${String(p.planet).padStart(2)}  ${p.flag}     ` +
  `${String(p.x).padStart(3)} ${String(p.y).padStart(3)} ${String(p.z).padStart(3)}   ${p.defence}`);

console.log('');
console.log('P/F-M records, named from where the BASIC reads them after TRANLIT copies one in');
console.log('');
console.log(' P   destroyLimit  shipKind(->file)  b2  enemyShips  noSpawn');
for (const r of RECORDS) {
  const resolved = resolveShip(r.shipKind);
  console.log(`${String(r.planet).padStart(2)}   ${String(r.destructionLimit).padStart(11)}  ` +
    `${String(r.shipKind).padStart(8)}${r.shipKind === resolved ? '     ' : ` -> ${resolved}`}` +
    `${shipFiles.has(resolved) ? '' : ' (NO SUCH SHIP FILE)'}`.padEnd(10) +
    `${String(r.b2).padStart(4)}  ${String(r.enemyShips).padStart(10)}  ${String(r.noSpawn).padStart(7)}`);
}
const missing = RECORDS.filter((r) => !shipFiles.has(resolveShip(r.shipKind)));
console.log('');
console.log(missing.length
  ? `${missing.length} record(s) name a ship shape with no file on the disk.`
  : `Every record resolves to a ship file that exists (${[...shipFiles].sort((a, b) => a - b).join(', ')}) — ` +
    'which is what START line 230\'s IF J = 2 THEN J = 3 is for.');

// --- the port -------------------------------------------------------------------------
const src = fs.readFileSync('../src/engine/extractedOriginalData.ts', 'utf8');
const rows = [...src.matchAll(/\{\s*planet:\s*(\d+),\s*tech:\s*(\d+),\s*base:\s*(\d+),\s*conquered:\s*(\d+)/g)]
  .map((m) => ({ planet: +m[1], tech: +m[2], base: +m[3], conquered: +m[4] }));

console.log('');
console.log(`--- the port's EXTRACTED_LIVE_PLANET_TABLE: ${rows.length} rows, planets ` +
  `${rows[0].planet}..${rows[rows.length - 1].planet} ---`);
for (const shift of [0, 1]) {
  const disk = [...Array(21)].map((_, i) => at(38282 + i));
  const hits = rows.filter((r, i) => r.tech === disk[i + shift]).length;
  console.log(`  port row i vs PLANET FILE offset ${62 + shift} + i: ${hits}/${rows.length} match` +
    (shift === 1 ? '   <- this is the indexing the game uses (planet P at offset 62+P)' : ''));
}
console.log(`  the disk's planet 20 has defence ${at(38282 + 20)}; the port has no planet 20.`);
console.log(`  offset 62 (value ${at(38282)}) is not a planet — no planet number indexes it.`);

// --- emit the verified table ----------------------------------------------------------
// Generated, not hand-maintained: the disk is the source, and this file says so at the top
// so nobody edits it by hand and nobody mistakes it for the unverified table beside it.
const ts = `// GENERATED by modern/web/oracle/probe_planetdata.mjs - do not edit by hand.
//
// Decoded from PLANET FILE-M and P/F-M on the original disk, indexed the way the game
// indexes them. Each field is located by a use site in the original BASIC, quoted beside
// it; the tables do not share a base, so a single base for all of them puts half the data
// off by one.
//
// Planets are numbered 1..20. GALAXY MAP loops FOR P = 1 TO 20, and PEEK(38209) - the
// current planet - is compared against P inside that loop and used to index X()/Y()/Z().

export interface DiskPlanet {
  /** 1..20, as the original numbers them. */
  planet: number;
  /** GALAXY MAP 3066: IF PEEK(38219 + P) = 1 THEN HCOLOR= 2 */
  flag: number;
  /** GALAXY MAP 3020: X(P) = PEEK(M + P), M = 38366 */
  x: number;
  /** GALAXY MAP 3020: Y(P) = PEEK((M + P) - 21) */
  y: number;
  /** GALAXY MAP 3020: Z(P) = PEEK((M + P) - 42) */
  z: number;
  /**
   * STARSHIP SIMULATOR 8: TE = PEEK(38282 + PEEK(38209))
   * STARSHIP SIMULATOR 189: IF PEEK(38282 + PEEK(38209)) < 2 THEN (no enemies appear)
   */
  defence: number;

  // The rest come from the planet's P/F record. START line 220 calls into TRANLIT.OBJ0,
  // which copies that record to $953C-$9541, and the BASIC then peeks it there.

  /** $953C. The port's shipDestructionLimit. */
  destructionLimit: number;
  /**
   * $953D. START 230: J = PEEK(38205): IF J = 2 THEN J = 3 - there is no SHIP # 2 on the
   * disk. Use resolveShipKind() rather than this raw value.
   */
  shipKind: number;
  /** $953E. No use site found yet. */
  b2: number;
  /** $953F. STARSHIP SIMULATOR 190/192: defenders only spawn while this is > 0. */
  enemyShips: number;
  /** $9540. STARSHIP SIMULATOR 190/192: spawning also requires this to be 0. */
  noSpawn: number;
}

export const DISK_PLANETS: readonly DiskPlanet[] = [
${PLANETS.map((p) => {
  const r = RECORDS.find((r) => r.planet === p.planet);
  return `  { planet: ${p.planet}, flag: ${p.flag}, x: ${p.x}, y: ${p.y}, z: ${p.z}, defence: ${p.defence}, ` +
    `destructionLimit: ${r.destructionLimit}, shipKind: ${r.shipKind}, b2: ${r.b2}, ` +
    `enemyShips: ${r.enemyShips}, noSpawn: ${r.noSpawn} },`;
}).join('\n')}
] as const;

/** START line 230: J = PEEK(38205): IF J = 2 THEN J = 3. Ship files on disk are ${[...shipFiles].sort((a, b) => a - b).join(', ')}. */
export function resolveShipKind(kind: number): number {
  return kind === 2 ? 3 : kind;
}

/** The original refuses to spawn defenders below 2. STARSHIP SIMULATOR line 189. */
export const DEFENCE_SPAWN_THRESHOLD = 2;
`;
fs.writeFileSync('../src/engine/diskPlanetData.ts', ts);
console.log('');
console.log('wrote ../src/engine/diskPlanetData.ts');
