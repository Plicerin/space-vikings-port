// Every harness, in order, with a verdict at the end.
//
// This had been an ad-hoc shell loop retyped a dozen times. It is a file now, because the
// suite is what the port's claim to be the disk rests on and it takes twenty minutes: it
// should be the same twenty minutes every time, and it should say plainly what failed.
//
//   node run_all.mjs            everything
//   node run_all.mjs repair     only the harnesses whose name contains "repair"
//
// Exit code is the number of harnesses that failed, so CI or a shell can test it.
import { spawn } from 'child_process';
import fs from 'fs';

const filter = process.argv[2] || '';
const files = fs.readdirSync('.')
  .filter((f) => f.endsWith('_parity.mjs') || f.endsWith('_check.mjs') || f === 'playthrough.mjs')
  .filter((f) => !filter || f.includes(filter))
  .sort();

if (!files.length) {
  console.log(`nothing matches "${filter}"`);
  process.exit(0);
}

const run = (file) => new Promise((resolve) => {
  const started = Date.now();
  const child = spawn(process.execPath, [file], { stdio: ['ignore', 'pipe', 'pipe'] });
  let tail = '';
  const keep = (buf) => { tail = (tail + buf.toString()).slice(-4000); };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  child.on('close', (code) => resolve({ file, code, seconds: (Date.now() - started) / 1000, tail }));
});

console.log(`${files.length} harnesses`);
console.log('');
const failed = [];
for (const file of files) {
  process.stdout.write(`  ${file.padEnd(26)} `);
  const r = await run(file);
  console.log(`${r.code === 0 ? 'pass' : 'FAIL'}  ${r.seconds.toFixed(0)}s`);
  if (r.code !== 0) failed.push(r);
}

console.log('');
if (!failed.length) {
  console.log(`all ${files.length} passed`);
} else {
  console.log(`${failed.length} of ${files.length} failed:`);
  for (const f of failed) {
    console.log('');
    console.log(`--- ${f.file} ---`);
    console.log(f.tail.split('\n').slice(-14).join('\n'));
  }
}
process.exit(failed.length);
