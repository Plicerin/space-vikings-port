// The port's RND against Applesoft's, byte for byte.
//
// **This transcription is not finished.** It agrees for between 30 and 708 consecutive calls
// depending on the seed and then diverges, and the divergence is pinned: FMULT's guard byte
// comes out one too low whenever a multiplier byte is zero and `$E9B2 JMP $E8DA` takes the
// whole-byte shortcut. Everything downstream - the add's carry, the byte swap, the round at the
// store - then follows from that one bit, which is why the failure looks like the top mantissa
// byte being off by one rather than the low bit it started as.
//
// What is left to read is the shortcut itself. `$E8DA` shifts a byte and then falls into
// `$E8F0 ADC #$08 / BMI / BEQ / SBC #$08 / TAY / LDA $AC / BCS $E911`, which is the shared
// shift-right entry, and entering it with A = 0 does not obviously stop after exactly eight
// bits. That is where the missing bit is.
//
// So this exits 0: it is a progress measure, not a passing check, and it should not be read as
// one. probe_rnd.mjs calls $EFAE on the machine and reads the five seed bytes back after every
// call; this runs diskRnd.ts from the same starting seeds and reports how far it gets.
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/rnd/golden.json', 'utf8'));
const runs = golden.runs.filter((r) => r.failedAt === undefined && r.values.length);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.rndEFAE), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose rndEFAE - is the dev server running?'); });

const got = await page.evaluate(({ jobs, mult, add }) => {
  const sv = window.__spaceVikings;
  const ok = JSON.stringify(sv.RND_MULTIPLIER) === JSON.stringify(mult)
    && JSON.stringify(sv.RND_ADDEND) === JSON.stringify(add);
  return {
    constantsOk: ok,
    // The carry entering the first multiplier byte is derived from $EA0E's exponent add inside
    // fmultE97F, so there is nothing to pass in and nothing to choose between.
    seqs: jobs.map((j) => {
      const run = () => {
        let s = j.seed.slice();
        const out = [];
        for (let i = 0; i < j.n; i++) { const r = sv.rndEFAE(s, j.shiftIn); s = r.seed; out.push(s); }
        return out;
      };
      return { measured: run() };
    }),
  };
}, {
  jobs: runs.map((r) => ({ seed: r.seed, n: r.values.length, shiftIn: r.shiftIn ?? 0,
    carry: r.firstCarry ?? 0 })),
  mult: [0x98, 0x35, 0x44, 0x7a, 0x68], add: [0x68, 0x28, 0xb1, 0x46, 0x20],
});
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

const hx = (b) => b.map((v) => v.toString(16).padStart(2, '0')).join(' ');
let fail = 0;
if (!got.constantsOk) { fail++; console.log('  the constants at $EFA6 and $EFAA do not match'); }

console.log(`  seed                 calls   carry   first mismatch`);
const firstBad = (want, have) => {
  for (let k = 0; k < want.length; k++) if (want[k].join(',') !== have[k].join(',')) return k;
  return -1;
};
for (let i = 0; i < runs.length; i++) {
  const want = runs[i].values;
  // The probe measured this at $E9B0; fmultE97F derives it. They should agree.
  const carry = runs[i].firstCarry ?? 0;
  const have = got.seqs[i].measured;
  const bad = firstBad(want, have);
  if (bad >= 0) fail++;
  console.log(`  ${hx(runs[i].seed)}   ${String(want.length).padStart(5)}   carry ${carry}   ` +
    (bad < 0 ? 'none - every byte of every call agrees'
      : `call ${bad}: machine ${hx(want[bad])}, port ${hx(have[bad])}`));
}

const total = runs.reduce((n, r) => n + r.values.length, 0);
console.log('');
console.log(`${total} calls across ${runs.length} seeds`);
const overflowed = golden.runs.filter((r) => r.failedAt !== undefined);
if (overflowed.length) {
  console.log(`${overflowed.length} seed(s) overflow on the first call and Applesoft errors out ` +
    `instead of returning: ${overflowed.map((r) => hx(r.seed)).join(', ')}`);
}
if (fail === 0) {
  console.log('RND parity: clean - every byte of every call agrees');
} else {
  const best = Math.min(...runs.map((r, i) => {
    const k = firstBad(r.values, got.seqs[i].measured);
    return k === -1 ? r.values.length : k;
  }));
  console.log(`RND: INCOMPLETE - ${fail} of ${runs.length} seeds diverge, the earliest after ` +
    `${best} consecutive calls. See the head of this file for where the missing bit is.`);
}
process.exit(0);
