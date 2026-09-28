// First contact: get the original disk actually running, and prove the oracle is
// drivable — memory reads, the text screen, and hi-res page 1.
import { openOracle } from './a2.mjs';

const a2 = await openOracle();
const b = await a2.boot();
console.log(`disk in drive 1: ${b.bytes} bytes; booted after ${b.bootFrames} frames ` +
  `(~${(b.bootFrames * 16.688 / 1000).toFixed(1)}s of Apple II time)`);
console.log(`PC $${b.pc.toString(16)}  VARTAB $${b.vartab.toString(16)} — a program of ` +
  `${b.vartab - 0x801} bytes is in memory`);

console.log('\n--- the screen it stops at ---');
console.log((await a2.screen()).join('\n').replace(/\n+$/, ''));

const hgr = await a2.readRange(0x2000, 0x4000);
console.log(`\nhi-res page 1: ${hgr.filter((x) => x).length}/8192 non-zero, ` +
  `${new Set(hgr).size} distinct byte values`);
console.log('cycles since reset:', await a2.cycles());
if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();
