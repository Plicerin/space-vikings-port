// What is in the ship's working block once a new game has started?
//
// SHIP'S DATA-M is 54 bytes BLOADed to $9506, so it ends at $953B. But the BASIC peeks
// well past that: PEEK(38205) = $953D picks the ship shape (START 230), PEEK(38209) =
// $9541 is the current planet (GALAXY MAP 3075 compares it against P in 1..20), and
// PEEK(38211..38219) = $9543-$954B is the saved ship state (START 225).
//
// Nothing on the disk BLOADs into $953C-$954B, so something writes it at runtime — most
// likely TRANLIT.OBJ0, which START line 220 calls as
//   POKE 38823, PEEK(38392): POKE 38824,0: CALL 38825
// with all three addresses inside TRANLIT.OBJ0's own load area ($9600-$9958).
//
// Rather than reason about it, watch the block through a new game.
import { openOracle } from './a2.mjs';

const BASE = 0x9506, END = 0x954c;                       // SHIP'S DATA .. start of PLANET FILE

const a2 = await openOracle();
await a2.boot();
console.log('answering (N)EW\n');
await a2.key('N');

const show = (label, bytes) => {
  console.log(`--- ${label} ---`);
  for (let i = 0; i < bytes.length; i += 16) {
    const row = bytes.slice(i, i + 16);
    console.log(`$${(BASE + i).toString(16)} ${String(BASE + i).padStart(5)} +${String(i).padStart(2)}  ` +
      row.map((b) => b.toString(16).padStart(2, '0')).join(' '));
  }
};

let last = '';
for (let i = 1; i <= 90; i++) {
  await a2.frames(60);
  const bytes = await a2.readRange(BASE, END);
  const key = bytes.join(',');
  if (key === last) continue;
  last = key;
  show(`after ${i * 60} frames`, bytes);
  console.log('');
}

const b = await a2.readRange(BASE, END);
const rd = (addr) => b[addr - BASE];
console.log('=== the fields the BASIC names ===');
console.log(`  38157 $${(38157).toString(16)}  speed        = ${rd(38157)}   (STARSHIP SIMULATOR 8: S = PEEK(38157))`);
console.log(`  38205 $${(38205).toString(16)}  ship shape   = ${rd(38205)}   (START 230: J = PEEK(38205); ships on disk are 0,1,3,4)`);
console.log(`  38209 $${(38209).toString(16)}  planet       = ${rd(38209)}   (GALAXY MAP 3075: IF P = PEEK(38209), P in 1..20)`);
console.log(`  38199 $${(38199).toString(16)}  E            = ${rd(38199)}   (STARSHIP SIMULATOR 8: E = PEEK(38199))`);
console.log(`  38210 $${(38210).toString(16)}  atmosphere?  = ${rd(38210)}   (STARSHIP SIMULATOR 156/158 gate RE and ORBIT on it)`);
console.log(`  38207 $${(38207).toString(16)}               = ${rd(38207)}   (STARSHIP SIMULATOR 190/192: enemy spawn needs > 0)`);
console.log(`  38208 $${(38208).toString(16)}               = ${rd(38208)}   (STARSHIP SIMULATOR 190/192: spawn needs = 0)`);
console.log(`  38211-38219 ship state = ${[...Array(9)].map((_, i) => rd(38211 + i)).join(' ')}   (START 225, OLD game only)`);
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
