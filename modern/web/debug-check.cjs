const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => {
    console.log(msg.type().toUpperCase(), msg.text());
  });
  page.on('pageerror', err => console.log('PAGE ERR:', err.message));
  try {
    await page.goto('http://127.0.0.1:4546/', { waitUntil: 'domcontentloaded', timeout: 15000 });
  } catch(e) { console.log('Load err:', e.message); }
  
  const result = await page.evaluate(() => {
    const c = document.getElementById('stage');
    if (!c) return { canvas: 'not found' };
    const styles = getComputedStyle(c);
    return {
      cssWidth: styles.width,
      cssHeight: styles.height,
      display: styles.display,
      visibility: styles.visibility,
      opacity: styles.opacity,
    };
  });
  console.log('Result:', JSON.stringify(result, null, 2));
  
  // Now check if the module script loaded by looking at the network requests
  await browser.close();
})();
