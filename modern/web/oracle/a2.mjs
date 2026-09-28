// The oracle: the original Space Vikings disk running in apple2js, drivable from a
// script. This is the thing every capture is measured against.
//
// Why it exists: the port is source-informed but has no arbiter — nothing answers
// "does this match the disk?". Everything here is in service of answering that.
//
// Usage:
//   import { openOracle } from './a2.mjs';
//   const a2 = await openOracle();
//   await a2.boot();                     // disk in drive 1, reset, run
//   await a2.waitMs(4000);
//   const bytes = await a2.readRange(0x2000, 0x4000);
//   await a2.close();
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EMU = path.join(HERE, 'emu');
const DISK = path.resolve(HERE, '..', 'public', 'data', 'spacevikings.dsk');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.dsk': 'application/octet-stream',
};

export async function openOracle({ headless = true } = {}) {
  if (!fs.existsSync(DISK)) throw new Error('disk image not found: ' + DISK);

  const server = http.createServer((q, r) => {
    let u = decodeURIComponent(q.url.split('?')[0]);
    if (u === '/') u = '/apple2js.html';
    const f = u === '/disk.dsk' ? DISK : path.join(EMU, u);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, {
      'Content-Type': MIME[path.extname(f)] || 'application/octet-stream',
      'Content-Length': fs.statSync(f).size,
      'Accept-Ranges': 'bytes',
    });
    if (q.method === 'HEAD') { r.end(); return; }
    fs.createReadStream(f).pipe(r);
  });
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const port = server.address().port;

  const browser = await chromium.launch({ headless });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/apple2js.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!(window.Apple2 && window.Apple2.apple2), null, { timeout: 30000 });

  const ev = (code) => page.evaluate((s) => new Function('return (async () => (' + s + '))()')(), code);

  // The handles every probe uses. Kept on window so a probe can add to them.
  await ev(`(() => {
    const a2 = window.Apple2.apple2;
    const cpu = a2.getCPU();
    window.M = {
      a2, cpu,
      rd: (a) => cpu.read(a),
      wr: (a, v) => cpu.write(a, v),
      range: (from, to) => { const out = []; for (let a = from; a < to; a++) out.push(cpu.read(a)); return out; },
      // the 40-column text screen, with the Apple's interleaved line bases
      textRow: (row) => { const base = 0x400 + (row & 7) * 0x80 + ((row >> 3) * 40);
        let s = ''; for (let c = 0; c < 40; c++) s += String.fromCharCode((cpu.read(base + c) & 0x7F) || 32);
        return s.replace(/\\s+$/, ''); },
      screen: () => [...Array(24)].map((_, r) => window.M.textRow(r)),
      // a cheap fingerprint of a memory range, for spotting "did anything change"
      hash: (from, to) => { let h = 2166136261; for (let a = from; a < to; a++) { h ^= cpu.read(a); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); },
    };
    return 'ok';
  })()`);

  const api = {
    page, ev, errors, port,
    /**
     * Put the disk in drive 1, then reset and run.
     *
     * The UI's doLoadHTTP() fetches in the background, so resetting a fixed delay later
     * raced it: the first attempt reset an empty drive and the Autostart ROM dropped
     * straight to a `]` prompt in half a second. This goes at the Disk II card directly
     * and REFUSES TO RESET until the drive reports a disk.
     */
    async boot({ timeoutMs = 20000 } = {}) {
      const loaded = JSON.parse(await ev(`(async () => {
        const io = window.M.a2.getIO();
        const disk2 = io._slot ? io._slot[6] : null;
        if (!disk2 || typeof disk2.setBinary !== 'function') return JSON.stringify({ ok: false, why: 'no Disk II card in slot 6' });
        const data = await (await fetch('/disk.dsk')).arrayBuffer();
        await disk2.setBinary(1, 'spacevikings', 'dsk', data);
        window.M.disk2 = disk2;
        const meta = disk2.getMetadata(1);
        return JSON.stringify({ ok: !!meta, why: meta ? '' : 'setBinary left the drive empty', bytes: data.byteLength });
      })()`));
      if (!loaded.ok) throw new Error('could not load the disk: ' + loaded.why);
      await ev(`(() => { window.M.a2.reset(); window.M.a2.run(); return 'running'; })()`);
      // and confirm it actually boots rather than falling to the monitor prompt
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        await page.waitForTimeout(400);
        const busy = JSON.parse(await ev(`JSON.stringify({ pc: window.M.cpu.getPC(), cycles: window.M.cpu.getCycles() })`));
        if (busy.pc < 0xd000) return { ...loaded, bootedAt: Date.now() - start, pc: busy.pc };
      }
      return { ...loaded, bootedAt: -1, note: 'still in ROM after ' + timeoutMs + 'ms' };
    },
    async waitMs(ms) { await page.waitForTimeout(ms); },
    async pause() { await ev(`(() => { window.M.a2.stop(); return 'stopped'; })()`); },
    async resume() { await ev(`(() => { window.M.a2.run(); return 'running'; })()`); },
    async read(addr) { return JSON.parse(await ev(`window.M.rd(${addr})`)); },
    async readRange(from, to) { return JSON.parse(await ev(`JSON.stringify(window.M.range(${from}, ${to}))`)); },
    async screen() { return JSON.parse(await ev(`JSON.stringify(window.M.screen())`)); },
    async pc() { return JSON.parse(await ev(`window.M.cpu.getPC()`)); },
    async cycles() { return JSON.parse(await ev(`window.M.cpu.getCycles()`)); },
    /** Press a key the way the keyboard soft switch sees it. */
    async key(ch) {
      const code = typeof ch === 'number' ? ch : ch.toUpperCase().charCodeAt(0);
      await ev(`(() => { window.M.a2.getIO().keyDown(${code}); return 'k'; })()`);
      await page.waitForTimeout(80);
      await ev(`(() => { window.M.a2.getIO().keyUp(); return 'k'; })()`);
      await page.waitForTimeout(120);
    },
    async close() { await browser.close(); server.close(); },
  };
  return api;
}
