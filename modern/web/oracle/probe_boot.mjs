// First contact: get the original disk actually running, and prove the oracle is
// drivable — memory reads, the text screen, and hi-res page 1.
//
// apple2js's machine reset() does not re-run the Autostart ROM's slot scan, so a reset
// with a disk in the drive still lands at the `]` prompt. PR#6 is what a person would
// type there, and it is what boots the disk.
import { openOracle } from './a2.mjs';

const a2 = await openOracle();
const loaded = await a2.boot();
console.log('disk in drive 1:', loaded.bytes, 'bytes;', loaded.bootedAt >= 0 ? `left ROM after ${loaded.bootedAt}ms` : loaded.note);

const atPrompt = (await a2.screen()).some((l) => l.trim().endsWith(']'));
if (atPrompt || loaded.bootedAt < 0) {
  console.log('at the BASIC prompt — typing PR#6 to boot slot 6');
  for (const ch of 'PR#6') await a2.key(ch);
  await a2.key(13);
}

let last = '';
for (let i = 0; i < 40; i++) {
  await a2.waitMs(500);
  const [screen, pc] = [await a2.screen(), await a2.pc()];
  const joined = screen.filter((l) => l.trim()).join('\n');
  if (joined !== last) {
    console.log(`\n--- t=${((i + 1) * 0.5).toFixed(1)}s  PC=$${pc.toString(16).padStart(4, '0')}`);
    console.log(joined || '(text screen empty — graphics mode)');
    last = joined;
  }
}

const hgr = await a2.readRange(0x2000, 0x4000);
const nz = hgr.filter((b) => b).length;
const distinct = new Set(hgr).size;
console.log('\n=== after 20s ===');
console.log('PC $' + (await a2.pc()).toString(16), ' cycles', await a2.cycles());
console.log(`hi-res page 1: ${nz}/8192 non-zero, ${distinct} distinct byte values`);
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
