# The oracle

The original Space Vikings disk, running in [apple2js](https://github.com/whscullin/apple2js),
drivable from a script. Every capture is measured against this.

It exists because the port had no arbiter: `"test": "tsc --noEmit"` is a typechecker, and
nothing answered *does this match the disk?*

Findings go in [DISK_TRUTH.md](DISK_TRUTH.md), which is the only findings document to trust.

```js
import { openOracle } from './oracle/a2.mjs';
const a2 = await openOracle();
await a2.boot();                        // returns at the game's first question
console.log((await a2.screen()).join('\n'));
const hgr = await a2.readRange(0x2000, 0x4000);
await a2.close();
```

`node oracle/probe_boot.mjs` boots the disk and prints the title screen — run it first to
check the oracle still works.

## What it gives you

- `boot()` — disk in drive 1, into the Disk II boot ROM, stepped until the game asks
  `(N)EW GAME OR (O)LD GAME?`. Throws rather than hand back a machine that did not get
  there.
- `frames(n)` / `waitMs(ms)` — the only clock there is; the machine advances nowhere else
- `read(addr)` / `readRange(from, to)` — any byte of the machine
- `screen()` — the 40-column text screen, line bases de-interleaved and inverse video
  decoded
- `pc()`, `cycles()` — where the 6502 is and how long it has run
- `key(ch)` — a keypress through the keyboard soft switch

`probe_list.mjs` + `detokenise.mjs` list the running Applesoft program out of memory, which
is the most trustworthy document about this game there is: it is what the disk loaded, not
what anyone wrote down afterwards.

The CPU underneath also has `stepCycles(n)` and `stepCyclesDebug(n, cb)`, so
instruction-level tracing is available when a capture needs it.

## Things that will bite you

- **`a2.reset()` does not boot the disk.** apple2js's reset does not re-run the Autostart
  ROM's slot scan, so a reset with a disk in the drive sits at a `]` prompt for ever.
  `boot()` enters the Disk II boot ROM at `$C600` instead — unlike typing `PR#6`, that
  needs no keyboard timing.
- **Never use apple2js's own `run()`.** It steps by wall clock inside
  `requestAnimationFrame`; under headless Chromium that is throttled and the disk sometimes
  booted and sometimes stalled. The oracle steps itself so a run is reproducible.
- **Nothing sampled during the disk load is reproducible.** Three boots agree only from
  frame 660 onwards. Take captures after `boot()` returns, never before.
- **Do not mask screen bytes to `$7F`.** That turns inverse video into control codes — the
  title reads `^S^P^A^C^E`. `screen()` handles it; raw reads do not.
- **After the title, the text screen is meaningless.** The game redirects character output
  to its own hi-res driver at `$9300` (`POKE 54,0: POKE 55,147`), so from then on text is
  pixels on the hi-res page.
- **`pause()` / `resume()` do nothing** and are kept only so older probes still run. The
  machine only advances inside `frames()`, so every read is already of a still machine.
- `emu/` is a **built** apple2js (webpack production build, ~2 MB). Its source is the
  upstream repo plus two git submodules (`cpu6502`, `apple2shader`) — clone with
  `--recurse-submodules` or the build fails on missing type declarations.
- Loading the disk goes at the Disk II card directly rather than through the UI's
  `doLoadHTTP`, which fetches in the background: resetting a fixed delay after it raced the
  fetch. `boot()` refuses to reset until the drive reports a disk.
