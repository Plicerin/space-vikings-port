import { chromium } from 'playwright';
import fs from 'fs/promises';

const APP_URL = 'http://127.0.0.1:5180/';
const RESULT_PNG = 'end_to_end_result.png';
const RESULT_JSON = 'end_to_end_result_log.json';
const MAX_RUNTIME_MS = Number(process.argv[2] ?? 10 * 60 * 1000);
const POLL_MS = 1000;
const NO_PROGRESS_MS = 60_000;
const HEADLESS = process.env.PLAYWRIGHT_HEADLESS !== '0' && process.env.PLAYWRIGHT_HEADLESS?.toLowerCase() !== 'false';
const FLIGHT_SCENES = new Set(['cockpit', 'starshipSimulator']);

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getLogAndScene(page) {
  return page.evaluate(() => {
    const logApi = window.__gameLog;
    if (!logApi || typeof logApi.getLog !== 'function') {
      return { len: 0, scene: null, tail: [], commanderMode: false, autopilot: false };
    }
    const log = Array.from(logApi.getLog());
    const tail = log.slice(-10).map((e) => ({ time: e.time, scene: e.scene, event: e.event, detail: e.detail }));
    const last = tail[tail.length - 1];
    const state = window.__spaceVikingsState ?? null;
    return {
      len: log.length,
      scene: last ? last.scene : null,
      tail,
      commanderMode: Boolean(state?.commanderMode),
      autopilot: Boolean(state?.autopilot),
      position: state
        ? { x: Number(state.x) || 0, y: Number(state.y) || 0, z: Number(state.z) || 0 }
        : null,
    };
  });
}

async function waitForScene(page, targetScene, maxWaitMs) {
  const start = Date.now();
  let current = null;
  const targets = typeof targetScene === 'string'
    ? new Set([targetScene])
    : new Set(targetScene);

  while (Date.now() - start < maxWaitMs) {
    const { scene } = await getLogAndScene(page);
    if (scene && targets.has(scene)) return true;
    if (scene && scene !== current) {
      current = scene;
      console.log(`[runner] scene=${current}`);
    }
    await wait(POLL_MS);
  }
  return false;
}

async function clearLog(page) {
  await page.evaluate(() => {
    window.__gameLog?.clearLog?.();
  });
}

  async function launchBrowser() {
  const attempts = [
    {
      label: 'Playwright Chromium shell',
      options: {
        headless: HEADLESS,
        args: ['--enable-gpu', '--use-gl=angle', '--no-sandbox'],
      },
    },
    {
      label: 'Chrome channel',
      options: {
        headless: HEADLESS,
        channel: 'chrome',
        args: ['--no-sandbox'],
      },
    },
  ];

  let lastError = null;
  for (const attempt of attempts) {
    try {
      console.log(`[runner] launching browser via ${attempt.label}...`);
      return await chromium.launch(attempt.options);
    } catch (err) {
      lastError = err;
      console.error(`[runner] ${attempt.label} failed: ${String(err?.message ?? err)}`);
    }
  }

  throw lastError ?? new Error('failed to launch browser');
}

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });

try {
  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await page.click('#stage');
  await clearLog(page);
  await wait(500);

  console.log('[runner] launching new game...');
  await page.keyboard.press('N');
  await wait(1500);

  const started = await waitForScene(page, FLIGHT_SCENES, 30_000);
  if (!started) {
    throw new Error('did not enter flight scene after new game');
  }

  console.log('[runner] cockpit entered, enabling commander mode');
  await page.keyboard.press('A');

  const startedAt = Date.now();
  let noProgressMs = 0;
  let lastLen = 0;
  let lastScene = null;
  let commanderAttempts = 0;
  const maxCommanderRetries = 3;
  let reachedEnd = false;
  let lastPosition = null;

  while (Date.now() - startedAt < MAX_RUNTIME_MS) {
    const { len, scene, tail, commanderMode, autopilot, position } = await getLogAndScene(page);
    const latest = tail[tail.length - 1];
    const latestEvent = latest?.event;
    const moved = position && lastPosition
      ? Math.abs(position.x - lastPosition.x)
        + Math.abs(position.y - lastPosition.y)
        + Math.abs(position.z - lastPosition.z) > 25
      : false;

    if (scene && scene !== lastScene) {
      console.log(`[runner] scene=${scene}`);
      lastScene = scene;
      noProgressMs = 0;
    } else if (len > lastLen) {
      noProgressMs = 0;
    } else if (moved) {
      noProgressMs = 0;
    } else {
      noProgressMs += POLL_MS;
    }
    lastLen = len;
    lastPosition = position;

    if (FLIGHT_SCENES.has(scene) && !commanderMode && !autopilot && commanderAttempts < maxCommanderRetries) {
      commanderAttempts += 1;
      await page.keyboard.press('A');
    }

    if (scene === 'start') {
      console.log('[runner] restarted to start scene, issuing NEW GAME');
      await page.keyboard.press('N');
    }

    if (scene === 'galaxyMap') {
      await page.keyboard.press(' ');
    }

    if (scene === 'playerDeath') {
      console.log('[runner] player destroyed, acknowledging reboot');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
    }

    if (scene === 'end') {
      reachedEnd = true;
      break;
    }

    if (latestEvent === 'victory') {
      console.log('[runner] victory event observed in log');
      reachedEnd = true;
      break;
    }

    if (noProgressMs >= NO_PROGRESS_MS) {
      throw new Error(`stalled with no log updates for ${NO_PROGRESS_MS}ms (scene=${scene ?? 'unknown'})`);
    }

    await wait(POLL_MS);
  }

  const final = await getLogAndScene(page);
  const finalLog = final.tail;
  const fullLog = await page.evaluate(() => {
    const entries = window.__gameLog?.getLog?.() ?? [];
    return entries;
  });
  const last = fullLog[fullLog.length - 1];
  const finalScene = last?.scene ?? null;

  if (!reachedEnd && !finalScene) {
    throw new Error('run ended without an active scene log entry');
  }

  const result = {
    success: reachedEnd || finalScene === 'end',
    runtimeMs: Date.now() - startedAt,
    finalScene,
    lastEvent: last?.event ?? null,
    scene: lastScene,
    logLength: fullLog.length,
    tail: finalLog,
  };
  await fs.writeFile(RESULT_JSON, JSON.stringify(fullLog, null, 2), 'utf8');
  await page.screenshot({ path: RESULT_PNG, fullPage: true });
  console.log(`[runner] result=${result.success ? 'PASS' : 'FAIL'} scene=${result.finalScene}`);
  console.log(`[runner] wrote ${RESULT_JSON} and ${RESULT_PNG}`);

  if (!result.success) {
    process.exitCode = 1;
  }
} catch (err) {
  console.error('[runner] ERROR', String(err?.message ?? err));
  try {
    await page.screenshot({ path: RESULT_PNG, fullPage: true });
    await fs.writeFile(RESULT_JSON, JSON.stringify(await page.evaluate(() => window.__gameLog?.getLog?.() ?? []), null, 2), 'utf8');
    console.log('[runner] captured diagnostics');
  } catch {
    // ignore
  }
  process.exitCode = 1;
} finally {
  await browser.close();
}
