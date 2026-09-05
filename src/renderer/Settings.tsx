import { useEffect, useState } from 'react';
import type { LibraryInfo, MigrationReport } from '../shared/types';

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function Settings() {
  const [info, setInfo] = useState<LibraryInfo | null>(null);
  const [report, setReport] = useState<MigrationReport | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingMigrate, setConfirmingMigrate] = useState(false);

  const reload = async () => {
    setInfo(await window.promptloom.getLibraryInfo());
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: reload is redefined every render (not memoized), so listing it would re-run this on every render instead of once on mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, []);

  const run = async <T,>(label: string, action: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    setStatus(`${label}…`);
    try {
      const result = await action();
      setStatus(null);
      return result;
    } catch (err) {
      setStatus(`${label} failed: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  const changeLibrary = async () => {
    const chosen = await window.promptloom.chooseLibrary();
    if (!chosen) return;
    const accepted = await window.promptloom.openLibrary(chosen);
    if (!accepted) {
      setStatus(
        `${chosen} is neither an existing library nor an empty folder — pick an empty folder to start a new library.`,
      );
    }
    // On success the app relaunches, so there is nothing to do here.
  };

  const dryRun = async () => {
    const result = await run('Checking', () => window.promptloom.planMigration());
    if (result) setReport(result);
  };

  const migrate = async () => {
    setConfirmingMigrate(false);
    const result = await run('Migrating', () => window.promptloom.runMigration());
    if (result) {
      setReport(result);
      setStatus(
        result.errors.length
          ? `Finished with ${result.errors.length} error(s); ${result.moved} moved.`
          : `Moved ${result.moved} image${result.moved === 1 ? '' : 's'} into stash folders.`,
      );
      reload();
    }
  };

  const rollback = async () => {
    const result = await run('Rolling back', () => window.promptloom.rollbackMigration());
    if (result === null) {
      setStatus('No migration manifest found — nothing to roll back.');
    } else if (result) {
      setStatus(`Restored ${result.restored} file${result.restored === 1 ? '' : 's'}.`);
      setReport(null);
      reload();
    }
  };

  const backup = async () => {
    const target = await run('Backing up', () => window.promptloom.backupLibrary());
    if (target) setStatus(`Snapshot written to ${target}`);
  };

  const integrity = async () => {
    const result = await run('Checking integrity', () => window.promptloom.checkIntegrity());
    if (result) setStatus(result.ok ? 'Database integrity: ok' : `Database problems:\n${result.detail}`);
  };

  if (!info) return <p className="hint">Loading…</p>;

  return (
    <div className="settings">
      <section className="category">
        <header>
          <strong>Library</strong>
        </header>
        <p className="settings-path" title={info.libraryPath}>
          {info.libraryPath}
        </p>
        <div className="settings-actions">
          <button onClick={changeLibrary} disabled={busy}>
            Change library…
          </button>
        </div>
        {/* SQLite on a synced or network folder is the one realistic way to
            actually corrupt the database, so warn where it can be seen at
            the moment of choosing rather than burying it in a README. */}
        <p className="hint">
          Keep the library on a local disk. OneDrive, Dropbox and network shares can corrupt
          SQLite, and two copies of the app open on one library will fight over locks.
        </p>
        {info.recent.length > 0 && (
          <ul className="item-list">
            {info.recent.map((entry) => (
              <li key={entry}>
                <span className="settings-path">{entry}</span>
                <button onClick={() => window.promptloom.openLibrary(entry)} disabled={busy}>
                  Open
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="category">
        <header>
          <strong>Contents</strong>
        </header>
        <ul className="item-list">
          <li>
            <span>Generations</span>
            <span>{info.generations.toLocaleString()}</span>
          </li>
          <li>
            <span>Groups</span>
            <span>{info.groups.toLocaleString()}</span>
          </li>
          <li>
            <span>Images</span>
            <span>{formatBytes(info.imageBytes)}</span>
          </li>
          <li>
            <span>Database</span>
            <span>{formatBytes(info.dbBytes)}</span>
          </li>
          <li>
            <span>Free space</span>
            <span>{formatBytes(info.freeBytes)}</span>
          </li>
          <li>
            <span>Layout</span>
            <span>{info.migrated ? 'stash folders' : 'flat images/'}</span>
          </li>
        </ul>
      </section>

      <section className="category">
        <header>
          <strong>Maintenance</strong>
        </header>
        <div className="settings-actions">
          <button onClick={dryRun} disabled={busy}>
            Dry run
          </button>
          <button onClick={backup} disabled={busy}>
            Back up now
          </button>
          <button onClick={integrity} disabled={busy}>
            Check integrity
          </button>
        </div>
        <div className="settings-actions">
          {confirmingMigrate ? (
            <>
              <span className="hint">Move every image into its stash folder?</span>
              <button className="btn-primary" onClick={migrate} disabled={busy}>
                Yes, migrate
              </button>
              <button onClick={() => setConfirmingMigrate(false)}>Cancel</button>
            </>
          ) : (
            <button
              className="btn-primary"
              onClick={() => setConfirmingMigrate(true)}
              disabled={busy || info.migrated}
            >
              {info.migrated ? 'Already migrated' : 'Migrate to stash folders'}
            </button>
          )}
          <button className="btn-danger-mild" onClick={rollback} disabled={busy}>
            Roll back
          </button>
        </div>
        {status && <p className="hint settings-status">{status}</p>}
      </section>

      {report && (
        <section className="category">
          <header>
            <strong>{report.dryRun ? 'Dry run' : 'Migration result'}</strong>
          </header>
          <ul className="item-list">
            <li>
              <span>Total rows</span>
              <span>{report.totalRows.toLocaleString()}</span>
            </li>
            <li>
              <span>{report.dryRun ? 'To move' : 'Moved'}</span>
              <span>{(report.dryRun ? report.toMove : report.moved).toLocaleString()}</span>
            </li>
            <li>
              <span>Already in folders</span>
              <span>{report.alreadyMigrated.toLocaleString()}</span>
            </li>
            <li>
              <span>Missing files</span>
              <span>{report.missingFiles.toLocaleString()}</span>
            </li>
            <li>
              <span>Free / required</span>
              <span>
                {formatBytes(report.freeBytes)} / {formatBytes(report.requiredBytes)}
              </span>
            </li>
          </ul>
          {report.backupPath && <p className="hint">Snapshot: {report.backupPath}</p>}
          {report.collisions.length > 0 && (
            <p className="error">
              {report.collisions.length} folder name collision(s) — rename these stashes first:{' '}
              {report.collisions.map((c) => c.labels.join(' / ')).join('; ')}
            </p>
          )}
          {report.errors.map((error) => (
            <p className="error" key={error}>
              {error}
            </p>
          ))}
          {report.dryRun && report.groups.length > 0 && (
            <ul className="item-list">
              {report.groups.map((group) => (
                <li key={group.label}>
                  <span className="settings-path">{group.folder}</span>
                  <span>{group.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
