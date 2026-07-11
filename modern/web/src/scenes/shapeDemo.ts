import type { SceneContext, SceneManager } from '../engine/sceneManager';
import { decodeShapeTableJson, ShapeRenderer } from '../engine/shapeTable';

// Phase 1 smoke test: load PLANET no 0's shape table and render every shape
// in a grid. Each cell varies SCALE / ROT to confirm the interpreter handles
// both. Not part of the final game flow — exists to validate the renderer.
//
// Live URL while the dev server is running:
//   http://127.0.0.1:5174/?scene=shapes
// (Or via the chain from the title screen — start.ts calls run('shapes').)
export async function shapeDemoScene(ctx: SceneContext, _scenes: SceneManager): Promise<void> {
  const { hires, loader } = ctx;
  const json = await loader.json<{ shapes: Array<{ id: number; raw_bytes: string }> }>(
    'data/shapes/planet-0.json',
  );
  const table = decodeShapeTableJson(json);
  const renderer = new ShapeRenderer(hires);

  hires.hgr();

  // Title bar
  hires.hcolor(3);
  hires.text('PHASE 1 - SHAPE TABLE DEMO', 7, 1);
  hires.hcolor(1);
  hires.text(`PLANET no 0  (${table.shapes.length} shapes)`, 7, 2);

  // Grid of cells. 280 wide, 192 tall. Title takes rows 1-2 (≈16px).
  // Cells: 5 cols × 3 rows = 15 = matches shape count exactly.
  const cols = 5;
  const rows = Math.ceil(table.shapes.length / cols);
  const left = 4;
  const top = 22;
  const cellW = (280 - left * 2) / cols;
  const cellH = (192 - top - 6) / rows;

  hires.hcolor(2);
  for (let i = 0; i <= rows; i++) {
    const y = Math.round(top + i * cellH);
    hires.line(left, y, left + cols * cellW, y);
  }
  for (let i = 0; i <= cols; i++) {
    const x = Math.round(left + i * cellW);
    hires.line(x, top, x, top + rows * cellH);
  }

  // Each shape rendered inside its cell, anchored at the cell centre. Apple II
  // shapes are tiny at SCALE=1 (raw vector lengths are 1 pixel each), so we
  // use SCALE=3 for visibility. Last column gets ROT=16 (90°) to confirm
  // rotation works.
  hires.hcolor(5);
  for (let idx = 0; idx < table.shapes.length; idx++) {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    const cx = Math.round(left + c * cellW + cellW / 2);
    const cy = Math.round(top + r * cellH + cellH / 2);
    renderer.scale = 3;
    renderer.rot = c === cols - 1 ? 16 : 0;
    renderer.draw(table, idx, cx, cy);
  }

  hires.hcolor(1);
  hires.text('SCALE=3      LAST COL ROT=16 (90DEG)', 4, 23);
}
