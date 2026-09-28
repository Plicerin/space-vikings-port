# The oracle

The original Space Vikings disk, running in [apple2js](https://github.com/whscullin/apple2js),
drivable from a script. Every capture is measured against this.

It exists because the port had no arbiter: `"test": "tsc --noEmit"` is a typechecker, and
nothing answered *does this match the disk?*

```js
import { openOracle } from './oracle/a2.mjs';
const a2 = await openOracle();
await a2.boot();                        // disk in drive 1, reset, run
await a2.waitMs(9000);                  // the title takes ~9s
console.log((await a2.screen()).join('\n'));
const hgr = await a2.readRange(0x2000, 0x4000);
await a2.close();
```

`node oracle/probe_boot.mjs` boots the disk and prints the screen as it changes — run it
first to check the oracle still works.

## What it gives you

- `read(addr)` / `readRange(from, to)` — any byte of the machine
- `screen()` — the 40-column text screen, line bases already de-interleaved
- `pc()`, `cycles()` — where the 6502 is and how long it has run
- `key(ch)` — a keypress through the keyboard soft switch
- `pause()` / `resume()` — stop the clock to read a consistent snapshot

The CPU underneath also has `stepCycles(n)` and `stepCyclesDebug(n, cb)`, so
instruction-level tracing is available when a capture needs it.

## Notes

- `emu/` is a **built** apple2js (webpack production build, ~2 MB). Its source is the
  upstream repo plus two git submodules (`cpu6502`, `apple2shader`) — clone with
  `--recurse-submodules` or the build fails on missing type declarations.
- Loading the disk goes at the Disk II card directly rather than through the UI's
  `doLoadHTTP`, which fetches in the background: resetting a fixed delay after it raced
  the fetch, and the Autostart ROM dropped to a `]` prompt in half a second. `boot()`
  refuses to reset until the drive reports a disk.
- The title screen is text mode; hi-res page 1 is still all zeros there.
