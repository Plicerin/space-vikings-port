import { readFileSync, writeFileSync } from 'fs';

let c = readFileSync('src/scenes/cockpit.ts', 'utf8');
const lines = c.split('\n');

// Current: line 1020 closes onFighterDestroyed, line 1023 starts spawnEnemy
// I need to insert 4 lines between them:
//   1021: '  }'  - close __cockpitFx
//   1022: '  const __cockpitPromise = new Promise<void>(__cockpitFx);'
//   1023: '  return __cockpitPromise;'
//   1024: '}' - close cockpitScene
// Then spawnEnemy at module level is correct

const insert = [
  '  }',   // close __cockpitFx
  '  const __cockpitPromise = new Promise<void>(__cockpitFx);',
  '  return __cockpitPromise;',
  '}',      // close cockpitScene
];

// Find the line before function spawnEnemy
let spawnIdx = -1;
for (let i = 1020; i < lines.length; i++) {
  if (lines[i].trim().startsWith('function spawnEnemy')) {
    spawnIdx = i;
    break;
  }
}
if (spawnIdx < 0) {
  console.log('spawnEnemy not found');
  process.exit(1);
}

console.log(`spawnEnemy at line ${spawnIdx + 1}`);
console.log('Inserting before it:');
insert.forEach((l, i) => console.log(`  ${spawnIdx + i + 1}: ${l}`));

lines.splice(spawnIdx, 0, ...insert);

// Verify
let depth = 0;
for (let i = 0; i < lines.length; i++) {
  const s = lines[i].replace(/\/\/.*$/, '');
  depth += (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length;
}
console.log(`Final depth: ${depth}`);

// Show insertion area
for (let i = spawnIdx - 2; i <= spawnIdx + 5 && i < lines.length; i++) {
  console.log(`${i+1}: ${JSON.stringify(lines[i])}`);
}

writeFileSync('src/scenes/cockpit.ts', lines.join('\n'));
