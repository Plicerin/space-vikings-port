# Gemma 4 Activity Report - Space Vikings Resurrected Port

## Project Overview
This session focused on transition from a "visual approximation" of the original *Space Vikings* game to a **ground-truth fidelity port**. Every major change was driven by data extracted directly from the detokenized Apple II BASIC source files and memory maps provided in the repository.

---

## Work Completed Today

### 1. UI & HUD Layout (Ground Truth Applied)
*   **Removed Modern Overlays:** Stripped all modern CSS styling, gradients, shadows, and extra "help" overlays that were not present in the original game.
*   **Accurate Labeling:** Implemented a clean Apple II-style layout for the cockpit HUD. 
*   **Exact Positioning:** Derived every label's row and column position (e.g., `SPEED`, `TURN`, `ENERGY`) directly from `INSTRUMENTS.bas`.
*   **Overlap Fixes:** Implemented clear-before-draw logic in menu helpers to prevent text overlapping, ensuring a clean render consistent with the original Apple II behavior.

### 2. Galaxy Map Fidelity
*   **Star System Names:** Updated all 20 systems (from `SOL` to `SHIVANDA`) to match the exact strings found on the disk image.
*   **Coordinate Scaling:** Implemented the original projection math:
    *   X-axis: $(X \times 10) - 35$
    *   Y-axis: $Y \times 5$
*   **Selection Logic:** Set selection tolerance to $\pm 1$ coordinate unit, matching the original BASIC logic.
*   **Visual Depth:** Implemented depth-dependent star shape changes (Shapes 6, 5, and 1) based on Z-coordinates as defined in `GALAXY MAP.bas`.
*   **Telemetry Info:** Updated selection text to show `STAR SYSTEM : [Name]`, `LOC. : [X] [Y] [Z]`, and the original `DISTANCE = [D] L/Y` calculation.

### 3. Flight Mechanics & Physics
*   **Coordinate Clamping:** Implemented the hard boundaries ($W1=20000, W2=-20000$) found in `STARSHIP SIMULATOR.bas`.
*   **Movement Math:** Replaced approximate movement with the exact scaling factors:
    *   $X1 = S \times (ZP \times XH)$
    *   $Z1 = S \times ZP \times ZH$
    *   $Y1 = S \times YP$
*   **HUD Telemetry:** Updated Row 24 values to use the original scaling factor $Q=1.41$ and `Math.floor` for integer conversion, ensuring telemetry matches the disk's output exactly.

### 4. Opening Scene Planet Rendering
*   **Removed Invented Logic:** Deleted the "point-cloud" approximation which was not based on disk data.
*   **Shape Table Integration:** Identified through `START.bas` and `ORBIT.bas` that the planet is rendered via the **Shape Table system** (`DRAW PL AT X,Y`).
*   **Correct Shape Index:** Configured the opening scene to use **Planet Index 0**, as specified by the `# 0` load command on the original disk image.
*   **Crash Resolution:** Fixed a `TypeError` by correctly passing the required renderer and table objects to the drawing function, ensuring stable rendering while assets load.

---

## Technical Summary of Ground Truth Mappings
| Feature | Source File | Key Logic/Data Extracted |
|---------|-------------|---------------------------|
| **HUD Labels** | `INSTRUMENTS.bas` | Exact Row/Col and Color indices for all labels. |
| **Map Scaling** | `GALAXY MAP.bas` | $X \times 10 - 35$, $Y \times 5$ projection logic. |
| **Flight Math** | `STARSHIP SIMULATOR.bas` | Movement scaling factors and coordinate clamping. |
| **Planet Shape** | `START.bas` / Memory Map | Planet Index 0 usage for opening sequence. |

## Status Summary
The port is now significantly more faithful to the original Apple II version. The "Guesswork" phase is complete; every major UI element, movement calculation, and map coordinate is now anchored to the detokenized BASIC source.

**Next Steps:**
1.  Refine combat animations/logic from `STARSHIP SIMULATOR.bas`.
2.  Implement remaining scene transitions based on original `RUN` commands.
3.  Finalize any missing minor memory flags (`$38201`, `$38164`).
