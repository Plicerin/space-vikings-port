// tools/play.mjs - long-lived Playwright driver for the apple2js + Space Vikings setup.
// Launches Chromium (headed) pointing at the emulator with the disk autoloaded,
// then exposes an HTTP control endpoint so subsequent shell commands can
// screenshot the canvas, type keys, press named keys, wait, eval JS, or quit.
//
//   POST /shot     { "path": "absolute/out.png" }
//   POST /keys     { "text": "N", "delay": 80 }
//   POST /press    { "key": "Enter" }      // Playwright key names
//   POST /wait     { "ms": 2000 }
//   POST /eval     { "expr": "document.title" }
//   POST /dump     { "addr": 0x7879, "len": 256, "label": "shipbuf" }
//   GET  /shipdump
//   POST /quit
//
// Start with: node tools/play.mjs

import { chromium } from 'playwright';
import http from 'node:http';

const APP_HOST = '127.0.0.1';
const APP_PORT = 5180;
const CTL_PORT = 9100;

// apple2js loads disks whose URL contains '://' via doLoadHTTP, fetching the
// raw .dsk and handing it to disk2.setBinary. The disk URL goes in the URL
// hash so apple2js's gup('disk')||hup() picks it up at startup.
const DISK_URL = `http://${APP_HOST}:${APP_PORT}/data/spacevikings.dsk`;
const PAGE_URL = `http://${APP_HOST}:${APP_PORT}/legacy/apple2js.html#${DISK_URL}`;

console.log('[play] launching chromium...');
const browser = await chromium.launch({
  headless: false,
  args: ['--window-size=1024,800', '--no-default-browser-check'],
});
const ctx = await browser.newContext({ viewport: { width: 1024, height: 800 } });
const page = await ctx.newPage();

page.on('console', msg => {
  if (msg.type() === 'error' || msg.type() === 'warning') {
    console.log(`[browser:${msg.type()}]`, msg.text());
  }
});
page.on('pageerror', err => console.log('[pageerror]', err.message));

console.log('[play] opening', PAGE_URL);
await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 30000 });

// Wait for apple2js's main canvas to be ready. apple2js renders into a
// <canvas id="screen"> inside the .display container.
const canvas = page.locator('canvas').first();
await canvas.waitFor({ state: 'visible', timeout: 15000 });

// apple2js maps mouse position over the canvas to paddle (0/1) values.
// Without recentering, the ship pitches and banks at extreme rates because
// the mouse sits wherever Playwright last left it. Keep the cursor pinned
// to the canvas centre so PDL(0)=PDL(1)=128 (paddle neutral).
async function centerMouse() {
  const rect = await canvas.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(rect.x, rect.y);
}

await canvas.click({ position: { x: 296, y: 208 } });
await centerMouse();
console.log('[play] canvas ready, mouse parked at canvas centre');

// Install the HCG hook so we can read the on-screen text without OCR.
// The game redirects PRINT to a hi-res character generator at $9300; that
// routine takes the char in the A register and the cursor in zero-page
// $24 (col) / $25 (row). We wrap cpu.stepCycles to fire a capture whenever
// PC reaches $9300, building a virtual 24x40 text page in window.__hcgText.
const hookInstalled = await page.evaluate(() => {
  const cpu = window.__sv?.cpu;
  if (!cpu) return false;
  if (cpu.__hcgInstalled) return true;
  cpu.__hcgInstalled = true;

  window.__hcgText = Array.from({ length: 24 }, () => Array.from({ length: 40 }, () => ' '));

  const proto = Object.getPrototypeOf(cpu);
  const origStep = proto.step;

  // apple2js.run() always installs a Debugger that calls cpu.stepCyclesDebug
  // (not stepCycles). We override stepCyclesDebug to interleave a PC check.
  //
  // The HCG entry at $9300 isn't actually used — Applesoft's COUT vector goes
  // through $9EBD which dispatches into HCG mid-routine. But $93AD (LDY #$00,
  // start of the inner per-row glyph copy) runs exactly once per character
  // drawn. At that point: $24=col, $25=row, $26/$27=glyph address.
  // The glyph table starts at $8800 with 8 bytes per char, so:
  //   char = (((($27 - $88) << 8) | $26) >> 3) & 0x7F
  function captureIfHCG() {
    if (cpu.pc === 0x93AD) {
      const col = cpu.read(0x24);
      const row = cpu.read(0x25);
      const lo = cpu.read(0x26);
      const hi = cpu.read(0x27);
      const code = (((hi - 0x88) << 8) | lo) >> 3;
      if (row < 24 && col < 40 && code >= 0 && code < 128) {
        const ascii = code < 0x20 ? code + 0x40 : code;
        window.__hcgText[row][col] = String.fromCharCode(ascii);
      }
    }
  }

  cpu.stepCyclesDebug = function (c, cb) {
    const end = this.cycles + c;
    while (this.cycles < end) {
      captureIfHCG();
      origStep.call(this);
      if (cb && cb(this)) return;
    }
  };
  cpu.stepCycles = function (c) {
    const end = this.cycles + c;
    while (this.cycles < end) {
      captureIfHCG();
      origStep.call(this);
    }
  };
  return true;
});
console.log(hookInstalled ? '[play] HCG hook installed' : '[play] WARN: HCG hook not installed');

const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  let params = {};
  if (body) {
    try { params = JSON.parse(body); }
    catch { res.writeHead(400); res.end('bad json'); return; }
  }

  const reply = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };

  try {
    if (req.url === '/shot') {
      const path = params.path;
      if (!path) return reply(400, { ok: false, error: 'missing path' });
      await page.bringToFront();
      await canvas.screenshot({ path });
      return reply(200, { ok: true, path });
    }
    if (req.url === '/keys') {
      const { text, delay = 80 } = params;
      if (text == null) return reply(400, { ok: false, error: 'missing text' });
      await page.bringToFront();
      await centerMouse();
      await page.keyboard.type(text, { delay });
      return reply(200, { ok: true, typed: text });
    }
    if (req.url === '/press') {
      const { key, count = 1 } = params;
      if (!key) return reply(400, { ok: false, error: 'missing key' });
      await page.bringToFront();
      await centerMouse();
      for (let i = 0; i < count; i++) {
        await page.keyboard.press(key);
        await page.waitForTimeout(80);
      }
      return reply(200, { ok: true, pressed: key, count });
    }
    if (req.url === '/wait') {
      const { ms = 1000 } = params;
      await page.waitForTimeout(ms);
      return reply(200, { ok: true, waited: ms });
    }
    if (req.url === '/wait-for') {
      const { kind = 'text', pattern, timeoutMs = 30000, intervalMs = 250, page: textPage } = params;
      if (!pattern) return reply(400, { ok: false, error: 'missing pattern' });
      const deadline = Date.now() + timeoutMs;
      const re = new RegExp(pattern, 'm');
      while (Date.now() < deadline) {
        const text = await page.evaluate(({ kind, textPage }) => {
          if (kind === 'htext') {
            const t = window.__hcgText;
            if (!t) return null;
            return t.map((row) => row.join('').replace(/\s+$/, '')).join('\n');
          }
          const a2 = window.__sv?.apple2;
          if (!a2) return null;
          const gr = textPage === 2 ? a2.gr2 : a2.gr;
          if (!gr || typeof gr.getText !== 'function') return null;
          return gr.getText().split('\n').map(l => l.replace(/\s+$/, '')).join('\n');
        }, { kind, textPage });
        if (text != null && re.test(text)) {
          return reply(200, { ok: true, matched: true, kind, pattern, text });
        }
        await page.waitForTimeout(intervalMs);
      }
      return reply(408, { ok: false, matched: false, kind, pattern, error: 'timeout' });
    }
    if (req.url === '/eval') {
      const result = await page.evaluate(params.expr);
      return reply(200, { ok: true, result });
    }
    if (req.url === '/text') {
      // apple2js's LoRes/text device exposes getText() which returns the
      // current text page rendered as a 24-line string. Falls back to
      // page 2 ($800) if requested via { page: 2 }.
      const text = await page.evaluate((wantPage) => {
        const a2 = window.__sv?.apple2;
        if (!a2) return null;
        const gr = wantPage === 2 ? a2.gr2 : a2.gr;
        if (!gr || typeof gr.getText !== 'function') return null;
        return gr.getText();
      }, params.page);
      if (text == null) return reply(503, { ok: false, error: 'gr.getText unavailable' });
      // Trim trailing spaces per line to keep output readable.
      const trimmed = text.split('\n').map(l => l.replace(/\s+$/, '')).join('\n');
      return reply(200, { ok: true, text: trimmed });
    }
    if (req.url === '/htext') {
      // Returns the virtual text page captured by the HCG hook.
      // This is what's actually drawn on the hi-res screen as text — menus,
      // prompts, the cockpit X/Y/Z numbers, all of it.
      const text = await page.evaluate(() => {
        const t = window.__hcgText;
        if (!t) return null;
        return t.map((row) => row.join('').replace(/\s+$/, '')).join('\n');
      });
      if (text == null) return reply(503, { ok: false, error: 'HCG hook not installed' });
      return reply(200, { ok: true, text });
    }
    if (req.url === '/state') {
      const state = await page.evaluate(() => {
        const cpu = window.__sv?.cpu;
        if (!cpu) return null;
        const u8 = (a) => cpu.read(a);
        const i16 = (a) => {
          const v = cpu.read(a) | (cpu.read(a + 1) << 8);
          return v >= 0x8000 ? v - 0x10000 : v;
        };
        const planet = u8(0x9541);
        return {
          x: i16(0x731B), y: i16(0x731D), z: i16(0x731F),
          pitch: u8(0x7321), bank: u8(0x7322), heading: u8(0x7323),
          speed: u8(0x950D), energy: u8(0x9537),
          shipKind: u8(0x953D),
          atmosphere: u8(0x9542),
          planet,
          targetEnemy: u8(0x958A + planet),
          shieldFlag: u8(0x9551),
          oldGameSentinel: u8(0x95F7),
        };
      });
      if (!state) return reply(503, { ok: false, error: '__sv not exposed yet' });
      return reply(200, { ok: true, state });
    }
    if (req.url === '/peek') {
      // { addr: 0x400, len: 64 } -> hex bytes, useful for ad-hoc debug
      const { addr, len = 1 } = params;
      if (addr == null) return reply(400, { ok: false, error: 'missing addr' });
      const bytes = await page.evaluate(({ addr, len }) => {
        const cpu = window.__sv?.cpu;
        if (!cpu) return null;
        const out = [];
        for (let i = 0; i < len; i++) out.push(cpu.read(addr + i));
        return out;
      }, { addr, len });
      if (!bytes) return reply(503, { ok: false, error: '__sv not exposed yet' });
      return reply(200, { ok: true, addr, bytes });
    }
    if (req.url === '/dump') {
      const { addr, len = 64, label = 'dump' } = params;
      if (addr == null) return reply(400, { ok: false, error: 'missing addr' });
      const dump = await page.evaluate(({ addr, len, label }) => {
        const cpu = window.__sv?.cpu;
        if (!cpu) return null;
        const bytes = [];
        for (let i = 0; i < len; i++) bytes.push(cpu.read(addr + i));
        const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
        return { label, addr, len, bytes, hex };
      }, { addr, len, label });
      if (!dump) return reply(503, { ok: false, error: '__sv not exposed yet' });
      return reply(200, { ok: true, dump });
    }
    if (req.url === '/shipdump') {
      const dump = await page.evaluate(() => {
        const cpu = window.__sv?.cpu;
        if (!cpu) return null;
        const ranges = [
          { label: 'shipBuffer', addr: 0x7879, len: 256 },
          { label: 'shipData', addr: 0x9506, len: 64 },
          { label: 'simState', addr: 0x9530, len: 96 },
        ];
        return ranges.map(({ label, addr, len }) => {
          const bytes = [];
          for (let i = 0; i < len; i++) bytes.push(cpu.read(addr + i));
          return {
            label,
            addr,
            len,
            bytes,
            hex: bytes.map((b) => b.toString(16).padStart(2, '0')).join(''),
          };
        });
      });
      if (!dump) return reply(503, { ok: false, error: '__sv not exposed yet' });
      return reply(200, { ok: true, dump });
    }
    if (req.url === '/quit') {
      reply(200, { ok: true, bye: true });
      setTimeout(async () => { await browser.close(); process.exit(0); }, 50);
      return;
    }
    reply(404, { ok: false, error: 'unknown route' });
  } catch (err) {
    reply(500, { ok: false, error: String(err) });
  }
});

server.listen(CTL_PORT, '127.0.0.1', () => {
  console.log(`[play] control endpoint http://127.0.0.1:${CTL_PORT}`);
});
