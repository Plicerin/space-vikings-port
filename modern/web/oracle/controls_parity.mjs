// The flight controls, port against machine.
//
// Two halves. The first expands the port's run-length tables to 256 entries each and compares
// them value by value against captured/controls/golden.json, so a range cannot drift from the
// 6502 without this failing. The second plays the game and holds a key, because tables that
// match prove nothing if nothing calls them - which was exactly the state of this module
// before: probe_controls.mjs measured all of it and no harness consumed it.
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const golden = JSON.parse(fs.readFileSync('captured/controls/golden.json', 'utf8'));

const results = [];
const check = (what, ok, detail = '') => {
  results.push({ what, ok, detail });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? '   ' + detail : ''}`);
};

/** Compare two 256-entry tables and report the first few disagreements. */
function sameTable(name, mine, theirs) {
  const bad = [];
  for (let i = 0; i < 256; i++) {
    if (mine[i] !== theirs[i]) bad.push(`${i}: ${mine[i]} not ${theirs[i]}`);
  }
  check(name, bad.length === 0,
    bad.length ? `${bad.length} differ, e.g. ${bad.slice(0, 3).join(', ')}` : 'all 256');
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikingsState),
  null, { timeout: 30000 });

console.log('the tables, against the 6502:');
const port = await page.evaluate(async () => {
  const m = await import('/src/engine/diskControls.ts');
  // Walk the model the way probe_controls.mjs walks the machine: one call at a time, from a
  // known state, reading the byte back.
  const run = (init, pdl1, pdl0) => {
    const st = { pitch: 0, bank: 0, heading: 0, steepLatch: 0, ...init };
    m.applyControls(st, pdl1, pdl0);
    return st;
  };
  const s8 = (v) => (v > 127 ? v - 256 : v);
  const pitchStep = [], bankStep = [], headingStep = [], flipPitch = [], flipHeading = [];
  for (let p = 0; p < 256; p++) pitchStep.push(s8(run({}, p, 128).pitch));
  for (let p = 0; p < 256; p++) bankStep.push(s8(run({}, 128, p).bank));
  for (let b = 0; b < 256; b++) {
    headingStep.push(s8((run({ bank: b, heading: 100 }, 128, 128).heading - 100) & 0xff));
  }
  for (let pitch = 0; pitch < 256; pitch++) {
    const st = run({ pitch, heading: 100, steepLatch: 0 }, 128, 128);
    flipPitch.push({ pitch, heading: st.heading, latch: st.steepLatch });
  }
  for (let h = 0; h < 256; h++) {
    flipHeading.push({
      from: h,
      to: run({ pitch: 0x80, heading: h, steepLatch: 0 }, 128, 128).heading,
    });
  }
  const pile = (pdl1, pdl0, read, steps = 24) => {
    const st = { pitch: 0, bank: 0, heading: 0, steepLatch: 0 };
    const seen = [];
    for (let i = 0; i < steps; i++) { m.applyControls(st, pdl1, pdl0); seen.push(s8(st[read])); }
    return seen;
  };
  return {
    pitchStep, bankStep, headingStep, flipPitch, flipHeading,
    clamp: {
      bankDown: pile(128, 255, 'bank'), bankUp: pile(128, 0, 'bank'),
      pitchDown: pile(255, 128, 'pitch'), pitchUp: pile(0, 128, 'pitch'),
    },
  };
});

sameTable('pitch step, by PDL(1)', port.pitchStep, golden.pitchStep);
sameTable('bank step, by PDL(0)', port.bankStep, golden.bankStep);
sameTable('heading change, by bank', port.headingStep, golden.headingStep);

// The flip. The pitch sweep runs from a cleared latch each time, so it reports which pitch
// values are inside the backwards half as much as what the flip does to a heading.
{
  const bad = golden.flipPitch.filter((g, i) =>
    port.flipPitch[i].heading !== g.heading || port.flipPitch[i].latch !== g.latch);
  const steep = golden.flipPitch.filter((g) => g.latch === 1);
  check('the steep-pitch flip fires on the same pitches and does the same thing',
    bad.length === 0,
    bad.length
      ? `${bad.length} differ, e.g. pitch ${bad[0].pitch}`
      : `pitch ${steep[0].pitch}-${steep[steep.length - 1].pitch}, heading 100 to ${steep[0].heading}`);
}
{
  const bad = golden.flipHeading.filter((g, i) => port.flipHeading[i].to !== g.to);
  check('and it is modulo 253, across all 256 headings', bad.length === 0,
    bad.length ? `${bad.length} differ, e.g. ${bad[0].from} to ${bad[0].to}` : '(heading + 126) % 253');
}
for (const k of ['bankDown', 'bankUp', 'pitchDown', 'pitchUp']) {
  const mine = port.clamp[k].join(' ');
  const theirs = golden.clamp[k].join(' ');
  check(`${k}: where repeated full deflection ends up`, mine === theirs,
    mine === theirs ? `${port.clamp[k][23]} after 24` : `${mine}  not  ${theirs}`);
}

// ---------------------------------------------------------------------------------------
console.log('');
console.log('and in play, with a key held:');

const flown = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const scene = () => {
    const l = window.__gameLog.getLog();
    return l.length ? l[l.length - 1].scene : '?';
  };
  const key = (k) => {
    const init = { key: k, code: 'Key' + k.toUpperCase(), bubbles: true };
    window.dispatchEvent(new KeyboardEvent('keydown', init));
    window.dispatchEvent(new KeyboardEvent('keyup', init));
  };
  key('N');
  for (let i = 0; i < 500 && scene() !== 'cockpit'; i++) await sleep(70);
  if (scene() !== 'cockpit') throw new Error('no cockpit');
  await sleep(1500);

  const s = window.__spaceVikingsState;
  Object.assign(s, { atmosphere: 0, speed: 0, pitch: 0, bank: 0, heading: 0 });
  await sleep(300);
  const at0 = { pitch: s.pitch, bank: s.bank, heading: s.heading };

  const hold = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { key: code, code, bubbles: true }));
  const drop = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { key: code, code, bubbles: true }));

  // Hold left. A paddle held off centre banks a step a pass, and the bank turns the nose.
  hold('ArrowLeft');
  await sleep(9000);
  const held = { pitch: s.pitch, bank: s.bank, heading: s.heading };
  drop('ArrowLeft');

  // Let go. Bank stays where it got to and the nose keeps coming round - the thing a yaw
  // cannot do, and the reason this is a roll.
  await sleep(9000);
  const coasted = { pitch: s.pitch, bank: s.bank, heading: s.heading };
  return { at0, held, coasted };
});

const s8 = (v) => (v > 127 ? v - 256 : v);
check('holding a key banks the ship', s8(flown.held.bank) !== 0,
  `bank ${s8(flown.at0.bank)} to ${s8(flown.held.bank)}`);
check('and the bank turns the nose', flown.held.heading !== flown.at0.heading,
  `heading ${flown.at0.heading} to ${flown.held.heading}`);
check('letting go leaves the bank where it was', s8(flown.coasted.bank) === s8(flown.held.bank),
  `bank still ${s8(flown.coasted.bank)}`);
check('and the ship keeps turning, which a yaw would not',
  flown.coasted.heading !== flown.held.heading,
  `heading ${flown.held.heading} to ${flown.coasted.heading}`);

fs.writeFileSync('captured/controls/port.json',
  JSON.stringify({ port, flown }, null, 1) + String.fromCharCode(10));
for (const e of errors.slice(0, 3)) console.log('page error:', e);
await browser.close();

const failed = results.filter((r) => !r.ok).length;
console.log('');
console.log(failed === 0
  ? `controls parity: all ${results.length} checks passed`
  : `controls parity: ${failed} of ${results.length} failed`);
process.exit(failed === 0 ? 0 : 1);
