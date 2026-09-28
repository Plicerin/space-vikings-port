// The planet tables, decoded from the master files and indexed the way the game indexes
// them, and emitted as the port's planet data.
//
// Every field below is located by a use site in the BASIC, not by pattern-matching the
// bytes. That matters because the tables do NOT share a base: the galaxy map reads the
// "yours" flag at PEEK(38219+P) — offset P-1 — while flight reads tech at
// PEEK(38282+PEEK(38209)) — offset 62+P. Guessing one base for all of them puts half the
// data off by one.
//
// Planets are numbered 1..20: GALAXY MAP loops FOR P = 1 TO 20, and PEEK(38209) (the
// current planet) is compared against P inside that loop and used to index X()/Y()/Z().
// GALAXY MAP 15100 confirms it — S$(1) = "SOL".
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import fs from 'fs';

const PF = 0x954c;                                     // where PLANET FILE BLOADs
const d = openDisk(DISK);
const pf = d.read(d.files.find((f) => f.name === 'PLANET FILE-M')).data;
const at = (addr) => pf[addr - PF];

// --- names, from the program that prints them -----------------------------------------
// GALAXY MAP 15100-15130: S$(1) = "SOL": S$(2) = "ALPHA CENTAURI": ...
const gm = d.read(d.files.find((f) => f.name === 'GALAXY MAP'));
const gmText = listProgram(asMemory(gm, 0x801), 0x801, 0x801 + gm.len + 2)
  .map((l) => l.text).join('\n');
const NAMES = {};
for (const m of gmText.matchAll(/S\$\((\d+)\)\s*=\s*"([^"]*)"/g)) NAMES[+m[1]] = m[2];
const named = Object.keys(NAMES).length;
if (named !== 20) throw new Error(`expected 20 planet names in GALAXY MAP, found ${named}`);

// --- P/F: one record per planet, copied into the ship's working block at runtime --------
//
// START line 220 does POKE 38823,PEEK(38392): POKE 38824,0: CALL 38825 — all three inside
// TRANLIT.OBJ0's load area — and afterwards $953C-$9541 holds the current planet's P/F
// record verbatim. probe_shipdata.mjs measured that: at the start of a new game the block
// reads 96 03 64 1e 01 01, which is P/F record 1 byte for byte.
//
// So these are six separate bytes, not a 16-bit word and some spares.
const PF_FIELDS = [
  ['destructionLimit', 38204],   // +0 H/D 93: POKE 38204, TECH * 60
  ['shipKind', 38205],           // +1 START 230: J = PEEK(38205): IF J = 2 THEN J = 3
  ['groundTroopUnits', 38206],   // +2 GROUND FORCES 500: ET = PEEK(38206) * 500
  ['enemyShips', 38207],         // +3 STARSHIP SIMULATOR 190/192: spawn needs > 0
  ['noSpawn', 38208],            // +4 STARSHIP SIMULATOR 190/192: spawn needs = 0
  ['planet', 38209],             // +5 GALAXY MAP 3075: IF P = PEEK(38209)
];
const pfm = d.read(d.files.find((f) => f.name === 'P/F-M')).data;
const RECORDS = new Map();
for (let i = 0; i + 16 <= pfm.length; i += 16) {
  const r = pfm.subarray(i, i + 16);
  if (r[5] === 0 || r[5] > 20) continue;               // the trailing filler record
  const rec = {};
  PF_FIELDS.forEach(([name], k) => { rec[name] = r[k]; });
  RECORDS.set(r[5], rec);
}

// There is no SHIP # 2 on the disk, which is exactly why START line 230 remaps it.
const shipFiles = new Set(d.files.filter((f) => /^SHIP # \d+$/.test(f.name)).map((f) => +f.name.slice(7)));
const resolveShip = (k) => (k === 2 ? 3 : k);          // START 230
const SHIP_LIST = [...shipFiles].sort((a, b) => a - b).join(', ');

// PLANET FILE is eight 21-byte tables, each read as base + P with base = 38219 + 21k.
// 8 * 21 = 168 bytes, then 7 control bytes, which is the file's 175 exactly. Every base
// below is a literal that appears in the BASIC.
const TABLES = [
  ['secured', 38219],      // COM 1120/1130: IF PEEK(38219+C) = 0 ... "HAS BEEN SECURED"
  ['known', 38240],        // COM 1005: IF PEEK(38240+C) = 0 THEN "NO INFORMATION AVAILABLE"
  ['population', 38261],   // COM 1110: PRINT "POPULATION = APPROX. "; PEEK(38261+C) * 35294
  ['tech', 38282],         // GROUND FORCES 500: TECH = PEEK(38209): TECH = PEEK(38282+TECH)
  ['repairBase', 38303],   // COM 1150/1160: IF PEEK(38303+C) = 0 ... "OPERATIONAL REPAIR BASE"
  ['z', 38324],            // GALAXY MAP 3020: Z(P) = PEEK((M+P)-42), M = 38366
  ['y', 38345],            // GALAXY MAP 3020: Y(P) = PEEK((M+P)-21)
  ['x', 38366],            // GALAXY MAP 3020: X(P) = PEEK(M+P)
];
if (TABLES.length * 21 + 7 !== pf.length) {
  throw new Error(`PLANET FILE is ${pf.length} bytes; ${TABLES.length} tables of 21 plus 7 ` +
    'control bytes does not account for it');
}

const PLANETS = [];
for (let p = 1; p <= 20; p++) {
  const r = RECORDS.get(p);
  if (!r) throw new Error(`P/F-M has no record for planet ${p}`);
  const row = { planet: p, name: NAMES[p] };
  for (const [field, base] of TABLES) row[field] = at(base + p);
  PLANETS.push({ ...row, ...r });
}

const POPULATION_SCALE = 35294;   // COM 1110

fs.writeFileSync('captured/planet_data.json', JSON.stringify({ planets: PLANETS, notes: {
  'PLANET FILE base': '$954C (38220)',
  'structure': 'eight 21-byte tables at 38219 + 21k, each read as base + P for P in 1..20, then 7 control bytes',
  'unused offset 62': `at $9586 = ${at(38282)} — never read: tech is indexed 38282+P for P=1..20, so it starts at offset 63`,
  'save sentinel $95F7': `${at(38391)} (77 once a game has been saved; START line 26)`,
  'population scale': POPULATION_SCALE,
  'ship files on disk': SHIP_LIST,
} }, null, 2) + '\n');

console.log('The galaxy, as the disk has it');
console.log('');
console.log(' P  name              secured known  base    X   Y   Z   tech  ship   population  troops  enemy');
for (const p of PLANETS) {
  const resolved = resolveShip(p.shipKind);
  console.log(`${String(p.planet).padStart(2)}  ${p.name.padEnd(17)} ${p.secured}      ${p.known}     ${p.repairBase}   ` +
    `${String(p.x).padStart(3)} ${String(p.y).padStart(3)} ${String(p.z).padStart(3)}   ` +
    `${String(p.tech).padStart(4)}  ${String(p.shipKind).padStart(4)}${p.shipKind === resolved ? '   ' : `->${resolved} `}` +
    `${String(p.population * POPULATION_SCALE).padStart(11)}  ` +
    `${String(p.groundTroopUnits * 500).padStart(6)}  ${String(p.enemyShips).padStart(5)}`);
}
const missing = PLANETS.filter((p) => !shipFiles.has(resolveShip(p.shipKind)));
console.log('');
console.log(missing.length
  ? `${missing.length} planet(s) name a ship shape with no file on the disk.`
  : `Every planet resolves to a ship file that exists (${SHIP_LIST}) — which is what ` +
    "START line 230's IF J = 2 THEN J = 3 is for.");

// --- emit the port's planet data ------------------------------------------------------
const ts = `// GENERATED by modern/web/oracle/probe_planetdata.mjs - do not edit by hand.
//
// The galaxy, decoded from PLANET FILE-M, P/F-M and GALAXY MAP on the original disk.
//
// PLANET FILE is eight 21-byte tables, each read as base + P with base = 38219 + 21k:
// 8 * 21 = 168 bytes, then 7 control bytes, which is its 175 exactly. Every base below is
// a literal that appears in the BASIC, quoted beside the field it fills. They do NOT share
// a base, so reading the file as one array of records puts most of the data off by one.
//
// The disk numbers planets 1..20 (GALAXY MAP 15100: S\$(1) = "SOL"). DISK_PLANETS is
// 0-based to match the port's own convention, so DISK_PLANETS[i] is the disk's planet
// i + 1, and index 0 is SOL - the planet a new game starts at.

export interface DiskPlanet {
  /** The disk's own number, 1..20. This is DISK_PLANETS index + 1. */
  planet: number;
  /** GALAXY MAP 15100-15130: S\$(P). Upper case, as the original prints it. */
  name: string;
  /** 38219+P. COM 1120/1130: PRINT S\$(C);" HAS BEEN SECURED" - the planet is yours. */
  secured: boolean;
  /** 38240+P. COM 1005: IF PEEK(38240+C) = 0 THEN "NO INFORMATION AVAILABLE AT THIS TIME." */
  known: boolean;
  /** 38261+P. COM 1110: PRINT "POPULATION = APPROX. "; PEEK(38261+C) * 35294. */
  population: number;
  /**
   * 38282+P. GROUND FORCES 500 names it: TECH = PEEK(38209): TECH = PEEK(38282 + TECH).
   * STARSHIP SIMULATOR 189: defenders only appear at tech >= 2.
   */
  tech: number;
  /** 38303+P. COM 1150/1160: "THERE IS AN OPERATIONAL REPAIR BASE ON THE PLANET." */
  repairBase: boolean;
  /** 38324+P. GALAXY MAP 3020: Z(P) = PEEK((M + P) - 42), M = 38366. */
  z: number;
  /** 38345+P. GALAXY MAP 3020: Y(P) = PEEK((M + P) - 21). */
  y: number;
  /** 38366+P. GALAXY MAP 3020: X(P) = PEEK(M + P). */
  x: number;

  // The rest come from the planet's P/F record. START line 220 calls into TRANLIT.OBJ0,
  // which copies that record to $953C-$9541, and the BASIC then peeks it there.

  /** $953C. H/D 93: POKE 38204, TECH * 60. */
  destructionLimit: number;
  /**
   * $953D, raw. START 230: J = PEEK(38205): IF J = 2 THEN J = 3 - there is no SHIP # 2 on
   * the disk. Use resolveShipKind() rather than this value.
   */
  shipKind: number;
  /** $953E. GROUND FORCES 500: enemy ground troops = this * 500. */
  groundTroopUnits: number;
  /** $953F. STARSHIP SIMULATOR 190/192: defenders only spawn while this is > 0. */
  enemyShips: number;
  /** $9540. STARSHIP SIMULATOR 190/192: spawning also requires this to be 0. */
  noSpawn: number;
}

export const DISK_PLANETS: readonly DiskPlanet[] = [
${PLANETS.map((p) => `  { planet: ${p.planet}, name: ${JSON.stringify(p.name)}, ` +
  `secured: ${!!p.secured}, known: ${!!p.known}, population: ${p.population}, ` +
  `tech: ${p.tech}, repairBase: ${!!p.repairBase}, x: ${p.x}, y: ${p.y}, z: ${p.z}, ` +
  `destructionLimit: ${p.destructionLimit}, shipKind: ${p.shipKind}, ` +
  `groundTroopUnits: ${p.groundTroopUnits}, enemyShips: ${p.enemyShips}, noSpawn: ${p.noSpawn} },`).join('\n')}
] as const;

/** START line 230: J = PEEK(38205): IF J = 2 THEN J = 3. Ship files on disk are ${SHIP_LIST}. */
export function resolveShipKind(kind: number): number {
  return kind === 2 ? 3 : kind;
}

/** COM 1110: PRINT "POPULATION = APPROX. "; PEEK(38261 + C) * 35294. */
export const POPULATION_SCALE = ${POPULATION_SCALE};

/** GROUND FORCES 500: ET = PEEK(38206) * 500. */
export const GROUND_TROOPS_PER_UNIT = 500;

/** STARSHIP SIMULATOR 189: IF PEEK(38282 + PEEK(38209)) < 2 THEN (no enemies appear). */
export const TECH_SPAWN_THRESHOLD = 2;
`;
fs.writeFileSync('../src/engine/diskPlanetData.ts', ts);
console.log('');
console.log('wrote ../src/engine/diskPlanetData.ts');
