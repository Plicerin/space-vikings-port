// What does the disk actually set up when you start a new game?
//
// current_status.md says the port initialises the opening from a later paused capture
// (y=210, z=-6761, heading=255, pitch=248) while START.bas documents X=700, Y=200,
// Z=-7000, H=0. Both may be real; the question is which instant each belongs to. This
// reads Applesoft's own variable table — names and all — at three moments: the title,
// the instant after (N)EW is answered, and a few seconds into play.
import { openOracle, VAR_READER } from './a2.mjs';

const a2 = await openOracle();
await a2.boot();
await a2.ev(VAR_READER);

const snap = async (label) => {
  await a2.pause();
  const s = JSON.parse(await a2.ev(`JSON.stringify(window.M.vars())`));
  const screen = (await a2.screen()).filter((l) => l.trim());
  await a2.resume();
  return { label, ...s, screen };
};
const show = (s) => {
  console.log(`\n=== ${s.label} ===`);
  console.log(`TXTTAB $${s.TXTTAB.toString(16)}  VARTAB $${s.VARTAB.toString(16)}  ARYTAB $${s.ARYTAB.toString(16)}  (${s.count} simple variables)`);
  if (s.screen.length) console.log('screen: ' + s.screen[s.screen.length - 1].slice(0, 60));
  const fmt = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? v : +v.toFixed(4)) : JSON.stringify(v));
  console.log(s.vars.map((v) => `${v.name}=${fmt(v.value)}`).join('  '));
};

// wait for the title prompt
for (let i = 0; i < 40 && !(await a2.screen()).some((l) => l.includes('NEW GAME')); i++) await a2.waitMs(500);
show(await snap('at the title prompt'));

await a2.key('N');
await a2.waitMs(1500);
show(await snap('immediately after answering (N)EW'));

await a2.waitMs(6000);
show(await snap('~7s into the new game'));

if (a2.errors.length) console.log('\npage errors:', a2.errors.slice(0, 3));
await a2.close();
