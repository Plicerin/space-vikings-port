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
      // The 40-column text screen, with the Apple's interleaved line bases.
      //
      // A screen byte carries the character in its low 6 bits and the video mode in the
      // top two: $80-$FF normal, $40-$7F flashing, $00-$3F inverse. Masking to $7F (the
      // obvious thing) leaves inverse text as control codes — the title reads
      // "^S^P^A^C^E" instead of "SPACE". Take the low 6 bits and lift $00-$1F to $40-$5F.
      textRow: (row) => { const base = 0x400 + (row & 7) * 0x80 + ((row >> 3) * 40);
        let s = '';
        for (let c = 0; c < 40; c++) { const v = cpu.read(base + c) & 0x3F; s += String.fromCharCode(v < 0x20 ? v + 0x40 : v); }
        return s.replace(/\\s+$/, ''); },
      screen: () => [...Array(24)].map((_, r) => window.M.textRow(r)),
      // a cheap fingerprint of a memory range, for spotting "did anything change"
      // One Apple II video frame: 262 scanlines x 65 cycles at 1.0205 MHz.
      // apple2js's own run() steps by WALL CLOCK inside requestAnimationFrame, which in
      // headless Chromium is throttled and gave a different result every run — the disk
      // sometimes booted to the game and sometimes stalled at the ] prompt. Nothing is
      // measurable on top of that, so the oracle steps itself.
      FRAME_CYCLES: 17030,
      frames: (n) => {
        for (let i = 0; i < n; i++) {
          cpu.stepCycles(window.M.FRAME_CYCLES);
          const mmu = a2.getMMU && a2.getMMU();
          if (mmu && mmu.resetVB) mmu.resetVB();
          const io = a2.getIO();
          if (io && io.tick) io.tick();
          if (a2.tick) a2.tick();
        }
        return cpu.getCycles();
      },
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
      // reset alone lands in the monitor: apple2js's reset() does not run the Autostart
      // ROM's slot scan, so the machine sits in KEYIN at a ] prompt for ever with
      // VARTAB = $803 (no program). Entering the Disk II boot ROM at $C600 is what
      // actually boots the disk, and unlike typing PR#6 it needs no keyboard timing.
      await ev(`(() => {
        window.M.a2.reset();
        const cpu = window.M.cpu, st = cpu.getState();
        st.pc = 0xC600;
        cpu.setState(st);
        return 'booting slot 6';
      })()`);
      // Stepped by us, never by a2.run(): same input, same result, every time.
      //
      // "Booted" cannot be "PC left ROM": a running Applesoft program spends most of its
      // time inside the interpreter at $D000-$F7FF, and $C600 is itself below $D000.
      // "Something is on the screen" is no better — DOS leaves its own `]` prompt there
      // four seconds before the game draws anything.
      //
      // What this waits for is the game asking a question: a program loaded (VARTAB well
      // above the empty-BASIC $803) and the 6502 sitting in the Autostart ROM's KEYIN
      // loop at $FD1B-$FD2F, seen twice running so a single unlucky sample cannot pass it.
      const maxFrames = Math.round(timeoutMs / 16.688);
      let waiting = 0;
      for (let f = 0; f < maxFrames; f += 30) {
        await this.frames(30);
        const st = JSON.parse(await ev(`JSON.stringify({
          pc: window.M.cpu.getPC(),
          vartab: window.M.rd(0x69) | (window.M.rd(0x6a) << 8)
        })`));
        const atKeyin = st.pc >= 0xfd1b && st.pc <= 0xfd2f && st.vartab > 0x803;
        waiting = atKeyin ? waiting + 1 : 0;
        if (waiting === 2) return { ...loaded, bootFrames: f + 30, ...st };
      }
      throw new Error('the disk did not reach a prompt in ' + maxFrames + ' frames. Refusing ' +
        'to hand back a machine that is not sitting at the game\'s first question.');
    },
    /** Run N Apple II video frames. This is the only clock the oracle has. */
    async frames(n) { return JSON.parse(await ev(`window.M.frames(${n})`)); },
    /** Frames, expressed as the wall time they would take on real hardware. */
    async waitMs(ms) { return this.frames(Math.max(1, Math.round(ms / 16.688))); },
    // The machine only advances inside frames(), so a read is always of a still
    // machine. These remain so older probes keep working.
    async pause() { return 'already still'; },
    async resume() { return 'stepped by frames()'; },
    async read(addr) { return JSON.parse(await ev(`window.M.rd(${addr})`)); },
    async readRange(from, to) { return JSON.parse(await ev(`JSON.stringify(window.M.range(${from}, ${to}))`)); },
    async screen() { return JSON.parse(await ev(`JSON.stringify(window.M.screen())`)); },
    async pc() { return JSON.parse(await ev(`window.M.cpu.getPC()`)); },
    async cycles() { return JSON.parse(await ev(`window.M.cpu.getCycles()`)); },
    /** Press a key the way the keyboard soft switch sees it. */
    async key(ch, { holdFrames = 4, afterFrames = 8 } = {}) {
      const code = typeof ch === 'number' ? ch : ch.toUpperCase().charCodeAt(0);
      await ev(`(() => { window.M.a2.getIO().keyDown(${code}); return 'k'; })()`);
      await this.frames(holdFrames);
      await ev(`(() => { window.M.a2.getIO().keyUp(); return 'k'; })()`);
      await this.frames(afterFrames);
    },
    async close() { await browser.close(); server.close(); },
  };
  return api;
}

/**
 * Applesoft's own variable table, read out by name.
 *
 * The interpreter keeps simple variables between VARTAB ($69/$6A) and ARYTAB ($6B/$6C),
 * seven bytes each: two name bytes then five of value. The high bits of the name say
 * the type — both clear is a float, both set an integer, the second alone a string.
 * So the game's state can be read with its own names on it, and no address has to be
 * guessed or trusted from anyone's notes.
 */
export const VAR_READER = `(() => {
  window.M.vars = () => {
    const rd = window.M.rd;
    const w = (a) => rd(a) | (rd(a + 1) << 8);
    const TXTTAB = w(0x67), VARTAB = w(0x69), ARYTAB = w(0x6b), STREND = w(0x6d);
    const name = (b1, b2) => {
      let s = String.fromCharCode(b1 & 0x7f);
      if ((b2 & 0x7f) !== 0) s += String.fromCharCode(b2 & 0x7f);
      return s;
    };
    // the 5-byte Applesoft float: sign-magnitude, excess-128 exponent, implied leading 1
    const mflp = (a) => {
      const e = rd(a);
      if (e === 0) return 0;
      const m1 = rd(a + 1), m2 = rd(a + 2), m3 = rd(a + 3), m4 = rd(a + 4);
      const sign = (m1 & 0x80) ? -1 : 1;
      const mant = ((m1 | 0x80) * 0x1000000 + m2 * 0x10000 + m3 * 0x100 + m4) / 0x100000000;
      return sign * mant * Math.pow(2, e - 128);
    };
    // A machine that has not run BASIC has VARTAB == ARYTAB == $803, and a machine in a
    // bad state has pointers that are simply wrong. Walking those produces thousands of
    // convincing-looking variables out of random memory, so refuse instead.
    if (ARYTAB < VARTAB || (ARYTAB - VARTAB) > 7 * 400 || VARTAB < 0x800) {
      return { TXTTAB, VARTAB, ARYTAB, STREND, count: 0, vars: [],
        refused: 'variable table looks unreal: VARTAB ' + VARTAB.toString(16) + ' ARYTAB ' + ARYTAB.toString(16) };
    }
    const out = [];
    for (let p = VARTAB; p + 6 < ARYTAB; p += 7) {
      const b1 = rd(p), b2 = rd(p + 1);
      if (b1 === 0 && b2 === 0) continue;
      const hi1 = !!(b1 & 0x80), hi2 = !!(b2 & 0x80);
      const nm = name(b1, b2);
      if (hi1 && hi2) {                                   // integer:  NAME%
        const v = (rd(p + 2) << 8) | rd(p + 3);
        out.push({ name: nm + '%', type: 'int', value: v > 32767 ? v - 65536 : v, at: p });
      } else if (!hi1 && hi2) {                           // string:   NAME$
        const len = rd(p + 2), ptr = rd(p + 3) | (rd(p + 4) << 8);
        let s = ''; for (let i = 0; i < len && i < 64; i++) s += String.fromCharCode(rd(ptr + i) & 0x7f);
        out.push({ name: nm + '$', type: 'str', value: s, at: p });
      } else {                                            // float:    NAME
        out.push({ name: nm, type: 'real', value: mflp(p + 2), at: p });
      }
    }
    return { TXTTAB, VARTAB, ARYTAB, STREND, count: out.length, vars: out };
  };
  return 'ok';
})()`;
