// How long a `RUN` costs on the machine.
//
// Every scene change in this game is one BASIC program printing `^DRUN <name>` and DOS 3.3
// going to the disk for the next one. That is not instant, and it is not a constant either -
// it is a seek and a read, so it depends on how big the program is and where it sits.
//
// What is measured here is exactly the span the port's scene manager stands in for: from the
// frame on which the line carrying the `^DRUN` is current, to the frame on which the next
// program is loaded and running. The keyboard wait before it is not part of it - the flight
// loop only looks at the key once a pass - and nor is anything the new program then draws.
//
// Timed in video frames, because `frames()` is what ticks the drive: 262 scanlines of 65
// cycles at 1.0205 MHz is 17,030 cycles, 16.688 ms.
import { openOracle } from './a2.mjs';
import { openDisk, DISK } from './dsk.mjs';
import fs from 'fs';

const FRAME_MS = 17030 / 1020500 * 1000;

const disk = openDisk(DISK);
/**
 * A loaded program, told apart cheaply.
 *
 * Every one of these starts with a line 0 - `ONERR GOTO 63999` - so the first line number is
 * no help at all and the end of the program is what tells them apart: DOS sets PRGEND at
 * $AF/$B0 when the load finishes, which is both the signature and the signal that it is done.
 */
const signatureOf = (name) => {
  const f = disk.files.find((x) => x.name === name);
  const r = disk.read(f);
  return { name, firstLine: r.data[2] | (r.data[3] << 8), prgEnd: 0x801 + r.len, len: r.len };
};
const PROGRAMS = ['STARSHIP SIMULATOR', 'COM', 'GROUND FORCES', 'END', 'RADAR',
  'SHIP # 3 I.D.'];
const SIGS = Object.fromEntries(PROGRAMS.map((n) => [n, signatureOf(n)]));

const a2 = await openOracle();
await a2.boot();
await a2.key('N');

const sig = async () => JSON.parse(await a2.ev(`(() => {
  const c = window.M.cpu;
  return JSON.stringify({
    firstLine: c.read(0x803) | (c.read(0x804) << 8),
    prgEnd: c.read(0xAF) | (c.read(0xB0) << 8),
    curlin: c.read(0x75) | (c.read(0x76) << 8),
  });
})()`));
const isProgram = (s, name) => s.firstLine === SIGS[name].firstLine && s.prgEnd === SIGS[name].prgEnd;

console.log('the five programs, as they are told apart:');
for (const n of PROGRAMS) {
  console.log(`  ${n.padEnd(20)} ${String(SIGS[n].len).padStart(5)} bytes, `
    + `ends at $${SIGS[n].prgEnd.toString(16)}`);
}
console.log('');

console.log('waiting for STARSHIP SIMULATOR...');
let ok = false;
for (let i = 0; i < 1200; i++) {
  await a2.frames(10);
  if (isProgram(await sig(), 'STARSHIP SIMULATOR')) { ok = true; break; }
}
if (!ok) { await a2.close(); throw new Error('the simulator never started'); }
await a2.frames(200);

/**
 * Press `key`, wait for `runLine` to be the current line, then count frames until `to` is
 * loaded and running.
 */
const timeRun = async (key, runLine, to, label) => {
  await a2.key(key, { holdFrames: 20, afterFrames: 4 });
  // Wait for the line that issues the RUN. The flight loop reads the keyboard once a pass,
  // so this can be a couple of seconds and none of it is the load.
  let reached = false;
  for (let i = 0; i < 1500; i++) {
    if ((await sig()).curlin === runLine) { reached = true; break; }
    await a2.frames(1);
  }
  if (!reached) return { label, frames: null, note: `line ${runLine} never came up` };

  let frames = 0;
  let settled = 0;
  for (; frames < 1200; frames++) {
    await a2.frames(1);
    const s = await sig();
    if (isProgram(s, to) && s.curlin !== 0) {
      // Hold it for three frames so a half-loaded program cannot be mistaken for the end.
      if (++settled >= 3) break;
    } else settled = 0;
  }
  const ms = frames * FRAME_MS;
  console.log(`  ${label.padEnd(34)} ${String(frames).padStart(4)} frames  ${ms.toFixed(0).padStart(5)} ms`
    + `   (${SIGS[to].len} bytes)`);
  return { label, from: null, to, key, runLine, frames, ms: +ms.toFixed(1), bytes: SIGS[to].len };
};

console.log('a RUN, from the line that issues it to the next program running:');
const runs = [];
runs.push(await timeRun('C', 319, 'COM', 'STARSHIP SIMULATOR -> COM'));
runs.push(await timeRun('5', 130, 'STARSHIP SIMULATOR', 'COM -> STARSHIP SIMULATOR'));
runs.push(await timeRun('C', 319, 'COM', 'STARSHIP SIMULATOR -> COM again'));
runs.push(await timeRun('2', 127, 'GROUND FORCES', 'COM -> GROUND FORCES'));
runs.push(await timeRun('9', 75, 'COM', 'GROUND FORCES -> COM'));
runs.push(await timeRun('3', 133, 'RADAR', 'COM -> RADAR'));
// The ship identification screen is a `RUN` like everything else - `5005 PRINT "^DRUN SHIP #
// ";J;" I.D."` - and the four `SHIP # n I.D.` files are Applesoft programs, not binary. It
// had been listed here as a BLOAD inside RADAR, which it is not.
runs.push(await timeRun('Z', 5005, 'SHIP # 3 I.D.', 'RADAR -> ship identification'));
runs.push(await timeRun('Z', 1070, 'RADAR', 'ship identification -> RADAR'));
runs.push(await timeRun('X', 2058, 'COM', 'RADAR -> COM'));
runs.push(await timeRun('4', 132, 'END', 'COM -> END'));

if (a2.errors.length) console.log('page errors:', a2.errors.slice(0, 3));
await a2.close();

const timed = runs.filter((r) => r.frames !== null);
const ms = timed.map((r) => r.ms).sort((a, b) => a - b);
const mean = ms.reduce((a, b) => a + b, 0) / ms.length;
const median = ms.length % 2 ? ms[(ms.length - 1) / 2] : (ms[ms.length / 2 - 1] + ms[ms.length / 2]) / 2;
console.log('');
console.log(`  ${timed.length} runs: ${ms[0].toFixed(0)} ms to ${ms[ms.length - 1].toFixed(0)} ms, `
  + `mean ${mean.toFixed(0)}, median ${median.toFixed(0)}`);

fs.mkdirSync('captured/runtime', { recursive: true });
fs.writeFileSync('captured/runtime/golden.json', JSON.stringify({
  source: 'DOS 3.3 RUN timed on the machine, from the line carrying the ^DRUN to the next program running',
  frameMs: +FRAME_MS.toFixed(4),
  runs, mean: +mean.toFixed(1), median: +median.toFixed(1),
  min: ms[0], max: ms[ms.length - 1],
}) + String.fromCharCode(10));
console.log('wrote captured/runtime/golden.json');
