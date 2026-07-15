import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto('http://127.0.0.1:5180/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
console.log('Pressing N for new game...');
await page.keyboard.press('N');
await page.waitForTimeout(2000);
await page.locator('#stage').screenshot({ path: 'new_game_started.png' });
await browser.close();
console.log('Saved new_game_started.png');
