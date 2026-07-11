import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 4545, host: '127.0.0.1', strictPort: true },
  build: { target: 'es2022', outDir: 'dist' },
  // Pin PostCSS to an inline (empty) config so Vite doesn't walk up the
  // directory tree and pick up an unrelated postcss.config.* from a parent.
  css: { postcss: { plugins: [] } },
});
