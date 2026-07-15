import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const APP_URL = process.env.APP_URL ?? 'http://127.0.0.1:5180/';
const OUT_DIR = path.resolve('tools/screenshots/visual-e2e');

const shots = [
  {
    name: '01-cockpit-flight-wireframe.png',
    title: 'Cockpit flight with forward wireframe ship',
    path: '?scene=starshipSimulator',
    waitMs: 900,
  },
  {
    name: '02-cockpit-hostile-fighters.png',
    title: 'Cockpit hostile encounter with enemy ship and fighters',
    path: '?scene=starshipSimulator&debug=hostile',
    waitMs: 1400,
  },
  {
    name: '03-planet-approach-bombardment.png',
    title: 'Planet approach / atmospheric bombardment view',
    path: '?scene=starshipSimulator&debug=bombardment',
    waitMs: 900,
  },
  {
    name: '04-radar-screen.png',
    title: 'Radar screen',
    path: '?scene=radar',
    waitMs: 500,
  },
  {
    name: '05-galaxy-map.png',
    title: 'Galaxy map',
    path: '?scene=galaxyMap',
    waitMs: 500,
  },
  {
    name: '06-ground-forces-menu.png',
    title: 'Ground forces menu',
    path: '?scene=groundForces',
    waitMs: 500,
  },
];

await fs.mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });

const manifest = [];

try {
  for (const shot of shots) {
    const url = new URL(shot.path, APP_URL).toString();
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('#stage').waitFor({ state: 'visible', timeout: 15_000 });
    await page.waitForTimeout(shot.waitMs);
    const outPath = path.join(OUT_DIR, shot.name);
    await page.locator('#stage').screenshot({ path: outPath });
    const logTail = await page.evaluate(() => window.__gameLog?.getLog?.().slice(-8) ?? []);
    manifest.push({
      title: shot.title,
      url,
      path: path.relative(process.cwd(), outPath).replaceAll('\\', '/'),
      logTail,
    });
    console.log(`[visual:e2e] ${shot.title}: ${outPath}`);
  }
} finally {
  await browser.close();
}

const manifestPath = path.join(OUT_DIR, 'manifest.json');
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
console.log(`[visual:e2e] wrote ${manifestPath}`);
