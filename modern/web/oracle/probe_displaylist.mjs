// Every line and point the renderer actually draws, trapped during one render.
//
// $6162 dispatches display-list opcodes through the table at $6076. The ones a model is made
// of end at two places:
//
//   $629C  JSR $6DD5   a line, from $B3/$B4 to $B5/$B6 - the bytes $68A1 produced
//   $624B  JSR $6D8F   a lone point, at $B3/$B4
//
// Trapping both gives the disk's own draw list, which is what the port's projectShipWorld()
// has to reproduce - not just the pixels, but which segments exist at all.
import { openOracle } from './a2.mjs';
import fs from 'fs';

const meta = JSON.parse(fs.readFileSync('captured/snapshot/flight.json', 'utf8'));
const b64 = fs.readFileSync('captured/snapshot/flight.bin').toString('base64');
const CAMZ = process.argv[2] === undefined ? -6401 : Number(process.argv[2]);
const s8 = (b) => (b > 127 ? b - 256 : b);

const a2 = await openOracle();
await a2.ev(`(() => { window.M.a2.reset(); return 'reset'; })()`);
await a2.frames(10);
const r = JSON.parse(await a2.ev(`(() => {
  const cpu = window.M.cpu;
  const s = atob(${JSON.stringify(b64)});
  for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
  cpu.write(0x731F, ${CAMZ & 0xff}); cpu.write(0x7320, ${(CAMZ >> 8) & 0xff});
  cpu.read(0xC050); cpu.read(0xC052); cpu.read(0xC054); cpu.read(0xC057);
  const st = cpu.getState();
  st.sp = 0xF0; st.pc = 0x6000;
  cpu.setState(st);
  cpu.write(0x01F1, 0xFF); cpu.write(0x01F2, 0x02);
  cpu.write(0x0300, 0x4C); cpu.write(0x0301, 0x00); cpu.write(0x0302, 0x03);

  const lines = [], points = [];
  let steps = 0;
  while (cpu.getPC() !== 0x0300 && steps < 8000000) {
    const pc = cpu.getPC();
    if (pc === 0x629C) {
      lines.push([cpu.read(0xB3), cpu.read(0xB4), cpu.read(0xB5), cpu.read(0xB6), cpu.read(0x9B), cpu.read(0x9C)]);
    } else if (pc === 0x624B) {
      points.push([cpu.read(0xB3), cpu.read(0xB4), cpu.read(0x9B), cpu.read(0x9C)]);
    }
    cpu.stepCycles(1);
    steps++;
  }
  return JSON.stringify({ steps, lines, points });
})()`));
await a2.close();

const lines = r.lines.map((l) => ({
  a: [s8(l[0]), s8(l[1])], b: [s8(l[2]), s8(l[3])], list: l[5] * 256 + l[4],
}));
const points = r.points.map((p) => ({ a: [s8(p[0]), s8(p[1])], list: p[3] * 256 + p[2] }));

console.log(`camera z ${CAMZ}: ${lines.length} lines and ${points.length} points in ` +
  `${r.steps.toLocaleString()} instructions`);
const bySrc = new Map();
for (const l of lines) {
  const page = l.list >> 8;
  bySrc.set(page, (bySrc.get(page) || 0) + 1);
}
console.log('  lines by the display-list page they came from: ' +
  [...bySrc.entries()].sort((a, b) => a[0] - b[0]).map(([p, n]) => `$${p.toString(16)}xx: ${n}`).join(', '));

fs.mkdirSync('captured/displaylist', { recursive: true });
const out = `captured/displaylist/z${CAMZ}.json`;
fs.writeFileSync(out, JSON.stringify({
  source: `one render from the flight snapshot at camera z ${CAMZ}, trapped at $629C and $624B`,
  cameraZ: CAMZ, lines, points,
}) + String.fromCharCode(10));
console.log(`wrote ${out}`);
