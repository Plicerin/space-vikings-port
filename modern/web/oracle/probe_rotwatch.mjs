// Which code fills $60-$65 - the camera-space point $68A1 projects.
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
  cpu.read(0xC050); cpu.read(0xC052); cpu.read(0xC054); cpu.read(0xC057);
  const st = cpu.getState();
  st.sp = 0xF0; st.pc = 0x6000;
  cpu.setState(st);
  cpu.write(0x01F1, 0xFF); cpu.write(0x01F2, 0x02);
  cpu.write(0x0300, 0x4C); cpu.write(0x0301, 0x00); cpu.write(0x0302, 0x03);

  const writers = {};
  const watch = [0x60, 0x61, 0x62, 0x63, 0x64, 0x65];
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
fs.writeFileSync('captured/rot/writers.json', JSON.stringify(r.writers) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/rot/writers.json');
