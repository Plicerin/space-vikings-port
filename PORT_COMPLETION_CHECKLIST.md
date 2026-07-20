# Space Vikings Port Completion Checklist

This checklist is based on direct review of the current modern port (`modern/web`), the original detokenized AppleSoft BASIC overlays in `detokenized_sources/`, and the reverse-engineering notes in `analysis/` and `HANDOVER.md`.

It is focused on **what remains to complete the port as a faithful recreation of the original game**, not on general cleanup or optional enhancements.

---

## Completion definition

For this project, “complete” should mean:
- every major original overlay has a working modern counterpart
- scene transitions and state changes match the original game closely
- encounter state is source-backed rather than guessed where practical
- core combat, campaign, economy, and progression formulas match the original
- remaining synthetic placeholder behavior is either removed or explicitly accepted

The project is already close on **scene coverage**, but it is not yet complete on **fidelity**.

---

## A. Highest-priority remaining work

## A1. Source-back encounter state for all planets

**Why this matters**  
This is the biggest remaining gameplay-fidelity gap. Right now, the modern port has source-backed arrival/encounter state only for planet 1, while other planets still rely on fallback/default behavior.

**Evidence**
- `modern/web/src/engine/extractedOriginalData.ts:124` — `EXTRACTED_ARRIVAL_STATE_BY_PLANET` only contains planet `1`
- `modern/web/src/scenes/hyperdrive.ts` uses fallback behavior when no extracted state exists
- `analysis/LIVE_EMULATOR_EXTRACTIONS.md` documents the intent to use live original-state captures

**Tasks**
- [ ] Capture original arrival/encounter state for all 20 planets
- [ ] Record, per planet:
  - [ ] `planetIndex`
  - [ ] `planetVitalityLimit`
  - [ ] `shipDestructionLimit`
  - [ ] `shipKind`
  - [ ] `enemyShips`
  - [ ] `planetSurrendered`
  - [ ] `atmosphere`
- [ ] Replace hyperdrive fallback/default state with extracted values wherever possible
- [ ] Verify that radar, COM, ship ID, and ground-forces scenes preserve the same encounter state across transitions

**Definition of done**
- All real planets have source-backed arrival-state entries or a documented, justified exception
- Hyperdrive no longer relies on broad default/fallback encounter setup for most planets

---

## A2. Replace synthetic orbit behavior with faithful orbit transition behavior

**Why this matters**  
The current `orbit` scene is custom and rewrites encounter values in ways that do not match the original overlay.

**Evidence**
- `modern/web/src/scenes/orbit.ts:80-93` mutates `shipKind`, `enemyShips`, and position directly
- original `detokenized_sources/ORBIT.bas:11-18` is more about positioning/asset loading based on existing state than creating new encounter state

**Tasks**
- [ ] Compare modern orbit entry/exit logic against `ORBIT.bas`
- [ ] Remove non-original state synthesis from `orbit.ts`
- [ ] Preserve pre-existing encounter state instead of fabricating new defenders where absent
- [ ] Re-check transitions from cockpit ↔ orbit ↔ other overlays

**Definition of done**
- Orbit acts as a faithful state-transition overlay rather than a custom encounter generator

---

## A3. Replace synthetic reentry behavior with faithful reentry transition behavior

**Why this matters**  
The current `reentry` scene behaves like a bespoke mini-sequence instead of the original overlay’s state setup and asset loading.

**Evidence**
- `modern/web/src/scenes/reentry.ts:94-149` adds custom heat/pitch/hull logic
- original `detokenized_sources/RE.bas:9-17` is much simpler and state-driven

**Tasks**
- [ ] Trace original reentry state setup from `RE.bas`
- [ ] Remove custom reentry mechanics not supported by source
- [ ] Make planet-load/atmosphere/orientation behavior match the original transition more closely

**Definition of done**
- Reentry is a faithful port of original transition behavior, not a custom gameplay insert

---

## A4. Make radar and ship identification use real encounter state

**Why this matters**  
Radar and ship-ID fidelity depends on real encounter persistence across overlays.

**Evidence**
- `modern/web/src/scenes/radar.ts:4` uses fixed `ENEMY_POS`
- `analysis/LIVE_EMULATOR_EXTRACTIONS.md` shows encounter state persisting through multiple overlays
- `modern/web/src/scenes/shipId.ts` is a generic scene rather than tightly coupled to original per-ship overlay behavior

**Tasks**
- [ ] Replace fixed/simplified radar contact assumptions with encounter-backed state
- [ ] Confirm ship ID display behavior for ship kinds 0/1/3/4 matches original logic
- [ ] Verify overlay persistence between cockpit, radar, COM, ship ID, and ground forces

**Definition of done**
- Radar and ship ID reflect the same underlying encounter state the original game uses

---

## B. High-value gameplay fidelity work

## B1. Port ground-forces formulas and flow more literally

**Why this matters**  
Ground-forces outcomes affect campaign progression, troop loss, conquest, and balance.

**Evidence**
- `modern/web/src/scenes/groundForces.ts` contains substantial `Math.random()`-driven logic
- original `detokenized_sources/GROUND FORCES.bas` provides specific formulas and flow

**Tasks**
- [ ] Compare casualty, victory, retreat, and morale logic against `GROUND FORCES.bas`
- [ ] Replace broad approximation/random progression with source-derived formulas where possible
- [ ] Verify surrender/conquest routing matches the original game’s logic

**Definition of done**
- Ground-forces outcomes are driven primarily by source-backed formulas, not broad approximation

---

## B2. Port loot/economy/shore-leave formulas more literally

**Why this matters**  
Campaign pacing depends heavily on resource collection, repair costs, resupply, and troop/base economy.

**Evidence**
- `modern/web/src/scenes/collect.ts` uses approximate random accumulation
- `modern/web/src/scenes/shoreLeave.ts` uses approximate/randomized prices and outcomes
- originals: `detokenized_sources/COLLECT.bas`, `SHORE LEAVE.bas`, `SUPPLY.bas`

**Tasks**
- [ ] Reconcile collection logic with `COLLECT.bas`
- [ ] Reconcile repair, sale, troop, and base formulas with `SHORE LEAVE.bas`
- [ ] Confirm `STATUS` and `SUPPLY` displays reflect the same underlying values/units as the original

**Definition of done**
- Economy and collection loops are formula-faithful enough to preserve original balance and progression

---

## B3. Tighten opening-sequence fidelity

**Why this matters**  
The opening scene is a key first-impression area and is already known to have had false-positive captures and visual tuning.

**Evidence**
- `modern/web/src/engine/extractedOriginalData.ts:137-165` sets a tuned opening state
- original `detokenized_sources/START.bas:190-195` sets different startup values
- `HANDOVER.md` explicitly calls out opening-scene fidelity work

**Tasks**
- [ ] Reconcile tuned opening values against actual startup/orbit/cockpit evidence
- [ ] Decide which parts are faithful recreation vs intentional presentation adjustment
- [ ] Document any intentional deviation if retained

**Definition of done**
- Opening scene is either source-faithful or clearly documented as an intentional enhancement

---

## C. Medium-priority cleanup for fidelity confidence

## C1. Replace the DMG stub with a faithful equivalent

**Evidence**
- `modern/web/src/scenes/stubs.ts:4-50`
- `modern/web/src/pages/index.ts:31`
- original `detokenized_sources/DMG.bas` is minimal

**Tasks**
- [ ] Decide whether DMG should remain expanded or be restored to original behavior
- [ ] If faithful mode is the goal, reduce it to source-backed overlay behavior

---

## C2. Resolve remaining uncertain memory mappings

**Evidence**
- `modern/web/src/engine/gameState.ts:10-11`
- `modern/web/src/engine/gameState.ts:146`
- `HANDOVER.md` notes unresolved address questions

**Tasks**
- [ ] Resolve remaining TODO/uncertain addresses where practical
- [ ] Confirm `inOrbit` and related flags against original behavior
- [ ] Separate any conflated concepts such as defender-vs-tech if still mixed in scene logic

---

## C3. Verify full overlay transition parity end-to-end

**Why this matters**  
Most screens exist, but the port still needs confidence that the game flow matches the original over repeated transitions and campaign progression.

**Tasks**
- [ ] Verify cockpit → galaxy map → hyperdrive → cockpit/orbit/ground-forces loops against original flow
- [ ] Verify save/load/return-to-game flow against intended semantics for the web port
- [ ] Verify commander-mode routing against original intent where applicable

---

## D. Optional / non-blocking items

These should not block a “faithful port complete” milestone unless explicitly in scope:
- [ ] Three.js prototype maturation (`modern/threejs-port/`)
- [ ] `shipVectorDebug` polish
- [ ] additional visual enhancements beyond faithful reproduction
- [ ] cleanup/refactoring of large files like `cockpit.ts` for maintainability

---

## Suggested completion sequence

1. **Planet encounter-state extraction for all planets**
2. **Orbit/reentry fidelity pass**
3. **Radar + ship-ID encounter fidelity pass**
4. **Ground-forces formula pass**
5. **Loot/economy/shore-leave formula pass**
6. **Opening-sequence fidelity pass**
7. **Memory mapping / parity verification pass**
8. **Optional enhancement work**

---

## Current conclusion

The port is already strong in **breadth**: most original overlays exist in modern form.

The remaining work is primarily about **fidelity and source-backing**, especially:
- encounter-state coverage
- orbit/reentry behavior
- radar/ship-ID consistency
- combat/economy formulas
- removal of synthetic placeholders
