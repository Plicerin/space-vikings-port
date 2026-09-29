// Which code fills $7E-$8F - the nine Q15 matrix entries the transform multiplies by.
//
// Rather than read the renderer looking for it, run one render from the flight snapshot and
// record the PC every time $60 changes. Whatever writes it is the end of the rotation chain.
import { openOracle } from './a2.mjs';
import fs from 'fs';

const meta = JSON.parse(fs.readFileSync('captured/snapshot/flight.json', 'utf8'));
const b64 = fs.readFileSync('captured/snapshot/flight.bin').toString('base64');

const a2 = await openOracle();
await a2.ev(`(() => { window.M.a2.reset(); return 'reset'; })()`);
await a2.frames(10);

const r = JSON.parse(await a2.ev(`(() => {
  const cpu = window.M.cpu;
  const s = atob(${JSON.stringify(b64)});
  for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
  cpu.write(0x7321, 32); cpu.write(0x7323, 16);   // pitch and heading, so the off-diagonals move
  cpu.read(0xC050); cpu.read(0xC052); cpu.read(0xC054); cpu.read(0xC057);
  const st = cpu.getState();
  st.sp = 0xF0; st.pc = 0x6000;
  cpu.setState(st);
  cpu.write(0x01F1, 0xFF); cpu.write(0x01F2, 0x02);
  cpu.write(0x0300, 0x4C); cpu.write(0x0301, 0x00); cpu.write(0x0302, 0x03);

  const writers = {};
  const watch = [0x7E, 0x7F, 0x80, 0x81, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8A, 0x8B, 0x8C, 0x8D, 0x8E, 0x8F];
  let prev = watch.map((a) => cpu.read(a));
  let steps = 0;
  while (cpu.getPC() !== 0x0300 && steps < 3000000) {
    const pc = cpu.getPC();
    cpu.stepCycles(1);
    steps++;
    for (let i = 0; i < watch.length; i++) {
      const now = cpu.read(watch[i]);
      if (now !== prev[i]) {
        const key = pc.toString(16) + ':' + watch[i].toString(16);
        writers[key] = (writers[key] || 0) + 1;
        prev[i] = now;
      }
    }
  }
  return JSON.stringify({ steps, writers });
})()`));
await a2.close();

console.log(`instructions in one render: ${r.steps.toLocaleString()}`);
console.log('');
console.log('PC and the byte it changed, most often first:');
const rows = Object.entries(r.writers).sort((a, b) => b[1] - a[1]);
for (const [key, n] of rows.slice(0, 20)) {
  const [pc, addr] = key.split(':');
  console.log(`  $${pc.padStart(4, '0')}  ->  $${addr}   ${n} times`);
}
fs.mkdirSync('captured/rot', { recursive: true });
fs.writeFileSync('captured/rot/matrix-writers.json', JSON.stringify(r.writers) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/rot/matrix-writers.json');
