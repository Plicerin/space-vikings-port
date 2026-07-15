// One-off screenshot helper for the modern port. Usage:
//   node tools/snap.mjs <url-relative-path> <out-png>
// Example:
//   node tools/snap.mjs "?scene=shapes" tools/screenshots/phase1-shapes.png

import { chromium } from 'playwright';

const [, , relPath = '', out = 'snap.png'] = process.argv;
const url = `http://127.0.0.1:5180/${relPath.startsWith('?') ? relPath : ''}`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.locator('#stage').screenshot({ path: out });
await browser.close();
console.log('saved', out);
