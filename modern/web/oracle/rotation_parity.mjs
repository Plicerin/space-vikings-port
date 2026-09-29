// The port's transcription of the rotation chain against the machine.
//
// Three things to check, each against captures taken by calling the disk's own code rather
// than against a model of it:
//
//   the table      all 256 angles through $64FB and $64F8    probe_rottrig.mjs
//   the multiply   768 operand pairs through $635C           probe_rottrig.mjs
//   the matrix     357 pitch/bank/heading triples via $654E   probe_rotbuild.mjs
//
// The last is the one that matters: it exercises the first two together the way the renderer
// does, so a slip in either shows up as a wrong matrix entry.
import { chromium } from 'playwright';
import fs from 'fs';

const PORT_URL = process.env.PORT_URL || 'http://localhost:4545/';
const trig = JSON.parse(fs.readFileSync('captured/rot/trig.json', 'utf8'));
const build = JSON.parse(fs.readFileSync('captured/rot/build.json', 'utf8'));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(PORT_URL, { waitUntil: 'load' });
await page.waitForFunction(() => !!(window.__spaceVikings && window.__spaceVikings.buildMatrix654E), null, { timeout: 30000 })
  .catch(() => { throw new Error('the port did not expose buildMatrix654E - is the dev server running?'); });

const got = await page.evaluate(({ pairs, triples }) => {
  const sv = window.__spaceVikings;
  const angles = [];
  for (let a = 0; a < 256; a++) angles.push([sv.cos64FB(a), sv.sin64F8(a)]);
  return {
    angles,
    products: pairs.map(([a, b]) => sv.mul635C(a, b)),
    matrices: triples.map(([p, b, h]) => sv.buildMatrix654E(p, b, h)),
  };
}, {
  pairs: trig.multiply.map((m) => [m.a, m.b]),
  triples: build.rows.map((r) => [r.p, r.b, r.h]),
});
await browser.close();
for (const e of errors.slice(0, 3)) console.log('page error:', e);

let failures = 0;
const report = (name, bad, total, first) => {
  if (bad) failures++;
  console.log(`  ${name.padEnd(32)} ${bad === 0 ? `${total} of ${total} exact` : `${bad} of ${total} wrong`}`);
  if (first) console.log(`      first: ${first}`);
};

{
  let bad = 0, first = null;
  for (let a = 0; a < 256; a++) {
    if (got.angles[a][0] !== trig.cos[a]) { bad++; first ??= `cos(${a}) machine ${trig.cos[a]}, port ${got.angles[a][0]}`; }
  }
  report('$64FB cosine, every angle', bad, 256, first);
}
{
  let bad = 0, first = null;
  for (let a = 0; a < 256; a++) {
    if (got.angles[a][1] !== trig.sin[a]) { bad++; first ??= `sin(${a}) machine ${trig.sin[a]}, port ${got.angles[a][1]}`; }
  }
  report('$64F8 sine, every angle', bad, 256, first);
}
{
  let bad = 0, first = null;
  trig.multiply.forEach((m, i) => {
    if (got.products[i] !== m.r) { bad++; first ??= `${m.a} * ${m.b} machine ${m.r}, port ${got.products[i]}`; }
  });
  report('$635C multiply', bad, trig.multiply.length, first);
}
{
  let bad = 0, cells = 0, badCells = 0, first = null;
  build.rows.forEach((r, i) => {
    cells += 9;
    let rowBad = false;
    for (let k = 0; k < 9; k++) {
      if (got.matrices[i][k] !== r.m[k]) {
        badCells++; rowBad = true;
        first ??= `pitch ${r.p} bank ${r.b} heading ${r.h}, entry ${k}: machine ${r.m[k]}, port ${got.matrices[i][k]}`;
      }
    }
    if (rowBad) bad++;
  });
  report('$654E matrix, whole triples', bad, build.rows.length, first);
  report('$654E matrix, single entries', badCells, cells, null);
}

// What the port's floating-point rotation would have produced for the same angles, so the
// size of the thing being fixed is on the record.
let worst = 0, worstAt = null;
for (const { p, b, h, m } of build.rows) {
  const rad = (v) => (v * 2 * Math.PI) / 256;
  const [sp, sb, sh] = [Math.sin(rad(p)), Math.sin(rad(b)), Math.sin(rad(h))];
  const [cp, cb, ch] = [Math.cos(rad(p)), Math.cos(rad(b)), Math.cos(rad(h))];
  const f = [ch * cb + sp * sh * sb, sb * cp, sp * ch * sb - sh * cb,
    sp * sh * cb - ch * sb, cp * cb, sh * sb + sp * ch * cb,
    sh * cp, -sp, ch * cp].map((v) => Math.round(v * 32768));
  for (let i = 0; i < 9; i++) {
    const e = Math.abs(f[i] - m[i]);
    if (e > worst) { worst = e; worstAt = `pitch ${p} bank ${b} heading ${h}, entry ${i}`; }
  }
}
console.log('');
console.log(`a float rotation of the same angles is out by up to ${worst} in Q15 ` +
  `(${(worst / 32768).toFixed(4)}), at ${worstAt}`);
console.log('');
console.log(failures === 0 ? 'rotation parity: clean' : `rotation parity: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
