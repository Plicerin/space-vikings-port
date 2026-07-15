# Space Vikings (Modern Web Remake)

This is the standalone Vite + TypeScript build for the modern cockpit/game loop remake.

## Development

```bash
cd "C:\Users\vrock\OneDrive\Documents\Space Vikings Resurrected\modern\web"
npm install
npm run dev
```

Open `http://127.0.0.1:5180/` and avoid iframing the app (the emulator path is embedded in the page links).

## Build

```bash
npm run build
```

The production output is written to `modern/web/dist/`.

## Local deployment preview

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

Then open `http://127.0.0.1:4173/`.

## GitHub Pages (recommended)

`/.github/workflows/deploy-modern-web.yml` builds and deploys `modern/web/dist/` using
GitHub Actions `main` branch pushes that touch `modern/web/**`.

To enable Pages:

1. Open repository Settings → Pages.
2. Set Source: `GitHub Actions`.
3. Push to `main` or use **Run workflow** in **Deploy modern/web**.

The page URL is published from the workflow output once deployment succeeds.

### One-command manual deploy

From `modern/web`, run:

```bash
npm run deploy
```

This runs a production build and publishes the `dist/` folder with `gh-pages`
(publishes the `gh-pages` branch by default).
