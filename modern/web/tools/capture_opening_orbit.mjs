import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';

const CTL_HOST = '127.0.0.1';
const CTL_PORT = 9100;
const outputDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const outBase = process.argv[3] ?? 'verified-opening-orbit';

async function main() {
  await waitForControl();
  await post('/eval', { expr: `(() => { if (window.__sv?.io?.updateKHz) window.__sv.io.updateKHz(4000); return window.__sv?.io?.kHz ?? null; })()` });
  await post('/keys', { text: 'N', delay: 80 });
  await post('/wait', { ms: 500 });

  const deadline = Date.now() + 45000;
  let stable = null;
  while (Date.now() < deadline) {
    const stateResp = await post('/state', {});
    const state = stateResp.state;
    const htextResp = await request('POST', '/htext', {});
    const htext = htextResp.status < 400 && htextResp.body?.ok ? htextResp.body.text : null;

    if (isOpeningOrbitState(state, htext)) {
      stable = { state, htext };
      break;
    }
    await sleep(500);
  }

  if (!stable) {
    throw new Error('did not reach a verified opening-orbit state');
  }

  const screenshotPath = path.join(outputDir, `${outBase}.png`);
  const jsonPath = path.join(outputDir, `${outBase}.json`);
  await post('/shot', { path: screenshotPath });

  const payload = {
    capturedAt: new Date().toISOString(),
    screenshotPath,
    verification: {
      reason: 'matched opening-orbit state signature',
      state: stable.state,
      htext: stable.htext,
    },
  };

  await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ ok: true, screenshotPath, jsonPath, payload }, null, 2)}\n`);
}

function isOpeningOrbitState(state, htext) {
  if (!state) return false;
  if (state.atmosphere !== 0) return false;
  if (state.oldGameSentinel !== 0) return false;
  if (state.shipKind === 0) return false;
  if (state.planet !== 1) return false;
  if (typeof state.x !== 'number' || typeof state.y !== 'number' || typeof state.z !== 'number') return false;
  if (Math.abs(state.x - 700) > 80) return false;
  if (Math.abs(state.y - 232) > 120) return false;
  if (Math.abs(state.z + 6643) > 600) return false;
  if (htext && /SHIP I\.D\.|LIGHT CRUISER|GROUND FORCES|GALAXY MAP|COMPUTER/i.test(htext)) return false;
  return true;
}

function request(method, route, payload) {
  return new Promise((resolve, reject) => {
    const body = payload == null ? '' : JSON.stringify(payload);
    const req = http.request({
      host: CTL_HOST,
      port: CTL_PORT,
      path: route,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: data ? JSON.parse(data) : null });
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function post(route, payload) {
  const response = await request('POST', route, payload);
  if (response.status >= 400) {
    throw new Error(`${route} failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body;
}

async function waitForControl() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await request('POST', '/state', {});
      if (response.status > 0) return;
    } catch {
      // keep polling
    }
    await sleep(250);
  }
  throw new Error('control endpoint did not come up');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
