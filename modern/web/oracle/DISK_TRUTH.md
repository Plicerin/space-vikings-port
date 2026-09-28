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

## The disk, read directly

`dsk.mjs` reads the DOS 3.3 image: 35 tracks of 16 sectors of 256 bytes, VTOC at track 17
sector 0, catalog sectors as a linked list of 7 entries each. `probe_catalog.mjs` prints it;
`probe_extract.mjs` writes every Applesoft program to `captured/disk/`.

This was worth doing because following the chain by reaching each game state only ever finds
the branches you manage to trigger. The catalog has all of them: **66 files, 23 of them
Applesoft programs.**

### The check that makes the reader trustworthy

`probe_chain.mjs` lists programs out of the *running machine* as the game chains through
them, and names each one by matching it against the catalog. START, STARSHIP SIMULATOR and
RE have all been captured both ways and are **identical byte for byte**. Two independent
routes to the same bytes, so the reader is not inventing anything.

That check also caught a mistake. Naming a live capture from the previous program's `RUN`
filed STARSHIP SIMULATOR under `INSTRUMENTS`: START does run INSTRUMENTS, but INSTRUMENTS
chains on before the image settles, so the second program seen live is already the next one.
**Names come from the catalog now, never from a guess.**

### Load addresses: two different numbers

A binary's catalog header records where it was `BSAVE`d from, and **`BLOAD ,A$xxxx`
overrides it**. Most files on this disk were saved out of a `$6000` staging area, so the
header address is usually `$6000` and means nothing. The address that matters is the one in
the `BLOAD`.

| BLOADed to | File |
| --- | --- |
| `$6000` | LO-HI A2-3D1 |
| `$7300` | PLANET # *n* |
| `$7879` | SHIP # *n*, or DEBRIS |
| `$7FFF` | ENEMY I.A24580.L68 |
| `$8800` | CHARACTER TABLE |
| `$8BEC` | MEM DATA |
| `$9023` | SPACE SIMULATOR ASSEMBLY |
| `$9276` | SOUND GEN |
| `$92D1` | LASER |
| `$9300` | HI-RES CHARACTER GENERATOR |
| `$9400` | MEM TRANSFER A |
| `$9506` | SHIP'S DATA (`-M` master for a new game) |
| `$954C` | PLANET FILE (`-M` master), length `$AF` |
| `$9600` | TRANLIT.OBJ0 |
| `$97E1` | P/F (`-M` master) |

DOS commands are `PRINT CHR$(4)"BLOAD ..."`, so a literal control-D sits inside the quote in
every listing. Grep accordingly.

### What runs what

The game is 23 chained Applesoft programs. `START` is the boot program; everything returns
to `STARSHIP SIMULATOR` (flight) or `COM` (the ship's menu).

```
START -> INSTRUMENTS -> STARSHIP SIMULATOR
STARSHIP SIMULATOR -> RE (re-entry), ORBIT, H/D
COM  -> GALAXY MAP, GROUND FORCES, RADAR, STATUS, SUPPLY, STARSHIP SIMULATOR
GROUND FORCES -> COLLECT, RECALL, SHORE LEAVE, COM
RADAR -> SHIP # n I.D. -> RADAR
GALAXY MAP -> COM, INSTRUMENTS, STARSHIP SIMULATOR
H/D -> S/X, STARSHIP SIMULATOR
COLLECT, STATUS, SUPPLY -> COM
DMG, EX, ORBIT, RE, RECALL -> STARSHIP SIMULATOR / GROUND FORCES
```

| Program | Lines | Bytes | |
| --- | --- | --- | --- |
| START | 110 | 4513 | boot, title, loads everything, sets the opening state |
| STARSHIP SIMULATOR | 134 | 5553 | flight: the main loop |
| SHORE LEAVE | 105 | 5562 | |
| COM | 124 | 5412 | the ship's menu |
| GROUND FORCES | 95 | 4708 | |
| GALAXY MAP | 69 | 2721 | |
| H/D | 57 | 2149 | |
| STATUS | 60 | 1859 | |
| COLLECT | 47 | 1909 | |
| SHIP # 4 I.D. | 34 | 1728 | |
| INSTRUMENTS | 32 | 1222 | |
| SHIP # 1 I.D. | 26 | 1270 | |
| SHIP # 3 I.D. | 28 | 1182 | |
| RADAR | 27 | 1140 | |
| SUPPLY | 27 | 1274 | |
| END | 21 | 813 | |
| ORBIT | 20 | 791 | |
| RE | 18 | 764 | re-entry |
| EX | 16 | 508 | |
| S/X | 16 | 360 | |
| RECALL | 12 | 554 | |
| SHIP # 0 I.D. | 8 | 374 | |
| DMG | 3 | 94 | |

There are 21 planet binaries (PLANET # 0 to # 20) and four ship shapes (SHIP # 0, 1, 3, 4)
plus DEBRIS.

## The flight model

From `captured/disk/starship_simulator.bas`, which is the main loop. Constants at lines 1-2:

```
DI = 32768   HH = 256   HL = 255   Q = 1.41
W1 = 20000   W2 = -20000            world wrap
CSN = $6006  SN = $6009  CA = $9023 cosine, sine, and the simulator entry point
M1 = $600C   M2 = $600D             the byte pair those routines read and write
```

Heading, pitch and bank are single bytes. The program pokes one into `M1`, `CALL`s the sine
or cosine routine in the assembly, and reads a 16-bit result back out of `M1`/`M2`, fixing
up the sign itself (lines 21-128) — there is no floating-point trigonometry anywhere.

The integration, line 129:

```basic
YP=YP/DI: ZH=ZH/DI: XH=XH/DI: ZP=ZP/DI
X1 = S*(ZP*XH): Z1 = S*ZP*ZH: X = X+X1: Z = Z+Z1: Y1 = S*YP: Y = Y+Y1
IF P>190 OR P<64 THEN Y = Y - 2*Y1
```

`S` is speed, held at `$9506+$33` (`PEEK(38157)`) and clamped to **0-120** (lines 207-208).
The trig results are 16-bit fixed point over `DI = 32768`.

Position wraps at **+/-20000** on each axis (lines 133-138): past one edge it reappears at
the other.

Pitch is clamped every frame (lines 175-177): `59` going one way, `195` (= -61) the other.

The HUD prints `INT(X/2)`, `INT(Y/2)`, `INT(Z/2)`, `INT(H*1.41)`, `INT(P*1.41)` — so the
displayed coordinates are **half** the stored ones, and displayed angles are the raw byte
times 1.41 (256 -> ~360).

Transitions out of flight:

| Condition | Goes to |
| --- | --- |
| `ABS(X)<900 AND ABS(Y)<900 AND ABS(Z)<900 AND PEEK(38210)=0` | `RE` |
| `PEEK(38210)=1 AND Y>4000` | `ORBIT` |
| key `X` (24) | `H/D` |

Keys are read with `PEEK(-16384)` and cleared with `POKE -16368,0` (lines 200-210).

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

## The planet tables

`probe_planetdata.mjs` decodes `PLANET FILE-M` (175 bytes, BLOADed to `$954C`) and `P/F-M`
(336 bytes, `$97E1`), and writes the result to `captured/planet_data.json` and to
`src/engine/diskPlanetData.ts` in the port.

**Planets are numbered 1..20.** GALAXY MAP loops `FOR P = 1 TO 20`, and `PEEK(38209)` — the
current planet — is compared against `P` inside that loop and used to index `X()`/`Y()`/`Z()`.
There is no planet 0 on the map.

### Each table is located by a use site, and they do not share a base

This is the trap. Reading the file as one array of records, or picking one base for all of
it, puts half the data off by one.

| Table | Use site | Address | Offset |
| --- | --- | --- | --- |
| flag | GALAXY MAP 3066: `IF PEEK(38219 + P) = 1 THEN HCOLOR= 2` | `$954B+P` | `P-1` |
| defence | STARSHIP SIMULATOR 8: `TE = PEEK(38282 + PEEK(38209))` | `$9586+P` | `62+P` |
| Z | GALAXY MAP 3020: `Z(P) = PEEK((M + P) - 42)`, `M = 38366` | `$95B4+P` | `104+P` |
| Y | GALAXY MAP 3020: `Y(P) = PEEK((M + P) - 21)` | `$95C9+P` | `125+P` |
| X | GALAXY MAP 3020: `X(P) = PEEK(M + P)` | `$95DE+P` | `146+P` |

Offset 62 (`$9586`, value 3) is **not** a planet: no planet number indexes it, because the
defence table is read at `38282 + P` for `P` in 1..20, which is offsets 63..82.

| P | flag | X | Y | Z | defence |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 | 15 | 15 | 15 | 3 |
| 2 | 0 | 13 | 13 | 12 | 3 |
| 3 | 0 | 14 | 9 | 15 | 3 |
| 4 | 0 | 8 | 16 | 12 | 0 |
| 5 | 0 | 22 | 14 | 19 | 2 |
| 6 | 0 | 13 | 22 | 19 | 1 |
| 7 | 0 | 17 | 23 | 12 | 4 |
| 8 | 0 | 14 | 8 | 9 | 2 |
| 9 | 0 | 19 | 13 | 25 | 3 |
| 10 | 0 | 20 | 22 | 10 | 4 |
| 11 | 0 | 9 | 23 | 20 | 0 |
| 12 | 0 | 7 | 23 | 14 | 1 |
| 13 | 0 | 25 | 21 | 13 | 4 |
| 14 | 0 | 25 | 15 | 21 | 2 |
| 15 | 0 | 9 | 21 | 19 | 0 |
| 16 | 0 | 25 | 5 | 11 | 3 |
| 17 | 0 | 24 | 10 | 10 | 3 |
| 18 | 0 | 11 | 18 | 27 | 3 |
| 19 | 0 | 18 | 27 | 11 | 1 |
| 20 | 0 | 11 | 11 | 25 | 2 |

Defenders only appear when defence is **2 or more** (STARSHIP SIMULATOR line 189:
`IF PEEK(38282 + PEEK(38209)) < 2 THEN 200`).

`$95F7` (offset 171) is the save sentinel: 0 in the master, 77 once a game has been saved.
START line 26 reads it, and line 73 refuses `(O)LD` without it.

### P/F-M

21 fixed 16-byte records, byte 5 of each being the planet number it belongs to (1..20, the
last record being filler). Bytes 0-1 are a 16-bit little-endian value, then three bytes.
Their meaning is **not yet settled** — no use site has been read for them — so they are
recorded in `captured/planet_data.json` as `w0`, `b2`, `b3`, `b4` and nothing is claimed
about them.

### The port's planet table is off by one

`src/engine/extractedOriginalData.ts` holds `EXTRACTED_LIVE_PLANET_TABLE`, 20 rows labelled
planets 0..19. Its `tech` column matches `PLANET FILE` offsets **62..81** — all 20 values,
exactly. The game reads planet `P` at offset **62+P**, which is offsets 63..82.

So every planet in the port carries **the previous planet's defence level**, and the
disk's planet 20 (defence 2) is missing entirely. Matching offsets 63..82 instead scores
5/20, which is what a one-place shift through this data looks like.

`src/engine/diskPlanetData.ts` is generated from the disk and is correct. The old table is
still in the tree and still wired up; replacing its consumers is not done.

---

## Frame parity

`frame_parity.mjs` renders the same screen on both sides and counts the pixels that
disagree. Until it existed nothing answered "does this look like the original?" - the port
had a typechecker and some screenshots.

The screen is the cockpit panel, INSTRUMENTS lines 10-200. It is the right one to start
with: a pure sequence of HPLOTs and PRINTs, no RNG, no input, no dependence on ship state,
so any difference is the port's and not timing's. The oracle capture is taken at the moment
INSTRUMENTS is the loaded program - identified by its program image, not by a delay - and
before STARSHIP SIMULATOR draws ships over it.

Both sides reduce to 280x192 lit-or-not. Colour is left out on purpose: hi-res colour is a
property of bit position and fringing, and comparing it would confuse "the port drew the
wrong thing" with "the port resolves fringing differently".

**As measured: 1,264 of 53,760 pixels differ - 97.649% agree.** Every differing pixel is
at y >= 128, which is the panel; nothing else on the screen disagrees.

It started at 95.086% (2,642 differing). Two causes were found and fixed.

### Fixed: coloured lines were drawn at double density

Row 128 is `HPLOT 1,128 TO 279,128` under `HCOLOR= 1`. Before:

```
disk x1-40  1010101010101010101010101010101010101010   140 lit, all odd columns
port x1-40  1111111111111111111111111111111111111111   279 lit
```

A non-white HCOLOR on the Apple II lights alternate pixel columns, so its lines come out
dotted at half density. The port's odd-column count already matched the disk exactly, so
the geometry was right and only the even columns were spurious.

`probe_hcolor.mjs` measured all eight values rather than assuming the other six. It does
not need the game or even a disk - HGR, HCOLOR and HPLOT are Applesoft ROM - so it enters
Applesoft's cold start at `$E000` and types HPLOT commands at the `]` prompt:

| HCOLOR | | columns lit | bit 7 |
| --- | --- | --- | --- |
| 0, 4 | black | none | |
| 1 | green | **odd** | 0 |
| 2 | violet | **even** | 0 |
| 3 | white1 | all | 0 |
| 5 | orange | **odd** | 1 |
| 6 | blue | **even** | 1 |
| 7 | white2 | all | 1 |

HPLOT *writes* the bit either way, so plotting green over white erases the even columns
rather than leaving them. `Hires.argbAt()` stores black for the off-phase for that reason.

> **Known limit.** HPLOT also sets bit 7 of every byte it touches, which switches the
> palette for all seven pixels in that byte. The port has an ARGB buffer rather than a bit
> framebuffer, so it cannot reproduce that spill. Geometry is right; colour fringing at
> byte boundaries is not modelled.

### Fixed: inverse-video text was not implemented

INSTRUMENTS 165 does `POKE 973,255` before printing SPEED / TURN / ENERGY and 177 does
`POKE 973,0` after, so **973 (`$3CD`) is the hi-res character generator's inverse flag**.
STARSHIP SIMULATOR 156 uses it the same way. It covers exactly nine labels; everything from
line 180 on is printed normally.

Inverse fills the whole 7x8 character cell and knocks the glyph out of it. The port's
`text()` already had an `invert` option but only painted the five glyph columns, leaving
gaps the original does not have - on the disk an inverse run is solid.

### What still differs

**The character set.** The port's `TEXT_GLYPHS` is its own 5x7 font. The disk's is
CHARACTER TABLE, BLOADed to `$8800` - 1024 bytes, 128 glyphs of 8 rows - driven by HI-RES
CHARACTER GENERATOR at `$9300`. Most of the remaining difference is glyph shape.

**`CALL 38402`.** INSTRUMENTS line 210 calls into TRANLIT.OBJ0 before chaining, and it
fills the four gauge boxes: measured inside them at y152-165 the disk has 393 lit pixels,
6 to 10 per interior row of a 12-wide box, where the port has only the outline. The port
draws its gauges later, in the cockpit scene, so this is partly an artefact of comparing at
this instant rather than a missing feature - but what that routine draws has not been
read.

---

## Open questions

- What `CSN`/`SN`/`M1`/`M2` at `$6006-$600D` compute exactly - the sine and cosine tables
  are in SPACE SIMULATOR ASSEMBLY and have not been disassembled.
- What `CALL CA` (`$9023`, SPACE SIMULATOR ASSEMBLY) draws, and how. This is the renderer;
  none of it is understood yet.
- The meaning of the flags the BASIC peeks: `38157` (speed), `38164`, `38199`, `38205`,
  `38207`, `38208`, `38209`, `38210`, `38282+n`. Only their use is known, not their names.
- Which ship number `J = PEEK(38205)` selects, and what `DEBRIS` replaces it for.
- What the `P/F-M` record fields mean - no use site read yet.
- What `$953C-$954B` holds. `SHIP'S DATA-M` is only 54 bytes (`$9506-$953B`), so a new game
  leaves that gap untouched, yet `PEEK(38209)` (`$9541`, the current planet) lives in it and
  is read on the first pass through flight. Something in the assembly must write it.
- Everything about flight rendering. The parity harness covers one static screen; nothing
  that moves has been compared.
- What HI-RES CHARACTER GENERATOR (`$9300`) does with CHARACTER TABLE (`$8800`) beyond the
  inverse flag at 973.
