import fs from 'node:fs';
import path from 'node:path';

const planetIndex = Number(process.argv[2] ?? '1');
const inPath = path.resolve(`modern/shapes_json/PLANET no ${planetIndex}.payload.json`);
const outPath = path.resolve(`modern/web/tools/planet-shape-debug-${planetIndex}.html`);

const payload = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const shapes = payload.shapes.slice(0, 15);

function bounds(points) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}

const panels = shapes.map((shape) => {
  const b = bounds(shape.points);
  const pathData = shape.points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x - b.minX + 8} ${y - b.minY + 8}`).join(' ');
  const width = Math.max(80, b.width + 16);
  const height = Math.max(80, b.height + 16);
  return `
    <div class="panel">
      <div class="label">shape ${shape.id} | pts ${shape.points.length} | ${b.width}x${b.height}</div>
      <svg viewBox="0 0 ${width} ${height}" width="${width * 2}" height="${height * 2}">
        <rect x="0" y="0" width="${width}" height="${height}" fill="#000"/>
        <path d="${pathData}" stroke="#fff" fill="none" stroke-width="1"/>
      </svg>
    </div>
  `;
}).join('\n');

const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Planet ${planetIndex} Shape Debug</title>
  <style>
    body { margin:0; background:#111; color:#ddd; font-family: Consolas, monospace; }
    .grid { display:grid; grid-template-columns: repeat(3, 1fr); gap:16px; padding:16px; }
    .panel { background:#1a1a1a; padding:12px; border:1px solid #333; }
    .label { margin-bottom:8px; font-size:14px; }
    svg { background:#000; display:block; }
  </style>
</head>
<body>
  <div class="grid">${panels}</div>
</body>
</html>`;

fs.writeFileSync(outPath, html);
console.log(outPath);
