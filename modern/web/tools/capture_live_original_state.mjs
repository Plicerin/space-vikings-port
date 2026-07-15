import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';

const CTL_HOST = '127.0.0.1';
const CTL_PORT = 9100;
const outBase = process.argv[2] ?? 'live-state-capture';
const outputDir = process.argv[3] ? path.resolve(process.argv[3]) : process.cwd();

async function main() {
  const screenshotPath = path.join(outputDir, `${outBase}.png`);
  const jsonPath = path.join(outputDir, `${outBase}.json`);

  const stateResp = await post('/state', {});
  if (!stateResp?.ok) {
    throw new Error(`/state failed: ${JSON.stringify(stateResp)}`);
  }
  const state = stateResp.state;
  const planet = state.planet;

  await post('/shot', { path: screenshotPath });

  const byteMap = {
    planetVitalityLimit: 38150,
    shipVitality: 38152,
    planetVitality: 38160,
    shipDestructionLimit: 38204,
    shipKind: 38205,
    enemyShips: 38207,
    planetSurrendered: 38208,
    planetIndex: 38209,
    atmosphere: 38210,
    savedGameSentinel: 38391,
  };

  const memory = {};
  for (const [label, addr] of Object.entries(byteMap)) {
    const resp = await post('/peek', { addr, len: 1 });
    if (!resp?.ok) throw new Error(`/peek failed for ${label} @ ${addr}`);
    memory[label] = { addr, value: resp.bytes[0] };
  }

  const planetTables = {
    conquered: 38219 + planet,
    known: 38240 + planet,
    populationScale: 38261 + planet,
    tech: 38282 + planet,
    base: 38303 + planet,
  };

  const planetState = {};
  for (const [label, addr] of Object.entries(planetTables)) {
    const resp = await post('/peek', { addr, len: 1 });
    if (!resp?.ok) throw new Error(`/peek failed for ${label} @ ${addr}`);
    planetState[label] = { addr, value: resp.bytes[0] };
  }

  const payload = {
    capturedAt: new Date().toISOString(),
    screenshotPath,
    state,
    memory,
    planetState,
  };

  await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ ok: true, screenshotPath, jsonPath, payload }, null, 2)}\n`);
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
