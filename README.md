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

All tooling runs in Docker — nothing needs to be installed on the host. The
`Makefile` is the entry point; `make help` lists every target.

```sh
make image-dev   # build the dev image
make install     # npm ci into the node_modules volume
make check       # biome + tsc --noEmit
make build       # bundle main/preload/renderer into out/
make destroy     # drop containers, local images and cache volumes
```

The containers run as your own uid/gid (the Makefile passes them in), so
nothing they write into the working directory comes back root-owned.

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

### Build tooling — known hurdles

This corner of the stack has been unusually high-friction; recorded here so
it isn't rediscovered the hard way again:

- **electron-forge's Vite plugin was a dead end**, not just slow — its own
  maintainers flag it non-production (electron/forge#4067), permanently
  pinned to `vite@^5`. This is why the whole build/package/publish pipeline
  was replaced with electron-vite + electron-builder (#56).
- **electron-builder defaults to publishing *draft* releases** and silently
  skips uploading *every* asset (installer, blockmap, update feed) if a
  release of a different type already exists for that tag — no error, just
  a quiet log line. release-please always creates a normal (non-draft)
  release before this workflow runs, so the very first release cut on the
  new pipeline (v2.0.0) shipped with nothing but a cosign signature
  attached to an otherwise-empty release. Fixed by pinning
  `publish.releaseType: release` in `electron-builder.yml` (#70), plus a
  `workflow_dispatch` escape hatch in `release.yml` to backfill a release
  without waiting for a new version bump (#70, #72).
- **Merging with the default merge-commit body double-lists every PR in the
  changelog.** GitHub's merge commit is `Merge pull request #N from ...`
  with the PR *title* as its body, and release-please reads a merge
  commit's body as its effective message — so the conventional PR title is
  counted once from the merge commit and again from the branch's own
  conventional commit. Every entry in `CHANGELOG.md` up to v4.5.0 appears
  twice for this reason (`ccf07ca`/`54ee6d4`, `eb433f2`/`50901b3`,
  `9d5555e`/`d5630e1`, ...). It can't be fixed with repository settings:
  GitHub only allows `MERGE_MESSAGE`+`PR_TITLE`, `PR_TITLE`+`PR_BODY` or
  `PR_TITLE`+`BLANK`, and the latter two just move the conventional text
  into the merge commit's *subject* instead. Merge with an empty body to
  avoid it:

  ```sh
  gh pr merge <N> --merge --body ""
  ```

  In the web UI, clear the message box below the merge commit title. The
  branch's own commits still supply the changelog entry, which is why the
  commit-msg hook enforcing Conventional Commits matters.
- **electron-vite is currently pinned to a beta** (`6.0.0-beta.1`) purely to
  get `vite@^8` support — the last stable release (`5.0.0`) caps at
  `vite@^7`. This is a deliberate, tracked trade-off (no dependabot ignore
  needed on `vite`/`@vitejs/plugin-react` as a result) — watch for
  electron-vite 6 going stable and re-pin to that once it lands.

## Packaging

```sh
make win
```

That produces the Windows NSIS installer in `dist/` **from Linux**, by
running electron-builder under Wine in a separate container
(`Dockerfile.win`, built on upstream's `electronuserland/builder:wine`).
The whole NSIS pipeline works there, uninstaller and block map included —
the uninstaller step runs the freshly-built installer under Wine, which is
why that image chowns `$HOME` to the build uid rather than just making it
writable (Wine refuses a `HOME` it doesn't own).

CI does the same thing on `ubuntu-latest` for both the per-PR installer
(`.github/workflows/build.yml`) and the published release
(`.github/workflows/release.yml`). It used to need a `windows-latest`
runner; it doesn't, and Windows minutes bill at 1.67x Linux.

Not covered: Authenticode signing. Releases are signed with cosign
(sigstore) over the finished `.exe`, so there's no `signtool` certificate in
play — a real code-signing cert would need its own look at whether Wine's
`signtool` is up to it.
