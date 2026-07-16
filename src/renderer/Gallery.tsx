import { useEffect, useState } from 'react';
import type { Generation } from '../shared/types';

export default function Gallery() {
  const [generations, setGenerations] = useState<Generation[]>([]);

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

  if (generations.length === 0) {
    return <p className="hint">No generations captured yet.</p>;
  }

  return (
    <ul className="gallery">
      {generations.map((generation) => (
        <li key={generation.id}>
          <img src={generation.imageUrl} alt={generation.promptText} />
          <p>{generation.promptText}</p>
          <p className="hint">
            {generation.seed ? `Seed: ${generation.seed}` : 'No seed captured'}
          </p>
          <button onClick={() => remove(generation.id)}>Delete</button>
        </li>
      ))}
    </ul>
  );
}
