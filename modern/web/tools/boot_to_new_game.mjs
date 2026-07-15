import http from 'node:http';

const CTL_HOST = '127.0.0.1';
const CTL_PORT = 9100;

async function main() {
  await waitForControl();
  await waitForTitle();
  await post('/eval', { expr: `(() => { if (window.__sv?.io?.updateKHz) window.__sv.io.updateKHz(4000); return window.__sv?.io?.kHz ?? null; })()` });
  await post('/keys', { text: 'N', delay: 80 });
  await post('/wait', { ms: 500 });

  const signatures = [
    { kind: 'htext', pattern: 'SUBLOGIC PRESENTS:', timeoutMs: 15000 },
    { kind: 'htext', pattern: 'SPEED[\\s\\S]*TURN[\\s\\S]*ENERGY', timeoutMs: 30000 },
    { kind: 'htext', pattern: 'MANUAL[\\s\\S]*AUTO[\\s\\S]*MISSILE[\\s\\S]*LASER', timeoutMs: 30000 },
  ];

  const results = [];
  for (const sig of signatures) {
    results.push(await safeWaitFor(sig));
  }

  const finalState = await post('/state', {});
  process.stdout.write(`${JSON.stringify({ ok: true, results, finalState }, null, 2)}\n`);
}

function request(method, path, payload) {
  return new Promise((resolve, reject) => {
    const body = payload == null ? '' : JSON.stringify(payload);
    const req = http.request({
      host: CTL_HOST,
      port: CTL_PORT,
      path,
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
          resolve({ status: res.statusCode ?? 0, json: data ? JSON.parse(data) : null });
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

async function post(path, payload) {
  const response = await request('POST', path, payload);
  if (response.status >= 400) {
    throw new Error(`${path} failed: ${response.status} ${JSON.stringify(response.json)}`);
  }
  return response.json;
}

async function safeWaitFor(payload) {
  const response = await request('POST', '/wait-for', payload);
  return {
    request: payload,
    status: response.status,
    body: response.json,
  };
}

async function waitForControl() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await request('POST', '/text', {});
      if (response.status > 0) return;
    } catch {
      // keep polling
    }
    await sleep(250);
  }
  throw new Error('control endpoint did not come up');
}

async function waitForTitle() {
  const title = await safeWaitFor({ kind: 'htext', pattern: 'SPACE VIKINGS', timeoutMs: 15000 });
  if (title.status >= 400) {
    throw new Error(`title wait failed: ${JSON.stringify(title.body)}`);
  }
  const prompt = await safeWaitFor({ kind: 'htext', pattern: '\\(N\\)EW GAME OR \\(O\\)LD GAME\\?', timeoutMs: 15000 });
  if (prompt.status >= 400) {
    throw new Error(`prompt wait failed: ${JSON.stringify(prompt.body)}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
