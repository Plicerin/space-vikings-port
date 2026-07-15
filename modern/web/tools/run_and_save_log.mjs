import { chromium } from 'playwright';
import fs from 'fs';

const durationMs = Number(process.argv[2] ?? 15000);

const browser = await chromium.launch({ 
  headless: true,
  args: ['--enable-gpu', '--use-gl=angle']
});
const page = await browser.newPage();

console.log('--- STARTING AI DIAGNOSTIC SIMULATION ---');
await page.goto('http://127.0.0.1:5180/');
await page.waitForTimeout(1000);
await page.click('#stage');
await page.evaluate(() => window.__gameLog?.clearLog?.());

console.log('[sim] Starting new game...');
await page.keyboard.press('N');
await page.waitForTimeout(3000);

console.log('[sim] Engaging commander...');
await page.keyboard.press('A');
await page.waitForTimeout(durationMs);

console.log('[sim] Fetching log...');
const logData = await page.evaluate(() => {
  return localStorage.getItem('space_vikings_event_log');
});

if (logData) {
  const parsed = JSON.parse(logData);
  console.log(`[sim] Total log entries: ${parsed.length}`);
  fs.writeFileSync('latest_simulation_log.json', JSON.stringify(parsed, null, 2));
  console.log('[sim] Log saved to latest_simulation_log.json');
}

await browser.close();
console.log('--- SIMULATION COMPLETE ---');
