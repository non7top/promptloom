import fs from 'node:fs';
import path from 'node:path';

// App-level settings, deliberately stored OUTSIDE the library they point at:
// the library's own location can't live inside the library, or there'd be no
// way to find it on the next launch. This file stays in Electron's userData
// directory forever; everything else can move.
export interface Settings {
  // Absolute path to the active library (the folder holding
  // promptloom.sqlite and stashes/). Defaults to userData, which is where
  // every existing install already keeps its data — so an install that has
  // never opened Settings behaves exactly as before.
  libraryPath: string;
  // Most-recently-used libraries, newest first, for quick switching.
  recent: string[];
}

const MAX_RECENT = 8;

let settingsPath: string;
let defaultLibraryPath: string;
let cache: Settings | null = null;

export function initSettings(userDataPath: string): void {
  settingsPath = path.join(userDataPath, 'settings.json');
  defaultLibraryPath = userDataPath;
  cache = null;
}

function defaults(): Settings {
  return { libraryPath: defaultLibraryPath, recent: [] };
}

export function loadSettings(): Settings {
  if (cache) return cache;
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as Partial<Settings>;
    cache = {
      // A settings file naming a library that has since been deleted or
      // unplugged (external drive, unmounted share) would otherwise leave
      // the app pointed at nothing with no way back — fall back to the
      // default location rather than failing to start.
      libraryPath:
        typeof raw.libraryPath === 'string' && fs.existsSync(raw.libraryPath)
          ? raw.libraryPath
          : defaultLibraryPath,
      recent: Array.isArray(raw.recent) ? raw.recent.filter((p) => typeof p === 'string') : [],
    };
  } catch {
    // Missing file on first run, or a corrupt/half-written one. Neither is
    // worth failing a launch over: the defaults are always usable.
    cache = defaults();
  }
  return cache;
}

function persist(next: Settings): void {
  cache = next;
  // Write-then-rename so an interrupted write can't leave a truncated
  // settings.json behind — the failure mode there is losing track of which
  // library is the active one.
  const tmp = `${settingsPath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
  fs.renameSync(tmp, settingsPath);
}

export function getLibraryPath(): string {
  return loadSettings().libraryPath;
}

export function getDefaultLibraryPath(): string {
  return defaultLibraryPath;
}

export function setLibraryPath(libraryPath: string): Settings {
  const current = loadSettings();
  const recent = [
    current.libraryPath,
    ...current.recent.filter((p) => p !== current.libraryPath && p !== libraryPath),
  ]
    .filter((p) => p !== libraryPath)
    .slice(0, MAX_RECENT);
  const next: Settings = { libraryPath, recent };
  persist(next);
  return next;
}
