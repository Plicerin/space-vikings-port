import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DEFAULT_TIMEOUT_MS = Number(process.argv[2] ?? 10 * 60 * 1000);
const WAIT_FOR_SERVER_MS = Number(process.argv[3] ?? 45_000);
const APP_URL = 'http://127.0.0.1:5180/';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = dirname(__dirname);

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function startServer() {
  const viteBin = join(PROJECT_ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  return spawn(process.execPath, [
    viteBin,
    '--host',
    '127.0.0.1',
  ], {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: false,
  });
}

async function waitForServer(timeoutMs) {
  const start = Date.now();
  let lastErr = '';
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(APP_URL, { method: 'GET' });
      if (res.ok) return true;
    } catch (err) {
      lastErr = String(err?.message ?? err);
    }
    await wait(250);
  }
  throw new Error(`server did not become ready within ${timeoutMs}ms; last error: ${lastErr}`);
}

async function runGame(timeoutMs) {
  return new Promise((resolve) => {
    const runner = spawn(process.execPath, [
      join(__dirname, 'run_end_to_end.mjs'),
      String(timeoutMs),
    ], {
      cwd: PROJECT_ROOT,
      stdio: ['ignore', 'inherit', 'inherit'],
      shell: false,
    });

    runner.on('close', (code) => {
      resolve(code ?? 0);
    });
  });
}

async function stopServer(proc) {
  if (!proc) return;
  let exited = proc.exitCode !== null || proc.signalCode !== null;
  proc.once('close', () => {
    exited = true;
  });
  proc.kill('SIGINT');
  await wait(300);
  if (!exited) proc.kill('SIGKILL');
  await Promise.race([
    new Promise((resolve) => proc.once('close', resolve)),
    wait(1000),
  ]);
}

let server = null;
let exitCode = 0;
let serverStarted = false;

try {
  server = startServer();
  await waitForServer(WAIT_FOR_SERVER_MS);
  serverStarted = true;
  console.log('[runner] server ready, starting end-to-end flow');
  exitCode = await runGame(DEFAULT_TIMEOUT_MS);
} catch (err) {
  console.error('[runner] ERROR', String(err?.message ?? err));
  exitCode = 1;
} finally {
  if (serverStarted) {
    try {
      await stopServer(server);
    } catch {
      // keep final status from the runner if available
    }
  } else if (server) {
    try {
      server.kill('SIGKILL');
    } catch {
      // ignore
    }
  }
}

process.exit(exitCode);
