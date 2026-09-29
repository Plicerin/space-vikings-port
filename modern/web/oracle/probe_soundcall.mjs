// What Applesoft's CALL actually leaves in Y and the carry, caught in the running game.
//
// EXPL is entered at $9276, and the three bytes that would set it up - `LDA #$00 / TAY / SEC`
// at $9272 - sit BELOW that. So the burst's length is whatever Y happens to hold and its
// noise depends on the carry, neither of which the routine chooses.
//
// The ROM says what Y will be. Applesoft's CALL is
//
//     $F1D5  JSR $DD67 / JSR $E752 / JMP ($0050)
//     $E75B  LDA $A0 / LDY $A1 / STY $50 / STA $51 / RTS
//
// so Y is the low byte of the address called - $76, or 118, for CALL 37494. Nothing between
// that RTS and the indirect jump touches it. The carry is left by the float-to-integer
// conversion inside $E752 and cannot be read off the page, so it is measured here instead.
//
// H/D line 8 does `NOISE = 37494: PRINT "BLOADEXPL"` and line 18 calls it, so booting the
// disk and emptying the tank reaches a real call with the real state.
import { openOracle } from './a2.mjs';
import { openDisk, DISK, asMemory } from './dsk.mjs';
import { listProgram } from './detokenise.mjs';
import fs from 'fs';

const disk = openDisk(DISK);
const textOf = (name) => {
  const r = disk.read(disk.files.find((f) => f.name === name));
  return listProgram(asMemory(r, 0x801), 0x801, 0x801 + r.len + 2)
    .map((l) => `${l.num} ${l.text}`).join('\n');
};
const SIM = textOf('STARSHIP SIMULATOR');
const HD = textOf('H/D');

const a2 = await openOracle();
await a2.boot();
await a2.key('N');

const loaded = async () => {
  const bytes = await a2.readRange(0x800, 0x2000);
  const mem = {};
  for (let k = 0; k < bytes.length; k++) mem[0x800 + k] = bytes[k];
  try { return listProgram(mem, 0x801, 0x2000).map((l) => `${l.num} ${l.text}`).join('\n'); }
  catch { return ''; }
};
const waitFor = async (wanted, tries = 600) => {
  for (let i = 0; i < tries; i++) { await a2.frames(20); if ((await loaded()) === wanted) return true; }
  return false;
};

console.log('waiting for STARSHIP SIMULATOR...');
if (!await waitFor(SIM)) { await a2.close(); throw new Error('no simulator'); }
await a2.frames(200);
console.log('setting a destination, emptying the tank, pressing H');
await a2.ev(`(() => { window.M.wr(38163, 5); window.M.wr(38199, 0); return 'w'; })()`);
await a2.frames(20);
await a2.key('H');
if (!await waitFor(HD, 400)) { await a2.close(); throw new Error('H/D never started'); }
console.log('H/D is running - waiting for it to BLOAD EXPL and call it');

// Single-step from here, watching for the entry. Stepping is slow, so do it in slices and
// give up rather than hang if the call never comes.
const r = JSON.parse(await a2.ev(`(() => {
  const cpu = window.M.cpu;
  const seen = [];
  let n = 0;
  while (n < 12000000 && seen.length < 6) {
    if (cpu.getPC() === 0x9276) {
      const st = cpu.getState();
      seen.push({ y: st.y, p: st.s, a: st.a,
        reg: cpu.read(0x9270) | (cpu.read(0x9271) << 8) });
    }
    cpu.stepCycles(1);
    n++;
  }
  return JSON.stringify({ steps: n, seen });
})()`));
await a2.close();

if (!r.seen.length) {
  console.log(`no call to $9276 in ${r.steps.toLocaleString()} instructions`);
  process.exit(1);
}
// $9276 is both the entry and the top of EXPL's own loop - $928F is `JMP $9276` - so only
// the first of these is the CALL. The rest are iterations, which is visible in Y counting
// down and the register doubling on each pass.
const call = r.seen[0];
console.log('');
console.log(`entry, then ${r.seen.length - 1} of its own iterations, in ${r.steps.toLocaleString()} instructions:`);
console.log('           Y    carry   P      $9270/$9271');
r.seen.forEach((s, i) => {
  console.log(`  ${(i === 0 ? 'the CALL' : `pass ${i}`).padEnd(9)} ${String(s.y).padStart(3)}  ` +
    `${String(s.p & 1).padStart(5)}   $${s.p.toString(16).padStart(2, '0')}    ` +
    `$${s.reg.toString(16).padStart(4, '0')}`);
});
console.log('');
console.log(`So CALL 37494 arrives with Y = ${call.y}` +
  `${call.y === 0x76 ? ' - $76, the low byte of the address, exactly as $E75B says' : ''}, ` +
  `the carry ${call.p & 1}, and the register at $${call.reg.toString(16).padStart(4, '0')} from the file.`);
console.log(`EXPL therefore runs ${call.y} iterations, not 256.`);

fs.mkdirSync('captured/sound', { recursive: true });
fs.writeFileSync('captured/sound/call.json', JSON.stringify({
  source: 'CALL 37494 trapped in the running game, reached through H/D with the tank empty',
  note: '$9276 is both the entry and the top of EXPL's loop, so entries[0] is the call and the rest are its own passes',
  entries: r.seen,
}) + String.fromCharCode(10));
console.log('wrote captured/sound/call.json');
