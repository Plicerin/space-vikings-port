import { readFileSync } from 'fs';
const c = readFileSync('src/scenes/cockpit.ts', 'utf8').split('\n');
for (let i = 1016; i < 1030; i++) {
  console.log(`${i+1}: ${JSON.stringify(c[i])}`);
}
