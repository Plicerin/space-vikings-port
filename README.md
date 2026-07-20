# Space Vikings Resurrected

A reverse-engineering and remake workspace for **Space Vikings** (Apple II, SubLOGIC / Mitchell Robbins).

This is not a single-purpose app repository. It combines:
- extracted assets and detokenized source from the original game
- reverse-engineering notes, memory maps, and live-capture analysis
- a custom 6502 emulator/test harness
- a substantial modern browser port built with Vite + TypeScript
- experimental enhanced rendering work alongside the main port

## Repository at a glance

### Original-game research
- `emulator/extracted/` — 42 extracted binary payloads from the original disk image
- `detokenized_sources/` — 23 detokenized AppleSoft BASIC files
- `analysis/` — memory-layout analysis, disassembly notes, manuals, and live emulator extraction docs

### Main modern port
- `modern/web/` — the main playable browser implementation
- `modern/web/src/scenes/` — scene modules mirroring the original overlay flow
- `modern/web/src/engine/` — rendering, input, state, AI, asset loading, and extracted-data support

### Experimental rendering work
- `modern/threejs-port/` — early Three.js prototype scenes
- `modern/web/src/scenes/shipVectorDebug.ts`
- `modern/web/src/engine/vectorRenderer.ts`

### Emulator / test harness
- `emulator/cpu6502.py`
- `emulator/cpu6502.js`
- `emulator/test.js`
- `emulator/cpu6502.test.js`

## Analysis

## What this codebase is

The repo has clearly grown in phases:
1. extraction of the original Apple II assets
2. detokenization and analysis of the BASIC overlays and assembly helpers
3. a modern browser port that maps the original overlay flow into scene modules
4. experimental visual enhancements layered beside the main remake

The result is best understood as a **research archive plus an active remake**, not as a small, cleanly isolated game project.

## Main implementation: `modern/web`

The most coherent and actively usable part of the repository is the Vite app in `modern/web`.

Important entry points:
- `modern/web/src/main.ts` — top-level entry
- `modern/web/src/pages/index.ts` — bootstraps the app and registers scenes
- `modern/web/src/engine/gameState.ts` — typed replacement for the original PEEK/POKE memory model
- `modern/web/src/engine/hires.ts` — Apple-II-inspired canvas renderer
- `modern/web/src/scenes/cockpit.ts` — largest gameplay scene and central flight/combat logic

The source under `modern/web/src` is substantial: about **9,483 TypeScript lines**.
Largest files include:
- `scenes/cockpit.ts` — 1541 lines
- `scenes/shipVectorDebug.ts` — 966 lines
- `engine/vectorRenderer.ts` — 615 lines
- `scenes/shoreLeave.ts` — 494 lines
- `scenes/groundForces.ts` — 353 lines
- `engine/gameState.ts` — 331 lines

### Architectural observations

#### 1. Scene-driven port of the original overlays
The original game was split across multiple AppleSoft overlays and binary helpers. The modern port mirrors that structure with named scenes such as:
- `start`
- `instruments`
- `galaxyMap`
- `com`
- `status`
- `supply`
- `radar`
- `recall`
- `shoreLeave`
- `groundForces`
- `collect`
- `end`
- `hyperdrive`
- `orbit`
- `reentry`
- `ex`
- `shipId`

That is a sensible architectural choice because it preserves the original game’s module boundaries instead of flattening everything into one loop.

#### 2. Typed state replacing raw memory addresses
`modern/web/src/engine/gameState.ts` is the key translation layer between the original game’s address-based state and the browser port’s typed state.

Instead of relying on raw memory offsets everywhere, it exposes named fields for:
- ship position and orientation
- combat and encounter state
- damage systems
- forces and inventory
- per-planet progression
- transient UI and commander-routing state

It is also one of the best-documented files in the repo: many fields include original memory addresses and BASIC references.

#### 3. Custom Apple-II-style renderer
`modern/web/src/engine/hires.ts` implements a software renderer with:
- a 560x384 backing buffer
- plot/line/text primitives
- Apple-II-style text rendering
- cropping to the 280x192 game area
- soft upscale and CRT-style presentation effects

This is a rendering-heavy remake, not a conventional HTML UI.

#### 4. Source-backed extracted data inside the app
`modern/web/src/engine/extractedOriginalData.ts` contains data promoted from live emulator capture work.

That is important: the port is not relying only on guesswork or hand-authored balancing values. At least part of the runtime state has been grounded in captured original behavior.

## Reverse-engineering material

This repository contains a large amount of original-source evidence:
- **42** extracted `.payload.bin` files in `emulator/extracted/`
- **23** detokenized BASIC files in `detokenized_sources/`
- **26** shape JSON files and **26** SVG previews in `modern/shapes_json/`
- large analysis outputs such as:
  - `analysis/MEMORY_LAYOUT.md`
  - `analysis/memory_layout.json`
  - `analysis/LIVE_EMULATOR_EXTRACTIONS.md`

`detokenized_sources/START.bas` is especially useful as a first reference because it shows the startup flow, BLOAD sequence, and early scene handoff logic that the modern port mirrors.

## Emulator status

There are two emulator implementations in the repo:
- Python: `emulator/cpu6502.py`
- JavaScript: `emulator/cpu6502.js`

### What I verified

#### Working now
- `modern/web` typechecks successfully with `npx tsc --noEmit`
- `node cpu6502.test.js` runs and prints the expected opcode smoke-test values
- `node test.js` now completes successfully with **29/29 tests passed**

#### What I fixed in `emulator/cpu6502.js`
I made a targeted repair pass to get the JavaScript emulator harness back into a working state:
- added missing stack instruction handlers: `PHA`, `PLA`, `PHP`, `PLP`
- allowed an optional external memory object in the constructor, which `cpu6502.test.js` expects
- exposed a `flags` getter, which `cpu6502.test.js` also expects
- initialized execution state so `step()` can run in the basic test harness
- replaced unbounded high-level routine execution in the lightweight harness with bounded behavior for `executeMemTransferA()` and `executeSoundGen()`

#### Important scope note
The JavaScript emulator test harness is now passing its checked-in tests, but that does **not** prove it is a complete or cycle-accurate 6502 emulator. It means the current repository’s own JS emulator tests are green and the harness is usable again.

## Experimental rendering path

There is a parallel visual-experiment track in the repo:
- `modern/threejs-port/`
- `modern/web/src/scenes/shipVectorDebug.ts`
- `modern/web/src/engine/vectorRenderer.ts`

This work explores a more stylized vector/bloom presentation while keeping the core browser remake in place.

That means the repo currently serves two adjacent goals:
1. preserve and port the original game structure
2. explore enhanced presentation ideas without losing the reverse-engineered base

## Current verified status

### Passing
- `modern/web`: `npx tsc --noEmit`
- `emulator`: `node cpu6502.test.js`
- `emulator`: `node test.js` (**29/29 tests passed**)

### Existing build artifacts
`modern/web/dist/` already exists and includes a built app plus copied data/debug assets.

## Strengths

- rich reverse-engineering evidence is checked into the repo
- the browser port structure matches the original overlay-based architecture well
- `GameState` is carefully documented with original address references
- original sources, analysis, and remake code are all available side by side
- the web port currently typechecks cleanly

## Risks and rough edges

- the root docs were previously fragmented across `README_COMPLETE.md`, `HANDOVER.md`, and `SESSION_HANDOFF.md`
- the repo mixes active source, generated outputs, screenshots, experiments, and archival material in one tree
- the JavaScript emulator remains only partially verified
- `modern/web/dist/` and other large checked-in outputs make the active source-of-truth harder to spot quickly
- `modern/web/src/scenes/cockpit.ts` is large enough that long-term maintenance risk is concentrated there

## Recommended starting points

If you are new to the repository, this is a practical reading order:
1. `detokenized_sources/START.bas`
2. `modern/web/src/engine/gameState.ts`
3. `modern/web/src/pages/index.ts`
4. `modern/web/src/scenes/start.ts`
5. `modern/web/src/scenes/cockpit.ts`
6. `analysis/LIVE_EMULATOR_EXTRACTIONS.md`
7. `HANDOVER.md`

## Running the main web port

From `modern/web`:

```powershell
npm install
npm run dev
```

Current Vite dev-server config:
- host: `127.0.0.1`
- port: `4545`
- strict port: enabled

Build:

```powershell
npm run build
```

Typecheck:

```powershell
npx tsc --noEmit
```

## Running the emulator harness

From `emulator`:

```powershell
python test_simulator.py
node cpu6502.test.js
node test.js
```

Interpretation of current state:
- `python test_simulator.py` is useful as an analysis harness
- `node cpu6502.test.js` works as a basic smoke test
- `node test.js` passes the repository’s current JS-emulator test suite

## Other important docs

- `HANDOVER.md` — long-form project status and historical handoff notes
- `SESSION_HANDOFF.md` — session-specific history
- `README_COMPLETE.md` — older comprehensive README draft
- `analysis/` — technical reverse-engineering notes and data dumps

## Summary

This repository is a **substantial reverse-engineering archive plus an active browser remake** of *Space Vikings*.

Today, the strongest and most immediately usable part of the codebase is the **TypeScript web port in `modern/web`**.

The JavaScript emulator harness is also back in working order for the repository’s current checked-in tests, though it should still be treated as a lightweight project-specific harness rather than proof of full 6502 accuracy.