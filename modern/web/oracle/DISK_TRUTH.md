# DISK_TRUTH

What the original *Space Vikings* disk actually does, measured from the disk running under
the oracle. **This is the only findings document to trust.** Nothing here is inferred from
the port, from screenshots, or from earlier notes; every entry says how it was obtained and
can be re-derived by running the probe named against it.

The rule: **the disk is the only source.** If something is not in here, it is not known.

---

## How a finding gets into this file

1. A probe in this directory produces it from the running disk.
2. The probe is committed, so the number can be reproduced.
3. The entry names the probe and what it observed.

A value that came from reasoning about a listing rather than reading the machine is marked
as such and does not count as settled until measured. (Working `GOSUB 6000` out by hand gave
the wrong low byte; the machine gave `a8 e4`. Read the machine.)

---

## The oracle

`a2.mjs` runs the original `.dsk` in apple2js (vendored under `emu/`) inside headless
Chromium, driven from Node.

### Booting

`a2.reset()` **does not boot the disk.** apple2js's reset does not re-run the Autostart
ROM's slot scan, so a reset with a disk in drive 1 sits in the Autostart KEYIN loop at a
`]` prompt for ever, with `VARTAB = $803` (no program). The oracle enters the Disk II boot
ROM directly:

```js
window.M.a2.reset();
const st = cpu.getState(); st.pc = 0xC600; cpu.setState(st);
```

Unlike typing `PR#6` this needs no keyboard timing.

### The clock

apple2js's own `run()` steps by **wall clock** inside `requestAnimationFrame`. Under
headless Chromium that is throttled, and the disk sometimes booted to the game and
sometimes stalled at the `]` prompt. Nothing is measurable on top of that, so the oracle
steps itself: `frames(n)` runs n x 17,030 cycles (262 scanlines x 65 at 1.0205 MHz).

### What "booted" means

Three candidate signals, two of them wrong:

| Signal | Why it fails |
| --- | --- |
| PC left ROM | A running Applesoft program is inside the interpreter at `$D000-$F7FF` most of the time, and `$C600` is itself below `$D000`. |
| Something is on the screen | DOS leaves its own `]` prompt there ~4 s before the game draws anything. |
| **A program is loaded (`VARTAB > $803`) and the 6502 is in KEYIN (`$FD1B-$FD2F`)** | This is the game asking its first question. Checked on two consecutive samples so one unlucky sample cannot pass it. |

`boot()` uses the third and reaches the title prompt after **690 frames (~11.5 s of Apple II
time, 13,277,903 cycles)**.

### Determinism - measured, with a limit

`probe_step_debug.mjs N` boots N times and compares memory (not PC - PC sampled inside a
delay loop or KEYIN lands on a different instruction of the same loop each time, which is
not divergence).

Three boots, 40 checkpoints each:

| Observable | Result |
| --- | --- |
| `VARTAB` | differs, frames 30-180 |
| `ARYTAB` | identical throughout |
| program image `$800-$1A04` | differs, frames 30-330 |
| hi-res page 1 | differs, frames 30-630 |
| text screen | differs at frame 180 only |

**The runs disagree while the disk is loading, then agree from frame 660 onwards** - 19
consecutive identical checkpoints up to the title screen.

> **Known limit.** Captures taken *after* `boot()` are reproducible. Captures taken *during*
> the load are not. No probe may sample before `boot()` returns.

### Reading the text screen

A screen byte carries the character in its low 6 bits and the video mode in the top two:
`$80-$FF` normal, `$40-$7F` flashing, `$00-$3F` inverse. Masking to `$7F` - the obvious
thing - turns inverse text into control codes, and the title reads `^S^P^A^C^E` instead of
`SPACE`. Take the low 6 bits and lift `$00-$1F` to `$40-$5F`.

**After line 75 the text screen stops being meaningful.** The title program does
`POKE 54,0: POKE 55,147`, redirecting character output to `$9300` - the HI-RES CHARACTER
GENERATOR. From that point all text is drawn onto the hi-res page by the game's own driver,
and page 1 of the text screen holds leftovers.

---

## The program on the disk

`probe_list.mjs` lists the running Applesoft program straight out of memory
(`detokenise.mjs` walks the linked list from `TXTTAB`). This is the game's own source as
the disk loaded it. Captured to `captured/title.bas`.

The boot program is **4,513 bytes**. It draws the title, asks
`(N)EW GAME OR (O)LD GAME?`, loads the binaries, sets the opening state, and chains to
`INSTRUMENTS`.

### What it loads, and where

| Address | File |
| --- | --- |
| `$6000` | LO-HI A2-3D1 |
| `$7300` | PLANET # 0 |
| `$7879` | SHIP # *n* - or DEBRIS |
| `$7FFF` | ENEMY I.A24580.L68 |
| `$8800` | CHARACTER TABLE |
| `$8BEC` | MEM DATA |
| `$9023` | SPACE SIMULATOR ASSEMBLY |
| `$9276` | SOUND GEN |
| `$92D1` | LASER |
| `$9300` | HI-RES CHARACTER GENERATOR |
| `$9400` | MEM TRANSFER A |
| `$9506` | SHIP'S DATA (`-M` master for a new game) |
| `$954C` | PLANET FILE (`-M` master for a new game), length `$AF` |
| `$9600` | TRANLIT.OBJ0 |
| `$97E1` | P/F (`-M` master for a new game) |

### The pointers the BASIC holds

Set at line 30. These are **addresses the program pokes and peeks, not coordinates** -
reading them as state is the trap that produced the earlier wrong numbers.

| Variable | Value | Address | Holds |
| --- | --- | --- | --- |
| `XI` | 29467 | `$731B` | ship X, 16-bit |
| `YI` | 29469 | `$731D` | ship Y, 16-bit |
| `ZI` | 29471 | `$731F` | ship Z, 16-bit |
| `P1` | 29473 | `$7321` | pitch, 8-bit |
| `B1` | 29474 | `$7322` | bank, 8-bit |
| `H1` | 29475 | `$7323` | heading, 8-bit |
| `CSN` | 24582 | `$6006` | not yet known |
| `SN` | 24585 | `$6009` | not yet known |
| `M1` | 24588 | `$600C` | not yet known |
| `M2` | 24589 | `$600D` | not yet known |
| `DI` | 32768 | `$8000` | not yet known |
| `CA` | 36899 | `$9023` | SPACE SIMULATOR ASSEMBLY entry |

So the ship's state lives in a nine-byte block at `$731B`, inside PLANET # 0's load area
(`$7300`).

---

## The opening state of a new game - settled

**`X = 700, Y = 200, Z = -7000, pitch = 0, bank = 0, heading = 0`.**

The listing says so at lines 190/195, *before* the new/old branch:

```basic
190 BV%=-7000: GOSUB 6000: POKE ZI,LO%: POKE ZI+1,HI%
    BV%=700:   GOSUB 6000: POKE XI,LO%: POKE XI+1,HI%
    BV%=200:   GOSUB 6000: POKE YI,LO%: POKE YI+1,HI%
195 POKE H1,0
```

and line 225 overwrites the whole block from SHIP'S DATA (`$9543-$954B`) **for an OLD game
only** - line 224 is `IF G$ = "N" THEN GOTO 230`.

Measured (`probe_opening.mjs`): after answering `(N)EW`, the nine bytes at `$731B` settle at

```
bc 02  c8 00  a8 e4  00 00 00
 700    200   -7000   p  b  h
```

and do not change again through the rest of the load.

> **This resolves the disagreement recorded in `current_status.md`.** `START.bas`'s
> documented `X=700 Y=200 Z=-7000 H=0` is the opening state. The port's
> `extractedOriginalData.ts` values (`y=210, z=-6761, heading=255, pitch=248`) are **not**
> the opening state - they are a capture taken some way into flight. The port initialises a
> new game from a mid-flight snapshot.

### New game vs. old game

| | New (`G$="N"`) | Old (`G$="O"`) |
| --- | --- | --- |
| Line 190/195 opening state | applied | applied, then overwritten |
| `GOSUB 2000` - BLOAD the `-M` master files, seed MISC FILE with `100.3 / 2000 / 10000` | yes | no |
| `GOSUB 3000` - BLOAD the saved files | no | yes |
| Line 225 - restore `$731B-$7323` from `$9543-$954B` | **no** | yes |

Line 73 refuses `(O)LD` with `THERE IS NO GAME SAVED` unless `PEEK(38391) = 77`
(`$95F7 = 'M'`), so a save is marked by a sentinel byte in PLANET FILE.

---

## Open questions

- What `INSTRUMENTS` (chained at line 260) does with `$731B` - not yet listed.
- What `CSN`/`SN`/`M1`/`M2` at `$6006-$600D` hold.
- Which ship number `J = PEEK(38205)` selects, and what `DEBRIS` replaces it for
  (line 240: `PEEK(38282 + PEEK(38209)) > 1 AND PEEK(38205) = 0`).
- Everything about flight: no frame-parity harness exists yet.
