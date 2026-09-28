// List the BASIC program the disk actually loaded.
//
// This is the game's own source, recovered from the machine rather than from anyone's
// notes — so it can say, with evidence, what the opening state is and what those
// pokeable addresses ($731B and friends) are for.
import { openOracle } from './a2.mjs';
import { listProgram } from './detokenise.mjs';
import fs from 'fs';

const a2 = await openOracle();
const b = await a2.boot();
const VARTAB = b.vartab;

const mem = {};
const bytes = await a2.readRange(0x800, VARTAB + 2);
for (let i = 0; i < bytes.length; i++) mem[0x800 + i] = bytes[i];

const lines = listProgram(mem, 0x801, VARTAB + 2);
const out = lines.map((l) => `${l.num} ${l.text}`).join('\n');
fs.writeFileSync('captured/title.bas', out + '\n');
console.log(`${lines.length} lines, ${VARTAB - 0x801} bytes, lines ${lines[0].num}-${lines[lines.length - 1].num}`);
console.log('written to captured/title.bas\n');
console.log(out);
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
