# PromptLoom

A companion app for keeping track of prompt/seed combinations while working
on sprites for visual novels, using [perchance.org's AI text-to-image
generator](https://perchance.org/ai-text-to-image-generator). It composes
prompts from reusable pose / clothes / character / smile definitions and
captures each result's image and seed for reproducibility — it is not
intended to bypass any restrictions of the platform or otherwise abuse it.

See [project.md](project.md) for the original brief.

## How it works

- Define reusable categories (pose, clothes, character, smile, ...) and the
  items within them.
- In the Composer, select one or more items per category and name a
  "stash" (a named group for whatever you're about to generate), then hit
  Start. PromptLoom populates the perchance prompt field for the first
  combination — you review it and click Generate yourself.
- Once images appear, click perchance's own per-image 🛡️💾 save button on
  whichever ones you actually like — PromptLoom intercepts that call so it
  saves to your Gallery too — then click "Populate next prompt" to move to
  the next combination.
- Saving reads the prompt and seed directly from the image itself (perchance
  embeds both), so what's stored is always exactly what was submitted, not
  just what PromptLoom composed. Everything lands in the Gallery grouped by
  stash, stored locally (SQLite + image files) and reproducible by seed.

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
Chromium's GPU process can crash once the embedded perchance view loads the
real, JS-heavy page (confirmed unrelated to this app's own code — temporarily
pointing `PERCHANCE_URL` in `src/main/perchanceView.ts` at `about:blank` runs
indefinitely without issue). Use the X11-forwarding setup above for anything
that needs to exercise the live page.

## Dependencies

Kept deliberately short so pruning unused packages later is easy.

Runtime:
- `react`, `react-dom` — renderer UI (Definitions/Composer)
- `electron-context-menu` — Electron shows no right-click menu anywhere by
  default; this adds the standard cut/copy/paste/inspect-element menu

Storage uses Node's built-in `node:sqlite` (stable in the Node version
Electron 43 bundles) — no SQLite dependency needed.

Dev/build:
- `electron`, `electron-vite`, `electron-builder`, `@electron/fuses` — build,
  package, and publish the app. `@electron/fuses` is applied directly via
  `scripts/afterPack.cjs` (an electron-builder `afterPack` hook), since
  electron-builder has no built-in fuses support.
- `vite`, `@vitejs/plugin-react` — bundling, driven by `electron.vite.config.ts`
- `typescript`, `@types/node`, `@types/react`, `@types/react-dom` — type-checking
- `@biomejs/biome` — linting (`biome.json`; formatter/import-sorting deliberately
  left off, this only replaces the old eslint linting setup)

Previously linted with `eslint` + `@typescript-eslint/*` + `eslint-plugin-import` +
`eslint-plugin-react` + `eslint-plugin-react-hooks`; switched to Biome because
`@typescript-eslint` depends on TypeScript's own compiler API to parse/type-check,
which structurally can't keep pace with TypeScript's release cadence — it capped
us at `typescript <6.1.0` while upstream was already at `7.x`. Biome ships its own
TS/JSX parser independent of `tsc`, so it isn't hostage to that lag.

Previously built on `@electron-forge/cli` + `plugin-vite`; migrated off it
because forge's Vite integration is explicitly non-production per its own
maintainers (electron/forge#4067) and pinned to vite@^5 with no updated
release in sight.

## Packaging

```sh
docker compose run --rm dev npm run make
```

Windows installers (NSIS) are built by CI on a `windows-latest` runner (see
`.github/workflows/release.yml`) — electron-builder's NSIS/deb/rpm targets
all cross-build from Linux except Windows's, which needs a real Windows host.
