import { useEffect, useState } from 'react';
import type { Generation } from '../shared/types';

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

  const reload = async () => {
    setGenerations(await window.promptloom.listGenerations());
  };

  useEffect(() => {
    // Initial IPC data load on mount, not a subscription to an external system.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, []);

  const remove = async (id: number) => {
    await window.promptloom.deleteGeneration(id);
    reload();
  };

  const saveAs = async (id: number) => {
    await window.promptloom.saveGenerationAs(id);
  };

  const removeGroup = async (label: string) => {
    await window.promptloom.deleteBatch(label);
    setConfirmingLabel(null);
    reload();
  };

  if (generations.length === 0) {
    return <p className="hint">No generations captured yet.</p>;
  }

  return (
    <div>
      {groupByLabel(generations).map(([label, group]) => (
        <section className="category" key={label}>
          <header>
            <strong>{label}</strong>
            {confirmingLabel === label ? (
              <>
                <span className="hint">Delete this whole group?</span>
                <button onClick={() => removeGroup(label)}>Yes</button>
                <button onClick={() => setConfirmingLabel(null)}>No</button>
              </>
            ) : (
              <button onClick={() => setConfirmingLabel(label)}>Delete group</button>
            )}
          </header>
          <ul className="gallery">
            {group.map((generation) => (
              <li key={generation.id}>
                <img src={generation.imageUrl} alt={generation.promptText} />
                <p>{generation.promptText}</p>
                <p className="hint">
                  {generation.seed ? `Seed: ${generation.seed}` : 'No seed captured'}
                </p>
                <button onClick={() => saveAs(generation.id)}>Save as...</button>
                <button onClick={() => remove(generation.id)}>Delete</button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
