// The three sound routines, run on the machine with the speaker watched.
//
// A sound is not a picture: the only thing to compare is *when* the speaker is toggled. Each
// routine ends in an access to $C030, and the gap between two of them in CPU cycles is the
// half-period of whatever comes out. So run each one and record the cycle count at every
// access - that timeline is the waveform, and it is what a port has to reproduce.
//
//   SOUND GEN  $9276, 74 bytes, BLOADed over the hex converter at the end of $9023
//              $9270/$9271 a 16-bit shift register, $9272/$9273 the two counters,
//              $9274 the period and $9275 the sweep. Clicks at $928B.
//   LASER      $92D1, 26 bytes. Clicks at $92DB.
//   EXPL       $9270, 34 bytes - it lands ON the parameter block and the front of SOUND GEN,
//              sharing nothing with it: its own RTS is at $928E. Clicks at $927E.
//
// The BASIC sets SOUND GEN's parameters at lines 4100, 4110 and 4120 of STARSHIP SIMULATOR
// and calls it as `SG = 37494`; LASER is `LA = 37585`; EXPL is BLOADed and then called at
// 37494 as well, because it overwrites that address.
import { openOracle } from './a2.mjs';
import { openDisk, DISK } from './dsk.mjs';
import fs from 'fs';

const meta = JSON.parse(fs.readFileSync('captured/snapshot/flight.json', 'utf8'));
const b64 = fs.readFileSync('captured/snapshot/flight.bin').toString('base64');

const disk = openDisk(DISK);
const expl = disk.read(disk.files.find((f) => f.name.trim() === 'EXPL'));
const explB64 = Buffer.from(expl.data.slice(0, expl.len)).toString('base64');

// SOUND GEN's three parameter sets, from STARSHIP SIMULATOR:
//   4100  POKE 37491,10: POKE 37490,10: POKE 37492,0: POKE 37493,129
//   4110  POKE 37491,5:  POKE 37490,5:  POKE 37492,0: POKE 37493,0
//   4120  POKE 37491,7:  POKE 37490,7:  POKE 37492,0: POKE 37493,129
const JOBS = [
  { name: 'SOUND GEN line 4100', entry: 0x9276, click: 0x928b, poke: { 0x9272: 10, 0x9273: 10, 0x9274: 0, 0x9275: 129, 0x9270: 0x36, 0x9271: 0xca } },
  { name: 'SOUND GEN line 4110', entry: 0x9276, click: 0x928b, poke: { 0x9272: 5, 0x9273: 5, 0x9274: 0, 0x9275: 0, 0x9270: 0x36, 0x9271: 0xca } },
  { name: 'SOUND GEN line 4120', entry: 0x9276, click: 0x928b, poke: { 0x9272: 7, 0x9273: 7, 0x9274: 0, 0x9275: 129, 0x9270: 0x36, 0x9271: 0xca } },
  { name: 'SOUND GEN, a period of 4', entry: 0x9276, click: 0x928b, poke: { 0x9272: 8, 0x9273: 3, 0x9274: 4, 0x9275: 0, 0x9270: 0x01, 0x9271: 0x00 } },
  { name: 'SOUND GEN, sweeping down', entry: 0x9276, click: 0x928b, poke: { 0x9272: 6, 0x9273: 4, 0x9274: 20, 0x9275: 1, 0x9270: 0x7f, 0x9271: 0x3c } },
  { name: 'LASER', entry: 0x92d1, click: 0x92db, poke: {} },
  // What the game actually does: CALL 37494 arrives with Y = $76 and the carry clear, caught
  // in the running disk by probe_soundcall.mjs and predicted by $E75B's LDY $A1.
  { name: 'EXPL as the game calls it', entry: 0x9276, click: 0x927e, expl: true, y: 118, poke: {} },
  { name: 'EXPL, Y = 0', entry: 0x9276, click: 0x927e, expl: true, y: 0, poke: {} },
  { name: 'EXPL, Y = 0, carry set', entry: 0x9276, click: 0x927e, expl: true, y: 0, carry: 1, poke: {} },
  { name: 'EXPL, Y = 1', entry: 0x9276, click: 0x927e, expl: true, y: 1, poke: {} },
  { name: 'EXPL, Y = 200', entry: 0x9276, click: 0x927e, expl: true, y: 200, poke: {} },
];

const a2 = await openOracle();
await a2.ev(`(() => { window.M.a2.reset(); return 'reset'; })()`);
await a2.frames(10);

const out = [];
for (const job of JOBS) {
  const r = JSON.parse(await a2.ev(`(() => {
    const cpu = window.M.cpu;
    const s = atob(${JSON.stringify(b64)});
    for (let i = 0; i < s.length; i++) cpu.write(${meta.lo} + i, s.charCodeAt(i));
    ${job.expl ? `const e = atob(${JSON.stringify(explB64)});
    for (let i = 0; i < e.length; i++) cpu.write(0x9270 + i, e.charCodeAt(i));` : ''}
    const poke = ${JSON.stringify(job.poke)};
    for (const k of Object.keys(poke)) cpu.write(Number(k), poke[k]);
    cpu.write(0x0300, 0x4C); cpu.write(0x0301, 0x00); cpu.write(0x0302, 0x03);
    const st = cpu.getState();
    st.sp = 0xF0; st.pc = ${job.entry};
    st.a = 0; st.x = 0; st.y = ${job.y ?? 0};
    // The status register has to be set too. SOUND GEN opens with SEC so it does not care,
    // but EXPL's SEC is at $9272-$9275, BELOW the entry point the BASIC calls - so the first
    // ROL shifts in whatever carry Applesoft happened to leave, and the noise changes with it.
    st.s = ${job.carry ? 0x21 : 0x20};
    cpu.setState(st);
    cpu.write(0x01F1, 0xFF); cpu.write(0x01F2, 0x02);

    const base = cpu.getState().cycles;
    const clicks = [];
    const reads = [];
    let n = 0;
    while (cpu.getPC() !== 0x0300 && n < 4000000) {
      const hit = cpu.getPC() === ${job.click};
      cpu.stepCycles(1);
      n++;
      if (hit) {
        clicks.push(cpu.getState().cycles - base);
        reads.push(cpu.getState().a);
      }
    }
    return JSON.stringify({
      done: cpu.getPC() === 0x0300,
      total: cpu.getState().cycles - base,
      instructions: n, clicks, reads,
      state: [cpu.read(0x9270), cpu.read(0x9271), cpu.read(0x9274)],
    });
  })()`));
  out.push({ name: job.name, entry: job.entry, poke: job.poke, y: job.y ?? 0, carry: job.carry ?? 0, expl: !!job.expl, ...r });
  const gaps = r.clicks.slice(1).map((c, i) => c - r.clicks[i]);
  const uniq = [...new Set(gaps)].sort((a, b) => a - b);
  console.log(`${job.name.padEnd(26)} ${r.done ? '' : 'DID NOT RETURN '}` +
    `${String(r.clicks.length).padStart(5)} clicks in ${String(r.total).padStart(7)} cycles` +
    (gaps.length ? `, gaps ${Math.min(...gaps)}-${Math.max(...gaps)} (${uniq.length} distinct)` : ''));
}
await a2.close();

fs.mkdirSync('captured/sound', { recursive: true });
fs.writeFileSync('captured/sound/golden.json', JSON.stringify({
  source: 'SOUND GEN, LASER and EXPL run from the flight snapshot, with the cycle count recorded at every $C030 access',
  note: 'EXPL is read off the disk and spliced at $9270, which is where it BLOADs',
  jobs: out,
}) + String.fromCharCode(10));
console.log('');
console.log('wrote captured/sound/golden.json');
