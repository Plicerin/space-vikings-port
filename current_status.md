# Current Port Status

## Summary

The Space Vikings browser port is substantial and broadly playable, but it is not yet a fully faithful or release-ready Apple II port.

- Product source: `modern/web/`
- Stack: TypeScript, Vite, Canvas/HGR emulation, and optional Three.js/vector rendering
- Current branch: `master`
- Live inventory: 24 scene modules and 21 engine modules
- Build status: `pnpm run build` passes; Vite reports a non-blocking large-chunk warning

## Implemented Coverage

The browser implementation covers the principal game loop:

- New/load game
- Instruments and cockpit
- Flight and combat
- Radar and COM
- Galaxy map and hyperdrive
- Orbit and reentry
- Ground forces, shore leave, collection, and recall
- Damage, ship destruction, end, and victory routes

Reverse-engineering coverage is extensive:

- 42 original binaries disassembled
- 26 Apple II graphics assets converted
- Original DSK and browser Apple II emulator available
- Recovered BASIC, disassembly, emulator state captures, and extracted runtime data present

## Verification Status

- Latest canonical `pnpm run build` passed with 59 modules transformed.
- Focused ad-hoc checks exist for opening, combat, and orbit behavior.
- The package's `test` command is currently TypeScript checking only; there is no comprehensive unit-test suite.
- A complete campaign-to-victory E2E run has not been conclusively verified.
- Build success proves the browser artifact compiles; it does not prove complete DSK equivalence.

## Fidelity Status

The port is source-informed but is not yet pixel-perfect or behaviorally exact.

The opening currently displays a coherent planet and recognizable ship in fresh browser captures, but the implementation still contains unresolved fidelity compromises:

- `modern/web/src/scenes/cockpit.ts` draws a narrowly gated procedural planet point cloud during the deep-space opening.
- `modern/web/src/engine/vectorRenderer.ts` uses a camera-relative planet anchor and tuned presentation constants.
- `modern/web/src/engine/extractedOriginalData.ts` currently initializes the opening from a later paused emulator capture (`y=210`, `z=-6761`, `heading=255`, `pitch=248`).
- The original immediate `START.bas` initialization is documented as `X=700`, `Y=200`, `Z=-7000`, `H=0`.

These values and render paths must be reconciled against live post-menu DSK state and the original shape/projection behavior before the opening can be called faithful.

## Highest-Priority Remaining Work

1. Replace the procedural/tuned opening planet presentation with the actual disk-derived shape traversal and projection.
2. Separate immediate new-game initialization from later paused-reference state.
3. Resolve the documented galaxy-map planet plotting issue in `galaxyMap.ts`.
4. Verify planet coordinates and defender data against the original planet-state binary.
5. Resolve remaining untraced memory fields and timing behavior.
6. Run and inspect a complete campaign E2E, including save/load and victory.
7. Keep faithful rendering clearly separated from enhanced/vector presentation.
8. Clean the repository's large set of untracked research, capture, generated, and temporary artifacts.

## Repository Condition

The current workspace contains 17 modified tracked files plus many untracked research and screenshot artifacts. Those changes are not represented by a clean release commit and must be reviewed, grouped, and verified before release.

## Overall Assessment

- Feature coverage: strong
- General playability: broadly playable
- Build health: passing
- Full campaign verification: incomplete
- Apple II fidelity: incomplete
- Release readiness: not ready
- Repository hygiene: substantial cleanup required
