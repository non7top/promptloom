import { useEffect, useRef, useState } from 'react';
import type { Generation } from '../shared/types';

const DELETE_UNDO_WINDOW_MS = 10_000;

// Deterministic per-stash color (same label always gets the same shade, no
// two labels drift on every reload) so stashes are easier to tell apart at a
// glance without users having to read the header text first.
function stashColor(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  }
  return `hsl(${hash % 360}, 65%, 93%)`;
}

function groupByLabel(generations: Generation[]): [string, Generation[]][] {
  const groups = new Map<string, Generation[]>();
  for (const generation of generations) {
    const label = generation.batchLabel || 'Unsorted';
    const group = groups.get(label) ?? [];
    group.push(generation);
    groups.set(label, group);
  }
  return Array.from(groups.entries());
}

export default function Gallery() {
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [confirmingLabel, setConfirmingLabel] = useState<string | null>(null);
  const [zoomedUrl, setZoomedUrl] = useState<string | null>(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const deleteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const [collapsedLabels, setCollapsedLabels] = useState<Set<string>>(new Set());
  const [renamingLabel, setRenamingLabel] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const reload = async () => {
    setGenerations(await window.promptloom.listGenerations());
  };

  useEffect(() => {
    // Initial IPC data load on mount, not a subscription to an external system.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, []);

  useEffect(() => {
    // Any still-pending timers when the Gallery tab unmounts should still
    // go through with the delete rather than silently getting abandoned.
    const timers = deleteTimers.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  // Deleting one image is a soft, undoable action: it visually collapses
  // right away, then only actually deletes once the undo window elapses —
  // unlike a whole stash, which needs an explicit Yes/No click instead.
  const scheduleDelete = (id: number) => {
    setPendingDeleteIds((prev) => new Set(prev).add(id));
    const timer = setTimeout(async () => {
      deleteTimers.current.delete(id);
      await window.promptloom.deleteGeneration(id);
      setPendingDeleteIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      reload();
    }, DELETE_UNDO_WINDOW_MS);
    deleteTimers.current.set(id, timer);
  };

  const undoDelete = (id: number) => {
    const timer = deleteTimers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      deleteTimers.current.delete(id);
    }
    setPendingDeleteIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const saveAs = async (id: number) => {
    await window.promptloom.saveGenerationAs(id);
  };

  const removeGroup = async (label: string) => {
    await window.promptloom.deleteBatch(label);
    setConfirmingLabel(null);
    reload();
  };

  const startRename = (label: string) => {
    setRenameValue(label);
    setRenamingLabel(label);
  };

  const saveRename = async (oldLabel: string) => {
    const newLabel = renameValue.trim();
    if (newLabel && newLabel !== oldLabel) {
      await window.promptloom.renameBatch(oldLabel, newLabel);
      reload();
    }
    setRenamingLabel(null);
  };

  const setStashOpen = (label: string, open: boolean) => {
    setCollapsedLabels((prev) => {
      const next = new Set(prev);
      if (open) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  if (generations.length === 0) {
    return <p className="hint">No generations captured yet.</p>;
  }

  return (
    <div>
      {groupByLabel(generations).map(([label, group]) => (
        <details
          className="category"
          key={label}
          style={{ background: stashColor(label) }}
          open={!collapsedLabels.has(label)}
          onToggle={(e) => setStashOpen(label, e.currentTarget.open)}
        >
          <summary>
            {renamingLabel === label ? (
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveRename(label);
                  if (e.key === 'Escape') setRenamingLabel(null);
                }}
                onBlur={() => saveRename(label)}
                autoFocus
              />
            ) : (
              <strong>
                {label} ({group.length})
              </strong>
            )}
            <button
              className="btn-rename btn-docked-corner btn-docked-corner-2nd"
              title="Rename"
              aria-label="Rename"
              onClick={(e) => {
                e.stopPropagation();
                startRename(label);
              }}
            >
              ✏️
            </button>
            <button
              className="btn-danger-mild btn-docked-corner"
              title="Delete group"
              aria-label="Delete group"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmingLabel(label);
                // The confirmation prompt lives outside <summary>, which a
                // closed <details> hides — force it open so it's visible.
                setStashOpen(label, true);
              }}
            >
              🗑️
            </button>
          </summary>
          {confirmingLabel === label && (
            <div className="confirm-delete-group">
              <span className="hint">Delete this whole group?</span>
              <button
                className="btn-danger-strong"
                onClick={() => removeGroup(label)}
              >
                Yes
              </button>
              <button onClick={() => setConfirmingLabel(null)}>No</button>
            </div>
          )}
          <ul className="gallery">
            {group.map((generation) => {
              const fullText = generation.seed
                ? `${generation.promptText} - seed ${generation.seed}`
                : generation.promptText;
              if (pendingDeleteIds.has(generation.id)) {
                return (
                  <li key={generation.id} className="gallery-pending-delete">
                    <span className="hint">Deleting…</span>
                    <button onClick={() => undoDelete(generation.id)}>Undo</button>
                  </li>
                );
              }
              return (
                <li key={generation.id}>
                  <img
                    src={generation.imageUrl}
                    alt={generation.promptText}
                    onClick={() => setZoomedUrl(generation.imageUrl)}
                  />
                  <details>
                    <summary>{fullText}</summary>
                    <p>{fullText}</p>
                  </details>
                  <div className="gallery-actions">
                    <button
                      className="btn-danger-mild btn-icon"
                      title="Delete"
                      aria-label="Delete"
                      onClick={() => scheduleDelete(generation.id)}
                    >
                      🗑️
                    </button>
                    <button className="btn-save" onClick={() => saveAs(generation.id)}>
                      Save as...
                    </button>
                    <button
                      onClick={() => navigator.clipboard.writeText(generation.promptText)}
                    >
                      Copy prompt
                    </button>
                    <button
                      className="btn-icon"
                      disabled={!generation.seed}
                      title="Copy seed"
                      aria-label="Copy seed"
                      onClick={() => generation.seed && navigator.clipboard.writeText(generation.seed)}
                    >
                      🌱
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <button className="collapse-stash" onClick={() => setStashOpen(label, false)}>
            ▲ Collapse
          </button>
          {!collapsedLabels.has(label) && (
            <button
              className="collapse-side-strip"
              title="Collapse"
              aria-label="Collapse"
              onClick={() => setStashOpen(label, false)}
            />
          )}
        </details>
      ))}
      {zoomedUrl && (
        <div className="lightbox-backdrop" onClick={() => setZoomedUrl(null)}>
          <img src={zoomedUrl} alt="" />
        </div>
      )}
    </div>
  );
}
