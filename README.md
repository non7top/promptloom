# PromptLoom

Batch-compose and generate images on [perchance.org's AI text-to-image
generator](https://perchance.org/ai-text-to-image-generator) from reusable
pose / clothes / character / smile definitions, capturing each result's image
and seed for reproducibility.

See [project.md](project.md) for the original brief.

## How it works

- Define reusable categories (pose, clothes, character, smile, ...) and the
  items within them.
- Compose a batch by selecting one or more items per category; PromptLoom
  queues every combination.
- An embedded browser (Electron's Chromium) drives the actual perchance page:
  injecting the composed prompt, clicking Generate, and capturing the
  resulting image + seed once ready.
- Everything is stored locally (SQLite + image files) so past generations are
  searchable and reproducible by seed.

perchance.org sits behind a Cloudflare bot check. PromptLoom persists the
browser session (cookies) across restarts, so you only need to clear that
challenge by hand once per machine.

## Development

All tooling runs in Docker — nothing needs to be installed on the host.

```sh
docker compose build dev
docker compose run --rm dev npm install
docker compose run --rm dev npm run lint
docker compose run --rm dev npx tsc --noEmit
```

To run the app itself, Electron needs a display. On Linux, forward your X
server into the container:

```sh
xhost +local:docker
docker compose run --rm -e DISPLAY dev npm start
```

On the target platform (Windows), just run `npm start` directly, no Docker
needed.

Under pure headless Xvfb (no forwarded X server), the app boots fine, but
Chromium's GPU process can crash once the webview loads the real,
JS-heavy perchance page (confirmed unrelated to this app's own code — swapping
the webview's `src` to `about:blank` runs indefinitely without issue). Use the
X11-forwarding setup above for anything that needs to exercise the live page.

## Dependencies

Kept deliberately short so pruning unused packages later is easy.

Runtime:
- `react`, `react-dom` — renderer UI (Definitions/Composer)
- `electron-squirrel-startup` — handles Windows install/uninstall shortcuts

Storage uses Node's built-in `node:sqlite` (stable in the Node version
Electron 43 bundles) — no SQLite dependency needed.

Dev/build:
- `electron`, `@electron-forge/cli` + `plugin-vite` + `plugin-fuses` +
  `maker-squirrel`/`maker-zip`/`maker-deb`/`maker-rpm` + `publisher-github` +
  `@electron/fuses` — build, package, and publish the app
- `vite`, `@vitejs/plugin-react` — bundling; the React plugin is pinned to
  the 4.x line (not the latest 6.x) because `@electron-forge/plugin-vite`
  currently requires Vite 5
- `typescript`, `@types/node`, `@types/react`, `@types/react-dom`,
  `@types/electron-squirrel-startup` — type-checking
- `eslint` + `@typescript-eslint/*` + `eslint-plugin-import` +
  `eslint-plugin-react` + `eslint-plugin-react-hooks` — linting

## Packaging

```sh
docker compose run --rm dev npm run make
```

Windows installers are built by CI on a `windows-latest` runner (see
`.github/workflows/release.yml`), since Squirrel packaging targets Windows
specifically.
