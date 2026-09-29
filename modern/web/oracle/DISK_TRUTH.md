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

**As measured: 0 of 53,760 pixels differ - the port's cockpit panel is pixel-identical to
the disk's.** Both light 2,856 pixels, in the same places.

It started at 95.086%. Five defects were found and fixed, each one visible only because the
previous had been cleared.

The comparison is against **every distinct hi-res page the oracle sees while INSTRUMENTS is
The comparison is against **every distinct hi-res page the oracle sees while INSTRUMENTS is
the loaded program**, picking the frame that agrees best - found by comparing rather than by
timing. The port now draws line 210's lamps too, and the frame it matches moved from 8 to 9
accordingly.

### 1. Coloured lines were drawn at double density

A non-white HCOLOR on the Apple II lights alternate pixel columns, so its lines come out
dotted. `probe_hcolor.mjs` measured all eight values rather than assuming the six the panel
does not use. It needs neither the game nor a disk - HGR, HCOLOR and HPLOT are Applesoft
ROM - so it enters Applesoft's cold start at `$E000` and types HPLOT commands at the `]`
prompt:

| HCOLOR | | columns lit | bit 7 |
| --- | --- | --- | --- |
| 0, 4 | black | none | |
| 1 | green | **odd** | 0 |
| 2 | violet | **even** | 0 |
| 3 | white1 | all | 0 |
| 5 | orange | **odd** | 1 |
| 6 | blue | **even** | 1 |
| 7 | white2 | all | 1 |

Green and orange share a phase; violet and blue take the other one. HPLOT *writes* the bit
either way, so plotting green over white erases the even columns rather than leaving them -
`Hires.argbAt()` stores black for the off-phase for that reason.

> **Known limit.** HPLOT also sets bit 7 of every byte it touches, which switches the
> palette for all seven pixels in that byte. The port has an ARGB buffer rather than a bit
> framebuffer, so it cannot reproduce that spill.

### 2. Inverse video was not implemented

INSTRUMENTS 165 does `POKE 973,255` before printing SPEED / TURN / ENERGY and 177 does
`POKE 973,0` after, so **973 (`$3CD`) is the hi-res character generator's inverse flag**.
STARSHIP SIMULATOR 156 uses it the same way. It covers exactly nine labels. Inverse fills
the whole 7x8 cell and knocks the glyph out of it; painting only the five glyph columns left
gaps the original does not have.

### 3. The character set was not the disk's

CHARACTER TABLE is BLOADed to `$8800`: 1024 bytes, 128 glyphs of 8 rows, driven by HI-RES
CHARACTER GENERATOR at `$9300`. Each row is 7 bits with **bit 0 the leftmost pixel** - the
same order hi-res bytes use - and the index is the character code masked to 7 bits. The
glyphs carry their own left margin, so there is no offset to add when drawing.

Neither the bit order nor the index mapping is written down anywhere, and guessing either
would put every letter subtly wrong. `probe_font.mjs` lifts the 7x8 cells under labels the
disk had actually drawn (MANUAL, AUTO, ORBIT, DAMAGE, MISSILE, LASER, COND, SHIELD) and
searches for the decoding that reproduces all 43 of them. A decoding that renders the real
screen is the right one by construction.

### 4. Two boxes the original does not draw

INSTRUMENTS 90-160 draws **eight** boxes, at y152 and y160 for x = 6, 71, 200 and 261. The
port drew ten, with an extra pair at y168 - 64 pixels it lit and the disk did not.

### 5. Text was transparent; on the Apple it is opaque

The character generator writes whole bytes, so a character erases whatever was under its
cell. INSTRUMENTS 200 prints X, Y, Z, XHDNG and YHDNG at text row 23, straight over the
orange rule line 70 drew at y177, and on the disk the rule is **gone** beneath them. The
port drew only the lit pixels, so the rule showed through - 31 pixels, at exactly the
character cells of HTAB 3, 9, 15, 25 and 34.

### What `CALL 38402` draws: eight blinking lamps

`$9602`, reached from INSTRUMENTS line 210 (`POKE 38189,10: CALL 38402`) and from STARSHIP
SIMULATOR line 500, every pass of the main loop. It reads `$952D` (38189): 10 draws all six
routines, anything else updates only the one `$9517` selects.

The drawing is `$9754`, and it is self-modifying - `$9773` and `$9774` are the low and high
operand bytes of the `STA` at `$9772`:

```
$9754  LDA #$00 / STA $9600      ; column counter
$9759  LDY #$00
$975B  LDA $9601 / BNE $9769
       LDA $9789,Y / STA $9774   ; 25 29 2d 31 35
       JMP $976F
$9769  LDA $978E,Y / STA $9774   ; 26 2a 2e 32 36
$976F  LDA $9793,X
$9772  STA $35F7                 ; <- $9773/$9774 are this operand
       INY / CPY #$05 / BNE $975B
$977A  INX / INC $9773 / INC $9600
       LDA $9600 / CMP #$02 / BNE $9759
```

Five rows from the high-byte table, two columns from the bumped low byte, the same byte
repeated down each column. The two tables work out as **rows 153-157** (`$9601` = 0) and
**rows 161-165** (`$9601` = 1), and the low bytes land on byte columns 1, 10, 28 and 37 in
both bands - eight lamps of 2 x 5 bytes, at x 7, 70, 196 and 259.

Each lamp has two appearances chosen by its own flag byte, and four of the six routines
write the flag back as they draw, so those blink as the main loop turns over:

| routine | flag | band | columns | flag = 0 | otherwise | flips? |
| --- | --- | --- | --- | --- | --- | --- |
| `$9643` | `$9539` | B | 37 | `50 2a` | `78 3f` | yes |
| `$966A` | `$953A` | B | 1, 10 | `55 02` / `7c 1f` | `7f 07` / `28 15` | yes |
| `$96A5` | `$9515` | B | 28 | `d0 aa` | 2: `a0 d5`, 3: `20 55` | 2 -> 3 -> 1 -> 2 |
| `$96DF` | `$9514` | A | 1, 10 | `7f 07` / `28 15` | `55 02` / `7c 1f` | yes |
| `$971A` | `$9542` | A | 28 | `20 55` | `70 7f` | no - atmosphere |
| `$9737` | `$95F9` | A | 37 | `50 2a` | `d0 aa` | no |

`$971A` reads the atmosphere flag RE sets, so that lamp is the one with a known meaning.

Measured, not inferred: `probe_gauges.mjs` blanks page 1, calls `$9602` with the flags set
both ways, and reads back which bytes land where.

**Two lamp states cannot be told apart from a capture.** `$95F9`'s two appearances are
`50 2a` and `d0 aa`, and two of `$9515`'s are `20 55` and `a0 d5`; each pair differs only in
bit 7, which is the palette and not a pixel. A lit-pixel comparison sees them as identical.

#### Wired, and what it settles

`Hires.hbyte()` writes a raw screen byte - seven pixels, LSB leftmost, clearing the bits it
does not set, with bit 7 picking green/violet or orange/blue by the odd/even split
`HCOLOR_PHASE` already records. The lamps are stored, not plotted, so they hold patterns no
HCOLOR produces and a plot-based primitive cannot express them.

The blinking four have no canonical state, so the phase the COM capture caught was read back
off the original's page: `$9539` = 1, `$953A` = 0, `$9515` = 3, `$9514` = 1, `$9542` = 0,
`$95F9` = 0. That is what makes the panel comparable at all.

| | before | after |
| --- | --- | --- |
| COM's panel region, rows 124-191 | 98.31% | **99.91%** |
| COM, whole page | 99.40% | **99.97%** |

Frame parity is still 100%, and the frame it matches moved from 8 to 9 - a genuinely
different captured frame, the one where line 210 has run. That is a check on the harness as
much as on the port: it picks the best-agreeing frame, which could have flattered a port
that drew nothing here, and instead it moved.

### The four panel needles

The 18 pixels `CALL 38402` left over are not that routine at all. They are STARSHIP
SIMULATOR's needles, redrawn every pass of the flight loop:

```
159 HCOLOR= 0: DRAW 25 AT TT,133: DRAW 26 AT 136,VV: DRAW 25 AT EE,133: DRAW 25 AT SS,133
    TX = 140 + ((HL - B) / 5.7): IF B < 127 THEN TX = 140 - (B / 5.7)
170 VY = INT(167 - ((HL - P) / 4)): IF P < 127 THEN VY = INT(167 + (P / 4))
173 SX = 13 + (S / 2):EX = 199 + E
175 HCOLOR= 3
180 DRAW 13 AT TX,133: DRAW 14 AT 136,VY: DRAW 13 AT SX,133: DRAW 13 AT EX,133
```

`HL` is 255. Line 159 erases the previous positions with the wider shapes 25 and 26 before
line 180 draws the new ones with 13 and 14, so the track is never repainted whole. Line 159
writes the `>= 127` form of `TX` first and overrides it below 127, which makes `B` and `P`
the same signed bytes the rest of the flight model uses.

`S = PEEK(38157)`, clamped to 0-120 by lines 207 and 208, and `E = PEEK(38199)`. Both scales
check out against something independent: `SX` spans 13 to 73 and `EX` spans 199 to 261, and
those are exactly the two ranges COM line 8 sweeps clear.

#### Why only two of the four are on COM's page

COM line 8, before it draws anything:

```
8 ... HCOLOR= 0: FOR X = 200 TO 260 STEP 5: DRAW 25 AT X,133: NEXT:
      FOR X = 13 TO 73 STEP 5: DRAW 25 AT X,133: NEXT
```

It wipes the speed and energy tracks. `TX` at 140 and the vertical needle at x 136 fall
between the two ranges and survive, which is why the capture has exactly those two. In the
snapshot `B` and `P` are both 0, so `TX` = 140 and `VY` = 167 - exactly where the missing
pixels were - and `S` = 0, `E` = 63 put `SX` at 13 and `EX` at 262. 262 is past the last
erase at 260, and it still comes out clean, so shape 25 is at least five pixels wider than
shape 13 either side.

**COM's page is now exact: 0 of 53,760 pixels differ.** `com_parity.mjs` models the sequence
rather than short-cutting it - INSTRUMENTS' panel, line 210's lamps, line 180's needles, then
COM, which erases two of them on its own line 8.

#### What this replaced in the port

`drawHUD` had its own reading of this part of the panel, and all four were wrong in the same
way: speed and energy as filled bars, and the bank and pitch needles as **rate-of-change**
markers at `140 + dHeading * 8` and `155 + dPitch * 6`. The disk drives all four off bytes,
not off how fast anything is changing. The energy bar also used `state.energy / 2000`.

That is the third independent sighting of the energy-scale problem, and the two on the disk
agree: STATUS line 1255 divides `$9537` by 62, line 173 spans it across a 199-260 track, and
the machine reads 63 on a fresh ship. `gameState.ts`'s 2000 is the odd one out. Everything
that needs the disk's byte now goes through `diskEnergyByte()`, which scales, so nothing
depends on which is right - but the port's energy model still does not match the disk.
---

## The energy byte, settled

`$9537` (38199) had been the port's `energy = 2000`, from the repo's own analysis. It is a
small byte, and four things on the disk agree on the scale:

| source | says |
| --- | --- |
| SHORE LEAVE 2525 | refills it to **63**, where every other system gets 100 |
| STARSHIP SIMULATOR 173 | `EX = 199 + E`, on a track with ticks at x 199, 231, 261 |
| COM `GOSUB 10000` | hides POWER LOW below **16** |
| the machine | reads **63** on a fresh ship |

SHORE LEAVE is the clearest, because it special-cases this one byte out of twelve. Its
repair loop reads the line 2500 DATA in pairs and `J = 2` is ENERGY:

```
2510 PRINT "  REPAIR SHIP": FOR J = 1 TO 12: READ A$: READ LO
2520 D = PEEK(LO): IF D < 100 AND J < > 10 AND J < > 2 THEN ... POKE LO,100
2524 IF D < 63 AND J = 2 THEN D2 = 63 - D:D2 = D2 * (100 / 63)
2525 IF D < 63 AND J = 2 THEN ... POKE LO,63
```

**STATUS is the odd one out, and it is the original that is wrong.** Line 1255 reads
`EN = PEEK(38199): EN = EN / 62: EN = INT(EN * 100)` - divided by 62 while a full tank is
63, so a full tank reads **101%**. The port reproduces that rather than clamping it.

### Only the hyperdrive spends it

Across all 23 programs there is exactly one write to 38199, at H/D line 15. Not firing, not
damage, not time. The port had been charging 15 energy for a missile and 3 for a laser bolt;
both were invented, and both are gone.

H/D's whole use of it:

```
2  IF PEEK(38199) < > 0 THEN 5          ' zero means OUT OF ENERGY, ORBIT DECAYING, RUN S/X
14 P = PEEK(38199):P = P - D1: IF P < 0 THEN P = 0
15 POKE 38199,P
```

### The jump cost reads one axis three times

```
10010 X1 = ABS(PEEK(38366 + PEEK(38209))) - ABS(PEEK(38366 + PEEK(38163)))
      Y1 = <the same expression>: Z1 = <the same expression>
10020 D1 = INT(SQR(X1 ^ 2 + Y1 ^ 2 + Z1 ^ 2) + .6)
```

**38366 is the X table.** GALAXY MAP 3020 reads X, Y and Z from `M`, `M - 21` and `M - 42`
with `M = 38366`, and the port's planet coordinates were extracted from exactly those three.
Line 10010 reads the X expression into all three variables, so Y and Z never enter the cost:
the sum under the root is `3 * X1 ^ 2`, and `D1` comes out as `|dX| * sqrt(3)`, rounded. Two
planets at the same X cost nothing to travel between however far apart they are.

It looks like copy-paste - the `- 21` and `- 42` that GALAXY MAP has are simply missing - but
the port reproduces it, the way it reproduces the rest of the original's arithmetic.

The same `D1` is the stardate cost: H/D line 6 is `SD = SD + D1 + .3`, not the true distance.

### What this leaves

`vectorRenderer.ts` still scales the energy gauge by 2000. That file has another agent's
uncommitted work in it and was left alone; it needs the same one-line change.

Nothing checks the *rate* at which the disk spends energy beyond the jump, because there is
no other spend. What remains unknown is where a new game's 63 is written - START does not
POKE 38199, so the opening value comes from a BLOAD rather than from BASIC.

---

## Ships and shapes

Two unrelated things live under "shapes" on this disk, and conflating them is what went
wrong in the port.

### The ship models are 3D vector bytecode, not shape tables

`SHIP # 0/1/3/4` and `DEBRIS` are BLOADed to `$7879` and walked by the machine code at
`$9023`. The format (`probe_shapes.mjs`):

| byte | meaning |
| --- | --- |
| `04 nn` | set-state, one operand; every model starts with one |
| `0n xx xx yy yy zz zz` | a vertex: opcode 0-3 then three 16-bit little-endian signed coordinates |
| `7F` | end of model |

Every model parses to the last byte with nothing left over. **`SHIP # 0` is a one-byte file
containing exactly `$7F`** - an empty model, which is the clearest confirmation of the
terminator there could be.

The coordinates are world coordinates, already placed: SHIP # 1 runs x 270..560, y
-175..-65, z -3535..-3465, around the anchor STARSHIP SIMULATOR line 2 sets up as
`X9=400, Y9=-100, Z9=-3500`.

| model | bytes | ops | opcodes |
| --- | --- | --- | --- |
| SHIP # 0 | 1 | 0 | empty |
| SHIP # 1 | 962 | 138 | 1x22 2x91 3x24 |
| SHIP # 3 | 1046 | 150 | 0x7 1x24 2x100 3x18 |
| SHIP # 4 | 1592 | 228 | 1x56 2x170 3x1 |
| DEBRIS | 354 | 51 | 0x50 |

DEBRIS being fifty opcode-0 records and nothing else is what a debris cloud should be: a
scatter of points. What opcodes 1, 2 and 3 mean exactly is not settled - the renderer at
`$9023` has not been disassembled - but 1 behaves as a move and 2 as a line.

> The port's ship bytecode was **already byte-identical to the disk** for ships 1, 3 and 4.
> Its extractor read `../../extracted/*.payload.bin`, files of unknown provenance that
> happen to be right. It now reads the disk, and SHIP # 0 and DEBRIS - which had never been
> extracted - come with it.

### The shape table is a different file

`ENEMY I.A24580.L68` is BLOADed to `$7FFF`, and STARSHIP SIMULATOR line 2 does
`POKE 232,HL: POKE 233,127`, pointing Applesoft's shape-table vector (`$E8/$E9`) at it. It
is a real Applesoft shape table: **26 shapes**. Which shape is used where, from the BASIC:

| shape | used by |
| --- | --- |
| 1, 5 | GALAXY MAP 3040/3050, `DRAW PL` - the planet symbols |
| 2 | XDRAWn as a small sprite at various ROT and SCALE |
| 12 | GALAXY MAP |
| 13, 14 | STARSHIP SIMULATOR 159/180 - the panel needles (13 horizontal, 14 vertical) |
| 15, 16, 17, 18 | XDRAWn **all four at the same anchor** - one 28x28 composite, the explosion |
| 25 | a marker, drawn by almost every program |
| 26 | STARSHIP SIMULATOR |

Sprite choice is not by ship kind. `EX` line 6 draws 2 then 15, 16, 17, 18 all at
`140,65` at SCALE=2, which is the explosion.

> **The port's `ship-N.json` and `planet-N.json` "shape tables" are fabrications.** They
> come from running an Applesoft shape-table decoder over files that are not shape tables.
> `ship-1.json` declares offsets `[0, 1, 44, 1, 171]` - a shape table's offsets must point
> past its own header, and 0 and 1 point into it. The real table is now extracted to
> `public/data/shapes/shape-table.json`. Rewiring `cockpit.ts` to use it is **not done**:
> it currently picks a sprite index by ship kind out of the fabricated table, and the disk
> says sprite choice does not work that way.

### The port's shape interpreter had two bugs, and now matches the ROM exactly

`probe_shapetable.mjs` writes the table into memory at `$7FFF`, points `$E8/$E9` at it and
DRAWs all 26 shapes on the real Applesoft ROM at `(140,96)`, `ROT=0`, `SCALE=1`,
`HCOLOR=3`. No disk and no DOS: it enters Applesoft's cold start at `$E000`, and a
five-line BASIC driver reads the shape number out of a zero-page byte so each shape costs a
poke instead of thirty keystrokes. `shape_parity.mjs` then draws the same 26 with the
port's `ShapeRenderer` and compares.

It started at **8 of 26 exact, 133 pixels differing** - and in every failing case the port
lit *more* pixels than the ROM, never fewer.

**A plot vector lights one pixel, not two.** `plotSegment` ran `for (i = 0; i <= stepCount)`,
plotting both endpoints. On the Apple a plot vector lights the pen's current position and
*then* moves, so the destination belongs to the next vector. The extra mostly hid, because
the next vector's plot lands on the same spot, and only showed where a plot was followed by
a move or ended a run - which is why the excess was 1 or 2 pixels rather than double.

**Vector B is skipped on bits 3-7, not bits 3-5.** The rule is that the rest of the byte is
ignored once the *remaining* bits are all zero, so a byte with bits 3-5 clear but 6-7 set
still carries a B vector: direction 0 (up), no plot. This table contains no such byte, so
fixing it changed nothing here - it is corrected because it is wrong, not because it
mattered.

With both fixed: **26 of 26 shapes render exactly, 0 pixels differ.**

---

## $9023 is the flight controls, not the renderer

`CA = 36899 = $9023` is SPACE SIMULATOR ASSEMBLY, and STARSHIP SIMULATOR line 150 calls it
every pass. It reads the paddles and writes pitch, bank and heading. **The renderer is
somewhere else**: the last thing `$9023` does is `$921E: JSR $6000`, and `$6000` is LO-HI
A2-3D1 - the same module that holds `CSN` and `SN` at `$6006` and `$6009`.

Full listing in `captured/space_simulator.asm`.

### How the listing was made

`probe_trace.mjs` traced 1,279,509 instructions across 240 frames of real flight. Only
**77** of them were inside `$9023`, touching 39 of its 597 bytes - the routine was entered
**twice**, because a single pass of that Applesoft main loop costs half a million
instructions. A trace alone would have left 93% of the module looking like tables.

So the listing is built by **following the code** from its entry points - branches, JSRs and
JMPs - and only bytes nothing can reach are left as data. The trace still earns its keep:
every line it saw execute is marked, so the listing never implies more than was observed.

### The control model, measured

`probe_controls.mjs` writes the module into memory at `$9023` with no DOS and no game, so
nothing else can move the values, patches `$921E` (`JSR $6000`) to `RTS` so only the control
logic runs, and then sets inputs and reads outputs on the real 6502.

`$95FD` is `PDL(1)` and `$95FE` is `PDL(0)` - STARSHIP SIMULATOR line 19 pokes them,
`POKE 38397,J: POKE 38398,K`. Per call:

| paddle | pitch / bank change |
| --- | --- |
| 0-30 | +4 |
| 31-49 | +3 |
| 50-69 | +2 |
| 70-89 | +1 |
| **90-169** | **0 - the dead zone** |
| 170-189 | -1 |
| 190-209 | -2 |
| 210-229 | -3 |
| 230-255 | -4 |

Bank's first step is at **30**, pitch's at **31** (`CMP #$1E` against `CMP #$1F`). That is
the one asymmetry in the whole table, and it is in the disassembly and in the measurement
both.

**Bank drives heading** (`$912E`), which is what makes a turn a roll rather than a yaw:

| bank | heading change |
| --- | --- |
| -4..+4 | 0 |
| 5-16 | -1 |
| 17-32 | -2 |
| 33-47 | -3 |
| 48 | -4 |
| -16..-5 | +1 |
| -32..-17 | +2 |
| -48..-33 | +3 |

**Bank is clamped to +/-48.** `$91FE` and `$920E` undo an increment that would carry bank
into `$30..$CF`. Measured by holding full deflection: bank steps -4, -8 ... -48 and then
stays at -48 however long you hold it.

**Pitching past vertical reverses heading** (`$90F2`). While pitch is in `$40..$BF` the ship
is inverted, and crossing into or out of that band flips the heading once - `$952F` latches
which side you are on so it happens on the transition, not every pass. Measured from
heading 100: entering the band gives 226, leaving it gives 226 again from 100.

The flip is not symmetric: it is `ADC #$7E` (+126) when heading is below `$7F` and
`SBC #$7F` (-127) otherwise. That band matches STARSHIP SIMULATOR line 129's
`IF P > 190 OR P < 64 THEN Y = Y - 2 * Y1`, which inverts the vertical velocity over the
same range.

### The last 86 bytes are not code or tables

`$9222-$9277` is never executed and nothing can reach it. Rendered as Applesoft it reads:

```basic
O(I) = ASC(MID$(N$,J,1)) - 48 : IF O(I) > 9 THEN O(I) = O(I) - 7
J = J + 1 : NEXT I : O = 4096 * O(1)
```

A hex-string-to-number converter, caught in memory when the module was BSAVEd over a region
wider than the code. SOUND GEN BLOADs to `$9276` and overwrites the last two bytes of it,
which is harmless for the same reason.

---

## The renderer: LO-HI A2-3D1 at $6000

4864 bytes, BLOADed by START line 90, entered from `$921E: JSR $6000` at the end of the
flight controls. Listing in `captured/renderer_6000.asm`.

Traced over 1500 frames of real flight: **5,126,242 of 7,985,458 instructions were inside
this module - 64% of all CPU time.** It was entered 9 times as `$6000`, 27 times at `$6006`
and 18 times at `$6009`. 1,483 of its bytes were seen executing, and traversal from those
plus the entry points reaches 2,008 - the rest is tables and data.

### Shape of it

| address | what |
| --- | --- |
| `$6000` | `JMP $611C` |
| `$6006`, `$6009` | `JMP` to the sine and cosine |
| `$600C-$6099` | **zero-page save buffer**, not tables - see below |
| `$609A-$611B` | quarter-wave cosine table, 65 entries of 16-bit LE |
| `$611C` | entry: save zero page, `JSR $6140`, restore |
| `$6140` | the renderer proper: clears `$7B-$9C`, sets `$9C = $73` (the page PLANET # 0 and the ship model live on) |
| `$61A9`, `$61CA`, `$61D7`, `$620F` | line clipping |
| `$633D`, `$635C` | signed multiply |
| `$64F8`, `$64FB`, `$6526`, `$653F` | sine and cosine |

`$611C` copies zero page `$60-$C1` into `$6013-$6075`, calls `$6140`, and copies it back.
So the file's own head is a **save area**, and what is on the disk there is whatever was in
the developer's zero page when the module was BSAVEd - which is why it disassembles as
stray Applesoft tokens. It is not data the renderer reads.

### $635C is a signed Q15 multiply - measured

`$633D` loads two 16-bit values from zero page through X and Y, calls `$635C`, and stores a
16-bit result. `$635C` takes the sign from `$79 EOR $7B`, takes absolute values, and returns
low byte in A, high in X.

`probe_mul.mjs` calls it directly - no BASIC, the return address pushed by hand pointing at
a `JMP`-to-self so stepping stops exactly on return - and it computes **`(p * q) / 32768`**,
truncating, worst error 1.5 over the test cases:

| p | q | result | p*q/32768 |
| --- | --- | --- | --- |
| 256 | 256 | 2 | 2.00 |
| 16384 | 2 | 1 | 1.00 |
| 32767 | 32767 | 32765 | 32766.00 |
| -1000 | -1000 | 29 | 30.52 |
| 32767 | 16384 | 16383 | 16383.50 |

That is the same `DI = 32768` the BASIC divides trig results by at STARSHIP SIMULATOR line
129. The engine has one fixed-point convention throughout: **Q15**.

### Line clipping is Cohen-Sutherland

`$6212` copies an 8-byte segment record, `JSR $61A9` computes outcodes into `$66` and `$6E`,
and then:

```
$621E  LDA $66 : AND $6E : BNE $620F     ; both outside the same edge - reject
$6224  LDA $66 : BNE $61D7               ; clip the first endpoint
$6228  LDA $6E : BNE $61CA               ; clip the second
$622C  BEQ $6270                         ; both inside - draw
```

### CSN and SN are the other way round, and wrong outside the first quadrant

`$6006` (`CSN` in the BASIC) is `SEC: SBC #$40` and then falls into `$6009`'s body, so
**`$6006(a) = $6009(a - 64)`**. Measured over all 256 inputs: `$6009` is
`32767 * cos(2*pi*a/256)` and `$6006` is `32767 * sin(...)`. The BASIC's names are the wrong
way round relative to the maths.

The table at `$609A` is a quarter wave - 65 entries, index 0 to 64, exact to +/-1 - and the
routine reconstructs the other three quadrants by negating. That negation is wrong:

```
$6509  SEC
$650A  LDA #$00
$650C  SBC $609B,Y      ; the HIGH byte
$650F  TAX              ; ...stored as the result's high byte
$6510  SBC $609A,Y      ; the LOW byte, subtracted from what is left in A
```

A correct 16-bit negation reloads `#$00` before the second subtract so the borrow lands on
the high byte. This one does not, so the low byte comes out as `(0 - high) - low - borrow`.

**So the original's sine and cosine are exact in the first quadrant and wrong everywhere
else, by up to 486.5 - 1.48% of full scale.** Simulating those instructions exactly
reproduces **512 of 512** measured values, so this is the behaviour and not an artefact of
measuring. A port that computes real sines will not match the original's geometry.

### Making it draw

Calling `$6000` from a cold machine with all fifteen of START's binaries loaded and the ship
placed at `$731B` **returns without drawing anything** (`probe_render.mjs`) - it needs state
those BLOADs do not produce. Snapshot and replay solves that; see the next section. The
projection itself - how the model bytecode at `$7879` becomes screen coordinates - has still
not been derived.

---

## Driving the renderer: snapshot and replay

Calling `$6000` on a cold machine with all fifteen of START's binaries loaded draws nothing,
because it needs state those BLOADs do not produce. Rather than reconstruct that state by
hand, take it from the running game.

`probe_snapshot.mjs` boots the disk, waits for STARSHIP SIMULATOR, lets flight settle, then
single-steps the 6502 until **PC is exactly `$6000`** and captures all 48K plus the
registers. Whatever the renderer needed, it had, by construction.

`probe_replay.mjs` writes that back into a fresh machine, sets the graphics soft switches,
replaces the return address on the stack with a trap, and runs. **604,164 instructions, and
it draws.** The ship can then be moved and it draws again - so this is a render oracle, the
same kind of arbiter the cockpit panel and the shape table already have.

| Z | heading | pixels | extent |
| --- | --- | --- | --- |
| -6401 | 0 | 404 | x 82-155, y 32-99 |
| -4000 | 0 | 284 | x 46-163, y 15-122 |
| -2000 | 0 | 102 | x 2-189, y 3-123 |
| -6401 | 16 | 366 | x 2-177, y 29-104 |
| -6401 | 32 | 4 | mostly out of frame |
| -6401 | 64 | 6 | mostly out of frame |

Closing from Z -6401 to -2000 spreads the object from a 73-pixel-wide box to nearly the full
screen, and turning swings it out of view. That is a perspective projection behaving as one
should.

**It draws to hi-res page 2 (`$4000-$5FFF`) while page 1 is displayed.** STARSHIP SIMULATOR
line 147 pokes `$7315` with `$54` or `$55` - the low byte of the PAGE1/PAGE2 soft switch -
and the `FOR OO = 0 TO 1` loop at line 15 alternates them. The game double-buffers.

### The oracle was free-running between calls

Finding this exposed a real defect in `a2.mjs`. apple2js starts its own
`requestAnimationFrame` loop when the page loads, and **that loop kept stepping the CPU
between our evaluate calls**: a restore in one call and a run in the next were not adjacent,
and the machine executed hundreds of thousands of instructions in the gap. Measured
directly, PC moved from `$6000` to `$6D23` and SP from `$D6` to `$CE` between two adjacent
reads that did nothing.

That is exactly the nondeterminism `frames()` was written to avoid, and it had been there
the whole time - `frames()` was the only clock the oracle *drove*, but not the only clock
that *ran*. `openOracle()` now calls `a2.stop()`, and PC is identical across repeated reads.

Re-checked afterwards: the cockpit panel is still 0 of 53,760 pixels different, and all 26
shapes still render exactly. Those probes step explicitly and hand-shake through a flag
byte, so the stray clock had not been perturbing them - but nothing guaranteed that before.

---

## Ship render parity

`probe_shipgolden.mjs` takes ship-only renders from the original, and `ship_parity.mjs`
compares the port against them.

### Isolating the ship

The replayed renderer draws the whole scene, planet and ship together, while the port draws
only a ship. So each state is rendered **twice**: once normally, and once with a single
`$7F` written at `$7879`, which is an empty model - SHIP # 0 on the disk is exactly that one
byte. Every pixel present in the first and absent in the second belongs to the ship.

The isolation is clean: across the whole sweep, no state had a single pixel present *only*
in the no-ship render, so blanking the model removes the ship and disturbs nothing else.

### What the disk does

| state | ship pixels | extent |
| --- | --- | --- |
| Z -6401 | 126 | x 94-133, y 74-85 |
| Z -5500 | 294 | x 74-129, y 79-97 |
| Z -4500 | 408 | x 34-119, y 97-123 |
| Z -3600 | 0 | passed it |
| heading 4 / 8 / 12 | 138 / 154 / 196 | slides left: x94 -> x72 -> x46 -> x18 |
| heading 250 / 246 | 122 / 158 | slides right: x128, x150 |
| pitch 4 / 8 | 118 / 142 | rises: y74 -> y53 -> y32 |
| pitch 250 | 150 | falls: y104 |

Range grows it, heading slides it sideways, pitch slides it vertically. That is a world-space
perspective projection, and it is what the port has to match.

### What the port did, and what it does now

`projectShipBytecode()` centred the model on its own bounds, rotated it by
`COCKPIT_SHIP_WIREFRAME_VIEW` - **yaw -1.05, pitch -0.27, roll 0.05**, a fixed three-quarter
view - projected at a focal length of 280, and **rescaled so the larger of width and height
filled a span the caller passed in**. The caller also passed the screen centre. So the port
computed neither placement nor size; in the cockpit both came from a distance heuristic.

`projectShipWorld()` replaces it: every vertex goes through the camera with the transform
derived in `fit_projection.mjs`, using the machine's own sine and cosine. `cockpit.ts` uses
it, and nothing is handed to it - not the centre, not the span.

### Measured

| | before | world projection | + the disk's trig | + clipping |
| --- | --- | --- | --- | --- |
| mean shape agreement | **12.1%** | 62.0% | 69.8% | **73.6%** |
| height vs the disk's | 2.30x | 1.05x | 1.05x | **1.00x** |

Agreement is intersection over union, over 11 states, and from the second column on the port
is given nothing: it computes where the ship goes and how big it is.

Switching from real sines to the machine's own table lands exactly where it should - on the
negative angles, the quadrants the original's trig gets wrong:

| state | real sines | the disk's table |
| --- | --- | --- |
| pitch -6 | 28.5% | **83.4%** |
| heading -6 | 62.5% | **81.7%** |
| heading -10 | 65.6% | **76.8%** |
| heading +4, +8, +12 | 75.3 / 76.2 / 80.4% | unchanged |

Clipping fixes the closest-approach state, which was the worst by a wide margin: **29.5% to
60.4%**, and its aspect from 1.56x to 1.00x. In the running port that state now rejects 24
segments and draws a box of x44-119 y97-123 where the disk draws x34-119 y97-123 - the
vertical extent exact.

### What the remaining gap is, measured

Exact overlap punishes a one-pixel shift completely, and the fitted projection is only good
to about 0.6 px rms. So the harness also asks the softer question - is there a port pixel
*touching* each of the disk's?

**98.3% of the disk's pixels have a port pixel adjacent**, 96% to 100% across all eleven
states.

So the geometry is right and what is left is rasterisation: a float reimplementation of a
fixed-point renderer, driven by a projection fitted to within a pixel, lands beside the
original's pixels rather than on them. Getting past this would mean reproducing the
renderer's fixed-point arithmetic exactly, not correcting anything conceptual.

Opcode 3 was settled the same way rather than by reading it. The three possible readings -
draw then lift the pen, draw and continue, move without drawing - score 72.6%, **73.6%** and
72.2%. Close enough that the harness only just prefers one, and the code says so.

---

## The projection, derived

The transform inside `$6000` was never read out of the disassembly. It did not have to be:
the replay harness renders any state on demand, so the renderer can be asked directly.

`probe_project.mjs` replaces the model at `$7879` with **one vertex** - `04 01` (the state
DEBRIS uses, whose records are all points), a single opcode-0 record, then `$7F` - and the
renderer answers with one 2-pixel blob. Sweeping the vertex and the camera gives 54
observations of where a known world point lands.

Each state is differenced against a baseline rendered at **the same camera**. That matters:
moving the camera moves the planet too, so a baseline taken at one heading subtracts nothing
useful at another and leaves the whole scene behind as false "new" pixels. With a single
baseline the angle sweeps returned ~260 stray pixels; per-camera, they return 2.

### The answer

```
d  = P - C                          world point relative to the camera
d' = yaw d by heading, then pitch    256 byte units to a full turn
sx = 139.0 + 230.9 * d'x / d'z
sy =  61.7 - 212.7 * d'y / d'z
```

**0.61 px rms over 54 observations, worst single point 1.71 px.**

- `FOCAL_Y / FOCAL_X` is **0.921**, and a 280x192 frame on a 4:3 display has a pixel aspect
  of **0.914**. So it is one focal length with the Apple's non-square pixels corrected for,
  not two independent constants.
- The centre `(139.0, 61.7)` is the middle of the view above the panel: screen centre x is
  140, and the flight view occupies y 0-127, whose centre is 64.
- Rotation order is **yaw then pitch**, and the fit is unambiguous - 0.61 px against 3.11 px
  the other way round. Small-angle data could not tell them apart; the states with heading
  and pitch both non-zero could.
- Pitch turns the opposite way from heading (sign -1). With the same sign the fit is 12 px.

### Checked at large angles

The small-angle sweep only covers +/-8 of 256. The wide sweep places each point so the
rotation should bring it back to the same spot, for headings 16 through 224 - all the way
round. Every one lands at **(114.5-116.5, 69.0)**: the model cancels the renderer's rotation
across the whole circle, to about a pixel.

That is also where the renderer's own broken sine lives (wrong by up to 1.48% outside the
first quadrant). On those 14 states, using the machine's measured table fits **0.84 px** and
using real sines fits **1.21 px** - so the renderer does use its own table, and the fit says
so where it is possible for it to say so. At small angles the two are indistinguishable.

### Clipping

The original clips lines against the view with Cohen-Sutherland at `$61A9`-`$620F`.
`probe_clip.mjs` measures the rectangle instead of reading it: a single long line is drawn
through the real renderer and where it was cut is read off the page.

**Lines are cut to x 2-277, y 0-123**, and a line wholly outside is rejected. The panel
starts at y 128, so the renderer keeps a few rows of margin above it.

A line stepped across the other axis is kept for y 0..123 and x 3..275; the cut extent is
the number to trust, because the kept/rejected boundary depends on how a nominal screen
position maps back through the fitted projection, which is good to about a pixel.

### Checked against whole ships

Single points fitting well is not the same as a ship fitting. Projecting all 149 of
SHIP # 3's vertices with the fitted formula, against the golden renders:

| state | disk box | predicted | error |
| --- | --- | --- | --- |
| z-6401 | x 94-133 y 74-85 | x 95-131 y 74-85 | 1.6 |
| z-5500 | x 74-129 y 79-97 | x 75-128 y 80-97 | 1.5 |
| z-4500 | x 34-119 y 97-123 | x 12-119 y 97-138 | **22.0** |
| h4 | x 72-109 y 74-85 | x 71-109 y 74-86 | 0.8 |
| h8 | x 46-87 y 75-86 | x 46-85 y 74-86 | 1.9 |
| h12 | x 18-61 y 75-87 | x 18-61 y 75-87 | 0.4 |
| h250 | x 128-165 y 74-85 | x 128-164 y 74-85 | 1.2 |
| h246 | x 150-189 y 74-86 | x 151-187 y 74-86 | 1.8 |
| p4 | x 94-133 y 53-64 | x 95-131 y 53-64 | 1.6 |
| p8 | x 94-133 y 32-44 | x 95-131 y 32-43 | 1.6 |
| p250 | x 94-131 y 104-116 | x 94-131 y 104-116 | 0.4 |

Ten of eleven agree to within 1.9 px. The outlier is the closest approach, and it is
explainable rather than a failure of the model: at Z -4500 some vertices fall outside the
view, the renderer **clips** them with the Cohen-Sutherland code at `$61A9`-`$620F`, and
this formula does not clip, so it predicts a box 22 px wider. Clipping is the missing piece,
not the transform.

`src/engine/diskProjection.ts` is generated from the fit.

---

## Planets, and what PLANET # 0 actually is

### PLANET # 0 is the starfield

START line 100 BLOADs PLANET # 0 to `$7300`. Its first 36 bytes are a header - including
the ship's own state at offsets 27-35 (`$731B-$7323`) - and from offset 36 it is **195
opcode-0 records, exactly filling the file** (36 + 195 x 7 = 1401). Opcode 0 is a lone
point. Their coordinates span +/-10000 in all three axes.

That is the star table. It is the same bytecode the ship models use, so the port's existing
parser and world projection handle it unchanged.

The numbered files are a different thing entirely: PLANET # 1, 5, 13 and 20 are opcode
1/2/3 line work with **y at 0** and x and z spanning +/-10000 - ground wireframes, drawn
flat, for approach rather than a body seen from space.

### Isolating it

The ship was isolated by writing `$7F` over its model at `$7879`. The planet cannot be, and
the experiment says why: writing `$7F` at offset 36 (`$7324`) blanks **the entire scene**,
ship included, because the renderer walks one object list and an empty one makes it bail
before it ever reaches `$7879`. Offsets past the first terminator change nothing.

So the stars are simply what is drawn with the ship blanked - the reverse of the ship case.

### Measured

| state | disk px | port px | exact | within 1px | disk extent | port extent |
| --- | --- | --- | --- | --- | --- | --- |
| z -6401 | 278 | 276 | 42.8% | 96% | x82-155, y32-99 | x84-154, y33-99 |
| z -5000 | 274 | 275 | 36.9% | 96% | x66-159, y24-109 | x67-159, y24-109 |
| z -3000 | 232 | 232 | 30.0% | 88% | x10-171, y0-122 | x11-171, y0-122 |
| z 0 | 10 | 10 | 53.8% | 90% | x8-173, y9-106 | x8-174, y9-106 |
| heading +8 | 274 | 274 | 44.6% | 97% | x32-227, y31-100 | x33-228, y31-100 |
| heading -8 | 278 | 280 | 50.0% | 99% | x28-197, y32-110 | x28-198, y33-110 |
| pitch +8 | 196 | 195 | 44.8% | 99% | x82-155, y0-57 | x83-155, y0-57 |
| pitch -8 | 210 | 208 | 45.1% | 97% | x82-155, y15-123 | x82-155, y15-123 |

The pixel counts agree to within a couple throughout, and so do the extents.

**Mean 37.5% exact, 91.2% within one pixel** over 12 states.

Exact overlap is much lower here than for ships and that is expected: a point has one pixel
to get right, so a sub-pixel error costs the whole star, where a line keeps most of itself.
The within-one-pixel figure is the meaningful one, and the extents agree to a pixel or two
throughout.

In the running port, from the snapshot camera: 195 records parsed, 37 clipped away, 144
plotted, **276 pixels across x84-154, y33-99** against the disk's **278 across x82-155,
y32-99**.

### Two things this turned up

**A point is two pixels wide.** `probe_project.mjs` put a single vertex through the real
renderer 54 times and got a 2-pixel blob every time, at x and x+1 on the same row. The port
plotted one, which left the starfield at half the original's density - 142 pixels against
278. Plotting two took star agreement from 26.9% to 37.5% and within-one-pixel from 86.8%
to 91.2%.

**A plausibility guard was silently truncating models.** `parseShipBytecode()` had an
`isPlausibleVector()` check that **broke out of the parse** on any vertex with z outside
-10000..-500. Ship models sit around z -3500 so it never fired for them, but the star table
spans -10000..+10000 and the guard threw away all 195 points at the first star - the port
drew nothing at all. The format needs no such guess: `$7F` ends a model, which is why
SHIP # 0 is that one byte. The guard is gone.

### The port still draws planets the disk does not

`renderPlanet()` in `cockpit.ts` places a body at a hardcoded `v3(200, 90, 0)` - commented
as "opening capture of the disk", unverified - and fills it with `drawPlanetPointCloud()`,
a procedural cloud, plus the fabricated `planet-N.json` shape tables.

Measured, the disk draws **no planet body at all** in this scene: with the ship blanked, the
whole render is the 195 stars, at every camera position tried, from Z -6401 out to Z 0 where
only 10 pixels remain. The numbered planet files are ground wireframes and are BLOADed when
you arrive somewhere, not while flying.

This has **not** been changed. Removing a visible feature is a call about the game rather
than about the disk, and what the original draws on approach has not been captured yet.

---

## The approach, captured

### How the game gets there

`RE` is what loads a numbered planet, not the hyperdrive. STARSHIP SIMULATOR line 156 runs
it when `ABS(X) < 900 AND ABS(Y) < 900 AND ABS(Z) < 900 AND PEEK(38210) = 0`.

RE is short: it floods the screen orange, prints `REENTRY SEQUENCE START`, sets the
**atmosphere flag** at `$9542` (38210), `BLOAD PLANET # <current planet>` to `$7300`,
repositions the ship to `Y = 1024`, `Z = -7000`, heading 20, and runs STARSHIP SIMULATOR
again. So the approach is ordinary flight with a ground wireframe where the star table was.

`probe_approach.mjs` flies there rather than reconstructing it: from the opening position
the ship is already heading that way, and after **8,700 frames** - about 145 seconds of
Apple II time, Z walking from -7000 to -881 - re-entry fires. It then stops on the
instruction at `$6000` and takes all 48K.

The capture checks itself: **`$7324` onwards matches PLANET # 1 on the disk in 778 of 778
bytes**, with `$9541` = 1 and `$9542` = 1.

### What the numbered planets are

The same 36-byte header and record list as everything else. PLANET # 1 through 20 are
opcode 1/2/3 line work with **y at 0** and x and z spanning +/-10000 - a ground plane, drawn
flat, 89 to 162 vertices each. PLANET # 4 and # 6 reach y 800, so some of them carry raised
features.

Rendered from the approach snapshot, the ground fills the width and the lower screen, and
the horizon moves with pitch exactly as it should:

| state | px | extent |
| --- | --- | --- |
| at the capture | 3278 | x 2-277, y 75-123 |
| pitch +8 (nose down) | 3928 | x 2-277, y 32-123 |
| pitch +32 | 460 | x 2-277, y 0-92 |
| pitch -8 (nose up) | 1328 | x 2-277, y 114-123 |
| heading 128 (turned about) | 0 | nothing - the grid is finite |

### Measured

The port had no ground wireframe at all. `renderPlanet()` drew a procedural disc at a
hardcoded position; nothing on screen came from the planet files.

Extracting PLANET # 1-20's record lists and putting them through the same parser and world
projection as everything else:

**64.2% exact, 85.4% within one pixel**, over 12 states, with the extents matching almost
throughout. Best is pitch -8 at 87.6% exact and 100% within a pixel.

Two states do poorly and are worth naming rather than averaging away: pitch +32 (60% exact
but only 61% within a pixel - the port draws one horizon row where the disk draws a spread
from y 0 to 92) and heading +64 at 40.7%. Both are steep angles where much of the grid
falls behind the camera, and the culling there is not right yet.

### Wired

`cockpit.ts` now draws the ground wireframe when `state.atmosphere` is set and the stars
otherwise, which is the same slot the disk uses - RE BLOADs the planet over `$7300`, on top
of the star table. In the running port: stars 276 pixels across x84-154, ground 2140 pixels
across x2-277 y73-123.

`renderPlanet()`'s procedural disc is still there and still not on the disk. It is now the
only drawn thing in flight with no counterpart in the original.

---

## Near-plane clipping

### The near plane is at 0, and the original clips to it

`probe_near.mjs` puts a single point straight ahead at a shrinking distance: it is still
drawn at **dz 0** and gone at dz -50. And a line running from well behind the camera to well
in front **is drawn** - 92 pixels for one spanning dz -2000 to 4000 - so the original clips
such a segment at the near plane rather than dropping it.

`projectShipWorld()` had been projecting each vertex on its own and dropping whatever landed
behind the camera, which loses the whole segment. It now transforms to camera space, clips
the segment there with `clipNear()`, and only then divides.

### The clipping undid itself

Implementing that changed **nothing** - ships, stars and ground all to the same pixel - and
that was the useful signal, because 14 to 17 segments a frame demonstrably straddled the
plane.

`clipNear()` puts a clipped endpoint **exactly on** the plane, and `projectCameraSpace()`
rejected `z <= NEAR_Z`. So every segment that had just been clipped was thrown away by the
next line. One character: the test is `z < NEAR_Z`.

It was found by hand-checking a single segment - the `x = 0` grid line of PLANET # 1 at the
state the port drew nothing for - and following it through each stage until one of them
returned null.

### What it was worth

| | before | after |
| --- | --- | --- |
| ground, within one pixel | 85.4% | **99.5%** |
| ground, exact | 64.2% | 67.5% |
| stars, within one pixel | 91.2% | 91.7% |
| ships, within one pixel | 98.8% | 98.8% |

Every ground extent now matches the original's exactly, and the per-state within-one-pixel
figures are 98% to 100% across all twelve. The state that drew nothing at all - heading 0,
pitch +32 - is 72.3% exact and **99% within a pixel**.

Ships moved from 73.8% to 72.2% on exact overlap while staying at 98.8% within a pixel: the
near-clipped remnants are now drawn, and a few of their rasterised pixels fall beside the
original's rather than on them. The geometry is no worse; the overlap metric is simply
sensitive to that.

### The horizon theory was wrong

The guess had been that the renderer draws something at steep pitch which is not in the
planet's vertex list - a horizon. It does not. **With the record list emptied, nothing is
drawn at any pitch**: 0, 8, 16, 32, 48 and 248 all give a blank page. Everything on screen
comes from the data.

> Truncating the list part-way is **not** a valid experiment, and its numbers should be
> ignored. `$7F` terminates when it is the first byte of a model, which is why writing it at
> `$7879` cleanly removes the ship, but written mid-list it desynchronises the stream rather
> than ending it - keeping 1 record drew 460 pixels, keeping 2 drew none, keeping 6 drew 460
> again.

---

## COM, the command screen

Reached by pressing **C** in flight: STARSHIP SIMULATOR line 319 runs it, via
`ON K - 16 GOTO 317,318,319` with K = 19, and 19 is 195 - 176 where 195 is `C` with the high
bit set.

It is a good parity target for the same reasons the cockpit panel was. Line 20 floods rows
0 to 123 with `HCOLOR= 6`, line 90 draws a box from (1,1) to (139,110) in `HCOLOR= 1`, and
the rest is text through the hi-res character generator. No RNG, no ship state, and it
settles waiting at `GET COM$`. `probe_com.mjs` captures it; `com_parity.mjs` compares.

It draws on **page 1**, and the original's page has **11,468** lit pixels.

### Measured

| region | agreement |
| --- | --- |
| COM's own area, rows 0-123 | **100.00%** - 0 of 34,720 pixels differ |
| rows 124-191, the panel | **100.00%** |
| whole page | **100.00%** - 0 of 53,760 |

The two regions have to be counted separately. COM fills rows 0 to 123 and never touches
what is below, so the **instrument panel is still standing underneath it**. The port's
`drawComMainScreen()` opened with `hgr()`, which clears the whole buffer, and that alone
cost 3,011 pixels - the panel region was 84.2%. With the lamps `CALL 38402` draws ported
too it is now 100%, and STARSHIP SIMULATOR line 180's needles close the rest.

### How the original clears its background - and it is not HOME

This was wrong at first. COM sets the text window with `POKE 32/33/34/35` and calls `HOME`
several times, and the obvious reading is that each `HOME` blanks the window over the fill.
It does not. `HOME` clears the `$400` text page, which is invisible while the hi-res screen
is showing; **only characters sent through `COUT` reach the character generator**.

So the blanking is done by printed spaces, and one line does all of it. Line 29:

```
HOME: PRINT "                    ": HOME: VTAB 2:
FOR X = 1 TO 12: PRINT "                    ": NEXT:
PRINT "                    ";: HOME: POKE 32,1
```

Fourteen printed lines of twenty spaces - one at row 0, twelve from `VTAB 2`, one at row 13
- and they run while the window is still `POKE 32,0` / `POKE 33,40` from lines 21 and 25.
That is **0-based columns 0-19 over rows 0-13**, exactly what the capture shows, and not
what line 80's window (left 1, width 21, bottom 14) would have given.

The clue was the capture itself: the cleared block is 20 columns wide and starts at column
0, while `WNDLFT`/`WNDWDTH` read 1 and 21 when COM settles. The window registers are a red
herring here; the printed strings are the truth.

`Hires.clearTextCells(col, row, cols, rows)` does the blanking, and `com.ts` calls it once
for line 29's block and once for line 80's 40-character row.

**`HTAB` and `TAB( )` are absolute screen columns, not window-relative.** Line 100's
`PRINT TAB( 3);"COMMAND MODE"` lands on 0-based column 2, not on `WNDLFT + 2 = 3`, and the
readouts' `HTAB 23/29/35` land on 0-based columns 22/28/34. The left margin of an untabbed
`PRINT` does honour `WNDLFT`: line 110's options start at 0-based column 1.

With that, the layout follows from the listing without guessing. Line 95's `PRINT`, line
100's title and its trailing `PRINT`, and line 110's five options and their trailing `PRINT`
put `COMMAND?` on 0-based row 9 - the port had it on row 13.

One port-side habit had to go with it. `menu.ts` cleared each block out to the right edge
(`40 - col + 1`) before writing, which was harmless while text was transparent and destroys
background now that it is opaque. Applesoft's `PRINT` does not pad either, so the clear now
runs only as far as the longest line.

Rows 0-13, columns 0-19 now agree pixel for pixel.

### The twelve readouts, and a warning light

Lines 40 to 70 draw a 3 x 4 grid down the right-hand side. `ST(1..12)` comes from line
15140, the label pairs are the `DATA` at 15000-15030 read in order, and line 70's
`FOR J = 1 TO 2` prints two lines per readout - its row and the one below. `V()` and `H()`
from lines 40 and 50 put them on rows 2, 5, 8, 11 and columns 23, 29, 35.

What the addresses hold is fixed by two other programs, not by guesswork. SHORE LEAVE line
2500 names them:

```
2500 DATA SHIELD,38200,ENERGY,38199,# 1 ENGINE,38198,# 2 ENGINE,38197,COMPUTER,38196,
     RADAR,38195,ENV. CONTROL,38194,HULL DMG.,38193,HYPERDRIVE,38190,MISSILES,38187,
     LASER,38186,NAV. COMP.,38184
```

and STATUS prints them as percentages (`PRINT "ENGINE#1:"; PEEK(38198);"%"`). So they are
0-100 health bytes, with three exceptions: 38187 is a bare missile count, 38199 is divided
by 62 (STATUS line 1255), and **38193 is hull health** - STATUS prints `100 - PEEK(38193)`
as HULL DMG. 38185 carries COM itself and is not in that DATA list; 38184, which is, is
NAV. COMP. and has no readout.

| J1 | addr | what | line 1 | line 2 | fresh ship |
| --- | --- | --- | --- | --- | --- |
| 1 | 38198 | # 1 ENGINE | `  1  ` | ` ENG ` | 100 |
| 2 | 38197 | # 2 ENGINE | `  2  ` | ` ENG ` | 100 |
| 3 | 38196 | COMPUTER | ` COMP` | `NO/GO` | 100 |
| 4 | 38195 | RADAR | `RADAR` | `NO/GO` | 100 |
| 5 | 38194 | ENV. CONTROL | ` ENV ` | `NO/GO` | 128 |
| 6 | 38193 | HULL DMG. | ` HULL` | ` DMG ` | 100 |
| 7 | 38199 | ENERGY | `POWER` | ` LOW ` | 63 |
| 8 | 38200 | SHIELD | ` SHLD` | `NO/GO` | 100 |
| 9 | 38190 | HYPERDRIVE | `HYPER` | `DRIVE` | 100 |
| 10 | 38187 | MISSILES | ` MSL ` | `NO/GO` | 60 |
| 11 | 38186 | LASER | `LASER` | `NO/GO` | 100 |
| 12 | 38185 | COMS | ` COM ` | `NO/GO` | 1 |

The "fresh ship" column is what COM actually found, read off the machine.

#### POKE 973 is inverse video - corrected

Line 70 calls `GOSUB 10000` before every `PRINT`, and that subroutine does nothing but poke
973 - `$3CD`:

```
10000 IF J1 = 7 AND PEEK(ST(J1)) < 16 THEN POKE 973,255: RETURN
10005 IF T = 0 THEN POKE 973,255: RETURN
10010 POKE 973,0: RETURN
```

**`$3CD` is the character generator's inverse flag.** A failed system's readout is drawn
highlighted - black glyphs on a solid block - which is what labels like `NO/GO`, `POWER LOW`
and `HULL DMG` are for.

This file previously said 255 meant *skip*, and concluded that the grid lists the systems
still working and that the warning lights were inverted - a bug in the original. That was
wrong, and it is worth recording how, because the measurement that produced it was sound and
the reading of it was not.

`probe_comreadouts.mjs` zeroes the computer, the shields and the laser and drops the energy
to 9. Those four readouts stop looking like glyphs, and the other eight are untouched pixel
for pixel. The conclusion drawn was "they are not drawn". The probe's own numbers say
otherwise:

| readout | lit before | lit after | sum |
| --- | --- | --- | --- |
| COMPUTER | 70 | 210 | 280 |
| ENERGY | 95 | 185 | 280 |
| SHIELD | 68 | 212 | 280 |
| LASER | 88 | 192 | 280 |

A readout is five cells, and 5 x 7 x 8 is **280**. Every pair sums to it exactly. That is
the glyph's complement, not its absence. The error was comparing "after" against the
background figure without noticing that 210 is not 140.

STATUS settles it independently and without any inference: line 30 pokes 973,255 and leaves
it there until line 1396, and the whole report is drawn, inverse from edge to edge.

And the port is now checked against the machine in the state where the two readings differ.
`com_parity.mjs` renders COM with those four systems broken and compares it against
`captured/com/readouts.json`: **0 of 34,720 pixels differ**. Under the old reading it could
not have matched at all.

The rule: draw always, and draw inverse when the byte is zero - or, for ENERGY, below 16.

#### One thing this turned up

`gameState.ts` has `energy = 2000`, "decremented by hyperdrive jumps". That came from the
repo's own analysis. The machine reads **63** in `$9537` on a fresh ship, and STATUS divides
that byte by 62, so the disk's scale is 0-62. `comStatusBytes()` scales rather than
comparing raw, so the readout gates correctly either way, but the port's energy model does
not match the disk and that is not settled here.

---

## STATUS, the ship status report

`STATUS.bas`, reached from flight by C, then 1 for CENTRAL COMPUTER, then 4 for SHIP STATUS -
COM line 270's `ON C GOTO 800,900,30,1200,20000` landing on 1200's `RUN STATUS`.
`probe_status.mjs` captures it; `status_parity.mjs` compares.

| | |
| --- | --- |
| screen 1, the ship report | **0 of 53,760 pixels differ** |
| screen 2, the troop report | **0 of 53,760** |

Both exact, panel included.

### The whole report is inverse video

Line 30 pokes 973,255 and nothing resets it until line 1396, just before `RUN COM`. So every
character of both screens is inverse, and line 1230's clear -
`FOR C = 1 TO 15: VTAB C: HTAB 2: PRINT <38 spaces>` - lays down solid blocks rather than
blanking cells.

The capture says so plainly. Row 40 of the original's page reads `.#.#.#.` across text
column 0 and then solid to column 38: columns 1-38 are 38 x 7 = **266 pixels**, which was
exactly the per-row shortfall while the port was drawing normal text. Columns 0 and 39 fall
outside the window `POKE 32,1: POKE 33,39` sets and keep the `HCOLOR= 1` flood.

This is also what corrected COM's readouts - see above.

### ENERGY reads 100%, not 101%

```
1255 EN = PEEK(38199):EN = EN / 62:EN = INT(EN * 100)
1256 IF EN > 100 THEN EN = 100
```

Line 1255 divides by 62 while a full tank is 63, so a full tank computes 101 - and **line
1256 clamps it**. On the machine it reads `ENERGY  :100%`.

An earlier note in this file said the original shows 101% and that the port should reproduce
that. It was written from line 1255 without reading line 1256, and the port was built to
match it. Both are fixed.

### Two systems are printed as constants

```
5110 PRINT "RADAR   :"; PEEK(38195);"%";: HTAB 22: PRINT "ENV.     :100%"
5120 PRINT "LASER   :"; PEEK(38186);"%";: HTAB 22: PRINT "NAV.COMP.:";100;"%"
```

`ENV.` and `NAV.COMP.` are hard-coded at 100%, even though 38194 and 38184 both exist and
SHORE LEAVE line 2500 names them. They never report damage.

### Other things the listing settles

- **`TR` and the troop count are different quantities.** Line 1330 prints `TR`, read from
  the MISC file (2000 in the capture), while line 1386's all-dead test is
  `(PEEK(38167) * 256) + PEEK(38159)`, which is 788. The port had one number doing both jobs.
- **STATUS and COM disagree about a planet's name.** STATUS line 10000's DATA has
  `GROOMBRIDGE 1618`; COM line 15130 has `GROOMBRIDGE 168`. The port had COM's everywhere.
- **`SD`, `TR` and `CR` are not bytes.** Line 50's `GOSUB 5000` INPUTs them from the MISC
  file, so they only exist as Applesoft variables - read through `VAR_READER` for the
  capture.
- **The needles carry through from flight.** STATUS never touches rows 124-191, so the panel
  underneath still has the lamps and the two needles COM's line 8 did not erase. Comparing
  it means replaying that whole sequence - panel, lamps, needles, COM's erase - which
  `status_parity.mjs` does.

---

## GALAXY MAP

`GALAXY MAP.bas` lines 3000-3320, reached from flight by C, then 1 for CENTRAL COMPUTER,
then 3 - COM line 265's `IF C = 3 THEN GOSUB 3000`, and COM 3000 is `RUN GALAXY MAP`.
`probe_galaxymap.mjs` captures it; `galaxymap_parity.mjs` compares.

| | |
| --- | --- |
| the map | **0 of 53,760 pixels differ** |
| the paddle cursor | **13 of 13 pixels, none missing, none extra** |

Exact on the first comparison, which has not happened before on this disk.

### The three coordinate tables are one block read three ways

```
3020 FOR P = 1 TO 20:X(P) = PEEK(M + P):Y(P) = PEEK((M + P) - 21):Z(P) = PEEK((M + P) - 42): NEXT P
```

with `M = 38366`. This is where the addresses for the port's planet coordinates come from,
and it is the line that proves H/D 10010 is a copy-paste bug: the hyperdrive cost assigns
`X1`, `Y1` and `Z1` all three from `PEEK(38366 + ...)`, missing the `- 21` and `- 42`.

### How a star is drawn

- **Shape by Z** (3030-3050): `Z < 12` gives shape 6, `11 < Z < 16` gives 5, `Z > 15` gives 1.
- **Position** (3060, 3065): `X = X(P) * 10 - 35`, `Y = Y(P) * 5`.
- **Colour** (3066): `IF PEEK(38219 + P) = 1 THEN HCOLOR= 2`, otherwise the HCOLOR 3 set at
  3025.
- **The current system** (3075) gets a violet box, `HPLOT X-5,Y+5 TO X+5,Y+5 TO X+5,Y-5 TO
  X-5,Y-5 TO X-5,Y+5`.

**38219+P is not a boolean.** SOL's byte reads **100** on a fresh disk, and line 3066 tests
`= 1` exactly, so SOL is drawn white like any other star and only the box marks it. The port
models this field as `surrendered: boolean`, which cannot hold 100, so the two agree on a
fresh game by luck rather than by construction. What else 38219+P carries is not known.

Line 3090's `HPLOT 1,150 TO 279,150` sets `HCOLOR= 5` and nothing changes it afterwards, so
line 3100's two labels are orange as well.

### The cursor never stops moving, and Applesoft truncates AT

Line 3120 XDRAWs shape 12 at the paddle position and line 3200 XDRAWs it away again, so the
page alternates between two states forever and never settles. The probe separates them by
sampling: over 41 reads, a pixel lit in every one is map and a pixel that ever goes dark is
cursor. That found 13 cursor pixels, and the map underneath is what the parity run compares.

Getting the cursor itself right needed one thing the listing does not say. `PX` is a float -
line 3110 is `PX = PDL(0) * 1.19`, which read 148.75 in the capture - and **Applesoft
truncates the AT coordinates before drawing**. Handing the float to the shape interpreter
and letting each plotted pixel round put the whole cursor one column right.

### Selecting a star

```
3215 PX = PX + 35
3230 IF INT(PX / 10) < = X(P) + 1 AND INT(PX / 10) > = X(P) - 1
     AND INT(PY / 5) < = Y(P) AND INT(PY / 5) > = Y(P) - 1 THEN GOTO 3250
```

Line 3215 adds back the 35 line 3065 subtracted. The test is not symmetric: X is plus or
minus one, but Y catches only the star's own row and the one above.

The distance at 3300-3320 is `INT(SQR(X1^2 + X2^2 + X3^2))` over all three axes - so the
galaxy map measures distance properly while the hyperdrive, which charges for it, does not.

### Two smaller things

- **GALAXY MAP has its own lamp routine.** Lines 5000-5160 paint the panel indicators as
  solid bars - `FOR J = LY TO LY + 4: HPLOT LX,J TO LX + 9,J` - at (7, 72, 200, 262) x
  (153, 161). Those are the same eight lamps `CALL 38402` draws, in the same two rows, but a
  few pixels wider and at slightly different columns. It runs only on the way out, from
  lines 1 and 2, when returning to COM or the simulator.
- **A `GOSUB 10000` that never fires.** `10000 IF T > 200 THEN POKE 973,255: RETURN` is
  another use of the inverse flag, but nothing in the program sets `T` or calls 10000. Dead
  code, left from whatever it was copied out of.

---

## RADAR, and how Applesoft draws a line

`RADAR.bas`, reached from COM by 3 - COM line 133's
`IF COM = 3 THEN POKE 38388,2: PRINT "RUN RADAR"`. `probe_radar.mjs` captures it;
`radar_parity.mjs` compares.

| | |
| --- | --- |
| the reticle, lines 2005-2042 | **1,143 of 1,143 pixels, exact** |
| the whole view, rows 0-123 | 96.7% exact, **98.7% within one pixel** |
| the panel below | **0 of 19,040 differ** |

### It borrows the flight renderer

RADAR is the first program that does not draw its own world. Line 2000 saves the pitch,
forces it to 63, moves the ship to Y = 20000 and levels the bank; 2005 CALLs 24576 - `$6000`
- and 37936, and plots a reticle over whatever comes back. Line 2045 puts pitch and bank
back and 2055 restores Y, so nothing survives it: the whole thing is a borrowed camera
looking straight down from far above.

```
2000 P(1) = PEEK(P1): POKE P1,63:BV% = 20000: GOSUB 6000: POKE YI,LO%: POKE YI + 1,HI%
     B(1) = PEEK(B1): POKE B1,0
2005 ... CALL 24576: CALL 37936 ...
```

So the two halves of the screen have to be scored separately, and the split is exactly what
you would expect: the reticle is BASIC line work and is exact, and the starfield behind it
is the renderer, at the same 98.7% within a pixel the other renderer harnesses report.
Averaging them would have hidden both.

Line 2057 is COM line 8's needle-track erase again, verbatim - RADAR clears the same two
tracks on the way out.

### HPLOT TO is not Bresenham

The reticle is the first diagonal line work on this disk. Everything COM, STATUS and GALAXY
MAP draw is axis-aligned, where every line algorithm agrees, so nothing before this caught
what the port was doing wrong.

Along `HPLOT 1,0 TO 131,59` the original lights **two** pixels in some columns and one in
others: 7 and 8 at x 18, 14 and 15 at x 34, 18 and 19 at x 42, but only 11 at x 26 and only
29 at x 66. Textbook Bresenham takes a diagonal step when both error tests fire and never
lights the corner; Applesoft steps one axis at a time and lights both sides of every row
change, in the column where it happens.

Two details fall out of the measurements and neither is guessable:

- **It is floor, not round.** At x 66 the true y is 29.50 and the original lights 29.
- **An exact crossing does not double.** Along `HPLOT 151,67 TO 279,123` the slope is
  56/128, which is exactly 7/16, so every sixteenth step lands on a whole number - and at
  those columns the original lights one pixel, not two. The new row belongs to the next
  column. That was the last seven pixels of disagreement.

The endpoint behaves the same way: `HPLOT 1,0 TO 131,59` lights 58 at x 130, not 58 and 59.

### Two line routines, not one

Applying that to everything cost ship wireframes 0.2 points of within-one-pixel agreement,
which is the useful part of the result: **the disk has two line routines and they do not
agree.** Applesoft's `HPLOT TO` draws the BASIC programs' line work; the renderer at `$6000`
plots its own segments in machine code that has not been disassembled.

`Hires.line()` is now the Applesoft one, measured. `Hires.segment()` keeps the textbook
Bresenham for the 3D renderer, and `shipBytecode.ts` uses it - not because that is known to
be right, but because it is what the existing numbers were measured against and there is no
evidence yet for anything better. Deriving `$6000`'s line drawing is an open question.

---

## GROUND FORCES

`GROUND FORCES.bas`, reached from COM by 2 - COM line 127. `probe_groundforces.mjs`
captures it; `groundforces_parity.mjs` compares.

| | |
| --- | --- |
| the menu screen | **0 of 53,760 pixels differ** |
| the battle screen's layout | **2,138 of 2,138 pixels** |

The rest of the program is combat resolution driven by `RND`, and there is nothing to
compare it against pixel by pixel.

### The menu is drawn on top of COM's screen

It never clears and never fills. Line 12 blanks rows 1-12 with printed spaces and line 13
draws the same box COM does - so what is on the page is **COM's screen with a hole punched
in the left-hand column**. COM's twelve readouts are still down the right, its 40-character
line is still at row 14, and the `HCOLOR= 6` flood is still behind all of it.

Three things carry over from COM with no code in GROUND FORCES to set them:

- **The text window.** `POKE 32,1` / `POKE 33,21` are COM's, so line 12's eighteen spaces
  land on columns 1-18 and every `PRINT` starts at column 1.
- **HCOLOR.** It lives in the hi-res routines' zero page, not in a BASIC variable, so `RUN`
  does not reset it. `$E4` reads **42** = `$2A` = HCOLOR 1 when the menu holds at line 60 -
  COM's line 90. The box and all the menu text are green.
- **The inverse flag.** `$3CD` is 0 on arrival, so the menu is normal video.

Comparing this screen means replaying the whole chain: the panel, line 210's lamps, line
180's needles, COM including its line 8 erase, and then the menu.

### The battle screen

Line 100 takes the window full width and 17 rows deep and blanks rows 0-15; 110 sets
`HCOLOR= 5` and draws the box, and nothing changes the colour again, so every label is
orange. Line 150's `POKE 973,255` comes **after** the labels, so they are normal video and
everything printed afterwards is inverse - which is what line 170's four rows of spaces
produce: the solid white band the narrative prints into.

The line numbers run 120, 130, 140, 145, so `PROBABILITY` and `OF SUCCESS :` are printed
after `COMPUTER` and `PROJECTION` even though they sit above them on screen.

The port had the geometry right and the rest wrong: white and green instead of orange, and
`GROUND FORCES`, `OF SUCCESS:`, `COMPUTER` and `STATUS` where the original prints
` GROUND FORCES`, `OF SUCCESS :`, ` COMPUTER ` and `  STATUS  ` - the padding is part of the
string and shows, because the text is opaque.

### The combat, which cannot be compared

Lines 500-690 resolve the battle. Recorded here because it is readable and the port's
version was not derived from it:

```
550 VIC = RND(1) * (10 * TECH): IF VIC < 20 THEN T1 = TECH * 3: T2 = 500 + (RND(1) * 20)
    T3 = 200 + (RND(1) * 5): X = RND(1) * (12 / (TECH + .5))
555 T1 = 1: T2 = 200 * (RND(1) * 5): T3 = 500 + (RND(1) * 5): X = -(RND(1) * (10 / (TECH + .5)))
572 PS = 100 / (SP + .01): PS = PS * VP
575 X = X + (PEEK(38203) - 3)
580 VP = VP + X
660 IF VP = > SP THEN ... "THE PLANET HAS SURRENDERED!": POKE 38208,1: POKE 38219 + PEEK(38209),1
```

`SP` is `PEEK(38150)` and `VP` is `PEEK(38160)`; line 575 is where troop morale enters, as
`morale - 3`. Line 4001 clamps the displayed probability to 100. None of this is checked
against the port.

---

## SHORE LEAVE

`SHORE LEAVE.bas`, reached from GROUND FORCES. `probe_shoreleave.mjs` captures it;
`shoreleave_parity.mjs` compares.

| | |
| --- | --- |
| CRYOGENICS | **0 of 53,760 pixels differ** |
| the pay screen | **0 of 53,760** |

### It is a dispatcher

```
20 J = PEEK(38388): POKE 38388,0: ON J GOTO 2200,2400,2500,2100,4000
```

and 38388 is set by whichever GROUND FORCES option chained here - 4 ENLIST sets 1, 5 SELL
LOOT sets 2, 6 REPAIR/RESTOCK sets 3, 7 ESTABLISH BASE sets 4, 8 CRYOGENICS sets 5. Option 3
leaves it at 0, so `ON J GOTO` falls through to 2080 and the shore-leave pay screen. Six
sub-screens in one program.

All six share a frame: line 14 draws the same box COM does, and `GOSUB 2080` blanks rows 1-12
with eighteen printed spaces. Nothing clears or fills, so COM's twelve readouts, its
40-character row 14 and the HCOLOR 6 flood are all still underneath - the same arrangement as
GROUND FORCES, and comparing it means replaying the same chain.

The clear lands inside the box without touching it: columns 1-18 are x 7-132 and rows 1-12
are y 8-103, while the box is at x 1 and 139 and y 1 and 110.

`$E4` reads 42 = `$2A` = HCOLOR 1 and `$3CD` reads 0 while the pay screen holds, so these
screens are green and normal video - the fourth independent reading of those two.

### Two gates, and one that turns out not to be a gate

Line 5 bounces back to GROUND FORCES unless `PEEK(38208)` is set, and line 4 sends
CRYOGENICS past it. The probe pokes 38208 to reach the pay screen - and then found it was
**already 1** on a fresh game. SOL starts surrendered. That is worth recording because
38219+1 reads 100 rather than 1, so the two "this planet is ours" bytes do not agree in form
and only one of them is a flag.

Line 2505 gates REPAIR on `PEEK(38210) = 0 OR PEEK(29469) > 22` - the atmosphere flag and the
ship's Y - so in deep space it prints `YOU MUST LAND ON / PLANET FIRST.` rather than the
repair list. That is why the repair screen is not captured here, and it is the screen whose
line 2500 DATA settled the twelve system addresses and the energy byte's 0-63 scale.

### What the port had

`hgr()`, a `SHORE LEAVE` title the original never prints on that screen, the text starting
two rows too low, and `NOT PAID.` / `TROOPS PAID.` messages that are nowhere in lines
2088-2099 - the original changes morale silently and chains out. The refusal at 2090,
`YOU DON'T HAVE / ENOUGH CREDITS, SIR!`, is real and stays.

### The economy, quoted but unchecked

Loot is valued at 2400-2406, thirteen counters at 38171-38183 with a price each and the
total doubled:

```
2400 L = PEEK(38171) * (300 * RND(1)): L = L + (PEEK(38172) * 150): ...
2406 L = L * 2
```

and a base costs `C = 20000 + ((RND(1) * 5000) * (RND(1) * 10))` at line 2170. Weapons are
priced at 3060 as `INT((RND(1) + .2) * 4 * MU(n))` with `MU` = 50, 75, 40, 30 for fighters,
transports, tanks and missiles. None of it is checked against the port.

---

## SUPPLY

`SUPPLY.bas`, reached from flight by C, 1, 5 - COM line 270's
`ON C GOTO 800,900,30,1200,20000` landing on 20000's RUN SUPPLY. `probe_supply.mjs`
captures it; `supply_parity.mjs` compares.

| | |
| --- | --- |
| page 1 | **0 of 53,760 pixels differ** |
| page 2 | **0 of 53,760** |

Two pages of one screen: line 1450 holds the first at a `GET`, line 1460 sets `R1` and calls
1400 again - which clears, prints the title and returns early at the `R1` test - and the
second page is drawn over it. Line 1510 takes `1` back to the first.

Unlike COM's chain, SUPPLY owns the screen: line 20 floods rows 0-123 with `HCOLOR= 1`, and
line 1400 pokes 973,255, so the whole report is inverse - the fifth independent reading of
that flag. Only line 1515 puts it back.

### The thirteen cargo counters

| address | line | printed as | multiplier |
| --- | --- | --- | --- |
| 38181 | 1410 | PLATINUM, POUNDS | x 10 |
| 38183 | 1410 | GOLD, POUNDS | x 10 |
| 38182 | 1420 | SILVER, POUNDS | x 20 |
| 38180 | 1420 | TITANIUM, THOUSAND POUNDS | x 1 |
| 38179 | 1430 | COLLAPSIUM, TONS | x 1 |
| 38178 | 1430 | STEEL, TONS | x 1 |
| 38177 | 1440 | FISSIONABLES, POUNDS | x 1 |
| 38176 | 1470 | ELECTRONIC PARTS, CRATES | x 1 |
| 38175 | 1470 | WEAPONS, CRATES | x 1 |
| 38174 | 1480 | FIGHTER PARTS, CRATES | x 1 |
| 38173 | 1480 | LUXURY FOODS, CASES | x 1 |
| 38172 | 1485 | WINE/LIQUOR, CASES | x 100 |
| 38171 | 1490 | ART WORKS, UNITS | x 10 |

These are the same thirteen SHORE LEAVE line 2400 values for sale, and the two sets of
numbers are **not** the same thing: 2400 prices them (`PEEK(38172) * 150`, and so on) while
SUPPLY only scales them for display. The port's `totalValue()` used SUPPLY's display
multipliers as if they were prices. It is gone; the real prices are quoted under SHORE LEAVE
and remain unchecked.

### A full-width PRINT does not always fill the window

Line 1400 clears with `HTAB 2: VTAB C: PRINT "<39 spaces>"` into a window set by
`POKE 32,1: POKE 33,39` - 39 characters into a 39-wide window. **Only 38 columns come out
blanked.** Column 39, x 273-279, still shows the `HCOLOR= 1` flood underneath, odd pixels
only. That was the entire disagreement on both pages: 3 pixels a row over 120 rows.

GROUND FORCES line 100 is the same shape - 40 spaces into a window set by
`POKE 32,0: POKE 33,40` - and there **all 40 columns are blanked**. Measured both ways: the
GROUND FORCES menu has x 274, 276, 278 lit at row 0 and the battle screen that replaces it
does not.

So a `PRINT` of exactly the window width loses its last character in one case and not the
other, and the difference is the left margin. The rule is recorded from the measurements;
the mechanism is not derived. Every other clear on this disk is narrower than its window -
STATUS prints 38 into 39, GROUND FORCES line 12 and SHORE LEAVE 2080 print 18 into 21, COM
line 29 prints 20 into 40 - so this only ever shows up in these two places.

---

## ORBIT

`ORBIT.bas`, twenty lines, run by STARSHIP SIMULATOR line 158:
`IF PEEK(38210) = 1 AND Y > 4000 THEN PRINT "RUNORBIT"`. `probe_orbit.mjs` captures it;
`orbit_parity.mjs` compares.

| | |
| --- | --- |
| ORBIT's own area, rows 0-125 | **0 of 35,280 pixels differ** |
| the whole page | **0 of 53,760** |

It is a transition, not a destination: it draws one screen, repositions the ship, BLOADs
PLANET # 0 and a ship model and chains straight back to the simulator without ever waiting
for a key. Line 10 floods only rows 0-125, so the panel below survives, and line 5 pokes
973,255 - so line 20's three PRINTs are a solid inverse band with the message in black
through the middle. Line 26 puts the flag back.

Lines 27-37 leave the ship at **X 700, Y 200, Z 2000, heading 190**, with line 25 clearing
the atmosphere flag and line 29 overriding the heading it read one line earlier.

### Reaching it needed the Applesoft variable, not the bytes

The obvious way in is to poke 38210 and Y. The atmosphere flag takes, but Y does not: the
main loop keeps Y as a BASIC variable and line 140 writes it back over `$731D`, and line 8's
read only happens on the pass that runs it. Measured, the loop is about **a hundred frames a
pass**, so poking memory loses the race almost every time - after forty pokes the bytes read
5000 and the BASIC `Y` still read 206.

`VAR_READER` gives the variable's address, so the probe writes the Applesoft float directly:
5000 is `8D 1C 40 00 00`, exponent 13 + 128 and a mantissa of 0.6103515625. That takes on the
next pass.

### Two things in the listing that do not reach the screen

- **Line 2's row-23 clear**, `VTAB 24: HTAB 1: PRINT "<17 spaces>";: HTAB 24: PRINT
  "<16 spaces>"`, lands on cells INSTRUMENTS never draws into - measured, columns 0-16 and
  23-38 of row 23 are empty on the original's page either way. It is a no-op.
- **Line 21's `POKE 974,64`** comes before line 22's HPLOT, but 974 only gates the character
  generator, not HPLOT, so the lamp is drawn. It is there to keep line 30's BLOAD commands
  off the hi-res screen.

### The needles are not ORBIT's to lose

The first comparison left 18 pixels over, at rows 132-134 and 165-169 - the bank and pitch
needles. ORBIT's line 2 erases only the speed and energy tracks, so it did not remove them;
the page simply does not have them. STARSHIP SIMULATOR line 180 records the positions to
erase only `IF OO = 1`, so the flight loop is double-buffering and which hi-res page carries
the needles depends on the flip phase when ORBIT takes over. Nothing here pins that phase
down, so the harness draws no needles and says why.

### In the port

The draw lives in `scenes/orbitScreen.ts` and `scenes/orbit.ts` calls it. What it replaced
was `hgr()`, HCOLOR 3 instead of inverse, and no needle-track erase. Lines 25-37's exit
state - X 700, Y 200, Z 2000, heading 190, atmosphere cleared - is `ORBIT_EXIT_STATE` beside
the draw, so the scene and the documentation share one copy of it.

---

## H/D, the hyperdrive jump

`H/D.bas`, run by STARSHIP SIMULATOR line 209: `IF K = 24 THEN PRINT "RUNH/D"`, where K is
the key code less 176 - so 24 is 200, `H` with the high bit set. `probe_hd.mjs` captures it;
`hd_parity.mjs` compares.

Line 1 bounces straight back unless a destination is set: `IF PEEK(38210) = 1 OR PEEK(38209)
= PEEK(38163) OR PEEK(38163) = 0`. 38163 is what COM line 880's SET COURSE pokes, and it is
0 on a new game.

### The screen cannot be compared, so what can was

Line 17 blanks rows 0-15, then line 20 draws **175 lines from (140,63)** - `C1,C2` set at
line 14 - to `RND(1) * 279, RND(1) * 125`, in HCOLOR 3. Line 80 sets `R = 2` and jumps back
to 20, which runs the same loop again in the HCOLOR 0 of line 76 and rubs them out. Two runs
of the original do not agree with each other, so a pixel diff would mean nothing.

| | |
| --- | --- |
| lit pixels, rows 0-125 | disk 10,520; the port's own runs give 9,342 to 10,957 |
| around the origin (140,63) | 9 of 9 lit |
| rows 126-127 | 0 lit on both - line 17 clears to y 127, line 20 reaches y 125 |

What the port had instead was an animation: eighty polar "warp lines" over 2.7 seconds, with
`HYPERDRIVE CHARGE` and `WARP DRIVE ENGAGED` captions. None of that is on the disk.

### The jump cost, confirmed on the machine

This is the useful part. The `D1` formula was derived from the listing and argued from
GALAXY MAP line 3020; the capture measures it:

| | |
| --- | --- |
| planet | 1 -> 5 |
| X table | 15 -> 22 |
| `INT(SQR(3 * dX^2) + .6)` | **12** |
| energy | 63 -> 51, a cost of **12** |

So the hyperdrive really does charge `|dX| * sqrt(3)` and really does ignore Y and Z.

Everything else lines 50-93 do checks out too: `Z` came back -9908, and line 70 retries until
`ABS(BV%)` is at least 7000; pitch and bank are 0 from line 75; `38240 + 5` is 1, the visited
flag line 16 sets; and 38209 has become the destination, line 26.

Line 73 is `A = RND(1) * 255`, so the heading lands in 0 to 254 - the port was using 256.

### One thing lines 90-93 say that the capture did not show

```
90 TECH = PEEK(38282 + PEEK(38209)): IF TECH < 2 THEN POKE 38150,0
93 IF TECH > 1 THEN POKE 38150,TECH * 60: POKE 38204,TECH * 60: POKE 38160,0: POKE 38161,0
```

Planet 5's tech is 2, so line 93 should leave 38150 at 120. Read after H/D had chained on,
**38150 was 0**. The read happened once STARSHIP SIMULATOR was running again, so the
simulator most likely overwrote it - but that is a guess, and nothing here pins it down. The
port follows the listing; the discrepancy is recorded rather than explained.

---

## COLLECT

`COLLECT.bas`, chained from GROUND FORCES line 805 once a planet surrenders.
`probe_collect.mjs` reaches it by pressing 1 for ATTACK PLANET and waiting the battle out;
`collect_parity.mjs` compares.

| | |
| --- | --- |
| COLLECT's band, rows 11-14 | **0 of 8,960 pixels differ** |

It writes nothing else. The band is the one GROUND FORCES' line 170 clears, and `$3CD` is
still 255 from there, so both messages are inverse over the battle screen.

### The loot rates

Line 805's `ON TECH + 1 GOSUB 820,840,910,1070,1090` picks the message and the rates, and
line 920 does the awarding:

| tech | J1 | J2 |
| --- | --- | --- |
| 0 | nothing at all | |
| 1 | its own short path at 850-900 | |
| 2 | 0 | 10 |
| 3 | 10 | 7 |
| 4 | 15 | 15 |

J1 covers collapsium, electronic parts, weapons and art works; J2 the rest; luxury foods is
always `RND(1) * 20`. At tech 2 J1 is **0**, which is what "THERE ARE NO HIGH TECHNOLOGY
PRODUCTS AVAILABLE" means mechanically.

Measured on a tech 3 assault, every gain fell inside its rate: art 4, weapons 9, electronics
6 and collapsium 7 against J1 = 10; wine 2, fighter parts 4, fissionables 1, steel 0,
platinum 5, silver 4 and gold 4 against J2 = 7; luxury foods 4 against 20.

Line 920 also halves both rates on any haul after the first in a trip -
`IF PEEK(301) = 1 THEN J1 = J1 * .6: J2 = J2 * .6`, then 921 sets 301. H/D line 5 pokes it
back to 0, so a jump restores the full rate.

### Two bugs in the original, one confirmed

**Line 960 pokes the wrong address.**

```
960 J = PEEK(38180) + (RND(1) * J2): GOSUB 915: POKE 31180,J
```

38180 is titanium; **31180** is `$79CC`, inside the ship model BLOADed to `$7879`. So
titanium is never awarded and a byte of the model is overwritten instead. Confirmed on the
machine: after the assault titanium was still 0 and 31180 had gone from **68 to 0**. SUPPLY
will print TITANIUM = 0 for the whole game no matter what is looted.

**Line 880 stores the wrong variable.**

```
870 F = PEEK(38182) + (RND(1) * 5): IF J > 255 THEN J = 255
880 POKE 38182,J
```

`F` is computed and thrown away, the cap tests `J`, and 880 stores `J` - still gold's value
from line 850. Silver should come out equal to gold. **This is not confirmed**: it is the
tech 1 path, and the assault reached was tech 3, which goes through line 920 where 940 pokes
38182 correctly. The captured silver and gold both read 4, but those are independent draws
and prove nothing. The port reproduces the bug from the listing.

### Two smaller things

- **A third spelling list.** COLLECT line 10000's DATA has `GROOMBRIDGE 1618`, as STATUS does
  and COM does not. Two of the three programs that carry the twenty names agree with each
  other and not with COM.
- **The oracle's RND is deterministic from a cold boot.** Two runs of this probe produced
  identical loot - art 4, wine 2, luxury 4, fighter 4, weapons 9, electronics 6,
  fissionables 1, steel 0, collapsium 7, platinum 5, silver 4, gold 4. Useful: RND-driven
  screens are reproducible as long as the route to them is.

### What the port had

A `LOOT GAINED` table listing every item's delta with a per-unit value. COLLECT prints no
such thing, and those per-unit values were another set of invented prices.

---

## RECALL

`RECALL.bas`, twelve lines, chained from GROUND FORCES option 2. `probe_recall.mjs`
captures it; `recall_parity.mjs` compares.

| | |
| --- | --- |
| the whole page | **0 of 53,760 pixels differ** |

It redraws the same box COM does, prints one of five two-line messages, and chains straight
back to GROUND FORCES. No key, no title, no status panel.

Everything else comes from up the chain. It never clears and never sets the window, so both
are COM's by way of GROUND FORCES - left 1, width 21, `$3CD` 0, `$E4` 42 for HCOLOR 1 - and
rows 1-12 are already blank because GROUND FORCES line 65 ran `R = 5: GOSUB 12` on the way
out.

The message lands on **0-based rows 4 and 5**, which is measured rather than traced. Tracing
the cursor through GROUND FORCES' dispatch and RECALL's own four file PRINTs is not reliable
- the first attempt predicted rows 2 and 3 - but the capture is unambiguous: rows 4 and 5,
with the box on 0 and 13 and COM's forty-character line on 14.

### The five branches

| line | condition | prints |
| --- | --- | --- |
| 2000 | `38209 <> 38158` and `0 < 38166 < 3` | TROOPS ARE NOT ON / *blank* / THIS PLANET, SIR! |
| 2005 | `TR = 0` | WE HAVE NO TROOPS / LEFT, SIR! and pokes 38166 to 0 |
| 2010 | `38166 = 1 or 2` | TROOPS ARE BEING / RECALLED, SIR! and pokes 38166 to 0 |
| 2020 | `38166 = 3` | TROOPS ARE IN / CRYOGENIC SLEEP! |
| 2030 | `38166 = 0` | TROOPS ARE ALREADY / ON BOARD, SIR! |

Only 2020 has been run - a new game has the troops in cryogenic sleep. The other four are
ported from the listing and are not verified.

Note 2000 is the only one with a blank line in the middle of it, and that it is also the
only branch that leaves 38166 alone while refusing.

### What the port had

A `RECALL TROOPS` title, two horizontal rules, a seven-line TROOP STATUS panel of troops,
fighters, tanks, missiles, transports, morale and credits, a `PRESS ANY KEY...` prompt, five
differently worded messages, and `MERCURY, VENUS, EARTH, MARS...` for the planet names - the
same fabricated list that was deleted from `orbit.ts`. None of it is on the disk.

---

## EX, the enemy explosion

`EX.bas`, sixteen lines, run by STARSHIP SIMULATOR line 1560 from inside the laser
subroutine: `IF DP > PEEK(38204) AND PEEK(38205) < > 0 THEN PRINT "RUNEX"`.
`probe_ex.mjs` captures it; `ex_parity.mjs` compares.

Reaching it needed the fire button, not a key. `DP` comes from line 1540 as
`PEEK(38152) + (J2 / (TE + 1))`, so the probe leaves the enemy damage accumulator high and
its limit low and then holds button 0 - apple2js exposes `buttonDown`/`buttonUp` on the IO,
which is what line 185's `PEEK(-16287)` reads.

### The burst

```
7  FOR X1 = 5 TO 130 STEP 8: Y1 = Y1 + 4.8: FOR J = 1 TO 15
20 X2 = X1 - (RND(1) * (X1 + X1)): Y2 = Y1 - (RND(1) * (Y1 + Y1))
21 IF Y2 > 65 THEN Y2 = 65
22 IF Y2 < - 60 THEN Y2 = - 60
25 HPLOT 140,60 TO 140 + X2,60 + Y2: NEXT
```

Sixteen steps of fifteen segments - **240 in all** - from (140,60), with the spread growing
as `X1` and `Y1` do, which is why the middle is dense and the edges are sparse. `Y1` starts
at 20 on line 5 and is bumped before the first inner loop, so it runs 24.8 to 96.8.

It is random, so no pixel diff. With the flash and the starfield underneath in place - EX
never clears, so both are on the page - the disk's 8,104 lit pixels sit inside the 7,610 to
8,287 the port's own runs give. The origin is 9 of 9 lit.

Leaving the starfield out is what the first comparison did, and it put the disk 278 pixels
above the port's best run. Worth remembering for anything else that draws over flight.

### What it leaves behind

| | |
| --- | --- |
| 38205 | 3 -> 0, line 30 - no enemy ship |
| 38207 | 30 -> 15, line 56's `F = PEEK(38207) / 2`, POKE truncating |
| `$7879` | line 30 pokes 127, and line 40's `BLOAD DEBRIS` lands on the same address immediately - the blank never survives to be read |

### Line 6's flash, and one thing not measured

```
6 SCALE= 2: XDRAW 2 AT 140,65: XDRAW 15 AT 140,65: XDRAW 16 ...: XDRAW 17 ...: XDRAW 18 ...
```

Five shapes at double scale, two pixels below the burst's origin. These are **XDRAW**, so
over the flight view they invert rather than paint. The port draws them, which is the same
thing over empty space and not the same over a star. That is a simplification, not a
measurement.

### What the port had

Forty polar "debris particles" animated as crosses over twenty-four frames, a full-screen
orange flash, `hgr()` between frames, and an `ENEMY SHIP DESTROYED` caption. EX clears
nothing and prints nothing.

---

## S/X, the player's death - and what inverse video really is

`S/X.bas`, sixteen lines, run by H/D line 4 when its line 2 finds the energy at 0, and by
STARSHIP SIMULATOR line 3350 when the hull reaches 0. `probe_sx.mjs` captures it;
`sx_parity.mjs` compares. Getting there is a matter of setting a destination, emptying the
tank and pressing H - which also captures H/D's own out-of-energy screen on the way.

### It is EX inverted

Lines 7-30 are EX's lines 7-30, character for character: sixteen steps of fifteen segments
from (140,60), `Y1` from 24.8 to 96.8, `Y2` clamped to -60..65. The one difference is line 5's
`HCOLOR= 0`, so the burst cuts black channels out of the screen instead of painting white
ones onto it. `drawExBurst` takes a colour and both scenes share it.

### Line 5 turns the whole page white

```
5 HCOLOR= 0:Y1 = 20: POKE 973,255: PRINT ""
```

That one empty `PRINT` leaves **the entire page solid white**. Measured by sampling the lit
count while it ran: 3,909, then 16,872, then 53,760 of 53,760 over about twenty-five frames,
with `$3CD` reading 255 and `$E4` reading 0 throughout. A newline does not blank a
twenty-four row window on its own, so something in the character generator's scroll or
window handling is doing it. Only the result is established.

| | |
| --- | --- |
| the finished screen | disk 45,481 lit; the port's runs give 45,306 to 46,628 |
| line 40's message row | **433 dark pixels on both** |

### Inverse video does not use HCOLOR

This is the part worth keeping. The port painted an inverse cell's background in the current
HCOLOR, which happened to work everywhere it had been tested and is wrong.

Two measurements settle it:

- **STATUS** clears with inverse spaces under `HCOLOR= 1`, and the rows come out **fully
  lit** - 266 of 266 pixels across columns 1-38. Half-density green would give 133.
- **S/X** prints its message under `HCOLOR= 0`. If the background followed HCOLOR the whole
  row would be black; the machine leaves it white and darkens only the 433 glyph pixels.

So an inverse cell is **white behind a black glyph, whatever HCOLOR is**. The port now does
that, and it is why the message row went from 1,680 dark pixels to 433.

Nothing regressed: COM, STATUS, SUPPLY, GROUND FORCES and COLLECT are all still exact. They
could not have caught this - every one of them is inverse under a non-zero HCOLOR, where
lighting all seven pixels of a cell in green and lighting them in white are the same thing to
a lit-pixel comparison. Only `HCOLOR= 0` tells them apart, and S/X is the only screen that
does it.

### What the port had

The same forty polar debris particles as EX, animated over twenty-four frames, plus a stats
screen counting planets owned and kills. S/X has no stats and no animation - it whitens the
page, cuts the burst out of it, prints one line, waits for two keys and reboots with `PR#6`.

---

## Open questions

Answered ones have been removed from this list rather than left to accumulate. What follows
is what is genuinely not known, roughly in order of how much it matters.

### Whole parts of the game have never been looked at

- **Five of the 23 programs.** DMG, END and the four SHIP # n I.D. programs are extracted
  and readable but nothing has been compared against them. STATUS, GALAXY MAP, RADAR,
  GROUND FORCES, SHORE LEAVE, SUPPLY, ORBIT, H/D, COLLECT, RECALL, EX and S/X are done.
- **Why one empty inverse PRINT whitens a whole page.** S/X line 5 does it, measured; the
  mechanism in the character generator is not derived.
- **EX line 6's XDRAW.** The port draws the five flash shapes rather than XORing them, which
  differs wherever the flight view already has a pixel.
- **Four of RECALL's five branches.** Only line 2020 has been run; a new game always has the
  troops in cryogenic sleep.
- **COLLECT's tech 1 path.** Lines 840-900, including the line 880 silver bug, have never
  been run - every assault reached so far has been tech 3.
- **H/D lines 90-93.** Planet 5's tech is 2, so 38150 should be 120 after the jump; it read
  0. The read was taken after the simulator had resumed and may simply be too late, but that
  is not established.
- **Why a full-width PRINT behaves differently at left margin 0 and 1.** SUPPLY loses its
  last character and GROUND FORCES does not; both are measured, neither is explained.
- **Four of SHORE LEAVE's six sub-screens.** ENLIST TROOPS, SELL LOOT, REPAIR/RESTOCK and
  ESTABLISH BASE are not captured. REPAIR needs the ship in atmosphere; the others need
  credits, loot or an unbuilt base.
- **The economy.** Loot values, base cost and weapon prices are quoted in this file from
  SHORE LEAVE lines 2170, 2400-2406 and 3060, and none of it is checked against the port.
- **GROUND FORCES' combat resolution.** Lines 500-690 are readable and are now quoted in
  this file, but the port's version was not derived from them and has not been checked.
- **The renderer's own line drawing.** `$6000` plots segments in machine code that has not
  been disassembled, and RADAR proves it is not the same routine as Applesoft's HPLOT TO.
  `Hires.segment()` is a placeholder for it.
- **Where a new game's energy comes from.** 38199 reads 63 on a fresh ship and no BASIC
  program POKEs it, so the opening value arrives with a BLOAD. Which file, and what else
  rides along in it, has not been traced.
- **Sound.** SOUND GEN (`$9276`), LASER (`$92D1`) and EXPL (`$9270`) have never been
  disassembled or listened to. `audio.ts` says outright that it approximates them.
- **Game logic.** Combat, damage, the economy, ground assaults - the BASIC for all of it is
  in `captured/disk/` and none of it has been checked against the port.

### Rendering, where the remaining error is

- **Exact pixel overlap.** Geometry is 98-100% within a pixel for ground and ships, and the
  extents match, but landing on the *same* pixel needs the renderer's fixed-point
  arithmetic rather than a float reimplementation of the same formula. Ships 72.2% exact,
  ground 67.5%, stars 38.9%.
- **Opcode 3** in the model bytecode. The harness prefers "draw and continue" at 73.6%
  against 72.6% and 72.2%, which is not much of a margin to conclude from.
- **What state `$6000` needs before it will draw.** Snapshot and replay sidesteps the
  question rather than answering it.

### Things in the port with no counterpart on the disk

Both of the ones that were here are gone: `renderPlanet()`'s procedural disc, and the
fabricated `ship-N.json` / `planet-N.json` shape tables, which have been deleted along with
the code that read them. Everything drawn in flight now comes from the disk.

One thing in that area is left, and it is not fabricated - `enemySourceBitmap` comes from an
AppleWin state dump (`data/debug/applewin-space-vikings-state.json`), a real capture of
unverified provenance. It is only reached when the bytecode path produces nothing, which it
no longer does.

### Smaller

- **Names for the flags.** `38164`, `38207`, `38208`, `38210` and the rest are used
  correctly because their use sites are known, but what the original's author called them
  is not.
