import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.goto('http://127.0.0.1:5180/');
await page.waitForTimeout(2000);
await page.click('#stage');
await page.keyboard.press('N');
await page.waitForTimeout(2000);
await page.keyboard.press('A');
await page.waitForTimeout(5000);

const logData = await page.evaluate(() => {
  return localStorage.getItem('space_vikings_event_log');
});

if (logData) {
  const parsed = JSON.parse(logData);
  console.log(`TOTAL LOGS: ${parsed.length}`);
  for (let i = 1; i < parsed.length; i++) {
    const diff = parsed[i].time - parsed[i-1].time;
    console.log(`${i}: ${parsed[i].event} [${diff.toFixed(1)}ms gap]`);
  }
}

await browser.close();
