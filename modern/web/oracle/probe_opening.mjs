// What is the ship's state at the start of a NEW game?
//
// The title program (captured/title.bas, listed out of memory) answers it at line 190:
//   BV%=-7000: GOSUB 6000: POKE ZI,LO%: POKE ZI+1,HI%   (ZI = $731F)
//   BV%=700:   ... POKE XI ...                          (XI = $731B)
//   BV%=200:   ... POKE YI ...                          (YI = $731D)
//   195 POKE H1,0                                       (H1 = $7323)
// and then line 225 overwrites the whole block from SHIP'S DATA for an OLD game only.
//
// That is the claim. This is the measurement: answer (N)EW and watch $731B-$7323 until
// it stops changing, so the value is read from the machine and not from the listing.
import { openOracle } from './a2.mjs';

const a2 = await openOracle();
await a2.boot();

await a2.ev(`(() => {
  const rd = window.M.rd;
  const s16 = (a) => { const v = rd(a) | (rd(a + 1) << 8); return v > 32767 ? v - 65536 : v; };
  window.M.ship = () => ({
    X: s16(0x731b), Y: s16(0x731d), Z: s16(0x731f),
    pitch: rd(0x7321), bank: rd(0x7322), heading: rd(0x7323),
    raw: [...Array(9)].map((_, i) => rd(0x731b + i).toString(16).padStart(2, '0')).join(' '),
  });
  return 'ok';
})()`);

console.log('answering (N)EW\n');
await a2.key('N');

let last = '';
for (let i = 1; i <= 120; i++) {
  await a2.frames(30);
  const s = JSON.parse(await a2.ev(`JSON.stringify({
    ...window.M.ship(),
    vartab: window.M.rd(0x69) | (window.M.rd(0x6a) << 8),
    line: window.M.rd(0x75) | (window.M.rd(0x76) << 8)
  })`));
  const key = s.raw;
  if (key === last) continue;
  last = key;
  console.log(`${String(i * 30).padStart(5)}f  $731B: ${s.raw}   ` +
    `X=${String(s.X).padStart(6)} Y=${String(s.Y).padStart(5)} Z=${String(s.Z).padStart(7)}  ` +
    `pitch=${String(s.pitch).padStart(3)} bank=${String(s.bank).padStart(3)} heading=${String(s.heading).padStart(3)}` +
    `   [BASIC line ${s.line}, VARTAB $${s.vartab.toString(16)}]`);
}

console.log('\nfinal screen:');
console.log((await a2.screen()).filter((l) => l.trim()).join('\n'));
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
