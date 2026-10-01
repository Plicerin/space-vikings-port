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
| `$600C-$600D` | a byte pair `$6526`/`$653F` read and write |
| `$600E-$6013` | **live per-object scale factors**, three 16-bit values - see the correction below |
| `$6014-$6099` | zero-page save buffer, not tables - see below |
| `$609A-$611B` | quarter-wave cosine table, 65 entries of 16-bit LE |
| `$611C` | entry: save zero page, `JSR $6140`, restore |
| `$6140` | the renderer proper: clears `$7B-$9C`, sets `$9C = $73` (the page PLANET # 0 and the ship model live on) |
| `$61A9`, `$61CA`, `$61D7`, `$620F` | line clipping |
| `$633D`, `$635C` | signed multiply |
| `$64F8`, `$64FB`, `$6526`, `$653F` | sine and cosine |

`$611C` copies zero page `$60-$C1` into `$6013-$6075`, calls `$6140`, and copies it back.
So most of the file's head is a **save area**, and what is on the disk there is whatever was
in the developer's zero page when the module was BSAVEd - which is why it disassembles as
stray Applesoft tokens.

**Correction.** The claim that all of `$600C-$6099` is save area was wrong, and it is wrong
at exactly the bytes the save overlaps: the copy starts at `$6013`, so `$600E-$6012` is not
covered by it at all. `$690F` fills six bytes there from the model stream -
`INY / LDA ($9B),Y / STA $600D,Y / CPY #$06 / BNE $690F` - and `$6631` reads them back as
three 16-bit factors that scale the whole matrix, skipping the multiply when a factor is
`$7FFF`. So `$600D-$6013` is a live per-object parameter block that the renderer both
writes and reads, and the save buffer proper begins after it.

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

`fit_projection.mjs` used to write this out as `src/engine/diskProjection.ts`. It no longer
does, and that file has been deleted - see **The fitted projection, and its removal** below.

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
others: 7 and 8 at x 18, 14 and 15 at x 34, 18 and 19 at x 42. Textbook Bresenham takes a
diagonal step when both error tests fire and never lights the corner; Applesoft steps one
axis at a time and lights both sides of every row change.

**A rule fitted here was wrong, and the ROM says why - see "The ROM's line routine" below.**
RADAR's diagonals are `HCOLOR= 2`, which lights only the even columns, so half of the
corner pixels were masked out of the capture. Reading that as "an exact crossing does not
double" fitted the mask, not the algorithm, and the SHIP # n I.D. wireframes - `HCOLOR= 3`,
all columns - contradicted it. The transcribed ROM loop satisfies both.

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
other. **The mechanism is `WNDWDTH` not being a width** - see *The print margin, derived*
below. Every other clear on this disk is narrower than its window - STATUS prints 38 into 39,
GROUND FORCES line 12 and SHORE LEAVE 2080 print 18 into 21, COM line 29 prints 20 into 40 -
so this only ever shows up in these two places.

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
- **Line 21's `POKE 974,64`** comes before line 22's HPLOT, but 974 is the character
  generator's page, not HPLOT's, so the lamp is drawn. 974 holds the **high byte of the page
  the generator writes to** - 32 is `$2000`, 64 is `$4000` - so poking 64 sends line 30's BLOAD
  echo to the undisplayed page instead of over the picture. See *The empty inverse PRINT*
  below, where the same byte turns up as the base of the form-feed clear.

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

## DMG

`DMG.bas`, three lines:

```
10 HCOLOR= 5: FOR J = 153 TO 157: HPLOT 262,J TO 271,J: NEXT:
   PRINT " ": PRINT "RUN STARSHIP SIMULATOR"
```

It lights one panel lamp orange and chains straight back. No clear, no text, no pause.
`probe_dmg.mjs` captures it; `dmg_parity.mjs` compares.

| | |
| --- | --- |
| the lamp | **25 of 25 pixels, none missing, none extra** |
| everything else on the page | **0 pixels changed** |

Measured: the lamp is ten wide by five tall at x 262-271, y 153-157, and HCOLOR 5 lights the
odd columns - 263, 265, 267, 269 and 271.

### 38393 is the ship-damaged flag

Four programs use it and between them they fix its meaning:

| | |
| --- | --- |
| START 2030 | clears it on a new game |
| STARSHIP SIMULATOR 3360 | `IF PEEK(38393) = 0 THEN POKE 38393,1: PRINT "RUNDMG"` - once, on the first hit |
| SHORE LEAVE 2555 | clears it again when the repairs are paid for |
| GALAXY MAP 5140-5150 | paints the same lamp HCOLOR 1 when it is 0 and HCOLOR 5 when it is 1 |

So the light comes on the first time anything lands and stays on until the ship is fixed,
and SHORE LEAVE line 2545 paints the same ten-by-five block in HCOLOR 1 to put it out.
Both colours light the same pixels - green and orange are both odd-column - so the lamp's
state is a colour difference and nothing else.

### Reaching it

Line 192 only calls the damage routine when 38208 is 0 and the ship is inside a box around
the enemy, and the routine at 3000-3032 is gated on `RND` three times over. So the probe
clears the surrender flag, puts an enemy at 38205, and moves `Z` inside the box - `Z` being
a BASIC variable, the same `VAR_READER` trick ORBIT needed, with -3000 as the Applesoft
float `8C BB 80 00 00`.

### What the port had

`hgr()`, which wipes the whole screen; `line(262, 153, 271, 157)`, a single diagonal rather
than five horizontal runs; a `DAMAGE REPORT` title; a twelve-row table of every system's
percentage with NOGO markers; and a three-second pause. DMG draws ten pixels by five and
leaves.

`scenes/stubs.ts` and `scenes/transitions.ts` held nothing but that stub and a re-export of
it, so both are gone.

---

## END

`END.bas`, the save/quit menu, reached from COM by 4 (COM line 132). `probe_end.mjs`
captures it; `end_parity.mjs` compares.

| | |
| --- | --- |
| END's own rows 0-15 | **0 of 35,840 pixels differ** |
| the whole page | **0 of 53,760** |

Three options - SAVE GAME, CONTINUE PRESENT GAME, END GAME - over the instrument panel,
which it never touches.

### The window is COM's, and that decides the clear

END's own `POKE 33,40` changes nothing: COM line 128 has already set
`POKE 32,0: POKE 33,40: POKE 34,0: POKE 35,24`. Left margin **0**, so line 30's sixteen rows
of forty spaces blank columns 0-39 outright - the full-width case that keeps its last
character, unlike SUPPLY's at left margin 1. Measured: column 39 is empty across rows 0-15.

`$E4` reads 42 for HCOLOR 1 and `$3CD` reads 0, so the menu is green and normal video.

Positions, measured rather than traced: END GAME on 0-based row 1 column 15 (line 40's
`HTAB 16`), the three options on rows 4, 5 and 6 at column 6 (`TAB( 7)`), and ENTER CHOICE.
on row 9 at column 0.

### Where the save puts things

```
200 POKE 38211, PEEK(29467): ... : POKE 38218, PEEK(29474)
202 POKE 38219, PEEK(29475)
204 POKE 38391,77: POKE 38392, PEEK(38209)
210 ... BSAVE P/F,A$97E1,L$140 ... BSAVE PLANET FILE,A$954C,L$AF ... BSAVE SHIP'S DATA ,A38150,L54
```

Nine bytes - X, Y, Z, pitch, bank and heading from 29467-29475 - into 38211 to **38219**.

That last address is worth noting. The planets-surrendered table is `38219 + P` for P = 1 to
20, which is 38220 to 38239, so the saved heading occupies the slot a one-based index never
reaches. They are adjacent rather than overlapping, and that is why the table is indexed
from 1 instead of 0.

Line 190 refuses to save in atmosphere; line 100's END GAME zeroes memory from 1 to 5000 and
halts.

### What the port had

A `CAREER SUMMARY` block - systems conquered, systems visited, total credits, troops on
board, hull integrity, stardate and condition - none of which END prints.

---

## SHIP # 0, 1, 3 and 4 I.D.

Four near-identical programs. RADAR line 2056 sends any key but X to line 5000, and 5005 is
`J = PEEK(38205): POKE 38151,5: PRINT "RUN SHIP # ";J;" I.D."`, so the ship-kind byte picks
the program; line 5002 maps kind 2 to SHIP # 3. `probe_shipid.mjs` captures all four in one
session by poking 38205 between visits; `shipid_parity.mjs` compares.

| | rows 0-15 |
| --- | --- |
| SHIP # 0 | **0 of 35,840 pixels differ** |
| SHIP # 1 | **0 of 35,840** |
| SHIP # 3 | 109 of 35,840 - 99.70% |
| SHIP # 4 | 19 of 35,840 - 99.95% |

### How they draw

`POKE 32,0: POKE 33,40: POKE 34,0: POKE 35,16` then sixteen rows of forty spaces, so
columns 0-39 are blanked outright - the left-margin-0 case again. Line 12 draws a frame from
(1,1) to (161,123) and lines 13-14 fill it with a grid: verticals every five from x 7, and
horizontals every five from y 5, all HCOLOR 1. Then HCOLOR 3 and the wireframe.

The drawing loop is the same in all four:

```
1000 READ C
1003 IF C = 77 THEN Y1 = <second view>: GOTO 1000
1005 IF C = 127 THEN 1060
1010 READ X,Y
1020 X = X1 - (X * 2):Y = Y1 - (Y * 2)
1030 IF C = 1 THEN HPLOT X,Y
1040 IF C = 2 THEN HPLOT TO X,Y
```

`X1` is 80 throughout and `Y1` starts at 40; 77 drops to the lower view - 80 for SHIP # 1,
100 for # 3, 90 for # 4 - and 127 ends. SHIP # 0 has no DATA at all: it draws the grid and
prints THERE IS NO / STARSHIP IN / THIS SYSTEM.

The tables are pulled out of the listings by the probe and generated into
`scenes/shipIdData.ts` rather than transcribed: 233 values for # 1, 236 for # 3, 428 for # 4.

### All four exact, once the ROM was read

SHIP # 3 and # 4 were short by 109 and 19 corner pixels under a line rule fitted to RADAR.
Disassembling `HLIN` settled it and all four are now exact - see below.

---

## The ROM's line routine

`Hires.line()` had been fitted to RADAR's reticle and the SHIP # n I.D. wireframes
contradicted the fit. Guessing had run out, so `probe_hlin.mjs` reads $F400-$F700 out of the
emulator and disassembles it. Applesoft's hi-res line is **HLIN at $F53A**, which is where
`HPLOT TO` ends up.

### What it does

One loop. It plots a pixel and then advances **one axis only** - never both - and runs
`dx + dy + 1` times:

```
F53A  ...                                    ; |dx| into $D0/$D1 and $D4/$D5
F55E  TYA / CLC / SBC $E2 / ... / STA $D2    ; $D2 = -(|dy| + 1)
F56E  SEC / SBC $D0 / TAX / LDA #$FF / SBC $D1 / STA $1D   ; counter = -(dx + dy + 1)
F57C  ASL A / JSR $F465 / SEC                ; step x
F581  LDA $D4 / ADC $D2 / STA $D4
      LDA $D5 / SBC #$00 / STA $D5           ; err -= |dy|
F58D  LDA ($26),Y / EOR $1C / AND $30 / EOR ($26),Y / STA ($26),Y   ; plot
F597  INX / BNE / INC $1D / BEQ $F600        ; until the counter runs out
F59E  LDA $D3 / BCS $F57C                    ; carry set -> step x again
F5A2  JSR $F4D3                              ; else step y
F5A5  CLC / LDA $D4 / ADC $D0 / ... ADC $D1  ; err += |dx|
F5B0  BVC $F58B                              ; and straight back to the plot
```

Three things fall out of that and none of them is guessable from pixels alone:

- **It is 4-connected, with no exceptions.** Every corner is two pixels, because the loop
  can only move one axis per plot.
- **`$D2` holds `-(|dy| + 1)`**, so adding it with the carry set is `err -= |dy|`. The error
  starts at `|dx|`.
- **The two branches are not symmetric.** The x branch subtracts `|dy|` and then plots; the
  y branch adds `|dx|` and jumps back to the *plot*, skipping the subtraction entirely.

### What it corrected

The rule this file previously recorded - that a crossing landing exactly on a column
boundary does not double - was **fitted to a colour mask**. RADAR's diagonals are
`HCOLOR= 2`, which lights only even columns, so half the corners never appeared in the
capture. It happened to reproduce RADAR exactly and it was wrong.

Transcribing the loop instead:

| | before | after |
| --- | --- | --- |
| RADAR's reticle | 1,143 of 1,143 | **1,144 of 1,144** |
| SHIP # 0 and # 1 | exact | exact |
| SHIP # 3 | 109 differ | **0** |
| SHIP # 4 | 19 differ | **0** |

RADAR gained a pixel rather than losing one: the extra corner lands on an even column there,
and the original has it too.

Nothing else moved. COM, STATUS, SUPPLY, GALAXY MAP, GROUND FORCES, COLLECT, RECALL, END,
frame and shape parity are all still exact, and the three renderer harnesses are unchanged at
98.8%, 91.7% and 99.5%.

### The renderer's own line, at $6DD5

`$6000` never calls the ROM - a scan of `$6000-$9000` finds no `JSR` or `JMP` anywhere into
`$F400-$F7FF`. The clipper falls through to `JSR $6DD5`, which takes two endpoints from
`$B3-$B6`, one byte each.

It maps them into screen space itself:

```
$6DD5  LDA $B3 / CLC / ADC #$46 / STA $B3      ; x + 70
$6DE3  LDA $B4 / EOR #$FF / CLC / ADC #$60     ; 95 - y
$6DF5  LDA $B5 / SEC / SBC $B3 / BCC $6E38     ; x2 < x1 -> swap the endpoints
```

and then dispatches to one of several octant-specialised inner loops through a
**self-modifying** `JMP` whose target is written to `$6FED`/`$6FEE`. Reading that is a poor
way to learn what it draws, so `probe_line6000.mjs` calls it instead - ten slopes and
directions, on a blank page 2, reading back exactly which pixels come out.

| | |
| --- | --- |
| every point | **two pixels wide** - this is where `drawShipWorld`'s doubling comes from |
| a 45 degree line | **one** logical pixel per row |
| direction | a segment and its reverse light the same pixels |

So the renderer's line is **8-connected** - ordinary Bresenham - where Applesoft's HLIN is
4-connected. Two line routines on one disk that genuinely differ, which is what
`Hires.line()` and `Hires.segment()` now are.

The left-to-right swap was the only thing `segment()` was missing. Nine of the ten cases
matched without it; `(60,30)-(-60,-30)` came out a row off, and it is the reverse of a case
that matched. With the swap, **all ten match $6DD5 exactly**.

The screen mapping is worth keeping too: `x + 70` doubled is `2x + 140`, and the port's
fitted `SCREEN_CENTRE_X` of 139 is that same centre - independent agreement between a
fitted projection and the machine code.

Ship exact overlap moved 72.2% to 71.9% while within-one-pixel held at 98.8%, and ground was
unchanged at 67.5% and 99.5%. The line routine is now checked directly against the machine,
so that small shift is the projection's residual error landing differently, not evidence
about the line.

---

## The projection arithmetic at $68A1

`$6274` is `LDY #$60: LDX #$9F: JSR $68A1` - project the camera-space point at zero page
`$60` into two screen bytes at `$9F`. The point is six bytes: x, y, z, 16-bit little-endian.

```
$68A1  STX $A7 / STY $A8
$68A5  LDA $0004,Y / STA $7A / LDA $0005,Y / STA $7B   ; z
$68AF  LDX $00,Y / LDA $0001,Y / JSR $6468             ; x / z
$68B7  LDA $79 / LDX #$45 / JSR $691E                  ; scale the quotient by 69
$68BE  CLC / ADC #$00 / STA $0000,Y                    ; plus the x offset
$68C8  ... the same for y, with #$3E and #$22
```

- **`$6468`** sorts out the signs and calls **`$64B6`**, a sixteen-step non-restoring divide.
  The quotient lands in `$78`/`$79` and the caller takes the **high** byte.
- **`$691E`** multiplies that byte by the clamp limit in eight shift-and-add rounds. It
  complements its input first, so a clear carry out of each `ROR $78` means the original bit
  was set; the first round loads instead of adding, and the last subtracts once for the sign.
- The carry the divide leaves matters: `$691E`'s opening `ROR $78` shifts it in.

### The four operands are per-object

`$68BA`, `$68C0`, `$68DD` and `$68E3` - the two clamp limits and the two offsets - are
**patched from the model stream** by `$68EA`, which reads four bytes and writes them into the
instruction operands. They are not constants. In the flight snapshot they read 69/0 and
62/34, and the limits arrive as `(byte >> 1) - 1`.

`$6DD5` then maps the results to the screen as `x + 70`, doubled when plotted, and `95 - y`.
That derives two numbers this file had only as fits: `95 - 34 = 61` is `SCREEN_CENTRE_Y`
(fitted 61.74), and the clip rectangle's 0 to 123 is `95 - 34 - 62` to `95 - 34 + 62`.

### Transcribed and checked

`diskProjectionFixed.ts` is the divide, the scale and the sign handling, transcribed rather
than fitted. `probe_project6000.mjs` calls `$68A1` on the machine and
`project6000_parity.mjs` runs the port over the same inputs:

| | |
| --- | --- |
| a sweep of 261 points, including z behind the camera | **261 of 261** |
| every call a live render made to `$68A1` - 293 of them | **293 of 293** |

Curve-fitting would have gone wrong here the way the line rule did: the transfer function is
asymmetric. A ratio of -0.1 gives -8 and +0.1 gives +6, because the sign is resolved before
the divide and the truncations do not mirror.

### Not wired in yet, and why

`projectCameraSpace()` still projects in floating point. Swapping it for the transcription
needs the inputs in the renderer's units, and they are not:

| | |
| --- | --- |
| the port's fitted `FOCAL_X` | 230.90 |
| the machine's, from the clamp limit | 69, doubled to 138 |

A live render's own camera-space values run to `|x|` 764, `|y|` 1114, `|z|` 2176 with the
camera at X 700, Y 200, Z -6401 and stars out at +/-10000 - so the renderer scales into its
own space before projecting, and z comes out **positive forward**, the same sense the port
uses. Feeding the renderer's own values through the port's formula disagrees, so the two
spaces differ by more than a constant factor.

What closes this is the rotation and scaling chain that fills `$60-$65` in the first place.
That is the next thing to read, and until it is read the fixed-point projection stays beside
the float one rather than replacing it.

---

## The rotation chain, and where the port's focal lengths come from

Watching every write to `$60` during one render points at `$67E6`/`$67E8`, the tail of
`$67D4`. Its caller is the transform:

```
$6730  the model point from ($9B),Y minus $90-$95  -> $AB/$AC, $AD/$AE, $AF/$B0
$675B  LDX #$AB / LDY #$7E / LDA #$A7 / JSR $633D   ; dx * m00 -> $A7
$6764  LDX #$AD / LDY #$84 / LDA #$A9 / JSR $633D   ; dy * m01 -> $A9
$676D  dz * $8A/$8B through $635C, then JSR $67D4   ; sum the three and store
       ...twice more, with $80/$86/$8C and $82/$88/$8E
$67D4  CLC / ADC $A7 ... ADC $A9 ... LDX $B2 / STA $01,X / STY $00,X / INC $B2 / INC $B2
```

So it is `camera = M . (p - origin)`, with M nine 16-bit Q15 entries at `$7E`, `$80`, `$82`,
`$84`, `$86`, `$88`, `$8A`, `$8C`, `$8E`, and `$635C` - the Q15 multiply this file already
had - doing the arithmetic.

### The matrix is not a rotation. It scales each axis.

Trapped from a live render at heading 0, pitch 0, it is **diagonal and not the identity**:

| | dx | dy | dz |
| --- | --- | --- | --- |
| out x | 16123 | 0 | 0 |
| out y | 0 | 32765 | 0 |
| out z | 0 | 0 | 9539 |

which as Q15 fractions is **0.4920, 0.9999, 0.2911**. The renderer squashes x to about half
and z to under a third before it divides.

### That is exactly where the port's fitted focal lengths came from

`$68A1` scales the quotient by its clamp limits - 69 for x, 62 for y - and `$6DD5` doubles x
when it plots. Applying those to the *world* ratio rather than the renderer's own:

| | from the machine | the port's fit |
| --- | --- | --- |
| `FOCAL_X` | `69 x 2 x (0.4920 / 0.2911)` = **233** | 230.90 |
| `FOCAL_Y` | `62 x (0.9999 / 0.2911)` = **213** | 212.80 |

Two numbers that had been least-squares fits against captured frames, now derived from the
machine code. The port's comment guessed that `FOCAL_Y / FOCAL_X` of 0.922 was the Apple's
pixel aspect; it is not, it is `62 / 138` times `Sy / Sx`, and the pixel aspect never enters
it.

This also answers why the transcribed `$68A1` could not simply replace `projectCameraSpace()`:
the machine's camera space is the port's, anisotropically scaled, so the two focal lengths
differ by different factors - 1.673 for x and 3.432 for y.

### How the matrix varies

Sweeping heading and pitch, it is `S . R`, with `R` built from the machine's own trig:

```
  heading pitch     m00    m01    m02    m10    m11    m12    m20    m21    m22
        0     0   16123      0      0      0  32765      0      0      0   9539
       16     0   14720      0  -6121      0  32765      0   3721      0   8813
       64     0       0      0 -15998      0  32765      0   9725      0      0
        0    16   15932      0      0      0  30271  12537      0  -3650   8813
       32    32   11399      0 -11311  16380  23167  16380   4862  -6746   4769
```

At pitch 16, `Sy cos` is 32765 x 0.9239 = 30271 exactly and `Sz cos` is 8813 exactly, so the
shape is right. `m00` drifting from 16123 to 15932 across a pitch change that should not
touch it - 1.2% - is the **sine and cosine being wrong outside the first quadrant**, which
this file already records as up to 1.48%. The matrix is built with the disk's own broken
trig, so a port that wants the same pixels has to use the same broken trig.

### The matrix construction, at $654E - read, not fitted

The angles do not come from `$7321-$7323` directly. `$62CB` copies **nine** bytes out of the
display list into `$90-$98` - `INY / LDA ($9B),Y / STA $008F,Y / CPY #$09 / BNE` - so `$90-$95`
is the camera position and `$96`, `$97`, `$98` are pitch, bank and heading. `$62D5` then calls
`$654E`, which is the construction.

`$654E` takes six table reads and nine multiplies. Writing Sp/Cp for the pitch pair and
Sb/Cb, Sh/Ch for bank and heading, and reading the entries in the order `$6730` uses them:

```
$7E  $84  $8A       [ Ch.Cb + Sp.Sh.Sb    Sb.Cp    Sp.Ch.Sb - Sh.Cb ]
$80  $86  $8C   =   [ Sp.Sh.Cb - Ch.Sb    Cp.Cb    Sh.Sb + Sp.Ch.Cb ]
$82  $88  $8E       [ Sh.Cp               -Sp      Ch.Cp            ]
```

Every product goes through `$635C`, never through a real multiply, and both trig values come
out of the 65-entry table at `$609A`. `$6140` preloads the diagonal with `$7FFD` as an
identity, but `$654E` overwrites all nine entries unconditionally, so that only shows before
the first build.

`$654E` falls through at `$6631` into the per-object scale described above.

#### Two places the machine loses precision, and neither is a rounding error

**The negated table fetch is wrong.** `$6502` handles angles in the second octant by indexing
the quarter table and negating, and `$6509` gets the negation backwards:

```
$6509  SEC / LDA #$00 / SBC $609B,Y    ; the HIGH byte first
$650F  TAX                             ; and it is kept as the result's high byte
$6510  SBC $609A,Y                     ; then the low byte, subtracted from THAT, not from zero
```

So the low byte comes out as `-high - low` rather than `-low`. `cos` of 45 degrees reads back
as `23169`, but `cos` of 225 degrees reads back as **`-23004`**, not `-23169` - short by 165.
At 180 degrees it is `-32383` against a table entry of `32767`. This is not a small effect and
it is not symmetric, so no float rotation reproduces it.

**`$635C` is not `a * b / 32768`.** The first thing it does to `a` is turn it into `-|a| - 1`
(one's complement when positive, decrement when negative), the first six of its fifteen rounds
carry only an eight-bit accumulator and add only `b`'s high byte, and bit 15 is never tested.
`100 * 1000` comes back as `2` where the arithmetic says `3`.

The table itself also has a plain typo: entry 25 is `26489` where a cosine gives `26790`.

#### Transcribed and checked

`modern/web/src/engine/diskRotation.ts` has `cos64FB`, `sin64F8`, `mul635C`, `buildMatrix654E`
and `toCameraSpace6730`. `oracle/probe_rottrig.mjs` and `oracle/probe_rotbuild.mjs` call the
disk's own routines; `oracle/rotation_parity.mjs` runs the port over the same inputs:

| check | result |
| --- | --- |
| `$64FB` cosine, every angle | 256 of 256 exact |
| `$64F8` sine, every angle | 256 of 256 exact |
| `$635C` multiply, 768 operand pairs | 768 of 768 exact |
| `$654E` matrix, 357 pitch/bank/heading triples | 3213 of 3213 entries exact |

A float rotation of the same three angles is out by up to **1133 in Q15 (0.035)**, at pitch
214 bank 153 heading 186. That is the size of what `toCameraSpace()` currently gets wrong.

### The per-object scale at $6631, and the bug in it

`$654E` falls through into a scale that multiplies row 0 of the matrix by `$600E`, row 1 by
`$6010` and row 2 by `$6012` - so it scales the three **camera-space axes**, not the model. A
row whose factor is `$7FFF` is skipped.

This is where the port's fitted focal lengths came from. `$68A1` divides x by z and scales by
69, and `$6DD5` doubles the answer, so across the screen the focal length is
`2 * 69 * factor0 / factor2` and down it is `62 * factor1 / factor2`. The flight snapshot's
16000 / 32767 / 9541 give **231.42** and **212.93**, against the **230.90** and **212.80**
that were fitted to captures. The fit was measuring this, one step removed.

**Each row's first multiply uses a stale operand.** Every row begins

```
LDX $600F / CPX #$7F / BNE $663F / LDA $600E / CMP #$FF / BEQ (skip the row)
$663F  STA $78 / STX $79
```

and the `BNE` jumps straight past the `LDA`. So unless the factor's high byte happens to be
`$7F`, the factor's **low byte is whatever A last held** - which on entry is the low byte of
`$8E`, from the last `$633D` in `$654E`, and thereafter is each multiply's own low byte. Only
column 0 is affected; columns 1 and 2 reload the factor properly. In the flight snapshot that
turns factor 16000 into **16125** for row 0, a 0.8% stretch across the screen, and it moves
with the heading because `$8E` does. `$635C`'s operands are not loaded consistently either:
row 0's columns 1 and 2 put the matrix entry in `$78`, everything else puts the factor there,
and since `$635C` is not symmetric that changes the answer.

### The frustum, at $67EF - the piece that makes the fixed-point divide safe

`$68A1` does not clamp. Handed a camera-space point with `|y| > z` it wraps, and the folded
result lands back in the middle of the picture: `(-269, -299, 290)` comes back as `-65, 94`,
which is screen row 1. The disk never draws that, because it never projects it.

`$61A9` transforms a vertex into `$60-$65` and calls `$67EF`, which leaves four bits in `$66`.
Each is a 16-bit add or subtract followed by the `BMI/BVC/BVS` dance that asks whether N and V
disagree - the signed "is this negative" test, correct even when the add overflows:

| bit | test | plane |
| --- | --- | --- |
| `$40` | `x + z < 0` | `x = -z` |
| `$20` | `z - x < 0` | `x = z` |
| `$10` | `y + z < 0` | `y = -z` |
| `$08` | `z - y < 0` | `y = z` |

So the frustum is **`|x| <= z` and `|y| <= z`**: ninety degrees each way, in camera space and
after the object scale. That is exactly the region where `$68A1` does not wrap, since `x/z` of
1 is the clamp limit. A point behind the camera always has a bit set, because `|x| <= z` is
impossible for negative z, so there is no separate near-plane test - and the port's `NEAR_Z`
was standing in for a frustum it only covered one face of.

`$6848` is the same routine for the second slot at `$68`, writing `$6E`. `$61B7` then runs
Cohen-Sutherland: reject outright when `$66 AND $6E` is nonzero, otherwise pull the failing
end onto its plane - `$6979` for the far end, `$695F` (which is `$6979` between two swaps) for
the near one - at most ten times, the budget `$615E` sets in `$B1`. Running out of rounds is a
rejection, not a draw. The four intersections are exact parametric solves at `$6B0D`, `$6A92`,
`$6A0D` and inline at `$6992`.

Checked over 631 points, including both sides of every plane, points exactly on them, points
behind the camera and operands at the ends of sixteen bits where the adds overflow: **631 of
631** agree with `|x| <= z, |y| <= z` (`oracle/probe_outcode.mjs`).

### Wired in, and what it was worth

`diskPipeline.ts` composes the whole chain and `shipBytecode.ts` now uses it, so the ship, the
starfield and the ground all go through the disk's own arithmetic rather than the fit.
`oracle/probe_pipeline.mjs` traps a live render at `$6631`, `$672A`, `$67D3` and `$68A1`, and
`oracle/pipeline_parity.mjs` runs the port over the same inputs:

| stage | at the fitted camera | with the ship close (z -4500) |
| --- | --- | --- |
| `$654E` matrix, as built | 9 of 9 | 9 of 9 |
| `$6631` matrix, after the scale | 9 of 9 | 9 of 9 |
| `$67D3` camera space | 269 of 269 | 248 of 248 |
| `$68A1` screen bytes | 269 of 269 | 248 of 248 |

and the rendered pixels:

| | fitted float path | the disk's own arithmetic |
| --- | --- | --- |
| ship, mean over 11 states | 71.9% | **78.1%** |
| ship, within one pixel | 98.8% | **99.5%** |
| starfield, mean over 12 states | 38.9% | **100.0%** |
| ground, mean over 12 states | 67.5% | **88.1%** |

Every one of the 11 ship states matches or beats the float path bar one (`h250`, 82.9% to
80.5%), every bounding box is now within a pixel of the disk's, and every height is exactly
1.00x where the float path ranged 0.92x to 1.08x. The starfield is exact.

Two things did the work. The frustum is one: without it the close-range ship scored 11.9%,
because `$68A1`'s wrap put vertices the disk clips into the middle of the frame. The stale
operand in `$6631` is the other - it is a real 0.8% and the fit could only average over it.

### The four intersections, at $6B0D, $6A92, $6A0D and $6992

All four are the same nine steps with the axes and signs swapped. For `y = z` at `$6992`,
with A at `$60-$65` and B at `$68-$6D`:

```
$6992  $7A = az - bz
$699F  $7A = (ay - by) - (az - bz)      the denominator
$69B5  A:X = bz - by                    the numerator
$69BF  JSR $6468                        t, a Q15 fraction, in $78/$79
$69C2  bx += t * (ax - bx)              through $635C
$69E4  bz += t * (az - bz)
$6A01  by = bz                          the plane, assigned rather than interpolated
$6A0A  JMP $6848                        and B's outcode is taken again
```

Solving `by + t(ay - by) = bz + t(az - bz)` gives exactly that t. The whole table:

| plane | bit | routine | numerator | denominator | the named axis |
| --- | --- | --- | --- | --- | --- |
| `x = -z` | `$40` | `$6B0D` | `bz + bx` | `(bx - ax) - (az - bz)` | `bx = -bz'` |
| `x = z` | `$20` | `$6A92` | `bz - bx` | `(ax - bx) - (az - bz)` | `bx = bz'` |
| `y = -z` | `$10` | `$6A0D` | `bz + by` | `(by - ay) - (az - bz)` | `by = -bz'` |
| `y = z` | `$08` | `$6992` | `bz - by` | `(ay - by) - (az - bz)` | `by = bz'` |

The axis the plane names is **assigned from the new z**, not interpolated, so the end lands on
the plane exactly; where the plane is negative that is an `EOR #$FF` and an `INC`, a two's
complement. `$6468` is the same divide `$68A1` uses, but the clipper takes the whole sixteen
bits of `$78/$79` rather than only the high byte.

**The dispatch order is the reverse of how it reads.** `$6979` asks whether `$40` is the only
bit left, then whether `$40` and `$20` are, then `$10` as well:

```
$6979  LDA $6E / AND #$BF / BEQ $6989   ; only $40 -> x = -z
       AND #$DF / BEQ $698C             ; only $40,$20 -> x = z
       AND #$EF / BEQ $698F             ; only $40,$20,$10 -> y = -z
       BNE $6992                        ; $08 -> y = z
```

so the plane that matches is the **last** bit still set, and the priority runs `$08`, `$10`,
`$20`, `$40`. A corner outside both `x = z` and `y = z` is taken against `y = z` first. Taking
the masks at face value and clipping against `x = -z` first gets the axis-aligned cases right
and every corner wrong, which is 275 of 411 pairs.

`$61B7` spends one budget of ten (`$B1`, set at `$615E`) across both ends, A first. The `DEC`
after clipping B is unconditional, so a segment whose last available round finally brings B
inside is still dropped.

Checked by calling `$6979` on 488 pairs - A inside and B outside in every direction and at
every depth, corners, points exactly on a plane, points behind the camera, and 400 random
pairs (`oracle/probe_clipedge.mjs`, `oracle/clip_parity.mjs`):

| check | result |
| --- | --- |
| `$67EF` outcodes | 976 of 976 exact |
| `$6979` clipped point | 411 of 411 exact |
| `$6979` outcode after the clip | 411 of 411 exact |

With the exact intersections in place the close-range ship goes from 75.1% to 75.3% and its
bounding box from 83 to 85 columns against the disk's 86; the starfield and ground do not
move, being already at 100.0% and 88.1%. So the approximation it replaced was costing very
little - but it was an approximation, and now nothing in the transform, the divide or the
clipper is.

### There is no screen-space clip

`$61A9-$620F` is the camera-space clipper read above, and it is the only one. `$6DD5` takes
its two endpoints, maps them with `ADC #$46` and `EOR #$FF / ADC #$60`, and goes straight into
`SBC` and a dispatch - no comparison against any screen bound, in it or in `$6D8F`, `$6E4F`,
`$70C6` or `$7044`. The one bounds test that looks like a clip is not one:

```
$70E2  ADC #$04 / CMP #$60 / BCS $711F     ; advancing one row in the interleaved layout
$711F  ...SBC #$80 on the low byte, SBC #$1B on the high, BCS $70E8
```

which folds the address back into the page and carries on plotting. It is row arithmetic.

It does not need a clip: the frustum has already bounded `sx` to +/-69 and `sy` to -28..96, so
`x + 70` is 1..139 and `95 - y` is -1..123 by construction.

`diskProjection.ts`'s `clipSegment()` and `insideClip()` - fitted by `probe_clip.mjs` to
x 2..277 and y 0..123 - were measuring the **effect** of the camera-space frustum, one stage
downstream. They went from the draw path without changing one pixel across all 35 ship, star and
ground states, which is what proved they were inert, and the file they lived in has since been
deleted outright.

### $6DD5 works in 140 half-columns, not 280 pixels

This is the thing the fitted clip was hiding. `$6DD5`'s x is `sx + 70`, so it runs **1 to
139**, and `$6DB5` turns that into an address and a mask through a pair of 140-entry tables:

```
$6DC8  LDX $B3 / LDA $6BC2,X     ; which byte of the row
$6DD1  LDA $6C4E,X               ; and which bits to OR into it
```

Every one of the 140 masks has exactly **two** bits set. Twenty of them set bit 7, which is
not a pixel - it picks the palette pair - and `$6D8F` shows what that means:

```
$6DA2  BMI $6DA9                 ; the mask has bit 7
$6DA9  ORA ($99),Y / STA         ; this byte, lighting bit 6 alone
$6DAD  INY / LDA #$01 / ORA      ; and bit 0 of the one after it
```

so the second dot carries into the next byte and the pair stays contiguous. Worked through
for all 140 entries, a half-column lights exactly screen pixels `2x` and `2x + 1`; the tables
are that, taken apart into a byte and a mask.

`Hires.segment()` had been running the same Bresenham in the Apple's 280 columns, one pixel a
step. That is a different picture in two ways: the rightmost half-column lights 276 **and**
277 where a 280-column walk stops at 276, and a diagonal advances two pixels across per row
rather than one. `Hires.segment6DD5()` and `Hires.halfColumn()` do it in the disk's units.

| | before | after |
| --- | --- | --- |
| ship, mean over 11 states | 78.2% | **86.6%** |
| starfield, mean over 12 states | 100.0% | 100.0% |
| ground, mean over 12 states | 88.1% | **99.5%** |

Every ship bounding box is now **exactly** the disk's - 40x12, 56x19, 86x27 and the rest,
where each was a column short before - and the ground matches x2-277 in all twelve states,
two of them pixel for pixel.

The bit-7 carry is worth a line on its own: getting it wrong costs 20 of every 140 columns
their second dot, which took the starfield from 100.0% to 91.7% while still improving the
ship and the ground. A single number would have called that a win.

### $6DD5's inner loop

`oracle/probe_line6dd5.mjs` calls `$6DD5` directly on 370 endpoint pairs - shallow, steep,
diagonal, horizontal, vertical, reversed, degenerate and 300 random - and
`oracle/line6dd5_parity.mjs` runs the port's line over the same ones. It also settles which
page the renderer draws to: `$70E4`'s `CMP #$60` puts the limit at `$6000`, so it is page 2.

`$6E38` swaps the ends so x always runs left to right, then `$6E07 SEC / SBC $B9 / BCC $6E2B`
splits on |dy| against dx. The two halves carry the error the opposite way round:

```
$6E4F  LDA #$00 / SEC / SBC $B9 / SEC / ROR A / STA $B8   ; shallow: ((-dx) >> 1) | $80
$70C6  LDA $BA / CLC / ROR A / STA $B8                    ; steep:   |dy| >> 1
```

Shallow adds |dy| per half-column and, on the carry out, steps the row and takes **dx** back
off. That is the part worth stating plainly, because it is not a byte wrap: 255 + 28 leaves
**214**, not 27. The threshold is 256 and the correction is dx, so over dx columns it crosses
exactly |dy| times. Steep subtracts dx per row and advances a half-column on the borrow,
adding |dy| back. Both run `dx + 1` or `|dy| + 1` times, counted by a `DEX / BEQ` straight
after the plot, so the last step never advances.

Reading that off the page was not enough - a first attempt let the byte wrap and got 48.7% of
the pixels. Watching `$B8` through one shallow line settles it: for dx 69 and dy 28 the
deltas are -13, +15, +28, +56 and -41, which is |dy| per column and dx off at each crossing
and nothing else.

The disk does not plot a half-column at a time. `$6E58` fetches the mask and hands it to one
of seven run builders - `$6E9A`, `$6EAD`, `$6F03`, `$6F35`, `$6F49`, `$6F9C`, `$6FD5`, chosen
by `$6E60-$6E92` on which bits the mask starts at - which walk the same recurrence
accumulating bits until the row changes or the byte fills, so `$6E95` can `ORA` a whole run in
with one store. The steep loops rotate the mask two bits at a time (`$70FC ROL A / ROL A`)
instead of re-indexing the table. That is a store-count optimisation; the pixels are whatever
the recurrence names, which is what `segment6DD5()` walks directly.

| | result |
| --- | --- |
| lines identical pixel for pixel | 347 of 370 |
| ...of those that stay on the page | **340 of 340** |
| disk pixels the port lights, on-page lines | **39594 of 39594 (100.0%)** |

and the renders:

| | before | after |
| --- | --- | --- |
| ship, mean over 11 states | 86.6% | **88.2%** |
| starfield, mean over 12 states | 100.0% | **100.0%** |
| ground, mean over 12 states | 99.5% | **100.0%** |

### The display list itself

`$6162` reads an opcode, rejects anything `>= $12`, and jumps through an 18-entry table at
**`$6076`** - which is live code, not save buffer: `$611C` copies zero page `$60-$C1` into
`$6014-$6075`, and the table begins immediately after it.

| op | handler | what it does |
| --- | --- | --- |
| 0 | `$622E` | a lone point: transform into slot A, plot if its outcode is clear |
| 1 | `$61B7` | a line from this vertex to the **next**, consuming both |
| 2 | `$61EC` | continue from the saved endpoint to this vertex |
| 3 | `$6212` | a spur out to this vertex - the saved endpoint does not move |
| 4 | `$62BE` | `STA $7C`, the no-clip flag |
| 5 | `$62CB` | nine bytes to `$90-$98`, then `JSR $654E` |
| 6, 10 | `$62DC`, `$62FA` | screen coordinates straight to `$B3-$B6` |
| 7 | `$62ED` | self-modifies `$62F6` and touches `$C054` - the page select |
| 11 | `$630B` | set `$9B/$9C`: chain to another list |
| 13 | `$6319` | `LDA #$FF / STA $7D` - record coordinates instead of drawing |
| 14, 15 | `$68EA`, `$690F` | patch the projection operands and the object scale |
| 8 | `$6D44` | page-select for the table at `$6CE0`, and a flag at `$6CDD` |
| 9 | `$7148` | which hi-res page the line routine draws into |
| 12 | `$718A` | draw mode: `ORA` to draw, `EOR` to erase |
| 16 | `$632A` | the display soft switches, then falls into 17 |
| 17 | `$6338` | a one-byte opcode: advance by 1 and carry on |

Three of those contradicted what the port was doing, and together they were the whole of the
ship's remaining error.

**Opcode 1 consumes two vertices.** `$61A9` reads this vertex's six coordinate bytes and
advances seven; `$618E` then reads the next record's six **without ever looking at its opcode
byte** and advances seven again. So a run is `1 v0, v1, 2 v2, 2 v3, ...` and the byte at v1's
opcode position is dead. It happens to be 2 in every model on the disk, which is why walking
at one vertex per op stays in sync and draws the same polylines - but it is not what the
machine reads.

**Opcode 3 is a spur, not a move.** `$6212` is `LDX #$07 / LDA $6F,X / STA $67,X`, which puts
the saved endpoint in slot **B** and this vertex in slot A - the mirror of `$61EC`, which puts
it in slot A. And `$618E` never runs, so `$70-$76` is not updated: the run continues from
where it already was. Draw out to somewhere and stay put. The port had been moving the pen to
the new vertex.

**Opcode 0 does not lift the pen.** `$622E` only touches slot A and the saved endpoint
survives, so a run continues straight across a lone point. The port had been clearing the pen.

`$7C` is worth keeping too: with it set, `$61CA` and `$61D9` drop a segment that needs
clipping instead of clipping it. The three ships carry 0 and DEBRIS carries 1.

### The ship is exact, and how that was established

`oracle/probe_displaylist.mjs` traps `$629C` and `$624B` through one render and records every
line and point the machine actually draws. At camera z -6401 the ship's pages `$78-$7C` yield
**118 lines**, and the port's `projectShipWorld()` yields 118 segments whose endpoints - as
the bytes `$68A1` produced - match **118 of 118**, with none left over on either side. That is
the result; the pixel counts below follow from it.

| | before | after |
| --- | --- | --- |
| ship, mean over 11 states | 88.2% | **100.0%** |
| starfield, mean over 12 states | 100.0% | 100.0% |
| ground, mean over 12 states | 100.0% | 100.0% |

**One correction to the measurement, and it needs stating plainly.** `captured/ship/golden.json`
is a difference of two renders - with the model and with `$7F` at `$7879` - so a ship pixel
that falls on a star is lit in both and drops out of the golden. The disk draws it; the
capture cannot see it; and a port that draws it correctly was being charged for it. At camera
z -6401 that is exactly `(120,83)`, `(121,83)`, `(104,84)` and `(105,84)`, all four of them
stars, which is why the disk's rows showed one-half-column gaps in the middle of continuous
runs. `probe_shipgolden.mjs` now records the background per state and `ship_parity.mjs` masks
the port with it, so both sides are `ship AND NOT background`. The endpoint comparison above
does not depend on any of that.

### The off-page wrap, at $6DB5

`$6DB5` turns a row into an address through a table at `$6B92`:

```
$6DB5  LDA $B4 / ROR A / ROR A / AND #$3E / TAY      ; 2 * ((y >> 3) & 31)
$6DBC  LDA $B4 / AND #$07 / ASL A / ASL A            ; (y & 7) * 4
$6DC2  CLC / ADC $6B93,Y / STA $9A                   ; + the row's high byte
$6DC8  LDX $B3 / LDA $6BC2,X / ADC $6B92,Y / TAY     ; + its low byte, and that carry
```

The table holds **24** entries, `$4000` to `$43D0` - which also settles that the renderer draws
to hi-res page 2 - but the index is masked to **31**. A row of 192 or more reads past the end
of it, into the half-column byte table at `$6BC2`, and computes an address from those bytes.
Nothing fails; the renderer draws at the result.

The plot loops do not recompute it. `$6E58` calls `$6DB5` once and then walks the address:

```
$70DF  ADC #$04 / CMP #$60 / BCS $711F               ; a row down is + $400
$7123  SEC / TYA / SBC #$80 / TAY / LDA $9A / SBC #$1B   ; past the end, fold by $1B80
$7134  SBC #$58 / ... / SBC #$1F                     ; or by $1F58, when $9A reaches $63
$705D  SBC #$04 / CMP #$40 / BCC $709D               ; and the mirror going up
```

Both folds read `$9A` **before** the add or subtract, because the store only happens after. So
the step is `old - $1B80`, not `old + $400 - $1B80`; row 7 to row 8 is `$5C00` to `$4080`,
which is $1B80 down. `$6FEA` does the same for the shallow loops through a byte patched at
`$6FED`. The result is that a line running off the bottom folds back into the page rather than
stopping: `[0,34]` to `[0,96]` makes 195 stores and every one of them is inside page 2.

`Hires` now tracks `$9A` and Y and resolves each store through the same interleave, dropping
the eight bytes per block the display never fetches. `$99` is zero throughout - `$6140` clears
`$7C-$9C` and nothing writes it - so the address is just `$9A` and Y.

**The bug this exposed was in the port, not the disk.** `$6DFE LDA $B6 / SEC / SBC $B4` is an
eight-bit subtract of eight-bit rows. A row of -1 is 255 to the machine, so a line from row 61
to row -1 runs **194 rows down** and off the bottom of the page - not 62 rows up. Computing
`dy` from signed numbers draws a different line entirely, and it is exactly the case a clipped
endpoint produces, since `sy` of 96 is `y/z` of 1.

The tables are kept at 256 entries rather than 140. `$B3` is a byte and the machine indexes it
with no bound, so past 139 each table runs into whatever follows - for `$6BC2` that is the
mask table at `$6C4E`. Nothing `$68A1` can return reaches there; transcribing the bytes costs
nothing and avoids inventing a limit the routine does not have.

| `oracle/line6dd5_parity.mjs`, 370 endpoint pairs | result |
| --- | --- |
| identical pixel for pixel | 369 of 370 |
| ...of the 366 `$68A1` can produce | **366 of 366** |
| disk pixels the port lights, those 366 | **46370 of 46370 (100.0%)** |
| ...of the 340 that stay on the page | 340 of 340 |

The one that differs, `[68,96]` to `[82,110]`, needs `sx` of 82 and `sy` of 110. `$691E`
clamps x to +/-69 and y to +/-62 before `$68A1` adds the offsets, so the renderer cannot
produce it; the sweep generated it. Inside the reachable box the line routine is exact **on page
2** - which, it turns out, is not the same as exact.

#### The wrap leaves the page

Everything above compares page 2. `oracle/probe_line6dd5wrap.mjs` asks whether `$6DD5` ever
stores outside it, by diffing all of `$0800-$BFFF` rather than the page alone. It does.

A row of 255 - which is what `95 - y` gives for `sy` 96 - indexes the row table at `$6B92` at
entry 62, well past its 24 entries, and the two bytes it finds there (4 and 4) put the address
at `$20xx`. That is hi-res **page 1**: the page being displayed while the renderer draws into
page 2.

| | |
| --- | --- |
| pairs in the 370 sweep that wrote into page 1 | **15** |
| of those, pairs `$68A1` can produce | **11** |
| bytes each one puts there | **2**, one at `$20xx` and one at `$3Bxx` |

So this is not confined to contrived endpoints. `[0,34]` to `[-69,96]` is an ordinary long
diagonal, and `sy` 96 is `y/z` of 1 - exactly what a clipped endpoint produces, which is to say
the common case rather than a rare one. Every such line drops two bytes onto the displayed page.

The port's `Hires` holds one page, so it drops those two stores, and that is why page 2 comes
out exact for all 366 reachable pairs while this went unnoticed: **no harness was looking
anywhere else.** The sweep is part of `line6dd5_parity.mjs`'s report now, so the number is
tracked rather than rediscovered.

#### and they are seen, for one pass

Whether the specks matter is a question about what happens to those bytes next, so
`oracle/probe_pageclear.mjs` plants `$AA` at the four addresses the wrap was measured writing to
and reads them at every entry to `$9023`:

| call | `$7315` | `$7317`/`$7319` | the page 1 marks | the page 2 marks |
| --- | --- | --- | --- | --- |
| 0 | `$54` | 1 | `$AA` | `$AA` |
| 1 | `$55` | 0 | `$AA` | **`$00`** |
| 2 | `$54` | 1 | **`$00`** | `$00` |

So **both pages are cleared before being drawn into**, and the parameters say which: `$7317` and
`$7319` at 1 means this pass clears and draws page 2, at 0 page 1, and `$7315` displays the
other one. Ordinary double buffering.

That settles the timing rather than dismissing it. While page 1 is on screen (`$7315` = `$54`)
the renderer is drawing into page 2 - and a wrap stray from that draw lands in page 1, **the
page being looked at**. It stays there until the next pass clears page 1 to draw into it, by
which time page 2 is on screen. So each stray is two bytes visible for about one pass, and the
main loop runs at roughly two passes a second.

A speck for half a second, then gone, twice per line that reaches `sy` 96.

#### and the port shows them now

`orByte` used to drop any address outside page 2, with a comment saying such a byte "is written
in memory and never seen". That was the assumption this whole thread disproved. It collects them
instead: the port's buffer stays a page 2 buffer, which is what every renderer harness compares,
and `takeOffPageStrays()` hands the stores to whoever is drawing a live frame. `cockpit.ts`
plots them, so a speck appears for one frame exactly as one appears on the original for one
pass.

Nothing about the walk had to change. The port was already reaching page 1 with the right
addresses; `orByte` was throwing the stores away at the last step. `line6dd5_parity.mjs` checks
them against the machine now:

| pair | bytes into page 1 | |
| --- | --- | --- |
| `[68,96]` -> `[82,110]` | cells 2563 = `$18`, 5043 = `$60` | match |
| `[68,96]` -> `[69,96]` | cell 2563 = `$78` | match |
| `[0,34]` -> `[-69,96]` | cells 4 = `$C`, 2484 = `$C` | match |
| `[30,60]` -> `[0,96]` | cells 24 = `$3`, 2504 = `$3` | match |
| `[-40,-28]` -> `[-69,96]` | cells 4 = `$C`, 2484 = `$C` | match |

**The machine's side of that table is final byte values; the port's is a list of stores.** A
two-pixel horizontal run ORs `$18` and `$60` into the same address and leaves `$78`, so
comparing a store list against changed bytes reports a difference that is not there - which is
what the first version of this check did, on `[68,96]` -> `[69,96]`. The port's stores are
folded per cell before comparing.

One correction. The claim in the previous round that "the divergence is in the walk after the
first store, not the entry" was drawn from a comparison that had passed **unmapped** endpoints
to `segment6DD5`, which takes them already mapped by `x + 70` and `95 - y`. That test was
meaningless. The conclusion happens to hold, and now for a reason: the strays are the stores at
the `sy` 96 end and they match exactly, so the entry agrees and the page-2 disagreement on that
one unreachable pair comes later.

### What is still not done

The renderer is done on the page it draws into. Transform, scale, frustum, clipping,
projection, the line routine, its address arithmetic and the display list are all read from the
disk rather than fitted, and the ship, the starfield and the ground each agree with the machine
on every pixel of page 2 in every state that has been captured.

The one thing measured and not reproduced is `$6DD5` storing **outside** page 2: a line with an
endpoint at `sy` 96 puts two bytes into page 1, and 11 of the 370 sweep pairs that `$68A1` can
produce do it. Those two bytes land on the page being displayed and survive about one pass
before the double buffering clears that page to draw into it. The port collects them out of
`orByte` and the cockpit plots them, so the speck is there too; the page 2 buffer the harnesses
compare is untouched by it. See *The wrap leaves the page*.

Five display-list opcodes - `$6D44`, `$7148`, `$718A`, `$632A` and `$6338` - are read now, and
none of the four models on the disk uses any of them: they are a page select, a draw-or-erase
mode and the display switches, for double buffering the shipped game never asks for. See
**The five display-list opcodes nothing uses**.

Away from the renderer: the game logic this file quotes for combat and the economy is quoted
from the BASIC rather than checked against a running machine.

---

## The three sounds

A sound has no picture to diff. The only thing to compare is **when** the speaker is toggled:
each routine ends in an access to `$C030`, and the gap between two of them in CPU cycles is
the half-period of what comes out. So `oracle/probe_sound.mjs` runs each one on the machine
and records the cycle at every access, and `oracle/sound_parity.mjs` checks the port's
transcription against that timeline, toggle for toggle.

| routine | catalog | loads at | BLOADed to | bytes | entry | toggles at |
| --- | --- | --- | --- | --- | --- | --- |
| SOUND GEN | `$2000` | `$2000` | `$9276` | 74 | `$9276` | `$928B` |
| LASER | `$6000` | `$6000` | `$92D1` | 26 | `$92D1` | `$92DB` |
| EXPL | `$9270` | `$9270` | `$9270` | 34 | `$9276` | `$927E` |

STARSHIP SIMULATOR line 2 names them: `SG = 37494`, `LA = 37585`. Lines 4100, 4110 and 4120
set SOUND GEN's parameters, and `POKE 37490-37493` is `$9272-$9275`.

### SOUND GEN, $9276

```
$9276  SEC / INC $9273 / LDX $9274
$927D  ROL $9270 / ROL $9271              ; the register, and the carry out of bit 15
$9283  TXA / BEQ / DEX                    ; count the period down
$9287  BNE / BCC / LDA $C030 / LDX $9274  ; toggle when the period ran out AND that bit is set
$9291  ROR A x3 / EOR $9271 / ASL A x3    ; feedback: bit 5 of that becomes the next carry
$929A  PHP ... PLP                        ; so the sweep cannot disturb it
$92B5  DEC $9272 / BNE / DEC $9273 / BNE
```

`$9270`/`$9271` is a 16-bit shift register whose top bit gates the speaker, divided down by
`$9274`. A period of 0 never decrements - `TXA` leaves Z set so `DEX` is skipped - which makes
every iteration a candidate and is the harshest setting. `$9275` sweeps the period: zero
leaves it alone, bit 7 set raises it, anything else lowers it. The register is **not** reset
between calls, so consecutive `CALL SG` carry on from where the last one stopped.

### LASER, $92D1

```
$92D1  LDY #$0E / LDX #$00
$92D5  TXA / CLC / SBC #$01 / BNE $92D7   ; a delay that grows with X
$92DB  STA $C030 / INX / CPX #$8C / BNE
$92E3  DEY / BNE $92D3
```

A period rising from 0 to 139, fourteen times over: a falling whine, repeated. The delay is
not quite `X`, because `CLC` then `SBC #$01` takes **two** off the first time and the loop
re-enters the `SBC` without touching the carry, so every later pass takes one - and an odd X
borrows down through zero to 255 and comes back the long way.

### EXPL, $9270 - which lands on SOUND GEN

EXPL BLOADs to `$9270`, which is SOUND GEN's parameter block, and its 34 bytes run to `$9291`.
So it overwrites the front of SOUND GEN and shares nothing with it, carrying its own `RTS` at
`$928E` and `JMP $9276` at `$928F`. The BASIC calls both at 37494 because after `BLOAD EXPL`
that address is EXPL. It is the same shift register and the same feedback, with no divider.

**Its setup is unreachable.** `LDA #$00 / TAY / SEC` sits at `$9272-$9275`, **below** the entry
point, so `CALL 37494` skips it: the burst's length is whatever Y holds and the first `ROL`
shifts in whatever carry Applesoft left. Neither is chosen by the routine.

The ROM settles Y. Applesoft's `CALL` is `$F1D5 JSR $DD67 / JSR $E752 / JMP ($0050)`, and
`$E75B` ends `LDA $A0 / LDY $A1 / STY $50 / STA $51 / RTS` - so **Y is the low byte of the
address called**, and nothing between that and the indirect jump touches it. For `CALL 37494`
that is `$76`. `oracle/probe_soundcall.mjs` boots the disk, empties the tank to reach H/D, and
traps the real call: **Y = 118, the carry clear, the register still `$0414` from the file**.
So the burst is 118 iterations, not 256, and 41 toggles in 4963 cycles.

(`$9276` is both the entry and the top of EXPL's loop, so a trap there sees the call and then
every pass - which is how Y counting down and the register doubling show up in that capture.)

### Checked

| run | toggles | cycles | |
| --- | --- | --- | --- |
| SOUND GEN line 4100 | 37 | 190650 | exact |
| SOUND GEN line 4110 | 642 | 82944 | exact |
| SOUND GEN line 4120 | 31 | 133509 | exact |
| SOUND GEN, period 4 | 148 | 48124 | exact |
| SOUND GEN, sweeping down | 510 | 76939 | exact |
| LASER | 1960 | 734531 | exact |
| EXPL as the game calls it | 41 | 4963 | exact |
| EXPL, Y = 0 | 115 | 10843 | exact |
| EXPL, Y = 0, carry set | 102 | 10804 | exact |
| EXPL, Y = 1 | 0 | 43 | exact |
| EXPL, Y = 200 | 82 | 8448 | exact |

3668 toggles, every one at the same cycle, and every total.

**One thing a port cannot reproduce faithfully.** `LDA $C030` returns the floating bus - what
the video scanner last fetched - and that value feeds straight back into the feedback chain at
`$9291`, so on real hardware the noise depends on what is on screen. apple2js returns 0 and
every capture here was taken with that; `diskSound.ts` takes it as a parameter and defaults to
0 rather than pretending the question does not exist.

---

## The economy and the combat, run rather than quoted

Both were in this file as line numbers copied off a listing, with a note saying so. They have
now been run.

### The economy, exact

Twelve of SHORE LEAVE's thirteen cargo rates are constants; the first, art at 38171, is
`300 * RND(1)` a unit. Empty that one and the whole sale is a number that can be predicted, so
`oracle/probe_economy.mjs` drives the disk to GROUND FORCES, sets the counters, sells, and
reads `L` and `CR` out of Applesoft's own variable table - the screen is no use, because SHORE
LEAVE prints through the hi-res character generator and the numbers are pixels by then.

With counts `0,3,7,2,1,4,5,9,11,6,2,3,1` the formula says **24780** and the machine pays
**24780**. The counters come back all zero, as 2460 says. With art set to 4 the extra was 2186,
inside the `0..2400` its `300 * RND * 4 * 2` allows.

| address | what | rate |
| --- | --- | --- |
| 38171 | art | `300 * RND(1)` |
| 38172 | wine | 150 |
| 38173 | luxury food | 100 |
| 38174, 38175, 38176 | fighter parts, weapons, electronics | 200 |
| 38177 | fissionables | 300 |
| 38178 | steel | 15 |
| 38179 | collapsium | 5 |
| 38180 | titanium | 25 |
| 38181 | platinum | `20 * 75` = **1500** |
| 38182 | silver | `10 * 100` = **1000** |
| 38183 | gold | `10 * 200` = 2000 |

then `2406 L = L * 2` and `2408 L = INT(L)`.

**The port was paying 116880 for that cargo.** Four rates were wrong: art carried a stray
`* 10` and a 150-to-300 price where the BASIC rolls 0 to 300, wine carried a stray `* 100`, and
platinum and silver had their 20 and 10 the wrong way round - 750 and 2000 against the
machine's 1500 and 1000. The wine alone accounted for 90000 of the difference.

A base is `2170 C = 20000 + ((RND(1) * 5000) * (RND(1) * 10))`, so 20000 to 70000; the disk
gave 32982. Weapons are `3060 C = INT((RND(1) + .2) * 4 * MU)` against `MU = 50, 75, 40, 30`
for fighters, transports, tanks and missiles at 38156 counting **down** to 38153 - the same
order GROUND FORCES line 600 pokes them back in, which is what ties the two screens together.

### The combat, by predicate

Lines 550-680 are all `RND`, and Applesoft's `RND` is a five-byte float LCG - `$EFAE` multiplies
and adds through `$E97F` and `$E7BE` and then forces the exponent - so reproducing a battle
would mean transcribing the ROM's floating point. That was not done. What was done instead is
to watch a real assault (`oracle/probe_combat.mjs`) and check the claims the formulas make,
each of which a wrong formula fails.

Setting one up takes care: the opening save has the first planet already taken, and line 660
zeroes 38150 on a surrender, so `SP` of 0 against `VP` of 1 means the battle is over before the
first round. Give it a surrender point to climb to and it runs.

Three things the port had wrong:

- **`T2` in the losing branch is `200 * (RND * 5)`, not `200 + (RND * 5)`.** A multiply: 0 to
  1000, not 200 to 205. `T2` scales the troop losses, so the branch where the roll goes against
  you can cost five times more than the other one.
- **`TP = TP - (RND * 1) + .5`, so transports can go UP.** One uniform with half added back:
  the change is `(-0.5, +0.5]`. The port had `rnd * rnd * 0.5`, which only ever subtracts. The
  assault settles it - over 27 values transports rose 9 times and fell 4, the largest rise
  +0.4297 and the largest fall -0.4674, both inside half a unit.
- **Line 650's `GOSUB 4000` truncates every round.** `P = INT(P): TP = INT(TP): TR = INT(TR):
  T = INT(T): M = INT(M)` - the fractions go in the variables themselves, not just in the byte
  line 600 pokes, so each round starts from whole numbers. Thirteen truncations in those same
  27 values.

Two more things the assault settled. `TR` is not a PEEK at all: it comes off the disk at line
11, `OPEN MISC FILE: READ MISC FILE: INPUT SD: INPUT TR: INPUT CR`, which is why a lost battle
writes the file back at line 670. And `ET` is **dead** - line 500 sets it from
`PEEK(38206) * 500`, line 570 takes some off every round, and nothing ever reads it.

Tanks, fighters and missiles behaved as `RND * (RND * 5)` says: no gains, and the worst single
round cost 4.3 of 5. An earlier reading of the capture said they gained too; that was the clamp
at 590-598 pulling a negative back to zero on a ship that had none of either to begin with.

The battle ended in defeat and poked what line 670 says: 38151 to 7, 38166 to 0, 38208 left
alone.

`diskEconomy.ts` and `diskCombat.ts` hold the transcriptions, `oracle/logic_parity.mjs` checks
the port against both - the sale to the credit, the combat against the same predicates - and
the harness reports the disk's own figures beside the port's so the two can be read together.

---

## The damage model, and a byte that is not what it says

Lines 3000-3381, with 5098, and they are reached from two places:

```
190  IF PEEK(38208) = 0 AND PEEK(38210) = 1 THEN GOSUB 3000:
     IF RND(1) < .5 AND PEEK(38207) > 0 THEN GOSUB 5000
192  IF PEEK(38208) = 0 AND X > -3500 AND X < 4500 AND Y > -3000 AND Y < 3000
     AND Z > -6000 AND Z < 2000 THEN GOSUB 3000:
     IF RND(1) < .6 AND PEEK(38207) > 0 THEN GOSUB 5000
```

so damage happens while the planet has not surrendered and the ship is either in atmosphere or
inside a box around the planet, and ground fire may follow it if a battery is left at 38207.

`3000` then gates twice, damages once, and returns:

```
3000 IF PEEK(38205) = 0 AND PEEK(38210) = 0 THEN RETURN
3001 IF RND(1) > .4 THEN 3030
3010 IF RND(1) > .4 THEN 3030
3019 ...flash RND(1)*5 times, sound... DMG = 1
3030 IF RND(1) > .3 THEN 3200
3032 ...flash, sound... DMG = 1
3200 IF DMG = 0 THEN RETURN
3205 J = PEEK(38200) - (RND(1)*1.1): GOSUB 3380: POKE 38200,J:
     IF PEEK(38200) > 10 AND PEEK(38201) = 1 THEN RETURN
3207 IF L = 7 THEN RETURN
3230 radar 38195, then 38198, 38197, 38196, 38186 at RND(1)*5, then 38193 at RND(1)*4
3350 POKE 38193,J: DMG = 0: IF J = 0 THEN PRINT "RUNS/X"
3360 IF PEEK(38393) = 0 THEN POKE 38393,1: PRINT "RUNDMG"
3380 IF J < 0 THEN J = 0
```

### Four things the port had wrong

- **The heavy branch needs two rolls.** `3001` and `3010` are separate
  `IF RND(1) > .4 THEN 3030`, so 3019 wants **both** at or under .4 - a chance of **0.16**, not
  0.4. With 3030's independent 0.3 that makes a damaging tick **41.2%** likely. Read as one
  roll it comes out 58%, and the port was taking damage about 40% too often.
- **There is no per-bolt hit on the player.** Nothing in the original tests whether an enemy's
  shot reaches you; the port had invented `shields -= 0.5 + rnd*2` and `hull -= rnd*3` on a
  50-pixel proximity test. Damage is the periodic tick and nothing else.
- **Ground fire touches shields only.** `5098` is `L = 7: GOSUB 3205: L = 0`, and `3207` is
  `IF L = 7 THEN RETURN` - so a shot from the surface enters at 3205, takes `RND(1)*1.1` off
  the shields, and stops. It cannot reach the hull. Neat reuse: `L` is the shields-only flag.
- **The shield gate tests the POKEd byte.** `POKE 38200,J: IF PEEK(38200) > 10` - shields of
  10.9 store as **10**, the test fails, and the rest of the ship takes the hit. Testing the
  unrounded number absorbs something the original lets through.

Five systems are never touched by this routine: energy 38199, env. control 38194, hyperdrive
38190, missiles 38187 and nav. comp. 38184.

### 38194 is not env. control. It is a loop counter.

`oracle/probe_damage.mjs` reads all thirteen systems together rather than only the six, which
is what turned this up: 38194 moved 42 times in three short runs and **went up**, repeatedly to
128.

Nothing in any BASIC program on the disk writes it. Trapping every write to `$9532` during
flight finds them all in **MEM TRANSFER A**, which BLOADs to `$9400`:

```
$9400  LDX #$00 / STX $9532
$9406  LDX $9532 / CPX #$80 / BEQ $946D
$940D  LDA $8BEC,X / STA $00 / LDA $8D7C,X / STA $04
$9417  INC $9532 ...
```

`$9532` is its index, counted 0 to `$80` while it moves 128 bytes between `$8BEC` and `$8D7C`.
And lines 150 and 153 are `CALL 37936` and `CALL 37888` - `$9430` and `$9400` - **every pass
of the main loop**, alternating on the page flip. So the byte under the ENV. CONTROL readout is
being counted from 0 to 128 continuously while you fly.

SHORE LEAVE 2500's `DATA` names 38194 ENV. CONTROL and COM 15140 shows it as `ST(5)`, so the
readout exists and is fed a counter. This is a collision in the original, not a reading error:
env. control is not a system that can be damaged or repaired, because nothing can hold a value
there for longer than a frame.

38187's changes are the missile count - `1090 J = PEEK(38187) - 2: GOSUB 3380: POKE 38187,J`,
which is firing one, not being hit.

### Checked

On the disk, over three runs - shields down, shields up and full, shields up but at 8:

| | result |
| --- | --- |
| what moved under damage | shields, radar, both engines, computer, laser, hull - nothing else |
| energy, hyperdrive, nav. comp. | never moved at all |
| anything going **up** | none |
| anything over its per-tick bound | none |
| ticks taking shields alone / the rest as well | 18 / 5 |

and `oracle/damage_parity.mjs` puts 40000 ticks of the port through the same predicates, plus
the one number the listing gives outright: a tick damages something **41.3%** of the time
against the 41.2% the two gates predict.

---

## There is no enemy AI. There is a weapons model.

`X9 = 400: Y9 = -100: Z9 = -3500` is set once at line 2 and never touched again. Nothing moves
the enemy, nothing steers it, nothing decides when it fires - it is a fixed point in the world
that the renderer draws and the missile box tests against. The only thing that moves is you.
`ai.ts` in the port is the player's autopilot for commander mode, which has no counterpart on
the disk and is labelled as such.

What stands in for combat is lines 185, 1000-1090 and 1500-1570:

```
185   IF PEEK(-16287) > 127 THEN GOSUB 1500
1500  IF PEEK(38208) = 1 THEN POKE 38208,0: POKE 38150,100
1501  IF PEEK(38202) = 1 THEN 1000                 ; 38202 = 1 selects the missile
1502  IF PEEK(38186) = 0 THEN RETURN
1505  ...three beams, CALL LA...  J1 = 10: J2 = 1
1535  VP = PEEK(38160) + (J1 / (TE+1)): IF VP < HL THEN POKE 38160,VP
1540  IF PEEK(38210) = 0 THEN DP = PEEK(38152) + (J2 / (TE+1)):
      IF DP < HL THEN POKE 38152,DP
1550  IF VP => PEEK(38150) THEN ...THE PLANET HAS SURRENDERED... POKE 38208,1
1560  IF DP > PEEK(38204) AND PEEK(38205) <> 0 THEN "RUNEX"
1085  IF HIT = 1 THEN GOSUB 1200: J1 = 10: J2 = 120: GOSUB 1535
1090  J = PEEK(38187) - 2: GOSUB 3380: POKE 38187,J
```

`TE = PEEK(38282 + PEEK(38209))` is the planet's tech, read **once** at line 8, and `HL = 255`
from line 1. H/D line 93 sets both `38150` and `38204` to `TECH * 60`, and line 16 zeroes
`38152`, so a planet's bar and its ship's are the same height.

### What holding the fire button on the disk shows

- **The laser does not aim.** 1535 and 1540 test nothing about heading, or range, or where
  anything is on screen. Holding the button while pointing at nothing raised 38160 all the
  same. The port had a screen-space gate - the enemy within 40 by 30 pixels of the middle -
  which is invented, and it meant a player who could not line the shot up did no damage at all
  where the original would have taken the planet.
- **`IF VP < HL THEN POKE` is a test, not a clamp.** At 250 a shot computes 252.5 and stores
  252. At 253 it computes 255.5, which is not less than 255, and **nothing is stored** - the
  byte sat at 253 while the same held button had just moved it from 250. A run therefore
  stalls at 254 and the planet can never be taken by laser alone if the bar is set at 255.
- **Every store truncates, and the fraction is gone.** The next shot PEEKs the byte back, so
  nothing accumulates below one. 38160 moved in steps of **2** where the arithmetic says 2.5.
- **So the laser can never damage the enemy ship.** 1540 adds `1 / (TE + 1)`, which reaches a
  whole number only at `TE = 0`, and line 189 refuses to put an enemy on a planet below tech 2.
  Measured at TE = 3: 38152 stayed at **0** through 900 frames of continuous fire. Only the
  missile, at J2 = 120, can destroy it - 30 a hit at that tech.
- **A missile costs two whether it hits or misses** (1090, measured 4 taken over two firings),
  and `5251 GOTO 1090` means shooting down a ground battery leaves through the same line and
  **charges two missiles for that as well**.
- **Firing at a planet that has already surrendered un-surrenders it** and puts the bar back to
  100 (1500).

Aiming exists only for the missile: 1010 tests its height against the horizon in atmosphere,
and 1050 tests a box 300 by 80 by 200 around the fixed enemy point in space.

`diskWeapons.ts` holds the transcription and `oracle/weapons_parity.mjs` checks the port
against the disk's own figures - the step from 250, the stall at 253, 38152 unmoved, the
missile cost, the box - fifteen checks, all clean.

One caution about the measurement: the main loop reads `$C061` once a pass and a pass is long,
so a 500-frame hold gets one shot away, not many. What that pins down is the **step**, not
where a run of shots ends up, and the harness compares it that way.

### The missile's flight, and a box that is not symmetric

The line above says `diskWeapons.ts` holds the transcription and `weapons_parity.mjs` checks
it, box included. Both were true, and the game still fired the wrong missile, because
`cockpit.ts` never called either of them. It had its own.

The missile is not a projectile that lives for a while. It is sixteen steps taken inside one
pass of the main loop:

```
1000 M8 = M1: M9 = M2: M3 = 3: M1 = 140: M2 = 40: X0 = X: Y0 = Y: Z0 = Z: S2 = 160
     X2 = S2 * (ZP * XH): Z2 = S2 * ZP * ZH: Y2 = S2 * YP: IF PEEK(38187) = 0 THEN 1090
1010 CALL SG: FOR M = 124 TO 62 STEP -4: XDRAW M3 AT M1 + M2,M: XDRAW M3 AT M1 - M2,M:
     IF PEEK(38210) = 1 AND Y0 < VV THEN HIT = 1: GOTO 1060
1050 IF X0 < X9 + 150 AND X0 > X9 - 150 AND Y0 < Y9 + 60 AND Y0 > Y9 - 20
     AND Z0 < Z9 + 100 AND Z0 > Z9 - 100 THEN HIT = 1
1060 XDRAW M3 AT M1 + M2,M: XDRAW M3 AT M1 - M2,M: M3 = M3 + .32: M2 = M2 - 2:
     X0 = X0 + X2: Z0 = Z0 + Z2: Y0 = Y0 + Y2:
     IF P > 190 OR P < 64 THEN Y0 = Y0 - 2 * Y2: NEXT
1085 IF HIT = 1 THEN GOSUB 1200: J1 = 10: J2 = 120: GOSUB 1535: GOTO 1090
1088 GOSUB 1100
```

`M` runs 124, 120 ... 64 - sixteen values, because the next would be 60 and the limit is 62 -
and the whole loop finishes inside the pass it started in. So a shot is decided before the
frame it was fired in has finished drawing. `X0 = X` at 1000 means the first test is made at
the ship itself, so the tested positions are the ship and fifteen more at 160 apart: as far as
**2400 ahead**, and with 1050's 100 of slack in Z the furthest a shot can reach is 2500.

Neither test leaves the loop. 1010's `GOTO 1060` lands on the step-and-`NEXT` line, and 1050
falls through to it, so `HIT` is only ever set and the rest of the flight cannot take it back.

**1050 is not symmetric in Y.** `Y0 < Y9 + 60 AND Y0 > Y9 - 20` is sixty above the enemy and
twenty below - a box 300 by 80 by 200, sitting high on the target.

`probe_missilebox.mjs` fired nine missiles on the machine from nine places around it. Line 8
runs once, not every pass - the main loop is 15 to 210 - so `XI`, `YI` and `ZI` are an output,
written by 140; the ship is moved by writing the Applesoft variables `X`, `Y`, `Z` and `S`
themselves, at line 150, after 129 has moved it and before 185 tests the button. Firing is the
paddle button, not a key.

| shot | from | machine |
| --- | --- | --- |
| dead on, 800 short | 400, -100, -4300 | hit, 38152 went 0 -> 30 in one pass |
| 50 below the box | 400, -150, -4300 | **miss** |
| just inside the top | 400, -45, -4300 | hit |
| just above the box | 400, -30, -4300 | miss |
| out of reach in Z | 400, -100, -8000 | miss |
| already past it | 400, -100, -3400 | miss |
| 300 off in X | 700, -100, -4300 | miss |
| 2400 short, the last step | 400, -100, -5900 | hit |
| 2600 short, one too far | 400, -100, -6100 | miss |

All nine come out as 1050 reads, including the one that matters: fifty below the enemy is a
miss, and a symmetric reading of the box calls it a hit.

What `cockpit.ts` had instead, and what it now does:

- **A missile that flew for two seconds of wall clock** and was tested against the enemy once
  a frame as it went. Replaced by the sixteen-step walk at the moment of firing. The
  projectile that is pushed onto the display list is now only what is drawn - it carries no
  test of its own.
- **`Math.abs(dy) < 60`**, which is 1050's box mirrored onto the low side. Replaced by
  `missileHit1000`, which walks 1050 as written.
- **The damage done by hand**: `Math.min(255, vitality + j2 / (te + 1))`, with
  `Math.max(1, defenseTech)` under the tech. 1535 and 1540 truncate into a byte, `IF DP < HL`
  is a test and not a clamp so at 255 the old value simply stays, and `TE` has no floor under
  it. All three are what `applyHit` already did for the laser; the missile goes through the
  same routine now.
- **An autopilot special case** - a hit granted within 1600 units, which nothing on the disk
  has.
- **`if (missilesRemaining < 2) return`**, where 1000 only skips the flight on an empty rack.
  With one missile left the shot still flies; 1090 charges two either way and 3380 stops the
  count at zero.

`missile_box_parity.mjs` asks the port for the same nine shots, using the `ZP`, `XH`, `ZH` and
`YP` the machine had at the moment it fired so that a rounding difference cannot be read as a
difference in the test: all nine agree, sixteen steps, the last tested 2400 ahead.

`playthrough.mjs` now flies the leg as well, which is the part no harness had ever done. Lined
up 800 short, one missile moves the ship's damage by `INT(120 / (TE + 1))` and costs two, and
the shot that carries the total past `38204` runs EX and comes back to a sky with no ship in
it.

---

## REPAIR/RESTOCK, and a gate that is not an altitude

One of the two screens this document listed as never captured. It is SHORE LEAVE 2500-2620,
and the reason nothing had reached it is that it needs a state no harness had ever set up: the
ship **on the deck of a planet**, with something broken to pay for.

```
2500 DATA SHIELD,38200,ENERGY,38199,# 1 ENGINE,38198,# 2 ENGINE,38197,COMPUTER,38196,
     RADAR,38195,ENV. CONTROL,38194,HULL DMG.,38193,HYPERDRIVE,38190,MISSILES,38187,
     LASER,38186,NAV. COMP.,38184
2505 R = 7: GOSUB 2080: IF PEEK(38210) = 0 OR PEEK(29469) > 22 THEN
     VTAB 3: HTAB 3: PRINT "YOU MUST LAND ON": HTAB 3: PRINT "PLANET FIRST.": GOTO 2099
2510 PRINT "  REPAIR SHIP": FOR J = 1 TO 12: READ A$: READ LO
2520 D = PEEK(LO): IF D < 100 AND J <> 10 AND J <> 2 THEN PRINT A$;":";: HTAB 13:
     CD = INT((RND(1) * 150) * (100 - ((D / 100) * 100))): PRINT D;: HTAB 17: PRINT "%":
     P = P + CD: POKE LO,100
2525 IF D < 63 AND J = 2 THEN ... CD = INT((RND(1) * 200) * (100 - D1)) ... POKE LO,63
2530 IF D < 100 AND J = 10 THEN ... CD = INT((RND(1) * 100) * (100 - PEEK(LO))) ... POKE LO,100
2560 ... PRINT P;" CREDITS.": PRINT "YOU HAVE ";CR: PRINT "CREDITS.": IF CR < P THEN 2600
2580 PRINT "ARE YOU GOING TO": PRINT "PAY, SIR? (Y/N) ";: GET N$:
     IF N$ = "N" AND P > 0 THEN PRINT " ": GOTO 2600
2600 R = 7: GOSUB 2080: IF N$ = "N" THEN 2605
2602 PRINT "YOU DON'T HAVE": PRINT "ENOUGH CREDITS!": PRINT "YOU HAVE 0 CREDITS":
     PRINT "LEFT!": CR = 0
2605 PRINT "I'M AFRAID YOU'VE": PRINT "MADE THE LOCAL": PRINT "GOVERNMENT ANGRY!"
2610 POKE 38208,0: POKE 38219 + PEEK(38209),0
```

### The gate is a low byte

`29469` is `YI`, and 140 stores Y there as a lo/hi pair - so `PEEK(29469) > 22` tests **the low
byte of Y alone**. 147 parks a landed ship on 20 and holds it there, which is plainly what the
test was written for, but it is not what it does: Y 1030 is `$0406`, low byte 6, and gets
through; Y 1000 is `$03E8`, low byte 232, and does not. Confirmed both ways on the machine by
`probe_repair.mjs`, and the port now reproduces it, low byte and all. It had been testing
`state.inOrbit`, which let a repair happen at any height at all.

### Two of the twelve are not damage

`38199` is the **energy** line 8 reads into `E` and the flight loop spends, and 2525 tops it up
to 63 - that is refuelling, not repair, and it is the one entry that gets *cheaper* the emptier
it is. `38187` is the **missile count** 1090 decrements two at a time, and 2530 restocks it to
100. Both were pointed at `damage.powerPct` and `damage.missilePct` in the port, fields nothing
else reads, so a paid-for repair left the ship with the same empty tank and the same empty rack
it came in with. On the machine, with the eight broken systems `probe_repair.mjs` set up:

| cell | before | after |
| --- | --- | --- |
| SHIELD 38200 | 40 | 100 |
| ENERGY 38199 | 9 | **63** |
| # 1 ENGINE 38198 | 70 | 100 |
| # 2 ENGINE 38197 | 100 | 100, skipped by `D < 100` |
| COMPUTER 38196 | 55 | 100 |
| RADAR 38195 | 100 | 100, skipped |
| ENV. CONTROL 38194 | 128 | 128, skipped - 128 is its resting value |
| HULL DMG. 38193 | 61 | 100 |
| HYPERDRIVE 38190 | 88 | 100 |
| MISSILES 38187 | 0 | **100** |
| LASER 38186 | 0 | 100 |
| NAV. COMP. 38184 | 100 | 100, skipped |

### Three pages, and the one in the middle nobody sees

The list prints in three pieces - the name at the window's margin, `HTAB 13` and the byte the
system was at **before** the repair, `HTAB 17` and the per-cent sign - and the two restock
branches print `A$;` with no colon, where 2520 prints `A$;":"`. Measured off the machine's own
page: columns 2, 13 and 17, first row 3. The port had been printing `NAME: 57%` as one run from
column 2, starting a row too low.

Then 2560's bill. If it cannot be paid, **2600 opens with its own `GOSUB 2080`**, which wipes
the panel - so the refusal is not appended underneath the bill, it replaces it, seven lines
from row 2: 2602's four and 2605's three. Saying N at 2580 goes to 2605 and gets the last three
only. The port had appended three invented lines, `LOCAL GOV'T ANGRY!` among them, under a bill
that stayed on screen.

The bill page itself is on screen for no frames at all on either machine, because 2560 falls
straight into 2600; it was caught here only by stopping the CPU with 2600 as the current line.

2610 then takes the planet back - `POKE 38208,0: POKE 38219 + PEEK(38209),0` - on both refusal
paths, and 2602 empties the purse. Paying jumps from 2590 to 2615 and keeps it.

`repair_parity.mjs` compares the itemised list and the refusal pixel for pixel, and the bill on
the rows that hold no RND-driven number: 0 of 53,760 differing on all three. The twelve cells
come out as the machine's, and 2610's forfeit happens. `playthrough.mjs` flies the gate both
ways.

---

## ENLIST TROOPS, which is two loops and not one question

The last screen this document listed as never captured, and the reason it reads oddly in the
port's history is that it is not one screen with one answer. There are two loops in it.

```
2200 R = 7: GOSUB 2080: PRINT "ENLIST TROOPS": PRINT
2210 IF PEEK(38389) = 1 THEN PRINT "ONE TIME PER TRIP.": GOTO 2099
2220 POKE 38389,1
2240 IF PEEK(38208) = 0 THEN PRINT "THE PLANET HAS NOT": PRINT "SURRENDERED YET!!": GOTO 2099
2250 PRINT "EACH NEW TROOP": PRINT "MUST BE PAID ONE": PRINT "CREDIT IN ADVANCE."
2260 PRINT "YOU HAVE ";CR: PRINT "CREDITS, SIR."
2270 PRINT "TROOPS= ";TR: VTAB 10: PRINT "HOW MANY TROOPS": PRINT "DO YOU WANT TO":
     PRINT "ENLIST?";
2275 J = 0: V = 13: H = 2: GOSUB 5000: EN = CC: VTAB 13: HTAB 2: PRINT "       "
2280 IF EN > CR THEN ...blank 10, 11, 12... VTAB 10: PRINT "YOU DON'T HAVE":
     PRINT EN;" CREDITS!": FOR J = 1 TO 3000: NEXT
2281 IF EN > CR THEN ...blank 10 to 13... VTAB 9: GOTO 2270
2285 IF TR + EN > 20000 THEN VTAB 12: HTAB 2: PRINT "TOO MANY TROOPS.  ":
     FOR O = 1 TO 2000: NEXT: POKE 38389,0: GOTO 2200
2290 TR = TR + EN: CR = CR - EN: GOSUB 3000
```

- **2281 goes back to 2270.** An answer the purse cannot cover is not an ending: the refusal
  stands for three thousand empty iterations, the rows are blanked, and the question is asked
  again. The machine's re-asked page is its first page to the pixel.
- **2285 goes back to 2200**, and pokes `38389` back to 0 on the way. Asking for a number that
  would burst the twenty-thousand ceiling costs nothing - the trip's one enlistment is handed
  back and the whole screen starts over. 2280's refusal does not do that, so running out of
  money does spend the trip.
- **2275 wipes what was typed**: `VTAB 13: HTAB 2: PRINT "       "` the moment `GOSUB 5000`
  returns. The port had been leaving the digits on the line.
- **2290 is the only `GOSUB 3000` on the disk.** Paying the troops is what opens BUY WEAPONS;
  it is not a menu entry of its own.

`probe_enlist.mjs` answers the question three times on the machine - unaffordable, impossible,
then one that works - and captures the page at each stop: the prompt, 2280's refusal, the
re-asked question, `TOO MANY TROOPS.` and BUY WEAPONS' first page, which only 2290 reaches.
`enlist_parity.mjs` drives the port through the same three answers: all five pages 0 of 53,760
differing, and the sums come out as the machine's - 10000 credits and 2000 troops in, 9900 and
19600 out after enlisting a hundred into an army of 19500.

### BUY WEAPONS' three refusals all go back to 3070, not to 3060

```
3060 NEXT: PRINT "..................": C = INT((RND(1) + .2) * 4 * MU(J1 + 1)):
     VTAB 10: PRINT A$(J1 + 1);" COST";C
3070 JJ = J: J = 0: VTAB 11: PRINT "BUY HOW MANY? ": V = 12: H = 2: GOSUB 5000: B = CC:
     IF B < 0 OR B > 255 THEN VTAB 11: PRINT 17sp: VTAB 11: SPEED= 90:
     PRINT "BUY 255 MAX.  ": SPEED= 255: PRINT "          ": GOTO 3070
3072 IF B + PEEK(LO - J1) > 255 THEN ... SPEED= 127: PRINT "255 MAX ": ... GOTO 3070
3090 IF B * C > CR THEN ... PRINT "NOT ENOUGH CREDITS": FOR L = 1 TO 2000: NEXT:
     ... GOTO 3070
```

**The price is rolled once an item.** Every refusal ends `GOTO 3070`, and 3060 - which holds
the `RND` - is only ever entered from the outer `FOR J1`. The port had the draw inside its
retry loop, so a silly answer bought a fresh price: type 300 until the fighters come cheap.
Proved without needing the machine's number at all - on the disk the re-asked page is the
first page **to the pixel**, 12,131 lit both times.

**Each refusal wipes the number that was typed**, with the `PRINT` of spaces that follows it -
ten columns for 3070, seven for 3072, eleven for 3090, which also clears its own message row
because it is the only one with a delay loop. 3070 and 3072 have no delay at all: `SPEED= 90`
and `SPEED= 127` printing the message a character at a time is the delay.

That last detail is also why the message row cannot be captured: under `SPEED= 90` the page
stands still between characters, so there is no moment at which it is reliably whole. The row
is scored out, and what the capture is kept for is the rest of the page - above all the
refused number still standing on row 12, because it is wiped only after the message.

Two of the captures needed a second attempt, both for reasons worth writing down. 3060 opens
with the `NEXT` of 3020's own `FOR J = 0 TO 3`, so stopping there catches BUY WEAPONS after a
single line - the same trap as REPAIR's 2540 and the EX burst's line 30. And 2080 leaves
`SPEED= 127`, so 2285's message is typed out a character at a time: a short step after the
line went current caught three of them, leaving the page reading `TOOIST?` where `ENLIST?` had
been. Both stops now wait for the page to stop changing.

---

## Saving a game: three blocks, three numbers, and a gap between them

What the disk keeps across a power cycle is smaller and stranger than it looks.

**MISC FILE** is a text file of three numbers - `SD`, `TR`, `CR`: the stardate, the troops and
the credits. It is read by SHORE LEAVE 11, GROUND FORCES 11, SUPPLY 5000, STATUS 5000, RECALL
11 and H/D 6, and written at eight points during play (SHORE LEAVE 2096, 2160, 2290, 2460 and
2620; GROUND FORCES 670, 800 and 1120; H/D 6). It needs no save command - those three numbers
are always current on the disk. `START 2050` resets them to `100.3`, `2000`, `10000` for a new
game.

**Everything else** waits for END's option 1:

```
190 IF PEEK(38210) = 1 THEN "YOU MUST BE IN ORBIT TO SAVE GAME" ... RETURN
200 POKE 38211,PEEK(29467) ... POKE 38218,PEEK(29474)
202 POKE 38219,PEEK(29475)
204 POKE 38391,77: POKE 38392,PEEK(38209)
210 POKE 38823,PEEK(38209): POKE 38824,1: CALL 38825:
    BSAVE P/F,A$97E1,L$140: BSAVE PLANET FILE,A$954C,L$AF:
    BSAVE SHIP'S DATA ,A38150,L54: PRINT "GAME SAVED."
```

Three blocks, and no more: **38150-38203** (the ship - its systems, its loot, its forces, its
missiles), **38220-38394** (the galaxy - star coordinates, tech levels, conquered flags, bases)
and **38881-39200** (P/F). `START 210`'s `O` branch BLOADs the same three back.

### The gap, and the nine cells that fall into it

38204 to 38219 is covered by **neither** of the first two blocks. That is where the enemy ship
lives (38204, 38205), the ground batteries (38207), the surrender flag (38208), the atmosphere
flag (38210) - and where 200 and 202 put the ship's position and attitude, copied cell by cell
out of `29467-29475`. None of it is written to disk. A loaded game has no memory of where the
ship was, which planet it was at (38209 is in the gap too), or what it was fighting.

Measured on the machine, `probe_save.mjs`: in the atmosphere 190 refuses and 38391 stays 0; out
of it, 200 and 202 copy all nine cells exactly - `188,2,200,0,151,229,0,0,0` into 38211-38219 -
and 204 sets 38391 to 77 and 38392 to the planet. (The three BSAVEs do not complete under the
oracle, so the block boundaries are read from the BSAVE arguments and the files' own lengths on
the image rather than from a write.)

202 lands on 38219, which looks like it should matter - `38219 + P` is the conquered flag
GALAXY MAP 3066 reads and SHORE LEAVE 1550 sets - but the disk numbers its planets 1 to 20,
so 38219 is slot 0 and nothing ever reads it. The write is inert. (It is worth saying plainly
because the port's `planets[i]` is the disk's planet `i + 1`: `planets[0]` is Sol at **38220**,
inside PLANET FILE and saved like the rest.)

### What START does with it

```
190 BV% = -7000 ... POKE ZI ... BV% = 700 ... POKE XI ... BV% = 200 ... POKE YI
195 POKE H1,0
200 IF G$ = "N" THEN GOSUB 2000
210 IF G$ = "O" THEN GOSUB 3000
220 POKE 38823,PEEK(38392): POKE 38824,0: CALL 38825
224 IF G$ = "N" THEN GOTO 230
225 POKE 29467,PEEK(38211) ... POKE 29475,PEEK(38219)
```

190 and 195 put every game, new or old, at X 700, Y 200, Z -7000, heading 0. 220 then pulls
planet `PEEK(38392)`'s record out of P/F - `CALL 38825` with `38824 = 0` is MEM TRANSFER A's
read, and END 210 did the matching write with `38824 = 1` - and 225 copies the nine saved
cells back over the position for an old game.

So the mechanism is complete, and it works perfectly **for as long as the machine stays on**.
Across a power cycle 38211-38219 has nothing behind it, and 225 restores whatever RAM holds.
38209 is not restored at all: the record transfer does not carry it, which H/D shows plainly -
line 25 does the transfer and line 26 pokes 38209 separately.

### The port

`diskSave.ts` models the blocks rather than the fields: `SHIP'S DATA` and MISC FILE's three
numbers go into the payload, `PLANET FILE` and `P/F` go in per planet - all twenty of them,
Sol included - and the gap itself is a module-level holder that is never written to storage. Save and continue in the same tab and the ship is where it
was; reload the page first and it comes back at 190 and 195's position with no enemy, no
batteries, the surrender and atmosphere flags clear and the planet unrestored.

### And a sky with no stars in it

Loading a game turned up a second bug, in the flight view rather than the save. START loads
the star table at line 100 - `BLOAD PLANET # 0,A$7300` - for every game, unconditionally, and
240 and 250 choose the **enemy's** model separately: DEBRIS when the planet is armed and the
ship is gone, `SHIP # J` otherwise. The two have nothing to do with each other.

In the port the whole asset load, star table and ground wireframe included, sat behind
`if (displayShipKind >= 1)`. A planet with no enemy on it therefore had no stars in space and
an empty box in the air. It is reachable two ways - fly on after EX has destroyed the ship, or
load a saved game, where 38205 is in the sixteen-byte gap END never writes - and it was the
second that showed it: the loaded game came up at START 190's position looking at nothing at
all. Only the enemy's own model is behind the guard now.

END's option 1 had been printing `GAME SAVED.` and writing nothing at all - there was no
`setItem` anywhere in the source - so START's `O`, which was otherwise complete, could only
ever answer `THERE IS NO GAME SAVED`. `save_parity.mjs` has fifteen checks over a save and a
load across a page reload, including everything the gap is supposed to lose.

### `SHIP'S DATA` is not on the disk at all

Only `SHIP'S DATA-M` is - 54 bytes, which is exactly `L54` - so this image has never been saved
to, and `START 3020`'s `BLOAD SHIP'S DATA` would fail on it. `PLANET FILE` and `P/F` are both
present, and `P/F-M` is 336 bytes where `P/F` is 320, which is what `L$140` writes.

`START 26` is a second, smaller mechanism: `OG = PEEK(38391): POKE 38391,0: IF OG = 77 THEN
BSAVE PLANET FILE`. 38391 is the marker END, GALAXY MAP and INSTRUMENTS use to route between
programs, and START reuses it at boot to decide whether to write the galaxy block back.

---

## What a scene change costs

Every screen in this game is its own Applesoft program, and moving between them is one program
printing `^DRUN <name>` and DOS 3.3 going to the disk for the next one. That is the single
most common thing the game does, and nothing had ever timed it.

`probe_runtime.mjs` times the span the port's scene manager stands in for: from the frame on
which the line carrying the `^DRUN` is current, to the frame on which the next program is
loaded and running. Not from the keypress - the flight loop only looks at the keyboard once a
pass, and that wait is the game's, not the disk's - and not up to anything the new program
draws. Timed in video frames, because `frames()` is what ticks the drive: 17,030 cycles,
16.688 ms.

| | |
| --- | --- |
| STARSHIP SIMULATOR -> COM | 1051 ms, twice, to the frame |
| COM -> STARSHIP SIMULATOR | 1802 ms |
| COM -> GROUND FORCES | 851 ms on one run, 1669 on the next |
| GROUND FORCES -> COM | 1035 and 1018 ms |
| COM -> RADAR | 1001 ms |
| RADAR -> COM | 1151 ms |
| COM -> END | 1769 and 1752 ms |

**It is not a property of the program being loaded.** The obvious reading of the first few
numbers is that each file costs what it costs - COM came in at 1051, 1051, 1018 and 1151 - but
COM to GROUND FORCES went 851 ms on one run and 1669 on the next, and END is 813 bytes and
costs as much as the simulator's 5,553. What is being paid for is the head: DOS seeks to the
catalog to find the file and then to wherever the file is, so it depends on what was read
last. Fourteen samples over two runs: **851 ms to 1802 ms, mean 1290, median 1051**.

So a single figure is the honest summary, and `sceneManager.ts` now waits the measured mean of
1290 ms before each scene, with the old screen still up - which is what the machine shows,
since DOS has the drive and nothing has redrawn. It had been 2200 ms, which was nobody's
measurement, and then nothing at all, which was no better in the other direction.

One caveat worth stating rather than papering over: a few of the port's scenes are not a `RUN`
on the disk. The ship identification screen is a `BLOAD` inside RADAR, and it pays the same
here, which overstates it - one shape file is a smaller read than a program.

### And it broke three harnesses, for a reason worth keeping

Putting the load time back turned `repair_parity`, `enlist_parity` and `transition_parity` red,
and none of it was the game. They waited on the clock after a keypress, or on the page having
stopped changing - and **a page that has stopped changing is now the screen you were already
on**, because the old screen stays up for the whole of the load. `transition_parity` settled on
five identical snapshots of the previous scene and compared that.

All three wait on the scene they are going to now, not on a timer, which is what they should
have been doing anyway. It is the same shape of mistake as a harness that draws the page it
then compares: the signal looked like it meant "ready" and meant something else.

---

## The readout row, and a harness that painted its own page

Playing through COM's computer menu turned up what looked like a clean defect: on the machine's
SUPPLY capture the bottom row carries only the `X Y Z XHDNG YHDNG` labels, and in the port it
carries `350 100 -3320` as well. 233 pixels, all on text row 24.

It was not a defect, and the way it was settled is worth keeping.

`supply_parity.mjs` could not have seen it either way, because **it composed the page it then
compared** - `drawInstruments`, the needles, then `drawSupplyPage1` into a canvas of its own.
SUPPLY fills only rows 0 to 123 and leaves the panel standing from whatever drew it last, so
the panel is half of what that screen is, and a harness that paints its own cannot test it. It
drives the game now: a new game, C to COM, 1 to the computer, 5 to SUPPLY.

Driven, it reported the 233 pixels. The question was then which side was wrong, and the answer
is neither: **whether those numbers are on the page is not a property of SUPPLY**. Line 155
prints them every pass, and the simulator draws into one hi-res page while the other is
displayed, so what COM inherits depends on which pass you left flight in. Measured both ways on
the machine, same route each time:

- press C as soon as the simulator is up, and the row reaches SUPPLY with **20** pixels on it;
- fly for twenty seconds first, and it reaches SUPPLY with **254**.

Both are the machine. The port's 253 is the second of them.

What *is* a property of the game is what the galaxy map does to that row, and the port follows
it to the pixel - 250 in flight and through COM, **152** on the map, **20** from there on, and
it never comes back until flight. The disk's own route capture shows the same three numbers.

So the row is excluded here, as `transition_parity` already excludes it everywhere, and the
reason is written down in both places. With it out, both SUPPLY pages agree on all 53,760
pixels with the scene actually driven.

---

## A sweep of the harnesses, for two ways of being green and wrong

After `supply_parity` turned out to be painting the page it compared, all forty-three were
swept for the same thing. Two patterns came out of it, and the second is worse than the first.

### Which harnesses compose the page they compare

Five drive the game: `transition_parity` along its twenty-six step route, and `repair`,
`enlist`, `supply` and `save`. Ten compare no page at all - `logic`, `damage`, `weapons`,
`replay`, `rnd`, `rotation`, `sound`, `missile_box`, `project6000`, `clip` - and are sound as
they stand.

The rest paint, and they divide three ways.

- **Primitives.** `dmg` checks the ten-by-five lamp, `shape` the shape-table decoder, `star`
  the star projection, `ship` the models, `line6dd5` one 6502 routine's side effects, `frame`
  a reference render, `map_pick` 3230's hit test. Painting a scratch canvas is the point of
  these; what they do not answer is whether any scene calls them.
- **RND-driven, deliberately structural.** `ex`, `ex_burst`, `sx`, `sx_burst`, `hd`. The
  original differs from itself run to run - `X2 = X1 - (RND(1) * (X1 + X1))` - so these check
  the background, the extent and the message rather than pixels. Fair, and unavoidable.
- **"Replays the chain" - the dangerous ones.** `orbit`, `recall`, `collect`, `shoreleave`,
  `groundforces`, `end`, `shipid`, `com`, `status`, `galaxymap`, `radar` all rebuild the
  inherited page by hand - panel, lamps, needles, the previous screen's leftovers - and then
  draw the screen on top. That hand-built page is a **model** of what the game does, and the
  model is exactly what went wrong in SUPPLY.

Most of that last group is covered anyway, because `transition_parity` drives COM, the
computer submenu, the directory, the galaxy map, STATUS, SUPPLY, RADAR, the ship id, GROUND
FORCES, CRYOGENICS and END along a real route. The ones it never reaches are **ORBIT, RECALL
and COLLECT**, and of those `orbit_parity` now flies there the way 158 does - into the
atmosphere, then `Y > 4000` - instead of composing. Driven, ORBIT's own rows 0 to 125 are
exact, 0 of 35,280. What is left below is the live readout row and the bank and pitch needles,
both of which depend on which hi-res page the flight loop had flipped to, which is what the
harness's own comment had said all along.

### Seventeen of them could not fail

`collect`, `com`, `dmg`, `end`, `frame`, `ground`, `groundforces`, `hd`, `project6000`,
`radar`, `ship`, `shipid`, `shoreleave`, `star`, `status`, `supply` and `sx` printed their
report and exited 0 whatever was in it. Every "43 of 43 passed" in this file counted those as
passes on the strength of the script not having thrown.

All of them have one now, and it was not mechanical - each had to be given the criterion it
was actually testing:

- **exact, whole page**: `com` (fresh ship and four systems broken), `end`, `shoreleave`,
  `status`, `frame`, `groundforces` (and every pixel of its battle layout lit on the disk too).
- **exact, over the rows the screen owns**: `shipid` (rows 0-15 for all four ships; the panel
  below is the flight page it inherits, and whether its needles are on it depends on the
  hi-res flip), `orbit` (rows 0-125), `supply` (both pages, less the live readout row).
- **exact, every state**: `ground` and `star` over twelve, `ship` over eleven - these print a
  mean agreement, and the criterion is that the mean is 100%, not that it is high.
- **exact, arithmetic**: `project6000`, all 261 samples and all 293 calls of a live render.
- **the lamp and nothing else**: `dmg` - no cell missing, none extra, nothing changed outside
  it, and 2545's green landing on the same cells.
- **a range, because the original is RND**: `hd` and `sx`. The streaks and the burst differ
  from themselves run to run, so what is required is that the disk's own count falls inside
  twelve runs of the port's - and beside it the parts that *are* exact: the message row for
  S/X, and for H/D the jump's D1, the energy it costs, the `|Z| >= 7000` line 70 retries for
  and the visited flag.
- **a range and a rate**: `collect` - the band is exact, and every commodity the machine
  awarded is inside the rate its tech allows, which is what `replay_parity` pins exactly.

Checked by breaking one on purpose: `end_parity` with its criterion inverted exits 1.

Giving them teeth turned `playthrough` red straight away, and on a real difference rather than
a harness one: its first missile, fired into the gap between a scene being logged and that
scene having loaded its assets, did nothing.

The first guess was that the key had been dropped, and that was wrong - `Input` already models
$C000 properly, and the latch carried the space for the whole 1,290 ms of the load. What ate it
was the **read**. `handleDiscreteInput` cleared the key before running its branches, so a key
the branches then declined to act on was gone. The cockpit's first frame read the space with 17
milliseconds of `fireCooldown` left - measured, with a diagnostic in that branch - and threw it
away.

On the machine a key waits in the latch until the program reads it, and the program reads it
when it is ready to act. So firing, which is the only thing here that can be refused for a
reason that will pass, now leaves the key where it was. `playthrough` fires into the gap with
nothing waited for and the shot lands.

One thing beside it is worth stating as unverified rather than fixed: `FIRE_COOLDOWN_SECONDS`
is 0.45, and it is nobody's measurement. The disk has no cooldown at all - line 185 tests the
paddle button once a pass, and a pass is 2.55 seconds, so the main loop *is* the rate limit.
The port's frame loop runs sixty times a second and needs something in its place, but 0.45 is
a guess, and the thing it stands in for is already a measured constant.

---

---

## RECALL, all five branches

RECALL is five ordered tests and nothing else. Only one had ever been run, because a new game
always has the troops asleep.

```
2000  IF PEEK(38209) <> PEEK(38158) AND PEEK(38166) > 0 AND PEEK(38166) < 3
      -> "TROOPS ARE NOT ON" / "" / "THIS PLANET, SIR!"
2005  IF TR = 0          -> "WE HAVE NO TROOPS" / "LEFT, SIR!"        and POKE 38166,0
2010  IF PEEK(38166) = 1 OR PEEK(38166) = 2
                         -> "TROOPS ARE BEING" / "RECALLED, SIR!"     and POKE 38166,0
2020  IF PEEK(38166) = 3 -> "TROOPS ARE IN" / "CRYOGENIC SLEEP!"
2030  IF PEEK(38166) = 0 -> "TROOPS ARE ALREADY" / "ON BOARD, SIR!"
```

38166 is where the troops are - 0 on board, 1 or 2 being recalled, 3 asleep - and 38158 is the
planet they are on. Only 2005 and 2010 poke it; the other three leave it alone. Line 2000's
message carries a blank line between its two, and the `PRINT:` at the head of 2000 puts one
above all five.

Four of the five are a matter of setting 38158 and 38166 before pressing 2.

### The fifth needed taking the CPU over

`TR` is not a PEEK. It is read off the MISC FILE at line 11, and there is no poking a DOS file.
So `oracle/probe_recallbranches.mjs` presses 2 and then steps the machine by hand until `TR`
appears in Applesoft's variable table, writes a zero into its exponent byte - which is how a
five-byte Applesoft float says zero - and lets it run on into 2005.

Two things had to be got right for that to mean anything.

**Zero the right TR.** GROUND FORCES has a `TR` of its own, read from the same file at its own
line 11, and pressing 2 does not clear it until DOS actually runs RECALL. Zeroing the one that
is there when the key goes down changes nothing, because the `RUN` wipes the variable table and
RECALL reads `TR` back off the file. So wait for that wipe first - `VARTAB == ARYTAB` is what an
empty table looks like.

**Wait for a non-zero TR.** Applesoft creates the slot at zero when `INPUT` names it and fills
it a moment later, so accepting zero means zeroing something that is about to be overwritten.
That is exactly what happened on the first two attempts, and the tell was that 2005's page came
out identical to 2030's - which it cannot be, since TR is the only thing separating them. The
probe now checks that pair explicitly rather than trusting that the poke landed.

### Checked

| line | what it says | 38166 | pixels differing |
| --- | --- | --- | --- |
| 2000 | troops are not on this planet | left at 1 | 0 |
| 2005 | we have no troops left | poked to 0 | 0 |
| 2010 | troops are being recalled | poked to 0 | 0 |
| 2020 | troops are in cryogenic sleep | left at 3 | 0 |
| 2030 | troops are already on board | left at 0 | 0 |

All five take the branch the port picks, poke what the port pokes, and match pixel for pixel.

One exclusion, stated because it is an exclusion: rows 184-190 hold the DOS command line the
previous program echoed when it ran RECALL - GROUND FORCES' own `PRINT D$;"RUN RECALL"`. It is
on the page before RECALL draws anything, RECALL never touches it, and the port's replay chain
starts from a synthetic panel and COM composite that never had a DOS prompt on it. 231 pixels,
identically in all five captures, and the comparison is over rows 0-183.

---

## Applesoft's RND

`$EFAE` is what every `RND(1)` in the game goes through, and without it nothing RND-driven can
be replayed. It is transcribed in `diskRnd.ts` and it agrees with the machine byte for byte.

```
$EFAE  JSR $EB82                          ; the sign of FAC
$EFB2  BMI $EFCC                          ; a negative argument reseeds from FAC
$EFB4  LDA #$C9 / LDY #$00 / JSR $EAF9    ; FAC <- the seed at $00C9
$EFBB  TXA / BEQ $EFA5                    ; RND(0) returns the last value unchanged
$EFBE  LDA #$A6 / LDY #$EF / JSR $E97F    ; FAC *= 11879546.40625
$EFC5  LDA #$AA / LDY #$EF / JSR $E7BE    ; FAC += 3.927677783011063e-8
$EFCC  LDX $A1 / LDA $9E / STA $A1 / STX $9E   ; swap mantissa bytes 1 and 4
$EFD4  LDA #$00 / STA $A2                 ; force it positive
$EFD8  LDA $9D / STA $AC                  ; the guard byte becomes the OLD exponent
$EFDC  LDA #$80 / STA $9D                 ; and the exponent becomes $80
$EFE0  JSR $E82E                           ; normalise
$EFE3  LDX #$C9 / LDY #$00 / JMP $EB2B     ; round, store over the seed, return it
```

The float is five bytes: an excess-128 exponent and a 32-bit mantissa. In memory bit 7 of the
first mantissa byte is the sign and the leading 1 is implied (`$EB43 LDA $A2 / ORA #$7F /
AND $9E`); in FAC the sign sits at `$A2` and the mantissa's top bit is explicit. `$AC` is a
fifth mantissa byte - the guard - which the arithmetic keeps and the store rounds away, half up
through the carry chain at `$E8C6`.

### Five things it is easy to get wrong

**`$EFD8` feeds the old exponent into the guard byte.** A byte with nothing to do with the
mantissa is shifted into it by the normalise and then rounded in by the store. Deliberate
mixing; leaving it out gives a different sequence within a handful of calls.

**`$A4` is a hidden operand of both FMULT and FADD.** The shift-right routine fills from it -
`$E8EC LDY $A4 / STY $01,X` - and **nothing in either routine sets it**. It is the sign
extension for a shift and the caller is supposed to have it right; RND's callers do not touch
it, so it is whatever the interpreter last left there. `$FF` in every capture taken here.
Aligning the tiny addend against a large FAC shifts five bytes of `$FF` into the top of it and
the add then carries where it otherwise would not.

**`$E7EE CMP #$F9 / BMI $E7B9` is not a bail.** It reads like "give up if the operands are more
than seven apart", and taking it that way makes FADD drop the addend entirely. `$E7B9` is
`JSR $E8F0`, the whole-byte shift, and it carries straight on into the add.

**FMULT's whole-byte shortcut is eight bits or nine, depending on the carry it is entered
with.** A zero multiplier byte goes to `$E9B2 JMP $E8DA`, which shifts one byte and falls into

```
$E8F0  ADC #$08 / BMI $E8DC / BEQ $E8DC
$E8F6  SBC #$08 / TAY / LDA $AC / BCS $E911
$E8FD  ASL $01,X / BCC / INC $01,X / ROR x5 / INY / BNE $E8FD
```

With the carry **set**, that arithmetic leaves Y at 0 and the `BCS` exits: eight bits. With it
**clear**, Y comes out `$FF`, the `BCS` falls through, and `INY / BNE` runs the bit loop exactly
once - a ninth bit. And the guard byte does not move on that extra pass, because it only ever
lives in A (`$E8F9 LDA $AC`, never stored back). A normal byte leaves the carry set, since
`$E9E2 RTS` is reached with the sentinel's last bit in it; the shortcut leaves it clear, because
`$E911` is `CLC / RTS`. So it chains from byte to byte.

**And the carry the chain starts from is not a constant - it comes out of the exponent add.**

```
$EA12  CLC / ADC $9D / BCC $EA1B / BMI (overflow) / CLC / .byte $2C
$EA1B  BPL (underflow)
$EA1D  ADC #$80 / STA $9D
```

The `.byte $2C` is `BIT abs`, swallowing the `BPL` so the carry-set path skips it; either way
`ADC #$80` runs with the carry clear. So it comes out **set exactly when the two exponents sum
to under `$100`**. Measured at `$E9B0` for three seeds - 0, 0 and 1 - which is what that
predicts, and deriving it rather than passing it in is what closed the last gap.

The same add gives the over- and underflow bounds: the exponent is `sum - $80`, valid while
`$80 <= sum < $180`. Below that the result is zero; above it Applesoft takes its error exit,
which is why two of the five seeds tried never return at all. One of those, `ff 00 00 ff ff`, is
what `$00C9` happens to hold after a reset - uninitialised RAM rather than a seed the
interpreter would start from.

### Checked

`oracle/probe_rnd.mjs` calls `$EFAE` on the machine and reads the five seed bytes back after
every call; `oracle/rnd_parity.mjs` runs `diskRnd.ts` from the same seeds.

| seed | calls | carry at `$E9B0` | |
| --- | --- | --- | --- |
| `80 00 00 00 00` | 6000 | 0 | every byte of every call agrees |
| `81 49 0f da a2` | 6000 | 0 | every byte of every call agrees |
| `01 00 00 00 01` | 6000 | 1 | every byte of every call agrees |

18000 calls, bit-exact. So anything RND-driven can now be replayed rather than checked by
predicate - the combat, the damage model, COLLECT's loot rolls, the base and weapon prices -
given the seed and `$A4`.

---

## Replaying the RND-driven routines

With `$EFAE` bit-exact, the damage model and the combat stop needing predicates. Given the seed
at `$00C9` and the fill byte at `$A4`, the exact value the machine drew can be recomputed, so
the formulas can be checked on the numbers rather than on their bounds.

`oracle/probe_rndreplay.mjs` and `oracle/probe_rndcombat.mjs` record, at **every** entry to
`$EFAE` during a damaging flight and a real assault, the five seed bytes before the call, `$A4`,
the bytes the routine writes, and the live Applesoft variables. Consecutive entries bracket one
draw each. `oracle/replay_parity.mjs` then replays them.

**`$A4` is `$00` in the running game**, not the `$FF` a freshly reset machine has. Both were
needed: the RND harness starts from a reset and sees `$FF`, and the game sees `$00`.

### The damage tick

A tick past 3205's gate draws seven values in a fixed order - shields, radar, engine 1, engine 2,
computer, laser, hull - so a window of seven consecutive calls over which all seven systems
change is exactly one tick. Eight such windows were recorded.

| | |
| --- | --- |
| losses predicted to the byte from the recomputed RND value | **56 of 56** |

so `shields -= RND(1) * 1.1`, the five at `* 5` and the hull at `* 4`, each through
`3380 IF J < 0 THEN J = 0` and a truncating POKE, are now confirmed on the values themselves.
Before this the most that could be said was that shields never lost more than 1.1 and the rest
never more than 5.

**Replay found something no predicate could.** Line 3019 is
`HC = RND(1) * 5: FOR LY = 1 TO HC: ... X1 = (RND(1) * 40) + 10: FOR J = 1 TO X1: NEXT: NEXT` -
it draws again **every time round the loop**. Those values only set a delay, so nothing visible
depends on them and no bound could have noticed them missing; but they come out of the same
stream as everything else, and leaving them out desynchronises the replay from line 3030 onward.
`damageTick3000` draws them now.

### The combat

A round draws eighteen values: VIC, then T2, T3 and X, then two each for T, P and M, one for TP,
three for TR, three for ET, and one more for X because 38205 is non-zero. Where the first draw of
a round falls in a recording is not known, so every offset is tried and the one that predicts the
next round is taken; a wrong model fails on the first round, so there is nothing to fit. The
boundary came out at draw 0 of every 18.

| | |
| --- | --- |
| rounds predicted - four weapon counts and the troop total, to the unit | **12 of 12** |
| the assault's progress, VP | to 3.3e-9 |

`TR` is the one that settles the argument. 560 scales the troop loss by `T2`, and `T2` in the
losing branch is `200 * (RND * 5)` where the port had read `200 + (RND * 5)` - a difference of up
to five hundred. Losses of 19, 80, 12 and 34 troops, each predicted exactly from the seed, is
that reading confirmed on the numbers.

Two things the replay turned up about GROUND FORCES' own bookkeeping. **VP is never poked back**:
line 600 writes only the four weapon bytes, so 38160 sits at whatever it was and VP lives in the
variable alone - comparing it against the byte is meaningless, which is how the first attempt at
this looked like twelve failures. And **4000 does not truncate VP**, so it carries a fraction from
round to round: in Applesoft's 32-bit mantissa where the port carries a double, which is why it
is compared to a tolerance while everything stored as a byte is exact.

### COLLECT's loot

`805 ON TECH + 1 GOSUB 820,840,910,1070,1090` picks a path by the planet's tech level. Three of
them set two rates and fall into 920, which draws thirteen values in a fixed order - gold, silver,
platinum, titanium, collapsium, steel, fissionables, electronics, weapons, fighter parts, luxury
food, wine, art - each `J = PEEK(addr) + (RND(1) * rate): GOSUB 915: POKE addr,J`, with
`915 IF J > 255 THEN J = 255` and a POKE that truncates. Line 1030's luxury food is the one flat
rate, 20, whatever the tech level.

`oracle/probe_rndloot.mjs` drives a winning assault - surrender point 2 against morale 6, so 660
surrenders on the first round and 690 falls into 800 - and records every entry to `$EFAE` with the
seed, all thirteen cargo counters, and **J1 and J2 as Applesoft held them**. Reading the rates off
the machine rather than working them out from the flag is what makes the replay a test: 920's
`IF PEEK(301) = 1 THEN J1 = J1 * .6` needs no assumption about what 301 was.

The recording lands 31 draws: 18 for the combat round, 13 for the loot. Two independent counts of
draws that were worked out separately, agreeing.

| | |
| --- | --- |
| counters predicted from the recomputed RND value | **13 of 13** |
| the byte line 960 writes instead of titanium | **also exact** |

**Line 960's typo is now pinned down, not just noticed.** `960 J = PEEK(38180) + (RND(1) * J2):
GOSUB 915: POKE 31180,J` peeks titanium and pokes **31180**, a typo for 38180. So titanium is never
awarded on any path - and 31180 is `$79CC`, which is inside the ship model BLOADed to `$7879`. The
machine took it from 68 to 5, and 5 is exactly the titanium award the line computed. The typo does
not lose the value; it writes it into the loaded ship.

**301 is `$012D`, inside the 6502 stack page.** The "already collected this trip" flag lives 210
bytes down a stack that grows down from `$01FF`, so deep enough nesting would write over it. That
is worth knowing but it is not a bug in practice: `oracle/probe_flag301.mjs` samples the stack
pointer across an assault and a collection and it gets no lower than `$019D`, 112 bytes clear of
the flag, and 301 changes exactly once in eighty million instructions - 0 to 1, from 921's own
POKE. Only three lines on the whole disk touch it: 920 reads it, 921 sets it, and H/D line 5 pokes
it back to 0 on a jump. So the 60% penalty on a second haul between jumps is real and reachable,
and the port's flag models it correctly.

The port's `awardLoot` already transcribed all of this - both bugs included - and the replay
confirms it on the values.

### Line 5000's ground fire

A battery on the surface throws a bolt up at the ship. Reaching it is line 190 or 192 - the
damage tick, then `IF RND(1) < .5 AND PEEK(38207) > 0 THEN GOSUB 5000`, at .5 in atmosphere and
.6 inside the box near the planet.

`oracle/probe_rndground.mjs` records **the executing line number** with every draw, out of
Applesoft's `CURLIN` at `$75/$76`. That turns attribution from an inference into a reading, and
it corrected the first attempt at once: the obvious tell for where a bolt starts is X1 moving,
and X1 is the wrong one, because 5095 advances X1 at every step of the flight and not only at
5000's setup.

With the line numbers the recording reads straight off:

| line | draws | what it is |
| --- | --- | --- |
| 190 / 192 | 119 / 67 | the gate before 5000, one per pass |
| 3001 / 3010 / 3030 | 186 / 64 / 186 | the tick's three gates |
| 3019 | 67 | the heavy branch's flashes and delays |
| 3205 | 201 | shields - 166 from the tick, 35 from ground fire |
| 3230 / 3260 / 3270 | 24 / 24 / 96 | the rest of the ship, only when 3205 falls through |
| 5000 / 5045 | 26 / 10 | a bolt's three setup draws |
| 5090 | 112 | one per step of a bolt, the 30% hit |
| 5210 / 5240 | 35 / 35 | the return fire, and whether it kills the battery |

Every count checks against another: 119 + 67 = 186 = the tick calls at 3001; 3270 is exactly four
draws for each of 3260's; 64/186 is 3001's .4; 35 of 112 steps is 5090's .3. The 26 and 10 give
12 bolts whichever way they are read.

`replay_parity.mjs` then drives **the port's own** `spawnGroundBolt5000` and `groundBoltStep5090`
with an `rnd` that hands back the machine's recomputed draws in order, so what is tested is the
shipped code rather than a second copy of the formulas in the harness. How many draws each call
takes is checked too, against the run of line numbers - which is what would catch a routine
drawing the right values in the wrong order or the wrong number of times.

| | |
| --- | --- |
| X1, the edge, Y2 with 5080's doubling, X2 and the shape | **12 of 12 bolts** |
| draws a bolt costs to set up | **12 of 12** |
| 5090's hit, by whether 3205 followed it | **112 of 112 steps** |
| 5098's shields loss | **35 of 35** |
| 5200 running only inside 5090's THEN | **35 of 35** |
| 5240 taking a battery off 38207 | **35 of 35** |
| draws a step of the bolt takes | **112 of 112** |

Four things the reading settles.

- **Ground fire can only touch the shields.** 5098 is `L = 7: GOSUB 3205: L = 0`, and 3207 is
  `IF L = 7 THEN RETURN`. It enters the damage routine one line past 3200's `IF DMG = 0`, takes
  `RND(1) * 1.1` off 38200, and returns - never the hull, the engines, the radar, the computer
  or the laser, whatever the shields are down to.
- **Both GOSUBs at 5090 are in the same THEN**, so the ship's return fire at 5200 happens only on
  a step that hit. A bolt that never hits is never shot at.
- **5240's kill ends the bolt.** `GOSUB 5250: POP` throws away 5000's return address and 5251
  jumps to 1090, so destroying the battery abandons the rest of the flight. It is also why the
  batteries go quickly: 12 bolts took all twelve of them off 38207 in the recording.
- **`RND(5)` is `RND(1)`.** Applesoft advances the stream for any positive argument; only zero
  repeats the last value and only a negative one reseeds. Replayed as an advance, every draw
  agrees, so 5000's `RND(5)` and 5240's are ordinary draws.

Two addresses named correctly as a result. **38165 is the ship's condition**, which STATUS
1290-1294 prints as GREEN, BLUE or RED for 1, 2 and 3 and GALAXY MAP 5060-5070 colours from -
so 5200's return fire happens only at red alert. The port had called it an anti-fighter turret.
And **38207 is the planet's ground batteries**, not its ships: 190 and 192 will not fire without
one, 5250 takes one off, EX line 56 halves them when you bombard from orbit, and GROUND FORCES
172 checks them before it will land troops.

The step rate is measured, not chosen. The cycle counter at consecutive 5090 draws puts one pass
of 5090-5096 at 88,046 cycles, **0.086 s, or 11.6 steps a second**. It matters because 5090 rolls
for a hit exactly once per step, so the step rate is the damage rate - which is why the port
advances a bolt in discrete steps rather than continuously by `dt`.

### What the port had instead

Nothing called ground fire at all: `groundFire5098` had no caller outside the debug bridge. In
its place was a fighter squadron with no basis on the disk - bolts spawned only in space and
never in atmosphere, placed at the enemy ship's screen position with an invented spread and
clamps and `vy = 3 + RND * 4`, shooting at the player, destroyed by a continuous per-frame chance
or by flying a missile or a laser at them, and taking a ship off `enemyShips`. The disk has none
of that: X1 is uniform across 10..270, the bolt enters at y 10 or y 120, only the ship's own
return fire at 5200 can destroy the battery behind it, and the only thing it can do to you is
take shields off.

`cockpit.ts` now runs the bolt as 5000-5096 has it, and a 40-second flight over a hostile planet
gives 20 hits, 6 batteries destroyed - 5240's 30% - with the hull, radar, engines, computer and
laser all still at 100.

### SHORE LEAVE's prices

Four of SHORE LEAVE's screens draw, and this file quoted the listing for them for a long time
without ever running it. `oracle/probe_rndprices.mjs` drives all four and records every draw with
the executing line; `replay_parity.mjs` then replays them through the port's own
`repairBill2500`, `weaponCost3060`, `lootValue2400` and `baseCost2170`.

| | |
| --- | --- |
| the repair bill, all twelve systems, to the credit | **12 of 12** |
| the total the bill comes to | **58017 against 58017** |
| what each system is poked back to | **12 of 12** |
| draws the repair takes | **12 of 12** |
| the four weapon prices at 3060 | **4 of 4** |
| the loot sale at 2400 | **55014 against 55014** |
| a base at 2170 | **37914 against 37914**, and the untruncated product too |

**The value a line computes is not visible at the draw that made it**, so the probe stops on the
line after each one and reads the variable. That is forced rather than convenient: `2080`, the
routine that clears the screen, is `FOR C = 2 TO 13: ... NEXT` and **leaves C = 14 behind**, and
3020 calls it before every one of 3060's four prices. Reading C one draw later gives 14 every
time, which is exactly what the first recording showed.

#### The repair bill, 2500-2540

```
2500 DATA SHIELD,38200,ENERGY,38199,# 1 ENGINE,38198,# 2 ENGINE,38197,COMPUTER,38196,
     RADAR,38195,ENV. CONTROL,38194,HULL DMG.,38193,HYPERDRIVE,38190,MISSILES,38187,
     LASER,38186,NAV. COMP.,38184
2520 D = PEEK(LO): IF D < 100 AND J <> 10 AND J <> 2 THEN
     CD = INT((RND(1) * 150) * (100 - ((D / 100) * 100))) ... POKE LO,100
2524 IF D < 63 AND J = 2 THEN D2 = 63 - D: D2 = D2 * (100 / 63)
2525 IF D < 63 AND J = 2 THEN D1 = INT((D2 / 100) * 100)
     CD = INT((RND(1) * 200) * (100 - D1)) ... POKE LO,63
2530 IF D < 100 AND J = 10 THEN CD = INT((RND(1) * 100) * (100 - PEEK(LO))) ... POKE LO,100
```

Each RND is inside its own THEN, so a system already at full costs no draw at all - which makes
the **number** of draws part of what is checked, not only their values.

- **Energy is the odd one out three times over.** Its threshold is 63 rather than 100, it is
  restored to **63** rather than 100, and its price runs backwards: `D1` is the damage rescaled
  onto 0..100 and the cost is `100 - D1`, so the *worse* the energy the *cheaper* the repair.
  Every other system charges `100 - D` and gets dearer as it breaks. Read off the machine, not
  inferred: energy at 17 gave D2 = 73.0159, D1 = 73, and the byte came back 63.
- **NAV. COMP. is repaired and charged for.** It is J = 12, so 2520 takes it with the rest. The
  port skipped it outright.
- **Missiles are a count, not a percentage.** J = 10 restores 38187 to 100, so the repair screen
  is also where the missile rack is refilled.
- **`100 - ((D / 100) * 100)` is not obviously `100 - D`** on a machine carrying a 32-bit
  mantissa. It came out exact for all ten systems tested, so the round trip through the division
  does not move INT - at least for these values.

#### Where BUY WEAPONS actually lives

Not in REPAIR/RESTOCK, whatever the menu calls it. The only `GOSUB 3000` on the disk is at
**2290, inside ENLIST TROOPS**: `TR = TR + EN: CR = CR - EN: GOSUB 3000`. Paying for troops is
what takes you to the weapons. The port had it hanging off the repair screen. 3060 is
`C = INT((RND(1) + .2) * 4 * MU(J1 + 1))` with MU = 50, 75, 40, 30 for fighters, transports,
tanks and missiles, so the four prices run 40-240, 60-360, 32-192 and 24-144.

#### What the port had

`lootValue2400`, `baseCost2170` and `weaponCost3060` were already right and the replay confirms
them on the values. The repair was not: it gated energy at 100 instead of 63, computed
`100 - (100 - pct)` where the disk computes `100 - INT((63 - D) * (100 / 63))`, restored energy
to 100 instead of 63, and left nav. comp. out. `shoreLeave.ts` now calls `repairBill2500`, and
`buyWeapons` has moved to the enlist path. Driven through the running game: every system comes
back at 100 with energy at 63, the bill is charged, and the four weapon prices appear after
enlisting.

### The two "one time per trip" gates

Both print the same sort of thing and only one of them means it.

```
SHORE LEAVE  2106  IF PEEK(38149) = 1 THEN "ONLY ONE TIME PER TRIP, SIR."    a base
             2107  POKE 38149,1
             2210  IF PEEK(38389) = 1 THEN "ONE TIME PER TRIP."              troops
             2220  POKE 38389,1
             2285  IF TR + EN > 20000 THEN ... POKE 38389,0: GOTO 2200
H/D           105  POKE 38206,0: POKE 38389,0: POKE 38149,0
```

H/D line 105 is the deliberate reset: a hyperdrive jump is what makes a trip a trip. But
**38149 is not only the base flag** - three other lines use the same byte to pass a message:

```
STARSHIP SIMULATOR    9  POKE 38149,7
                    182  IF PEEK(38149) = 7 THEN POKE 38149,0: GOTO 200
GALAXY MAP         3260  POKE 38149,8 ... RUN COM
COM                1007  IF PEEK(38149) = 8 THEN POKE 38149,0
```

Line 9 runs every time STARSHIP SIMULATOR starts and pokes 7 **unconditionally**, so returning
to flight destroys whatever the base flag held, and 182 then clears it to 0 on the first pass.
`oracle/probe_tripgates.mjs` measures it rather than arguing it, reading both bytes at each step
of COM -> GROUND FORCES -> COM -> flight:

| where | 38149 | 38389 |
| --- | --- | --- |
| set in COM | 1 | 1 |
| after `RUN GROUND FORCES` | 1 | 1 |
| back in COM | 1 | 1 |
| **after returning to flight** | **0** | **1** |

So a base is **one per landing** and troops are **one per jump**, although both lines say
"trip". Nothing writes 38389 but SHORE LEAVE and H/D, which is why it survives.

Two smaller things in the same corner. 2107 sets the flag **before the price is even shown**, so
being turned away at 2130 for want of credits still spends the attempt - and answering N at 2140
spends it too. And 2285 hands the trip back when the troop count asked for would take the total
over 20000, while 2280's "you don't have the credits" does not; so an impossible number is free
and an unaffordable one is not.

The port had neither gate: `baseRefusal2100` already took `alreadyTriedThisTrip` as an argument
but nothing supplied it, and ENLIST TROOPS had no check at all. `gameState` now carries
`baseTriedThisLanding` and `enlistedThisTrip` - named for what they actually do - cleared by the
cockpit's own init and by the hyperdrive respectively. ESTABLISH BASE also now calls
`baseRefusal2100` and `baseCost2170` instead of re-implementing both inline.

Driven through the running game: a second base attempt in one landing gives "ONLY ONE TIME PER
TRIP, SIR.", a second enlistment gives "ONE TIME PER TRIP.", and after COM's RETURN to flight the
base flag is clear while the enlist flag is still set.

### The fitted projection, and its removal

For most of this port the renderer went through `src/engine/diskProjection.ts`: a file generated
by `oracle/fit_projection.mjs`, which solved for focal lengths of 230.90 and 212.80 from screen
captures, rotated in floating point by heading and pitch, read the machine's sine and cosine back
as floats, and clipped against a rectangle `probe_clip.mjs` had measured by drawing long lines
and seeing where they stopped. It was a good fit. It was not what the machine does, and every
stage of it has since been replaced by something read off the disk:

| the fit had | the disk has |
| --- | --- |
| two-angle float rotation, Q15 tables read as floats | `diskRotation.ts` - three angles, `$654E`'s matrix, `$609A`'s lossy quarter-cosine and the typo at entry 25 |
| focal lengths solved for from captures | `diskProjectionFixed.ts` - `$635C`'s asymmetric multiply and `$6468`'s non-restoring divide, with the per-object scale |
| a screen rectangle fitted to x 2..277, y 0..123 | `diskPipeline.ts` - `$67EF`'s outcode and `$61B7`/`$6979` clipping in **camera space**, against \|x\| <= z and \|y\| <= z |

The fitted focal lengths turned out to be the object scale seen one step removed:
`2 * 69 * factor0 / factor2` is 231.42 against 230.90, and `62 * factor1 / factor2` is 212.93
against 212.80. That is why it fitted so well and why it was never going to be exact.

**How close it got, for the record.** Over the 269 vertices of a live render the float path landed
**0.81 px from the fixed one on average, 2.41 px at worst**. Close enough to look right for a
long time; wrong everywhere it mattered. Measuring that gap is the last thing the file was used
for, and the number is recorded here so deleting it costs nothing.

Nothing drew through any of it by the end. What kept it in the tree was three things that had
nothing to do with projection: a `Vec3` interface identical to the one in `math3d.ts`, the
`NEAR_Z = 1` guard, and one line in `pipeline_parity.mjs` reporting the gap above. `Vec3` now
comes from `math3d.ts`, `NEAR_Z` has moved into `diskPipeline.ts` with the reason it exists - it
is the port's near plane and not the machine's, which divides by a negative z quite happily and
returns the point mirrored through the origin - and the report line is gone.

`fit_projection.mjs` itself is kept: it is how the constants were first found, and
`captured/projection_fit.json` records what it measured. It no longer writes into `src/`, only
`captured/projection_source.ts.txt`, so re-running it cannot put dead source back.

### The object scale, in every view that draws

`$690F` is `INY / LDA ($9B),Y / STA $600D,Y / CPY #$06 / BNE $690F` - six bytes copied out of the
model stream into `$600D-$6013` - and `$6631` reads three of them back as 16-bit factors that
scale the three rows of the rotation matrix. The mechanism is **per object**, so a model could
carry its own triple, and the port carried one: `SNAPSHOT_SCALE = [16000, 32767, 9541]`, taken
from the single object in the flight snapshot and handed to the cockpit and the radar alike.

`oracle/probe_objectscale.mjs` traps `$6631` in every view that draws through `$6000`:

| view | calls to `$6000` | objects per call | scale |
| --- | --- | --- | --- |
| flight, ship in space | 31 | 1 | 16000, 32767, 9541 |
| in atmosphere, the ground | 19 | 1 | 16000, 32767, 9541 |
| far out, the starfield | 19 | 1 | 16000, 32767, 9541 |
| radar | 1 | 1 | 16000, 32767, 9541 |
| ship I.D. | **0** | - | does not use the renderer |

**One triple everywhere**, so the port was right, and is now right for a reason. The middle
factor is `$7FFF`, which `$6631` takes as "skip the multiply", so row 1 passes through untouched.

Three things worth keeping from how this was measured.

- **`$6000` draws one object per call.** It is called once per object, not once per scene. The
  first reading of this probe said "31 objects, one scale" and looked conclusive; counting the
  calls to `$6000` alongside the hits showed it was 31 calls of one object each, which is a much
  weaker fact. It needed a second and third state - atmosphere for the ground, and a long way out
  for the starfield - before "one scale everywhere" meant anything.
- **The ship I.D. screen does not use this renderer.** It loaded and ran and executed **zero**
  instructions anywhere in `$6000-$6FFF` over 120 million instructions. It draws from its own
  coordinate list, which is what `shipId.ts` already does.
- **Long raw stepping has to tick the emulator.** Three recordings in a row left the keyboard
  unserviced and COM would not start, and the state the flight variants poked in could not be
  put back either. The menu views are measured on a second machine booted fresh for them, which
  is cheaper than guessing which byte to restore.

### The print margin, derived

`WNDWDTH` at `$21` is not a width. `oracle/probe_printmargin.mjs` collects the addresses the
hi-res character generator at `$9300` actually executes while COM prints its menu - 80 of its
256 bytes, entered at `$933C` 615 times - disassembles only those, and the wrap comes out as:

```
$93D6  INC CH
$93D8  LDA CH
$93DA  CMP WNDWDTH
$93DC  BCC ...            ; still inside the window
$93DE  LDA WNDLFT
$93E0  STA CH             ; otherwise back to the left margin, on the next line
```

`CH` is an **absolute screen column**, not an offset into the window. So the window is columns
`WNDLFT .. WNDWDTH - 1` and it holds `WNDWDTH - WNDLFT` of them. The Apple II monitor's own
`COUT1` does exactly this with the same two bytes, so the generator is reproducing the ROM's
geometry rather than inventing one.

That is the whole puzzle:

| | window | holds | prints | result |
| --- | --- | --- | --- | --- |
| GROUND FORCES 100 | `POKE 32,0: POKE 33,40` | 40 | 40 | all forty columns blanked |
| SUPPLY 10 | `POKE 32,1: POKE 33,39` | **38** | 39 | columns 1-38 blanked; the 39th space wraps to the next row, and column 39 keeps what was under it |

Measured over sixteen window settings, every one landing where the rule predicts:

| left | width | printed | columns written |
| --- | --- | --- | --- |
| 0 | 40 | 40 | 0..39 |
| 1 | 39 | 39 | 1..38 |
| 2 | 38 | 38 | 2..37 |
| 5 | 30 | 30 | 5..29 |

The first attempt at this grid set `CH` to 0 rather than to the left margin, which made every
window start at column 0 and hid the rule completely. `HOME` leaves `CH` at `WNDLFT`, and
starting there is what makes the numbers mean anything.

`windowColumns(wndLeft, wndWidth)` in `hires.ts` is the rule, with the disassembly in its
comment; `supply.ts`, `status.ts` and `groundForces.ts` call it instead of carrying a hard 38
or 40 that nobody could account for.

### The empty inverse PRINT, which was neither empty nor a PRINT problem

S/X line 5 listed as `HCOLOR= 0: Y1 = 20: POKE 973,255: PRINT ""` and left the page solid
white, which looked like a newline doing something extraordinary. **The listing was wrong.**
The line's bytes end `BA 22 0C 22` - `PRINT "<$0C>"`, a form feed inside the quotes.
`detokenise.mjs` was writing control characters out as themselves, which a terminal does not
show, so the string read as empty. It writes them in caret notation now, and the line reads
`PRINT "^L"`. Line 3 turns out to be `PRINT "^DBLOAD EXPL"` - the Ctrl-D that starts every DOS
command, invisible until now in every listing quoted in this file.

The rest follows from the generator, traced by running the character through `$FDED` and
disassembling only what executed:

```
$933F  CMP #$8D        ; carriage return? no
$9343  CMP #$8C        ; form feed - clear the screen
$9347  LDY #$00
$9349  STY $2A         ; a pointer at the base of the hi-res page
$934B  LDA $3CE        ; 974 is the page's HIGH BYTE: 32 is $2000, 64 is $4000
$934E  STA $2B
$9350  LDA $3CD        ; 973, the inverse flag
$9353  CMP #$FF
$9355  BEQ $9358       ; inverse, so the fill byte stays $FF
$9358  STA ($2A),Y     ; and 8192 bytes of it go down
```

Measured on a page seeded at 5,760 lit:

| character | inverse flag | pixels lit after | solid rows |
| --- | --- | --- | --- |
| form feed `$8C` | 0 | **0** | 0 |
| form feed `$8C` | 255 | **53,760** | 192 |
| carriage return `$8D` | 0 | 5,760 | 0 |
| carriage return `$8D` | 255 | 5,760 | 0 |

and on the real S/X, line 5 hands the generator exactly two characters - `$8C` at CH 0, CV 16
with `$3CD` at 255, then `$8D` at CH 0, CV 0 - with `$2000` going `$00` to `$FF` between them.

**974 is the page, not a mode.** That also explains the `POKE 974,64` before every DOS command
on this disk: it points the generator at `$4000`, so the command echo lands on the page nobody
is looking at.

Three wrong turns worth recording, because each looked plausible:

- **The carriage return does nothing.** The first test pushed `$8D` through `$FDED` with the
  inverse flag set and the page did not change - which is correct, and would have been the end
  of it if the conclusion drawn had been "so the premise is wrong" rather than "so try harder".
- **Line 6's five hundred `CALL EX` do nothing to the page either.** EXPL at `$9270` is a sound
  routine - `LDA $C030` and a shift register - and 500 calls leave every pixel where it was.
- **The generator has no scroll.** A carriage return on the last row wraps `CV` to 0 and that
  is all, so no amount of scrolling could have filled anything.

What settled it was running S/X for real and reading the accumulator at `$933C`: two
characters, and the first was not the one the listing implied.

### Every control character hidden inside a string

Making `detokenise.mjs` show control characters turned one listing from a puzzle into three
plain lines, so the obvious question was what else had been invisible.
`oracle/probe_controlchars.mjs` reads the tokenised bytes of all twenty-three Applesoft programs
straight off the disk image and reports every control byte between quotes:

| byte | what it is | count | where |
| --- | --- | --- | --- |
| `$04` | Ctrl-D, the DOS command prefix | 159 | 23 programs |
| `$0C` | form feed, clears the page | **2** | S/X 5, GALAXY MAP 3000 |

and nothing else at all. Every one of the 159 Ctrl-Ds is the **first byte of its string**, which
is exactly what DOS reads them for, so none of them is doing anything but opening a command.
That is the useful shape of this result: the sweep is complete, and the only thing the listings
were hiding is two form feeds.

One of the two was already run down - S/X line 5, which whitens the page because 973 is 255
there. The other is new:

```
GALAXY MAP 3000  POKE 32,0: POKE 33,39: POKE 34,19: POKE 35,23: PRINT "^L": HTAB 1: VTAB 20
```

`oracle/probe_galaxyclear.mjs` drives COM's central-computer menu into the map and records the
character with the flags as the generator saw them: **973 = 0 and 974 = 32**, so this one fills
page 1 with `$00` - the whole page black - and `hires.hgr()` in `galaxyMap.ts` is the right
equivalent. The window `POKE`d on the same line makes no difference: the fill starts at the page
base and runs 8192 bytes whatever `$20-$23` hold.

**COM has a line 3000 too**, `PRINT " ": PRINT "^DRUN GALAXY MAP"`, so a probe that waits for
"line 3000" and then starts watching is watching the wrong program. The first run of this did
exactly that and recorded COM's trailing carriage return with COM's text window, which read
plausibly and meant nothing. The reading that counts is the one taken at the form feed itself.

Line 3000 also ends with `HTAB 1: VTAB 20`, so Applesoft's current line sits at 3000 for a while
*after* the PRINT has gone - which is the second way to start watching too late and see only the
carriage return that follows.

### EX line 6's XDRAW

```
5 HCOLOR= 3: Y1 = 20: EN = 30841: EX = 37494
6 SCALE= 2: XDRAW 2 AT 140,65: XDRAW 15 AT 140,65: XDRAW 16 AT 140,65:
  XDRAW 17 AT 140,65: XDRAW 18 AT 140,65: ... SCALE= 1
```

`XDRAW` EORs a shape's bits into the screen instead of storing them, and EX never clears: the
flash goes straight over the live flight view. The port drew these, which is the same thing over
empty space and not the same over a star, and that was recorded as a known simplification rather
than something measured.

Nothing about it can be settled from a finished screen, so `oracle/probe_exflash.mjs` captures
the hi-res page **immediately before and immediately after line 6**. The difference is exactly
the five shapes XORed onto whatever was underneath:

| | |
| --- | --- |
| pixels the five XDRAWs turned **on** | 1,036 |
| pixels they turned **off** | **98** |
| where the flash lands | x 112-168, y 37-93, at SCALE 2 |

The 98 settle it: a DRAW cannot take a pixel away. They are also exactly what the port used to
get wrong - the pixels it left lit because it painted where the machine inverted.

`Hires.hplotXor` toggles instead of storing, `ShapeRenderer.xdraw` uses it rather than being an
alias for `draw`, and `ex_parity.mjs` now replays the machine's own "before" page through the
port's `drawExFlash` and diffs it against the machine's "after":

| | |
| --- | --- |
| the disk turned on / off | 1,036 / 98 |
| the port turned on / off | 1,036 / 98 |
| pixels differing after line 6 | **0** |

Catching line 6 needed stepping rather than frame polling - lines 0 to 6 go past in a moment -
and the slack came from line 4's `BLOAD SOUND GEN`, whose disk access lasts long enough that the
program is detected and the stepper is watching well before the XDRAWs arrive.

The buffer holds a colour per pixel rather than the machine's packed bits, so the toggle is
lit-to-dark and dark-to-lit. Under a phased `HCOLOR` the port's `argbAt` returns 0 for the
columns the colour does not paint, and `hplotXor` keeps that rather than inventing a rule: the
only XDRAW measured here runs under `HCOLOR= 3`, which paints every column.

**EX line 6 is not the only XDRAW on the disk.** A sweep of all twenty-three programs finds
them in three shapes, and only the first is now settled:

| where | what | how it stands |
| --- | --- | --- |
| EX 6 | five shapes, once, over the flight view | measured and exact |
| STARSHIP SIMULATOR 1100, 1200-1222 | the missile flashes | measured: they leave the page unchanged, see below |
| STARSHIP SIMULATOR 1010/1060, 5090/5095, 5250 | draw, move, draw again to erase | harmless: the port re-renders each frame |
| GALAXY MAP 3120/3200 | the cursor, toggled forever | measured on a star and exact, see below |

### The missile flashes leave nothing behind

```
1085 IF HIT = 1 THEN GOSUB 1200: J1 = 10: J2 = 120: GOSUB 1535: GOTO 1090
1088 GOSUB 1100
```

so a missile that connects flashes at 1200-1222 and one that misses flashes at 1100. 5250 calls
1100 as well, when the ship's return fire kills a ground battery. Both are wrapped in
`FOR X0 = 1 TO 2`, so every shape at every scale and rotation is XDRAWn an **even** number of
times - and XDRAW is its own inverse.

That reading predicts the page comes back exactly as it was. `oracle/probe_destructionflash.mjs`
captures it at the moment the subroutine is entered and again at the moment it returns:

| | steps | pixels on | pixels off |
| --- | --- | --- | --- |
| 1100, a miss | 277,121 | **0** | **0** |
| 1200-1222, a hit | 564,005 | **0** | **0** |

So these are pure flicker, and the port having no shapes for them is right in every way a pixel
comparison can see. What it owes the original is a **transient** flash that restores the page,
which is what `cockpit.ts`'s `flashes` entry already is.

Three things this took, none of them guessable from the listing:

- **The boundary is the RETURN, not a change of line number.** Both subroutines `GOSUB 4100`
  partway through, so watching for a line outside their own numbers stops after 1,477
  instructions and measures nothing. Run to the caller's line instead - 1085 for the hit, 1088
  for the miss - and the same flash takes 277,121 and 564,005.
- **`X`, `Y` and `Z` are frozen.** Line 8 reads the ship position out of 29467/29469/29471 once,
  and **nothing on the disk jumps back to line 8**. So 1050's box test and 192's damage box both
  compare against wherever the ship was when STARSHIP SIMULATOR last started, and poking the
  position bytes mid-flight changes nothing. Arranging a hit means poking them and restarting
  the simulator through COM's RETURN so line 8 reads them again.
- **One case per machine.** Firing twenty missiles to find a miss empties the rack and moves the
  ship, and the hit needs a restart on top of that; both in one session left the second case
  never reaching its line.

### The galaxy map cursor, on a star

```
3110 PX = PDL(0) * 1.19: PY = PDL(1) ... clamps ...
3120 XDRAW 12 AT PX,PY
3130 IF PEEK(-16287) > 127 THEN 3210
3200 XDRAW 12 AT PX,PY: GOTO 3110
3210 HCOLOR= 0: DRAW 12 AT PX,PY
```

The port drew the cursor, on the reasoning that over the map's black background a DRAW and an
XDRAW come to the same thing. **At the paddles' resting position that is true** - the thirteen
cursor pixels at PX 148.75, PY 125 land on no lit map pixel at all - which is exactly why the
capture already in the tree could never have told the two apart. The cursor roams x 10-270 and
y 10-145 though, and that is where the stars are.

`oracle/probe_galaxycursor.mjs` drives the paddles onto one and measures:

| | pixels on | pixels off |
| --- | --- | --- |
| 3120's XDRAW, cursor over a star | 11 | **2** |
| 3210's black DRAW, against the clean map | 0 | **2** |

Two pixels going dark under the cursor is something a DRAW cannot do. And **3210 is not an
XDRAW**: 3130 jumps there with the cursor still on the screen and `HCOLOR= 0: DRAW 12` paints it
black rather than toggling it off, so picking a star leaves a cursor-shaped hole wherever it
overlapped. The hole stays until 3270's `GOTO 3000` repaints the map.

`drawGalaxyCursor` now XDRAWs, `eraseGalaxyCursor3210` does 3210's black draw, and the scene
paints the map **once** and toggles the cursor over it instead of repainting every pass - which
is what had been hiding both effects. `galaxymap_parity.mjs` checks them against the machine:
11 on / 2 off and 0 on / 2 off, both exact.

Two things about aiming, neither guessable:

- **A star is not drawn where 3230 looks for it.** The hit test is
  `INT(PX / 10) <= X(P) + 1 ...`, but 3215 has already done `PX = PX + 35` by then, so reading
  the star bytes and aiming at `(X * 10, Y * 5)` puts the cursor 35 pixels off and over nothing.
  Aiming at a pixel that is actually lit on the captured page needs no mapping at all.
- **Calibrate below the clamp.** The paddle-to-PX scale is solved from two samples, and 3110's
  `IF PY > 145 THEN PY = 145` means a sample taken high reads back clamped. Calibrating from
  0.5 and 0.8 gave a slope fitted to a flat line and sent the cursor to PY 0; 0.2 and 0.5 put it
  where it was asked for.

### Where a new game's ship comes from

38199 reads 63 on a fresh ship and no BASIC program pokes it, so the value had to arrive with a
BLOAD. It does, and it does not arrive alone:

```
START 2020  BLOAD SHIP'S DATA-M,A$9506
```

54 bytes at `$9506`, which is **38150 to 38203** - the whole ship. Every weapon count, every
system's health, the loot, the morale and the mode flags are that one file. (START 3020 loads
`SHIP'S DATA` instead for a saved game; there is no such file on this disk, so a fresh image
always starts from the master.)

Read back from a freshly booted game, **49 of the 54 bytes are still exactly what the file
holds**. The five that are not have two writers, both found by watching the bytes and recording
the PC and the current line rather than by reading the listings:

| byte | | file | first frame | who |
| --- | --- | --- | --- | --- |
| 38187 | missiles aboard | 100 | 60 | START 2030's `POKE 38187,60` |
| 38158 | the troops' planet | 50 | 1 | START 2030's `POKE 38158,1` |
| 38201 | shields on | 1 | **0** | INSTRUMENTS 210's `CALL 38402` |
| 38202 | missile mode | 0 | **1** | INSTRUMENTS 210's `CALL 38402` |
| 38165 | condition | 2 | **3** | INSTRUMENTS 210's `CALL 38402` |

`CALL 38402` is `$9602`, inside TRANLIT.OBJ0, and the three writes come from `$9669`, `$968D`
and `$96DE`. So the game opens with the **shields off, in missile mode, at red alert** - none of
which any BASIC line says.

The opening ship, then:

| | |
| --- | --- |
| speed | **120**, flat out |
| energy | **63**, not 100 - and SHORE LEAVE 2525 refills it to 63 too |
| env. control | **128**, which is over the 100 everything else sits at |
| shields | 100, and **off** |
| condition | **red** |
| weapon | **missiles**, 60 aboard |
| troops | **2000**, and not from this file at all - see below |
| troops' state | **3, cryogenic sleep**, on planet 1 |
| transports / fighters / tanks / ground missiles | **6 / 75 / 0 / 0** |
| morale | 6, excellent |
| everything else | 100, and the whole cargo hold empty |

The port had eight of those wrong - speed 60, condition green, env 100, troops, transports 4,
fighters 8, tanks 8, ground missiles 8, and the troops on board rather than frozen. It starts
where the disk starts now, checked in the running game.

**The troop count is not in this file.** A note here claimed STATUS displays it as
`PEEK(38167) * 256 + PEEK(38159)`, and 3 and 20 sit at those addresses, which gives a tidy 788.
STATUS 1330 is `PRINT "NO. OF TROOPS"; TAB(18);"-"; TAB(24);TR` - the Applesoft variable - and
five programs fill it the same way:

```
OPEN MISC FILE: READ MISC FILE: INPUT SD: INPUT TR: INPUT CR: CLOSE
```

at SHORE LEAVE 11, GROUND FORCES 11, SUPPLY 5000, STATUS 5000 and H/D 6. **MISC FILE**, a text
file on the disk, holds `100.3`, `2000`, `10000` - the stardate, the troops and the credits. So
a new game has **2000** troops, and whatever 38167 and 38159 are, they are not that. 788 was a
plausible number from a wrong reading, which is the kind that survives longest.

### COLLECT at tech 1, run at last

`805 ON TECH + 1 GOSUB 820,840,910,1070,1090` sends a primitive planet to 840, and no assault
had ever gone there - every planet played has been tech 3. Forcing the planet's tech byte
(`TECH=1 node probe_rndloot.mjs`) reaches it, and the path is three lines with three oddities:

```
840 PRINT "PLANET IS PRIMITIVE. THE ONLY LOOT": PRINT "IS A LITTLE GOLD AND SILVER AND SOME":
    PRINT "WINES AND LIQUORS, SIR."
850 J = PEEK(38183) + (RND(1) * 5): IF J > 255 THEN J = 255
860 POKE 38183,J
870 F = PEEK(38182) + (RND(1) * 5): IF J > 255 THEN J = 255
880 POKE 38182,J
890 J = PEEK(38173) + (RND(1) * 10): IF J > 255 THEN J = 255
900 POKE 38173,J: RETURN
```

- **870 works the silver out into `F`, tests `J`, and 880 stores `J`** - still gold's value.
  Silver always comes out equal to gold. On the machine: gold 2, silver 2.
- **The draw 870 makes is thrown away and still advances the stream.** The whole path costs
  three draws, not two, which is what a replay would trip over if the discarded one were left
  out. The recording is 21 draws: 18 for the combat round and 3 for the loot.
- **840 promises "WINES AND LIQUORS" and 890 credits 38173**, which is luxury food. Wine is
  38172 and this path never touches it - measured, 0 before and 0 after.

`replay_parity.mjs` drives the port's `awardLoot` at tech 1 with the machine's own three draws:
gold, silver and luxury food all agree to the unit, silver equals gold, the port takes exactly
three draws, and 31180 stays where it was - 960's typo is on the 920 path, which tech 1 never
reaches.

The port had already transcribed all three; this is the first time any of it has been run.

### H/D lines 90-93, and what else a jump moves

```
16 ... POKE 38152,0: POKE 38240 + PEEK(38163),1
25 POKE 38823, PEEK(38163): POKE 38824,0: CALL 38825
26 POKE 38209, PEEK(38163)
90 TECH = PEEK(38282 + PEEK(38209)): IF TECH < 2 THEN POKE 38150,0
93 IF TECH > 1 THEN POKE 38150,TECH * 60: POKE 38204,TECH * 60: POKE 38160,0: POKE 38161,0
```

A reading taken once before said 38150 came out 0 after jumping to planet 5, whose tech is 2 -
where 93 should have left 120. It was taken after the simulator had resumed, so it could not say
whether 93 never ran, ran with a different TECH, or ran and was overwritten.

`oracle/probe_hdjump.mjs` watches the bytes through the whole jump instead, recording the line
and PC at every change. **The earlier reading was simply wrong.** Jumping to planet 5:

| byte | | line | PC |
| --- | --- | --- | --- |
| 38152 | 77 -> 0 | **16** | `$E783` |
| 38204 | 77 -> 20 | **25** | `$97D2` |
| 38209 | 1 -> 5 | **25** | `$97D2` |
| 38150 | 77 -> **120** | **93** | `$E783` |
| 38204 | 20 -> 120 | 93 | `$E783` |
| 38160 | 1 -> 0 | 93 | `$E783` |
| 38161 | 77 -> 0 | 93 | `$E783` |

120 is `TECH * 60`, and it holds into the simulator. Three things came with the answer:

- **Line 25's `CALL 38825` moves 38209, not line 26.** `$97D2` is inside TRANLIT.OBJ0, and the
  routine loads the destination's record - 38204 arrives with it, at **150** for SOL, **20** for
  VARCAR and **0** for a tech 1 planet. Line 26's `POKE 38209, PEEK(38163)` writes a value that
  is already there.
- **38152 is cleared at line 16, on every jump.** Not in 93's branch, and not conditional on
  tech. Confirmed on a tech 1 arrival as well as a tech 2 one.
- **38161 is written once on the whole disk and never read.** Line 93's `POKE 38161,0` is the
  only write to it anywhere, and nothing peeks it.

A tech 1 arrival takes 90's branch instead, and what it does *not* do is as informative: 38150
goes to 0, but **38160 keeps its old value and 38161 is left alone** - a marker written there
before the jump was still sitting in it afterwards.

The port had `shipVitality = 0` inside the tech >= 2 branch, standing in for 93's dead
`POKE 38161,0`, so a jump to a primitive planet carried the previous system's enemy damage
across. It is line 16's now, unconditional. `shipDestructionLimit` is loaded from the
destination's record first, the way line 25 does it, so a tech 1 arrival gets the planet's own
number rather than keeping the last one; `PlanetState` carries `destructionLimit` for it, which
`DISK_PLANETS` already had.

### The five display-list opcodes nothing uses

`$6162` reads an opcode, ends the list on anything with bit 7 set or at or above `$12`, and
otherwise jumps through the 18-entry table at `$6076`. Thirteen entries had been read because a
list on the disk uses them. These five had not, and they are all inside LO-HI A2-3D1, so they
can be read without an emulator - and then run with one.

The loop's tail explains the lengths first: `$62C3 LDA #$02` falls into `$62C5 JSR $6184`, and
`$6184` adds A to the list pointer. So a handler ending `JMP $62C3` is a **two-byte** opcode and
one ending `JMP $62C5` advances by whatever it put in A.

| op | handler | bytes | what it does |
| --- | --- | --- | --- |
| 8 | `$6D44` | 2 | fills the 32-entry table at `$6CE0` (stride 3) with `$20..` or `$40..` and sets `$6CDD`; the parameter's bit 0 picks the page and bit 1 the flag, and it skips the fill when the table is already there, then `JSR $6CDA` |
| 9 | `$7148` | 2 | **which page the line routine draws into**: the high nibbles of the row table at `$6B93`, and eight self-modified bytes - `$6FF0`/`$7063` the page, `$6FF7`/`$709E` page − 4, `$701B`/`$70E5` page + `$20`, `$7023`/`$7120` three past that |
| 12 | `$718A` | 2 | **draw mode**: thirteen sites in the line routine between `$11` `ORA (zp),Y` and `$51` `EOR (zp),Y` - draw or erase - and closes an open recording |
| 16 | `$632A` | 1 | `$C053`, `$C057`, `$C050`, `$C054`: mixed, hi-res, graphics, page 1 - then falls into 17 |
| 17 | `$6338` | 1 | `LDA #$01 / JMP $62C5`, the no-parameter tail |

Reading a handler is not the same as knowing what it does, so each was **executed** on the
machine with a list of its own - `[op, param, $FF]`, the `$FF` stopping `$6162` - and the bytes
it patches read either side:

| | |
| --- | --- |
| op 12, parameter 1 | 13 of 13 sites `$11` -> `$51` |
| op 12, parameter 0 | 13 of 13 back to `$11` |
| op 9, parameter 0 | 8 of 8: `$40` -> `$20`, `$3C` -> `$1C`, `$60` -> `$40`, `$63` -> `$43` |
| op 8, parameter 0 then 1 | `$6CE0` onward `$40 $41 $42` <-> `$20 $21 $22` |
| op 17 | 17 instructions, list pointer on by **1** |
| op 16 | 22 instructions, pointer on by 1 - the five extra being `LDA #$00` and four `STA $C0xx` |

**A one-byte opcode must not be given a parameter byte.** The first attempt handed 16 and 17 the
same `[op, param, $FF]` as the others, and `$6162` read the parameter as the next opcode - a 0,
which is op 0, which plotted a point and ran on for 9,400 instructions. With `[op, $FF]` both
come out at 17 and 22.

So op 12 is the renderer's own XDRAW, op 9 its page select, and 16 the display mode - a
double-buffered, erasable drawing system the shipped game never asks for. Nothing on the disk
emits any of the five, and the port's parser stops at anything outside 0-4, which comes to the
same thing for every list it is given.

### The stardate, and the only thing that moves it

STATUS prints `STARDATE :` and the port's never changed: 100.3 from the first frame to the last,
because nothing advanced it. **H/D line 6 is the whole calendar:**

```
6 OPEN MISC FILE: READ MISC FILE: INPUT SD: INPUT TR: INPUT CR: CLOSE
  SD = SD + D1 + .3
  OPEN MISC FILE: WRITE MISC FILE: PRINT SD: PRINT TR: PRINT CR: CLOSE
```

Nothing else on the disk assigns SD - every other program reads it and writes it back unchanged
- so time passes only when you jump, and by the same `D1` the jump charges to energy. `D1` is
`INT(SQR(X1^2 + Y1^2 + Z1^2) + .6)` where lines 10010's three variables are all the **same**
expression, so it is `|dX| * sqrt(3)` rounded.

Played: Sol to Sirius costs 4, energy goes 63 to 59, and the stardate goes 100.3 to **104.6** -
`100.3 + 4 + 0.3`. STATUS shows it.

This was found by playing rather than by a harness, and it is the sort of thing no harness here
would have found: every capture is a single screen, and a clock that never ticks looks exactly
like a clock in a screenshot.

### Leaving the galaxy map goes through INSTRUMENTS

Playing the port, leaving the map left its bottom band - "GALAXY MAP" and "--PRESS SPACE TO
RETURN--" and the rule above them - sitting under COM's menu. COM line 20 floods only rows
0-123, so nothing it draws would cover rows 152-191, and the residue looked as though it might
be what the disk does too.

The disk does not go straight there. GALAXY MAP 3125 is

```
IF PEEK(-16384) > 127 THEN POKE -16368,0: POKE 38391,77: POKE 38388,7: RUN INSTRUMENTS
```

so a key press runs **INSTRUMENTS**, which repaints the panel; INSTRUMENTS 210 finds 38391 at 77
and so does not run the simulator, falling through to 220's `RUN GALAXY MAP`; and GALAXY MAP
line 1 finds 38391 = 77 with 38388 = 7 and runs COM. Three programs to get from the map to the
menu, and the middle one draws the whole bottom of the screen.

`oracle/probe_comband.mjs` watches it happen and counts the rows the band occupies:

| | |
| --- | --- |
| programs on the way | GALAXY MAP -> **INSTRUMENTS** -> GALAXY MAP -> COM |
| rows 152-191 on the map | 703 pixels lit |
| rows 152-191 in COM | 1808 pixels lit |
| of the map's band, still lit in COM | 203 |

So the bottom is repainted and what is there in COM is the instrument panel, not the caption.
The port now draws the panel on the way out, and the COM screen that follows is the full one -
command menu, damage control and panel - rather than a menu over the map's leftovers.

This is the third thing in a row that only playing found. A screen capture of COM matches the
disk perfectly either way, because the capture is of COM reached from *flight*; it is the
transition that was wrong, and nothing here captures transitions.

### Transitions, which nothing here was capturing

Every capture in this directory is of **one screen reached one way**. Three bugs in a row turned
out to live in the getting there instead:

- the ground wireframe was never drawn, because the atmosphere branch called something else
- the stardate never advanced, because only a jump moves it and nothing did
- the galaxy map's caption sat under COM, because the disk goes through INSTRUMENTS

`com_parity.mjs` matches the disk on every one of 34,720 pixels and could not have caught the
last of those: its capture is of COM reached from **flight**.

So `oracle/probe_transitions.mjs` walks a route on the machine and captures the page after each
step, with the programs each step ran, and `oracle/transition_parity.mjs` drives the port along
the same route and compares. Two things about driving it are worth keeping:

- **A key must be held longer than a pass.** STARSHIP SIMULATOR samples the keyboard once at
  line 200 and a pass is about half a second, so `a2.key`'s four-frame default is a race. The
  first run lost every press to it. Forty frames is reliable.
- **Settling has to be on a program this file recognises.** "(other)" is DOS part way through a
  load; treating that as settled sends the next key into a program that is not listening, and
  the route went to RADAR instead of the galaxy map. And the settle has to outlast an
  intermediate program - INSTRUMENTS runs for about a second between the map and COM.

The route, and what the disk runs along it:

| step | programs |
| --- | --- |
| flight -> COM | STARSHIP SIMULATOR -> COM |
| COM -> computer | COM |
| computer -> galaxy map | COM -> GALAXY MAP |
| galaxy map -> COM | **INSTRUMENTS -> GALAXY MAP -> COM** |
| computer -> status | COM -> STATUS |

**The harness does not pass, and that is the result.** It reports three distinct gaps:

| step | disk lit | port lit | differing | |
| --- | --- | --- | --- | --- |
| computer -> galaxy map | 1514 | 1520 | 20 | the cursor, not compared |
| computer -> status | 32991 | 32954 | **63** | a few characters |
| flight -> COM | 11698 | 10664 | **2690** | the panel: 3241 against 2207 |
| COM -> computer | 11862 | 3853 | **11893** | most of the screen |

- **The central computer submenu is nearly empty in the port** - 3,853 lit against 11,862. It is
  a screen no capture here covers, so nothing was measuring it.
- **The panel drawn on entering COM from flight is short by about a thousand pixels** (2207
  against 3241). After the galaxy map round trip the port draws 2993 against 3030, so the panel
  it puts up through `drawInstruments` is close and the one it puts up coming from flight is not.
- **STATUS is 63 pixels out**, which is a handful of characters somewhere.

None of those is fixed here. The point of this entry is that they are now measured and named
rather than waiting for someone to notice them while playing.

### The computer submenu

The submenu was the largest of those, and it is the one screen in COM that no other capture
reaches. Reading it off the disk:

    200 POKE 974,32: R = 1: GOSUB 21: HOME
    210 PRINT TAB( 1);"CENTRAL COMPUTER": PRINT
    220 PRINT "1) NAVIGATION COMP.": ... : PRINT "6) RETURN": PRINT
    260 PRINT "READY ";: GET C$

**The submenu inherits the screen; it does not rebuild it.** `GOSUB 21` falls through 21 and 25
into 29 -

    29 HOME: PRINT "<20 spaces>": HOME: VTAB 2: FOR X = 1 TO 12: PRINT "<20 spaces>": NEXT:
       PRINT "<20 spaces>";: HOME: POKE 32,1

which blanks **twenty columns over rows 0 to 13** and nothing else - and then 35, `IF R = 1 THEN
R = 0: RETURN`, takes it straight back out before 40 to 90 draw the damage-control grid on the
right and the `1,1 TO 139,1 TO 139,110 TO 1,110` box. The port was clearing forty columns over
sixteen rows and wiping both: 3,853 pixels lit against the disk's 11,862.

**TAB counts from the screen, not from the window.** Applesoft's `TAB(n)` stores n-1 into CH, and
the monitor takes CH as an absolute column; `WNDLFT` only comes back into it on a carriage
return. So `TAB(1)` is column 0, and the title sits one cell **left** of the menu beneath it,
which the disk's screen shows plainly. 210's trailing `PRINT` then puts the six options on rows
2 to 7 and 260's `READY ` - not `COMMAND?` - on row 9.

800 to 830 are the same shape for the navigation submenu: no TAB, so its title lines up with its
menu, two blank PRINTs before three options on rows 3 to 5, and `READY ` on row 7.

860 differs from both in one detail worth writing down: it is `R = 1: GOSUB 21: PRINT
"NAVIGATION COMPUTER"` with **no HOME**, so it prints where 29's own HOME left the cursor -
row 0, column 0, taken before 29's `POKE 32,1` moved the window edge. Its two digits are typed
on row 5 at columns 1 and 2 by `VTAB 6: HTAB 1 + J`, and 890 is `PRINT S$(C): PRINT "COURSE
SET."` with nothing above it cleared and no distance line; the port had invented one.

With those four screens corrected, `transition_parity.mjs` reports `COM -> computer` as exact
everywhere above the instrument panel:

| band | disk | port | differing |
| --- | --- | --- | --- |
| rows 0-40 | 3035 | 3035 | 0 |
| rows 41-123 | 5586 | 5586 | 0 |
| rows 124-191 | 3030 | 2993 | 63 |

The 63 are the panel, and they are the same 63 that STATUS and the return from it report - one
fault, in `drawInstruments`, counted four times. The panel entered from flight is a second,
larger one: 2205 against 3241, and on that step it is now the **only** difference.

### The instrument panel

The transition harness put two faults in the panel: 2,676 pixels on the panel COM shows coming
from flight, and 63 on the one it shows coming back through the galaxy map, the second of them
reported identically by four separate steps. Both turned out to be the same misunderstanding.

**The eight indicators are not lamps. They are bars, and GALAXY MAP draws them in BASIC:**

    5500 HCOLOR= CH: FOR J = LY TO LY + 4: HPLOT LX,J TO LX + 9,J: NEXT: RETURN

Ten pixels wide, five rows tall, at (7,153) (72,153) (200,153) (262,153) and the same four at
161 - one under each of MANUAL/AUTO, ORBIT/DAMAGE, MISSILE/LASER and COND/SHIELD. Lines
5000-5160 pick each bar's HCOLOR from a byte of game state, and those bytes are the ones $9602
reads: 38164 is $9514, 38165 is $9515, 38210 is $9542. So `LAMP_BYTES`, which
`probe_gauges.mjs` read out of $9602 a byte at a time, is just these eight bars in white or
green, with blue and orange for COND, written out as the bytes they land on. White is the full
run; green, blue and orange are half-density, which is why a bar is `$7f $07` one way and
`$55 $02` the other.

**The disk paints them two different ways, and the difference is visible.** $9602 **stores**
two whole byte columns, so it takes out whatever else was in them - the gauge boxes' own
vertical edges at x 17, 71, 82 and 272 disappear under it. 5500 **plots a line**, so only
LX..LX+9 is touched and those edges survive. `probe_panelpath.mjs` watched row 153 along the
route: entering COM from flight it reads `c0=$40 c1=$55 c2=$02`, and coming back through
INSTRUMENTS and GALAXY MAP it reads `c0=$00 c1=$55 c2=$0a`, the `$08` being the box edge at
x 17.

Which painter runs is decided by one line. INSTRUMENTS 210 is

    210 IF PEEK(38391) < > 77 THEN POKE 38189,10: CALL 38402: PRINT "^DRUN STARSHIP SIMULATOR"

and the return from the galaxy map arrives with 38391 = 77, so on that path INSTRUMENTS draws
the boxes bare and never calls $9602 at all; GALAXY MAP line 1's own `GOSUB 5000` fills them a
moment later. Two things were checked before believing this. `probe_lampmerge.mjs` filled page 1
with `$7f` and called $9602: the bytes came back unchanged, so it stores and does not OR, and
the surviving box edges cannot be its doing. `probe_lampphase.mjs` rendered the port's panel in
all 96 flag phases against every capture: none got below 63, so the residue was never a phase.

**And `c0` - the last 13 pixels - is COM's.** Line 20 ends

    POKE 32,0: HOME: FOR J = 1 TO 14: PRINT " ": NEXT

Fourteen blanks, one character cell each, down column 0 from the top of whatever text window COM
inherited. From flight that window is the default and they fall on rows 0 to 13, under the fill.
Coming back from the galaxy map, GALAXY MAP has left it at `WNDTOP 19, WNDBTM 23` - the band its
caption uses - so they fall on rows 19 to 23 and blank the first cell of four rows of the panel,
taking the gauge boxes' left edge at x 6 and the left end of the orange rule at x 5. The
character generator has no scroll, so once the prints reach the window's bottom they simply keep
rewriting that row. Measured: `probe_panelpath.mjs` reads `wnd L1 W39 T19 B23` all the way
through INSTRUMENTS and GALAXY MAP, and `c0` goes to `$00` at COM line 20.

**The panel the port was drawing in flight was its own.** Seven of INSTRUMENTS' lines instead of
its twenty-odd, the three titles in normal video instead of inverse, no X, Y, Z, XHDNG or YHDNG
labels, an invented third row of indicators labelled RADAR and H/DRIVE that the disk has no
trace of, and the five readouts printed on row 23 **on top of** the labels instead of on row 24
under them - STARSHIP SIMULATOR 155 is `VTAB 24`. It also rounded where `INT` floors.

Two senses had to be taken from the captures rather than from the words. The disk's flight
screen has 38164 and 38201 both at something other than 1, with the ship in manual and the
shields down, so 0 is the resting value of each. Reading MANUAL and AUTO as labels would have
got it backwards: white marks AUTO on the resting screen.

One more, found in passing: `drawComMainScreen` erases COM line 8's two needle tracks only when
it is handed the shape table, and `comScene` was not handing it one, so the speed and energy
needles the flight loop left at y 133 were still standing in COM.

With all of that, `transition_parity.mjs` reports the panel - rows 124 to 191 - as **exact on
every step of the route**, and five of the six compared screens exact in full:

| step | disk lit | port lit | differing |
| --- | --- | --- | --- |
| flight -> COM | 11698 | 11705 | **0** |
| COM -> computer | 11862 | 11869 | **0** |
| galaxy map -> COM | 11487 | 11487 | **0** |
| COM -> computer | 11651 | 11651 | **0** |
| status -> on | 34369 | 34369 | **0** |
| computer -> status | 32991 | 32991 | **0** |

Text row 23 - line 155's five numbers - is left out of the count on the two steps that carry it:
they are the ship's live position and the two machines are not at the same point in the same
flight.

### Settling on a screen that is nearly all ink

The capture, not the port, was wrong twice here, and the second way is worth writing down.

The first was settling on the **program**: `probe_transitions.mjs` waited until the loaded
program stopped changing, which caught COM between line 70 and line 90 - damage grid up, no
menu - and stored that as a finished screen. That is what the `galaxy map -> COM` step's 2,822
differing pixels were.

So it grew a second wait, for the drawing to stop. The first version of that **counted the
non-zero bytes** of hi-res page 1, and that measure is blind on exactly the screen that needed
it. STATUS floods rows 0 to 123 and then prints in inverse: nearly every byte in the region is
non-zero before a word is written, and knocking a glyph out of an inverse cell barely moves the
count. It settled on a page that had got as far as `CON` of `CONDITION:`, recorded 35,020 lit
against the port's 32,991, and I reported STATUS's first page as short by 2,029 pixels. It is
not. Hashing the page instead of counting anything about it gives 32,991 on both sides and
`transition parity: clean`.

The lesson is narrow and worth keeping: **a settle has to compare the thing itself, not a
statistic of it.** Any count can be stationary while the picture moves, and an inverse screen
makes that the normal case rather than the unlucky one.

### STATUS, with the numbers made awkward

`status_parity.mjs` reported both pages exact, but against one capture of one state - a fresh
ship, every system at 100%, condition RED, morale EXCELLENT!, troops in cryogenic sleep. A
screen full of the same three-digit number proves very little about the columns:
`PRINT "ENERGY  :";EN;"%"; TAB( 22);"CREDITS  :"` only puts the second field where TAB( 22) says
while the cursor has not already passed column 21, and the same goes for the `HTAB 22` in
5100-5120 and the `HTAB 24` on the troop page.

`status_values_parity.mjs` pokes the eighteen bytes the report reads to a mixture of widths -
a zero for missiles, one digit for shields, 250 for tanks, energy at 31 so line 1255's
`INT((31 / 62) * 100)` gives 50 - takes the branches the route's own capture never takes
(condition GREEN, morale FAIR, troops PLANETSIDE), and enters STATUS from COM the way a player
does. SD, TR and CR are not bytes, so they come off the machine's variable table: SD arrives as
100.30000001192093, which is the Applesoft float, and printing it as `100.3` is itself a check
of the nine-significant-digit rule.

Both pages: **30,093 lit against 30,093 and 31,466 against 31,466, nothing differing.**

### Playing it: the ship was five times too fast

Flying the port for a few seconds put the ship at X 18,000. Every bound the game uses is far
inside that - line 192 only runs the damage tick while X is between -3500 and 4500, Y between
-3000 and 3000 and Z between -6000 and 2000, and line 156 re-enters the atmosphere inside a
900-unit cube - so the whole game happens in a box the port was crossing in about five seconds.

`oracle/probe_flightspeed.mjs` measures it on both sides. Line 129 is the movement:

    129 ... X1 = S * (ZP * XH): Z1 = S * ZP * ZH: X = X + X1: Z = Z + Z1: Y1 = S * YP: Y = Y + Y1

so the step is the speed byte itself, once a pass. Sampling X, Y and Z out of line 8's own cells
at 29467, 29469 and 29471 often enough to see each jump gives steps of exactly **30, 60 and 120**
at those three speeds, **2.5 to 2.6 seconds apart at every one of them**. The step was right in
the port and the pass was not: it ran one every 500 milliseconds, from the repo's own reading of
a trace, and the comment in the source said so.

| speed | disk | port before | port after |
| --- | --- | --- | --- |
| 30 | 12.0 units/s | 60.0 | **12.0** |
| 60 | 24.0 units/s | 119.5 | **24.0** |
| 120 | 36.0 units/s | 239.2 | 48.0 |

The 120 row is the machine's own doing: its pass stretches to about 3.3 seconds at full speed
while the port's stays at 2.55, so the port is a third fast there and exact at the other two.
Two traps in measuring it are worth keeping. **The speed byte cannot be poked** - line 210 is
`POKE 38157,S` and runs every pass, so the BASIC variable puts it straight back, and the first
run of this got the same 36 units a second at every "speed". And **a two-byte read of X or Z can
tear**, because line 140 POKEs the two halves separately; at speed 120 that showed as steps of
-136 and 256 whose sum is the real 120.

Nothing in the pixel harnesses could have caught this. The flight view moves every frame and is
the one screen they do not compare.

### And three more things that only show up in play

**The flight view had a status line the disk has no trace of.** ENEMY:n and MIS:n across the
top, SURRENDERED under them, and banners for the autopilot and the commander bot. The only thing
STARSHIP SIMULATOR prints over the view is line 156's crosshair, and the disk's own flight
capture shows the star field, that crosshair and nothing else. All four readings are already on
the panel or in SHIP STATUS.

**RE's position bytes were being read unsigned.** Lines 27-35 leave the ship at `Y1 = 0: Y2 = 4`
and `Z1 = 168: Z2 = 228`, and those go through line 6600's decode, where a high byte of 128 or
more is negative: Y is **1024**, not 0, and Z is **-7000**, not 58,536. Taken unsigned, Z landed
past line 133's 20,000-unit wrap, so **every re-entry threw the ship to the edge of the map** -
flying into the planet put it at Z -19,365. RE's screen was wrong too: line 10 floods orange
(`HCOLOR= 5`), not black, and line 5's `POKE 973,255` makes the message at line 20 inverse with a
blank band above and below it. All of that is now in `src/scenes/reentryScreen.ts`, beside
ORBIT's, because `reentry.ts` is carrying another agent's uncommitted work.

**And the gauge under ORBIT is the atmosphere flag.** 38210 is not "in orbit": RE line 25 sets it
to 1 on the way down and ORBIT line 25 sets it back to 0 on the way up, and each of them paints
that very bar to match - RE white at its line 22, ORBIT green at its line 21, exactly what
GALAXY MAP's 5110 and 5120 would choose. The port was driving it from its own `inOrbit`.

### The ground assault

Attacking a planet showed four more, all of them in GROUND FORCES:

- **The instrument panel was being wiped.** Line 100 is `POKE 35,16: HOME: FOR C = 1 TO 16:
  VTAB C: PRINT <40 spaces>` - it blanks text rows 0 to 15 and nothing below them, so the panel
  stands under the battle. The port cleared the page.
- **The battle had effects of the port's own**: a white rule across the box, twenty
  pseudo-random dots, orange crosses, a coloured progress bar with its own frame, and a
  SURRENDER heading with a percentage under it, clipped to `URRENDER` at the right margin. The
  whole of the disk's per-round update is line 4010 - five numbers at HTAB 33 and the projection
  at VTAB 8, HTAB 18 - over the box lines 110 to 145 put down once.
- **The projection was printed a row too high**, beside PROBABILITY instead of OF SUCCESS :.
- **The messages were the port's own text.** Line 150's `POKE 973,255` is never put back except
  inside 4010, so everything printed during the assault is inverse, and line 170's blank is
  inverse spaces - rows 11 to 14 are a solid white band with the messages in black through it.
  The port printed green text on the fill, in half-width lines indented by one, where the disk
  prints single full-width lines from column 0.
- **The assault ended on the wrong quantity.** Line 670 is `IF TR = 0` - the troops. The port
  ended it when the transports ran out.
- **Any key retreats.** 1100 reads the key and 1110 works out which one it is, and then **1115 is
  `K = 82`**, unconditionally, so 1120's `IF K = 82` is always true. The port asked for R.

One thing found along the way and not acted on: **LT, the byte A, B, W and S poke to pick which
gauge $9602 updates, is 38167** - and STATUS line 1386 reads 38167 as the high byte of
`(PEEK(38167) * 256) + PEEK(38159)`, the count it tests for "THE TROOPS ARE ALL DEAD!". The two
uses are the original's, not the port's.

### COLLECT, and where a won assault actually leaves you

COLLECT itself is short - a message for the planet's technology, thirteen loot draws and a
sign-off - and `collect_parity.mjs` already had its band and both of the original's loot bugs
exact. What reading it end to end turned up was everything around it.

**COLLECT does not clear the band it prints into.** Lines 800 and 802 only move the cursor;
GROUND FORCES line 690 ran `R4 = 1: GOSUB 160` on the way here, so the band is already white and
carries nothing but "TROOPS ARE NOW COLLECTING LOOT.", which every one of these messages is long
enough to cover. The tech-2 branch at 910 is the exception: it waits, blanks the band itself and
then prints four lines.

**Line 17 is `POKE 38151,7`, and that is where a won assault ends.** COM line 98, between its box
and its menu, is

    98 IF PEEK(38151) = 7 THEN POKE 38151,0: POKE 974,64: PRINT "^DRUN GROUND FORCES"

so COM draws its whole screen and chains away without ever offering the menu. Four places set
that byte - GROUND FORCES 310 for an uninhabited world, 670 when the troops are all dead, 1130 on
a retreat, and COLLECT 17 after the loot - **so an assault of any outcome puts the player back in
the ground-forces menu**, not in COM's. The port went to COM's menu from all four.

**And a non-habitable planet never reaches COLLECT.** 220 prints its two lines, 230 blanks, 240
is `GOSUB 740: GOTO 310` - take the planet, set the flag, run COM. 805's own tech-0 branch at 820
is unreachable from here. The port was running the collect scene for it.

**The assault was reading the wrong byte for the planet.** Line 200 is `C = PEEK(38282 +
PEEK(38209))`, the technology, which the port keeps as `defense`; `groundForces.ts` was reading
`defender`, which is `resolveShipKind(shipKind)` - the ship in orbit. Two different bytes with
two different meanings, so the assault could describe one planet while COLLECT, which does read
`defense`, described another.

**The three menu refusals were drawn over the instrument panel.** Lines 65, 66 and 67 each run
`R = 5: GOSUB 12` first - line 12 blanks the left column, rows 2 to 13, and returns at its own
`IF R = 5` before 13 redraws the box and the menu - and then print inside that column from row 2.
The port put them in a block at row 16, on top of the panel, in its own wording: 65 says just
`NO BASE`, not "NO BASE ON THIS PLANET!". Each ends `GOTO 310`, the same `POKE 38151,7: RUN COM`,
so a refusal takes the long way round through COM and back to the menu.

### SHORE LEAVE's other four screens

`shoreleave_parity.mjs` had two of SHORE LEAVE's six screens exact - the pay screen and
cryogenics - and those two are the ones `drawShoreLeaveFrame` draws. The other four were written
without a capture to check them against, and every one of them had the same three inventions.

**The screen was being cleared.** SHORE LEAVE never clears or fills anything: line 14 draws the
same box COM does and line 2080 blanks the left column, rows 2 to 13, with eighteen printed
spaces. COM's twelve readouts down the right, its 40-character row 14, the HCOLOR 6 flood and
the whole instrument panel are all still on the page. Eight `hgr()` calls were taking them away.

**There is no key prompt.** Ten screens ended with `PRESS ANY KEY...` and a wait for one. Line
2099 is `FOR J = 1 TO 4000: NEXT` and then `RUN GROUND FORCES` - the disk simply waits. The real
GETs are elsewhere and stay: 2085's PAY THEM, 2140's BUILD A BASE, 2580's ARE YOU GOING TO PAY,
and 3070's BUY HOW MANY through the digit reader at 5000.

**Two of the titles were invented and two were misplaced.** 2410, 2510 and 3020 print their own
titles with leading spaces that put them at columns 5, 4 and 3; 2200's has none and belongs at
column 2. ESTABLISH BASE and the "you must land first" refusal print no title at all.

**And everything started two rows too low.** 2080 ends at the foot of its blanking loop and
2081's `VTAB 2` brings the cursor back to row 1 before anything prints, so every one of these
screens begins on row 2 - which is what the pay screen, the one that was checked, already did.

Line by line, the four that were not checked:

- **ESTABLISH BASE** (2100-2160): refusals on rows 2 to 4, the price on 2 to 7, 2130's refusal
  on 8 to 10, 2140's `VTAB 8` prompt on 8 and 9, and 2160 on 10 and 11 because 2155's
  `PRINT " "` finishes the `(Y/N)` row first. 2105 tests `PEEK(38282 + PEEK(38209))`, the
  technology - the port was reading the ship in orbit, the same mix-up GROUND FORCES had.
- **ENLIST TROOPS** (2200-2290): 2260 and 2270 run straight on from 2250, so there are no blank
  rows in the middle of it; 2280's refusal is at its own `VTAB 10` and 2285's at `VTAB 12`, not
  below the input.
- **REPAIR SHIP** (2550-2560): 2550's title, one blank and two lines, and then 2560 straight on
  from row 6 - the port had a blank between them.
- **BUY WEAPONS** (3020-3110) was the furthest off. `PRINT "CREDITS:";: HTAB 13: PRINT CR` is two
  prints, so the label sits at column 2 and the figure at column 13; 3050's `HTAB 16` does the
  same for each count; 3060 closes the list with a row of eighteen dots and puts the price at
  `VTAB 10`; 3070 asks at `VTAB 11` and reads at V 12, H 2; and all three refusals print back
  over row 11. 3110's last `GOSUB 3020` returns at 3055 before the price line, so the screen is
  left showing the new totals and no price.

One smaller thing: the digit reader drew an underscore cursor. 5006 echoes the digit and nothing
else - the hi-res character generator has no cursor - and 5002's `PRINT "  ";` is what takes a
digit back off on a backspace.

### RECALL, and the byte that says where the troops are

RECALL's own twelve lines were already exact - `recall_parity.mjs` has all five branches against
the machine, pixel for pixel, including which of them poke 38166. What playing it showed was
that its message was landing **on top of the GROUND FORCES menu**: "TROOPS ARE IN" over
"2) RECALL TROOPS", "CRYOGENIC SLEEP!" over "3) SHORE LEAVE".

RECALL blanks nothing. It does not need to, because GROUND FORCES line 65 is

    65 R = 5: GOSUB 12: VTAB 2: IF COM > 2 AND COM < 7 AND PEEK(38303 + PEEK(38209)) = 0 ...

and that `GOSUB 12` runs for **every** choice, before line 70's dispatch - line 12 wipes the left
column, box and options with it, and returns at its own `IF R = 5`. Line 62 redraws the box just
before it. The port only did that for the refusals, so every other screen arrived with the menu
still standing; RECALL is simply the one that draws nothing over it.

The rest of RECALL is 38158, the byte at the heart of its first branch - `IF PEEK(38209) < >
PEEK(38158) AND PEEK(38166) > 0 AND PEEK(38166) < 3`. Reading every program on the disk for it
gives four writes and nothing else:

| where | what |
| --- | --- |
| START 2030 | `POKE 38158,1` - planet 1, which is index 0 here |
| GROUND FORCES 150 | `POKE 38158, PEEK(38209)` - the assault |
| SHORE LEAVE 2098 | `POKE 38158, PEEK(38209)` - the pay screen |
| H/D 11 | `IF PEEK(38166) = 0 OR PEEK(38166) = 3 THEN POKE 38158, PEEK(38163)` |

**Nothing ever clears it.** The port had two of the four - it started the byte one planet out, it
did not move it on the pay screen, and it did not carry it through a jump - and it invented a
`-1` for "nowhere", written by RECALL and by both of GROUND FORCES' defeat paths.

That last one is what makes the whole thing work: troops on board or in cryogenic sleep travel
with the ship, so the planet they count as being on follows the jump; troops left planetside or
on shore leave do not. Which is exactly what GROUND FORCES 66 and 67 are for -

    66 IF COM = 4 AND PEEK(38158) < > PEEK(38209) THEN ... "YOU LEFT YOUR TROOPS ON ANOTHER PLANET!"
    67 IF COM = 1 AND PEEK(38158) < > PEEK(38209) THEN ... "YOU CAN'T ATTACK!"

**- both of which test where the troops are, not what they are doing.** The port tested the
location byte instead, which refuses a second landing on the planet the troops are already on
and allows an assault from a system they were never brought to.

### SUPPLY, with something in the hold

SUPPLY needed no changes, and that is worth saying plainly - but the capture it was passing
against proved less than it looked.

`supply_parity.mjs` has both pages exact at 0 of 53,760 pixels. It was taken on a fresh ship,
where all thirteen counters are zero. **Zero times ten is zero**, so that capture says nothing at
all about the multipliers 1410 to 1490 apply when they print - platinum and gold by 10, silver by
20, wine by 100, art works by 10 - and nothing about the columns either, because `= 0` is the
same width whatever `HTAB 19` does with it.

`supply_values_parity.mjs` pokes the thirteen bytes to a spread of one-, two- and three-digit
values, walks to the report the way a player does, and compares both pages. They come out exact:
30,615 against 30,615 and 30,238 against 30,238, nothing differing.

What that run shows on screen is the point of doing it. Each row is three prints -
`PRINT "* PLATINUM ";: HTAB 19: PRINT "= "; value;: HTAB 24: PRINT "POUNDS"` - and `HTAB` is
absolute, so:

    * PLATINUM        = 70 POUNDS
    * GOLD            = 250POUNDS
    * TITANIUM        = 255THOUSAND POUNDS

A two-digit figure leaves a space before the unit and a three-digit one runs straight into it,
because the number starts at column 20 and the unit is nailed to column 23. The same absolute
`HTAB 19` eats a character on the longest label of all: `* ELECTRONIC PARTS` is eighteen
characters from column 1, so its final S is at column 18 and the `=` lands on top of it. The disk
reads **`* ELECTRONIC PART=`**, and so does the port.

None of that is visible on a screen of zeros, and none of it could have been got right by
reading the listing carelessly. It is the same thinness `status_values_parity.mjs` was written
for: a capture of one state is a capture of one state.

### COM's twelve readouts, and the byte no program writes

The damage-control grid is COM lines 40 to 72. `ST()` at 15140 gives the twelve addresses, lines
40 and 50 give the twelve positions, and the labels come out of the DATA at 15000-15030 - two
five-character strings per cell, printed on consecutive rows. **The labels are fixed.** The only
thing state changes is whether a cell is drawn inverse, from `GOSUB 10000`:

    10000 IF J1 = 7 AND PEEK(ST(J1)) < 16 THEN POKE 973,255: RETURN
    10005 IF T = 0 THEN POKE 973,255: RETURN
    10010 POKE 973,0: RETURN

- cell 7 is POWER / LOW, and it lights when the energy byte drops below 16
- any cell lights when its byte is 0
- everything else is normal video

`com_parity.mjs` has both of those, and the port's rule matches. What it cannot see is whether
the **game's own state** holds the same twelve values, because it draws from `COM_FRESH_SHIP`, a
fixture in the source rather than anything the game produces. `probe_comreadouts.mjs` reads the
twelve off the machine early in a new game and compares them with the port's state at the same
point, and that found one: **38185, COM's twelfth readout, is 1 on the machine and the port's
opening state had 100.** Both are non-zero, so the cell renders identically and no pixel harness
could ever have separated them.

Which of the twelve can move at all is worth writing down, because it is fewer than the grid
suggests. Reading every write on the disk:

| byte | cell | written by |
| --- | --- | --- |
| 38200 | SHLD | START 2030, the damage tick at 3205, SHORE LEAVE's repair |
| 38195, 38198, 38197, 38196, 38186 | RADAR, 1 ENG, 2 ENG, COMP, LASER | the damage tick at 3230-3270, SHORE LEAVE's repair |
| 38193 | HULL | the damage tick at 3270-3350, SHORE LEAVE's repair |
| 38199 | POWER | H/D 15 spends it, SHORE LEAVE 2525 repairs it |
| 38187 | MSL | START 2030, the simulator's 1090 |
| 38194 | ENV | in SHORE LEAVE's repair DATA, but it sits at **128** and 2520 only repairs `IF D < 100` |
| 38190 | HYPER DRIVE | in the repair DATA, and nothing ever damages it |
| 38185 | COM | **nothing, anywhere** - it is not even in the repair DATA |

So `ENV NO/GO`, `HYPER DRIVE` and `COM NO/GO` are decoration: three of the twelve cells can
never change state in a whole game. The port's commander was setting `envPct` and `comsPct` to
100 on a restock, which is two of the three - it is left alone now, and 38185 has joined
`UNDAMAGED_SYSTEMS` beside the others.

### The galaxy directory

COM 900-1180, reached by 2 from the central computer or 1 from the navigation computer. No
capture in this directory covered it, and it had drifted further from the disk than anything
since the ground assault.

**The listing is twenty PRINTs and nothing else.** Line 940 is

    940 FOR C = 1 TO 10: HTAB 2: PRINT C;")";S$(C);: HTAB 21: PRINT C + 10;")";S$(C + 10): NEXT

- ten rows, two across, the number with no leading space and the paren straight after it, so it
reads `1)SOL` and `20)SHIVANDA`. The port had a `>` marking the current system, a `+` or `*`
marking whether each was taken or visited, a colour per planet, and a `CURRENT:` line underneath,
and every row of it a column and two rows out of place.

The page is also inverse on orange: 910 floods rows 0-123 in `HCOLOR= 5` and pokes 973 to 255,
and only 960 puts the flag back. 900's window is the full width, `POKE 32,0: POKE 33,40`.

**950's refusal is a redraw.** `GET C$: C = VAL(C$): IF C < 1 OR C > 2 THEN GOTO 910` - an
unrecognised key just draws the page again. The port was calling COM's `getChoice`, which prints
"PLEASE ENTER YOUR / COMMAND AGAIN." at row 21, on top of the instrument panel.

**And 1180 is `GOTO 900`.** After a planet's data has been read and its READY answered, the
listing comes back. The only way out is option 2. The port returned to the menu it came from.

The data page itself, 979-1170, does not flood and does not clear the whole screen: 979 narrows
the window to `POKE 32,1: POKE 33,39` and 980 blanks **rows 1 to 14**, so the directory's title
on row 0 is still standing above it. Everything is one PRINT after another from row 3 at column
1, and two of the blank PRINTs - 1080's and 1150's - happen whichever way the test after them
goes. What the port had drawn instead was a screen of its own: a `STATUS: SECURED` line, a
`DEFENDER:` line, a `LOOT COLLECTED` line and a `REPAIR BASE PRESENT` line, none of which the
original prints. The disk's wording is `SIRIUS HAS BEEN SECURED` / `SIRIUS IS INDEPENDENT.` and
`THERE IS AN OPERATIONAL REPAIR BASE` / `ON THE PLANET.`

Two smaller ones in the same screen. 1110 prints `PEEK(38261 + C) * 35294` through Applesoft,
which has **no thousands separators** - the port was formatting it with commas. And 1070 is a
single PRINT of thirty-eight characters, `ADVANCED CAPABILITY-SUPERIOR TO  OURS!`, two spaces
before OURS and all; the port had split it over two lines.

### DMG, and the flag it is really about

DMG is three lines, and `dmg_parity.mjs` already had them exact - 25 lit pixels on columns 263,
265, 267, 269 and 271, nothing changed outside the lamp, and 38393 set to 1 afterwards:

    10 HCOLOR= 5: FOR J = 153 TO 157: HPLOT 262,J TO 271,J: NEXT:
       PRINT " ": PRINT "^DRUN STARSHIP SIMULATOR"

So the screen was done. What was not was **the byte**, and the byte is the whole point of the
program. Three places touch 38393 and between them they say what it means:

| where | what |
| --- | --- |
| START 2030 | `POKE 38393,0` - a new ship |
| STARSHIP SIMULATOR 3360 | `IF PEEK(38393) = 0 THEN POKE 38393,1: PRINT "^DRUNDMG"` |
| SHORE LEAVE 2545, 2555 | repaint the lamp `HCOLOR= 1`, then `POKE 38393,0` |

**3360 runs DMG once.** The test is on the flag, not on the hit, so the lamp comes on the first
time anything gets through and the flight loop is not interrupted again until a repair clears it.
The port was triggering on its own `pendingUpdate`, which every hit sets, so it bounced out to
the DMG scene and back on every single one.

Nothing in the port cleared the flag either - `shipDamaged` was written by the DMG scene and read
by nobody - so SHORE LEAVE's repair left the lamp orange, and the panel gauge was being driven
from `hullPct < 100` instead. That is wrong twice over: a hit on the radar or an engine sets
38393 without touching the hull, and a repair puts the lamp out whatever the hull says. GALAXY
MAP 5140 and 5150 read the same byte to choose that bar's colour, which is how it was pinned
down in the first place.

One detail the parity harness makes plain and the screen does not: **green and orange light the
same five columns.** `HCOLOR= 1` and `HCOLOR= 5` differ only in the palette bit, so the lamp
changing state is invisible to a lit-or-not comparison - which is exactly why the byte needed
checking rather than the picture.

### EX's burst, predicted from one seed

`ex_parity.mjs` had EX's flash exact - line 6's five XDRAWs, 1,036 pixels on and 98 off - and
checked lines 7 to 30 only by their extent, because the burst is 240 segments drawn from 480 RND
draws and nothing was replaying them. An extent proves very little: the disk's run spanned
x 16-259 and the port's x 19-248, and both are inside what line 20 allows.

The port's RND is bit-exact, so the whole thing follows from one seed.
`oracle/probe_exburst.mjs` captures the five bytes at `$00C9` the moment EX reaches line 7, the
page as it stands then, and the page again once the loops are done;
`oracle/ex_burst_parity.mjs` draws the burst over the first with that seed and compares.

**6,775 pixels on both sides, 0 of 53,760 differing.** Two draws per segment, 480 of them in
order, through line 20's two subtractions, 21 and 22's clamps and HPLOT's truncation.

Three things had to be got right to take the capture at all, and each was wrong the first time.

- **1501 is `IF PEEK(38202) = 1 THEN 1000`, and 1000 is the missile routine** - 1090 spends
  38187 there. So 38202 = 1 selects missiles, and only the laser path from 1502 on reaches
  1560's `RUNEX`. A new game starts at 1, so holding the button just fired missiles.
  That settles the panel gauge too: GALAXY MAP 5030 paints (7,161), under MISSILE, **white**
  when 38202 is not 1 - so **white marks the gauge that is not selected**, which is the same
  way round as MANUAL and AUTO on the resting screen.
- **1540 only computes DP while `PEEK(38210) = 0`**, so the enemy can only be blown up from
  space, not from the atmosphere.
- **Line 30 is the outer `NEXT`,** so it comes round once per X1 step, sixteen times. Stopping
  at the first of them caught fifteen segments of the two hundred and forty - 852 pixels - and
  the replay then looked as though the port were drawing eight times too much. Line 40 is the
  first thing past the loops.

### S/X's burst, and a stopping point that prints

S/X is EX through the looking glass. Line 5 is `HCOLOR= 0: Y1 = 20: POKE 973,255: PRINT "^L"` -
the form feed through the character generator with the inverse flag set leaves the page solid
white - and then lines 7 to 30 are the **same loop as EX**, drawing the same 240 segments in
black. `sx_parity.mjs` had line 5's fill and line 40's message exact, 433 dark pixels on row 21
either side, but of the burst it could only say that the disk's 45,481 lit pixels fell inside the
44,970 to 45,913 the port produced over twelve random runs.

The same replay as EX settles it. `oracle/probe_sxburst.mjs` takes the seed at `$00C9` as S/X
reaches line 7 and the page either side of the loops, and `oracle/sx_burst_parity.mjs` redraws
them: **7,771 pixels taken off on both sides, 0 of 53,760 differing.**

Getting there needs 3350 - `POKE 38193,J: DMG = 0: IF J = 0 THEN PRINT "^DRUNS/X"` - so the hull
has to reach zero through the damage tick, which means 38208 held at 0 for lines 190 and 192 to
call 3000 at all, and 38193 held at 1 so the first hit finishes it.

**And the stopping point matters more here than in EX.** Line 30 is the outer `NEXT` and comes
round sixteen times, so line 40 is the marker - but S/X's line 40 *prints*, at `SPEED= 127`, and
a single 60Hz frame is long enough for the first character of "YOUR SHIP HAS BEEN DESTROYED!!" to
reach the page. The first run of this captured the **Y of YOUR** and reported it as twelve pixels
the port had failed to draw: x 30-34, y 168-174, which is text row 21 column 4, exactly where
line 40's `VTAB 22: HTAB 5` puts it. Stepping in thousand-cycle pieces and stopping the instant
CURLIN reads 40 gives the page as the loops left it.

### END, and two lines the screen cannot show

`end_parity.mjs` has END's menu exact at 0 of 53,760 pixels. Two of its lines do things a
picture cannot show, and `oracle/probe_endmenu.mjs` put both to the machine.

**`2) CONTINUE PRESENT GAME` does not go to the galaxy map.** Line 120 is
`POKE 38391,77: PRINT "^DRUNGALAXY MAP"`, and 38391 is the saved-game sentinel, so GALAXY MAP
line 2 fires before line 5 draws anything:

    2 IF PEEK(38391) = 77 THEN POKE 38391,0: GOSUB 5000: POKE - 16300,0: PRINT "^DRUN STARSHIP SIMULATOR"

Measured: `END -> GALAXY MAP -> STARSHIP SIMULATOR`, with the map never appearing. It paints the
eight gauge bars through `GOSUB 5000` and hands straight back to flight. The port was showing the
map. The fix is in GALAXY MAP rather than in END, because the same test catches the other way in
- INSTRUMENTS 220 runs GALAXY MAP with the sentinel set on a resumed save, and that has to end in
flight too. Line 1 is the same test with 38388 also at 7, which goes to COM instead; that is the
path out of the map's own key handler and is taken there.

**And line 70's `GET C` is a numeric GET.** A digit outside 1 to 3 redraws from line 30, as the
listing says - but a letter does not. Applesoft's number parser throws, line 0's
`ONERR GOTO 63999` catches it, and 63999 is `PRINT "^DINT"`, which drops the machine to the BASIC
prompt with the program stopped. Measured: pressing A leaves CURLIN at 63999 and the game is
over.

This is one of the few places the port deliberately does not follow the disk. There is no
interpreter prompt to fall to, and turning a mistyped key into a quit would be worse than the
divergence, so every key loops. It is written down here rather than quietly smoothed over.

A note on running two tests on one machine: they cannot share it. The letter test ends the
program, so anything pressed afterwards goes to the BASIC prompt rather than to line 70's GET -
the first run of this probe did exactly that and reported CONTINUE as going nowhere.

### The galaxy map's cursor page

`galaxymap_parity.mjs` had the map itself exact - 1,514 lit, 0 of 53,760 differing - and the
cursor's two draws at two positions. What nothing reached was the other half of the page: what
happens when the button goes down. 3210 to 3260 is the only state-dependent part of it.

`oracle/probe_mappick.mjs` puts the paddle cursor on a star and presses the paddle button, and
`oracle/map_pick_parity.mjs` redraws the result from the same twenty stars: **2,362 lit on both
sides, 0 of 53,760 differing.**

Where the readout lands took tracing, and the capture confirms it. 3000 sets the window to rows
19-23 with `POKE 34,19: POKE 35,23` and leaves the cursor on row 19; 3100's two PRINTs take rows
19 and 20 and leave it on row 21. So:

- a **miss** prints "THERE IS NO STAR SYSTEM THERE, SIR." on row 21, and 3240 blanks that same
  row again before going back to the cursor
- a **hit** at 3250 does `VTAB 21`, which is row 20 - **back up over "--PRESS SPACE TO RETURN--"**,
  which its 39 spaces blank first. So picking a star replaces that line rather than adding to it.
- 3250 ends `";Z(P);` with a semicolon, so 3320's `" : DISTANCE = "; INT(D1);" L/Y"` finishes the
  same row: `LOC. : 13 13 12 : DISTANCE = 4 L/Y`
- and 3260's question goes on row 22

The port had all three a row too low, so the "PRESS SPACE" line survived under them.

**The paddles do not read back what they are set to.** The probe aimed the cursor at PX 95, PY 65
- the exact position 3060 and 3065 draw star 2 at - and the machine used **PX 92.82, PY 63**. A
PDL read is timing based, `PX = PDL(0) * 1.19` is fractional on top of that, and the first run of
this harness took the asked-for values as the drawn ones and left two pixels of 3210's hole in
the wrong place. Reading PX and PY back off the variable table afterwards - less the 35 that 3215
has already added - is what makes the comparison mean anything.

### Playing it again: the radar, and a screen nothing could reach

`radar_parity.mjs` reports RADAR's reticle at 100% and "the panel below, rows 124-191: disk 2993
lit, port 2993 lit, 0 differ". Pressing R in the game showed the panel gone. Both are true: the
harness draws `drawInstruments` itself before calling `drawRadarScreen`, and the **scene** was
starting with `hires.hgr()`.

RADAR never clears below row 123. 2005's `CALL 24576: CALL 37936` redraw the view and 2010 blanks
just the two readout fields on row 23 - `VTAB 24: HTAB 1: PRINT <18 spaces>;: HTAB 26: PRINT <13
spaces>;`, the same pair RE and ORBIT blank. The instrument panel is flight's and stays put.

Two more things were wrong on the way out, and they hid a whole screen:

    2056 IF A$ < > "X" THEN 5000
    2058 POKE 974,64: IF PEEK(38388) > 0 THEN POKE 38388,0: PRINT " ": PRINT "^DRUN COM"
    2059 ... PRINT "^DRUN STARSHIP SIMULATOR"
    5005 J = PEEK(38205): POKE 38151,5: PRINT "^DRUN SHIP # ";J;" I.D."

- **Any key but X identifies the contact.** The port went back to COM whatever was pressed, so
  the four SHIP # n I.D. screens were unreachable in play - `shipid_parity.mjs` has been passing
  against a screen nothing in the game could get to.
- **X goes back where you came from.** COM line 133 pokes 38388 to 2 before running RADAR, so the
  radar reached from COM's menu returns to COM and the radar reached from flight returns to
  flight. The port went to COM from both.

Checked in play: R from flight now keeps the panel and blanks the two readouts, any other key
brings up LIGHT CRUISER's identification, X from flight returns to flight, and COM's option 3
returns to COM.

### Driving the scenes, not the draw functions

Two harnesses in this directory have now been green while the game was broken, for the same
reason both times. `radar_parity.mjs` draws `drawInstruments` itself before calling
`drawRadarScreen`, so it could not see that the scene began with `hires.hgr()`.
`shoreleave_parity.mjs` calls `drawShoreLeaveCryogenics`, which has no title, so it could not see
that the **scene** was printing a `CRYOGENICS` heading over it. A parity harness tells you a draw
function is right. It does not tell you the scene calls it that way.

`probe_transitions.mjs` was the one harness that walked the game instead, and it is the one that
found the instrument panel and the computer submenu. So it has been extended from five steps to
**twenty-six** - every menu screen the opening state can reach without a base, loot or damage:

    flight, COM, the computer submenu, the galaxy directory, the galaxy map, STATUS's two pages,
    SUPPLY's two pages, RADAR, the ship identification, GROUND FORCES, CRYOGENICS and END

Everything is compared except the three screens that move: the flight view, the galaxy map with
its cursor toggling, and the return to flight. Text row 23 is left out everywhere - it is line
155's live position, and `probe_comreadouts.mjs` and the panel's own captures check what belongs
there.

**Twenty-one of the twenty-three compared screens are exact.** The two that are not are the same
radar screen, 171 pixels, all of it in rows 0-123 - the star projection `radar_parity.mjs`
measures separately at 98.7%. Its panel is exact.

Four things the route found that nothing else could:

- **The galaxy directory's `2) RETURN` never returns.** Line 969 is `R = 2: GOSUB 20: GOTO 810`,
  and that GOSUB does not come back: 20 floods and clears, 29 blanks the column, and 35's
  `IF R = 1 THEN R = 0: RETURN` does not fire because R is **2**. It falls straight through 40 to
  120 and COM's main menu takes over, so the `GOTO 810` is dead and the navigation menu it names
  is never shown. Leaving the directory gives COM's main screen - 11,698 lit, the same as
  arriving from flight - whichever menu it was entered from.
- **RADAR 2005 puts the whole instrument panel back.** `CALL 24576: CALL 37936` does more than
  clear the view: the radar screen has the three needles at their flight positions - SX 73 from
  `13 + S/2`, TX 140, EX 262 from `199 + E` - even though COM line 8 swept two of those tracks on
  the way in, and its gauge bars are in $9602's store form rather than the one GALAXY MAP's 5500
  plots. That difference then rides all the way to END, which is how it showed up as the same 81
  pixels on six consecutive screens.
- the `CRYOGENICS` heading the scene was adding, and
- the `hires.hgr()` at the top of the radar scene.

### The star projection, which was not the problem

The last measured gap was RADAR's view: 98.7% exact, sixteen of the disk's pixels with no port
pixel anywhere near them, and the scene route reporting the same thing as 171 differing.

**The projection was not at fault.** `star_parity.mjs` puts it at 100% exact and 100% within a
pixel over twelve camera states - the header comment in `radar_parity.mjs` still said 38.9%, left
over from before it was fixed. The sixteen pixels are a six-by-four blob at x 132-137, y 30-33
that the star table cannot produce, and rendering `ship-3-bytecode` at the radar's camera gives
**exactly** those sixteen.

So they are the enemy contact, and the reason the port did not draw it is a difference in how the
two are organised. `CALL 24576` is **one call over one display list**: the star table is BLOADed
to A29440 and the ship model to A30841, and the renderer walks both. The port keeps them in two
files and draws them from two places - `renderStarfield` and `renderEnemyShip` in the cockpit -
so RADAR, which makes the one call, got only the stars.

One detail decides how to draw it. The port's cockpit moves the model to the enemy's current
position, with a note that its coordinates are absolute world ones. At the radar's camera the
model with **no offset at all** lands on the disk's sixteen pixels, so on this screen the ship is
drawn where the model says it is. `drawRadarScreen` takes both lists now.

RADAR's view is now **100.0% exact, all 1,226 pixels**, and its reticle and panel with it.

The scene route still cannot compare that screen, and the reason is worth stating rather than
hiding: line 2000 borrows the ship's own X, Z and heading and forces only Y and the pitch, so the
radar view is a projection from wherever the ship happens to be - the same live-state problem the
flight view has. The route scores it on its panel, which is exact, and `radar_parity.mjs` checks
the view at a camera captured with it. With that, the whole route is clean: **twenty-three
screens, every one of them exact.**

### A game played end to end

Every harness in this directory compares pixels. `oracle/playthrough.mjs` asks a different
question - does the game still work? - and answers it by playing one: in to the planet, down
through re-entry, up to orbit, down again, take the world, collect the loot, build a base, sell
the haul, out to flight, jump to another system, and through the radar and the ship
identification on the way. Twenty-two checks on **where it goes and what it leaves behind**,
not on what it draws.

That is the class of thing the pixel harnesses keep missing - RADAR drawing perfectly and
returning to the wrong program, the ship identification being unreachable, the galaxy directory
coming back to the wrong menu. All three were right in every capture and wrong in the game.

Two shortcuts are taken and marked where they happen: the ship is placed rather than flown,
because a pass is two and a half seconds and crossing the map takes minutes, and a planet's
surrender flag is cleared so the assault has something to do. Neither invents behaviour.

It passes, and what it checks on the way is worth listing: RE leaves the ship at Y 1024 and
Z -7000, ORBIT at X 700 and Z 2000, a won assault comes back to the ground-forces menu rather
than COM's, the loot is sold and the hold empties, and the radar returns to flight when flight is
where it was opened from.

**One thing it taught me by failing.** The first run could not make the hyperdrive jump, and the
port turned out to be right: H/D line 1 is

    1 POKE -16300,0: POKE 38392,0: IF PEEK(38210) = 1 OR PEEK(38209) = PEEK(38163)
      OR PEEK(38163) = 0 THEN PRINT "^DRUN STARSHIP SIMULATOR"

so a jump is refused while the ship is in the atmosphere, when the destination is the system it
is already in, and when no destination is set - and the refusal is silent, the program bouncing
straight back to the simulator. The way out is to take off first, which is what the harness does
now, with the refusal itself checked on the way.

### The flight view

The one screen nothing compared. `transition_parity.mjs` reports it and moves on - two live
flights are never at the same point - but that is a reason not to compare two runs, not a reason
not to compare the drawing. `oracle/probe_flightview.mjs` stops the machine at line 156, where
the frame is finished and 159 has not started erasing the needles, and captures the page **and
the six camera cells that drew it**: XI, YI and ZI at 29467, 29469 and 29471, and P1, B1 and H1
at 29473 to 29475. `oracle/flight_view_parity.mjs` then asks the port for that exact frame.

**396 lit pixels on both sides, nothing differing.**

Getting there took two corrections, and the second is the interesting one.

**The ship is drawn whether or not the planet has surrendered.** `CALL CA` walks one display
list; the model sits at A30841 from START onwards and only H/D 37's `POKE 30841,127`, EX 40's
BLOAD DEBRIS or a new BLOAD on arrival change it. Nothing gates the drawing on 38208 - that gates
the **damage tick** at 190 and 192. The port was hiding the ship at a secured planet, which is
why its opening frame was a bare star ball where the disk's has a ship in the middle of it.

**And line 2's `X9 = 400: Y9 = -100: Z9 = -3500` is not somewhere to put the ship.** It is where
the ship already is. `ship-3-bytecode` spans x 150 to 600, y -120 to 30 and z -3650 to -3350 -
centred on exactly that point - so the model carries absolute world coordinates and takes **no
offset**, the same as the radar's. Adding X9/Y9/Z9 on top put it twice as far out.

Nothing on the disk moves it, either. Searching every program for a write into the model area
gives four BLOADs and two blanks and no other write at all, so **the enemy is a fixed object in
the world**: it does not manoeuvre, you fly at it. The port already had that right - `spawnEnemy`
places it at line 2's coordinates and never moves it - but it was hiding it and drawing it in the
wrong place.

With both fixed, the live flight step of the scene route is 3,695 lit against the disk's 3,697,
and what is left between them is that the two ships are not in the same place.

### What this leaves the predicates for

`damage_parity.mjs` and `logic_parity.mjs` still run - they cover far more ticks and rounds than
a recording can, and they check the gates and the rates over tens of thousands of draws. But the
formulas themselves are no longer taken on a bound.

---

## Open questions

Answered ones have been removed from this list rather than left to accumulate. What follows
is what is genuinely not known, roughly in order of how much it matters.

### Whole parts of the game have never been looked at

- **Every screen has been reached.** SHORE LEAVE was the last holdout: SELL LOOT and
  ESTABLISH BASE came out of `probe_economy.mjs`, REPAIR/RESTOCK out of `probe_repair.mjs`,
  which lands the ship at Y 20 to get past 2505, and ENLIST TROOPS - with BUY WEAPONS behind
  it - out of `probe_enlist.mjs`. COLLECT's tech-1 path was reached earlier by forcing the
  planet's tech byte. Nothing in the BASIC is now unrun for want of a reachable state.
- **Replaying is done.** The damage tick, the combat, COLLECT's thirteen loot draws, line
  5000's ground fire and all four of SHORE LEAVE's price screens are replayed and exact.
  Nothing RND-driven is still checked by range alone.
- **The game logic is done.** The economy, GROUND FORCES' combat, the damage model, the
  weapons - missile flight and all - and all five of RECALL's branches have been run against
  the disk, and there is no enemy AI to do.
- **What feeds the ENV. CONTROL readout, if anything.** 38194 is MEM TRANSFER A's loop counter
  and COM shows it as a system percentage. Whether the game was ever meant to have an env.
  control system, or the address was simply reused, is not knowable from the disk.
- **Names for the flags.** `38164`, `38207`, `38208`, `38210` and the rest are used
  correctly because their use sites are known, but what the original's author called them
  is not.
