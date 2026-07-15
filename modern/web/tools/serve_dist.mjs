import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.argv[2] ?? 5180);
const host = '127.0.0.1';
const root = path.resolve('dist');
const types = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon'],
]);

http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${host}:${port}`);
  const requested = decodeURIComponent(url.pathname);
  const target = path.join(root, requested === '/' ? 'index.html' : requested);

  if (!target.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(target, (err, data) => {
    if (err) {
      fs.readFile(path.join(root, 'index.html'), (indexErr, indexData) => {
        if (indexErr) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(indexData);
      });
      return;
    }
    res.writeHead(200, {
      'Content-Type': types.get(path.extname(target)) ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}).listen(port, host, () => {
  console.log(`Serving ${root} at http://${host}:${port}/`);
});
