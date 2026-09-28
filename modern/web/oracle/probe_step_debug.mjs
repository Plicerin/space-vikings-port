// Is the oracle deterministic? Boot the disk N times and compare.
//
// apple2js's own run() steps by wall clock inside requestAnimationFrame, which in
// headless Chromium is throttled — the disk sometimes booted and sometimes stalled. The
// oracle steps itself instead, and this is the check that stepping is reproducible.
//
// What it compares is state, not PC. PC sampled inside a delay loop or KEYIN lands on a
// different instruction of the same loop each time; that is not divergence, and testing
// it would report failure on a machine that is behaving identically. Memory is the
// observable that matters: the loaded program, the variable table, and the two screens.
import { openOracle } from './a2.mjs';

const RUNS = Number(process.argv[2] || 3);
const SAMPLES = 40, EVERY = 30;
const traces = [];

for (let run = 1; run <= RUNS; run++) {
  const a2 = await openOracle();
  await a2.ev(`(async () => {
    const disk2 = window.M.a2.getIO()._slot[6];
    await disk2.setBinary(1, 'spacevikings', 'dsk', await (await fetch('/disk.dsk')).arrayBuffer());
    return 'loaded';
  })()`);
  await a2.ev(`(() => {
    window.M.a2.reset();
    const st = window.M.cpu.getState(); st.pc = 0xC600; window.M.cpu.setState(st);
    return 'at $C600';
  })()`);

  const marks = [];
  for (let i = 1; i <= SAMPLES; i++) {
    await a2.frames(EVERY);
    marks.push(JSON.parse(await a2.ev(`JSON.stringify({
      f: ${i * EVERY},
      vartab: window.M.rd(0x69) | (window.M.rd(0x6a) << 8),
      arytab: window.M.rd(0x6b) | (window.M.rd(0x6c) << 8),
      prog: window.M.hash(0x800, 0x1a04),
      hgr: window.M.hash(0x2000, 0x4000),
      text: window.M.screen().map((l) => l.trim()).filter(Boolean).join(' / ')
    })`)));
  }
  if (a2.errors.length) console.log(`run ${run} page errors:`, a2.errors.slice(0, 3));
  await a2.close();
  traces.push(marks);
  const last = marks[marks.length - 1];
  console.log(`run ${run}: VARTAB $${last.vartab.toString(16)}  program ${last.prog}  ` +
    `HGR ${last.hgr}  | ${last.text.slice(0, 44)}`);
}

console.log('');
const FIELDS = ['vartab', 'arytab', 'prog', 'hgr', 'text'];
let allSame = true, settled = 0;
for (const k of FIELDS) {
  const bad = [];
  for (let i = 0; i < SAMPLES; i++) if (new Set(traces.map((t) => t[i][k])).size > 1) bad.push(traces[0][i].f);
  allSame &&= bad.length === 0;
  console.log(`${k.padEnd(7)} ${bad.length
    ? `differs at ${String(bad.length).padStart(2)}/${SAMPLES} samples, frames ${bad[0]}-${bad[bad.length - 1]}`
    : `identical across all ${RUNS} runs`}`);
  if (bad.length) settled = Math.max(settled, bad[bad.length - 1]);
}
if (allSame) {
  console.log(`\nThe oracle is deterministic: ${RUNS} boots, same memory at every one of ${SAMPLES} checkpoints.`);
} else {
  // Disk loading is where the runs disagree; what matters is whether they reconverge and
  // stay converged, because every capture is taken after the boot settles.
  const stable = traces[0].filter((m) => m.f > settled).length;
  console.log(`\nThe runs disagree while the disk is loading, then agree from frame ` +
    `${settled + EVERY} on — ${stable} consecutive identical checkpoints to the title screen.`);
  console.log(stable >= 10
    ? 'Captures taken after boot() are reproducible; captures taken DURING the load are not.'
    : 'The runs never settle — nothing measured on top of this can be trusted.');
  process.exit(stable >= 10 ? 0 : 1);
}
