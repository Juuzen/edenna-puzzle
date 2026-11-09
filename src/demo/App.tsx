import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PuzzleEditor,
  PuzzlePlayer,
  PuzzleBoard,
  createPuzzle,
  parsePuzzle,
  parsePuzzleSet,
  serializePuzzleSet,
  type Puzzle,
} from '../index';

/** Esempi inclusi nel repository (cartella /examples). */
const EXAMPLES: Puzzle[] = Object.entries(
  import.meta.glob('../../examples/*.json', { eager: true, import: 'default' }) as Record<string, unknown>,
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, raw]) => parsePuzzle(raw).puzzle);

const STORAGE_KEY = 'edenna-puzzle:library';

interface Entry {
  key: string;
  puzzle: Puzzle;
}

const newKey = () => Math.random().toString(36).slice(2, 10);

function loadLibrary(): Entry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const list = parsePuzzleSet(raw).map((r) => ({ key: newKey(), puzzle: r.puzzle }));
      if (list.length) return list;
    }
  } catch {
    /* archivio assente o corrotto: si riparte dagli esempi */
  }
  return EXAMPLES.map((puzzle) => ({ key: newKey(), puzzle }));
}

const THEMES = [
  { id: 'ep-theme-edenna', label: 'Edenna (chiaro)' },
  { id: 'ep-theme-edenna-dark', label: 'Edenna (scuro)' },
  { id: 'ep-theme-classic', label: 'Classico' },
];

export function App() {
  const [library, setLibrary] = useState<Entry[]>(loadLibrary);
  const [selected, setSelected] = useState(0);
  const [view, setView] = useState<'edit' | 'play'>('edit');
  const [theme, setTheme] = useState(THEMES[0].id);
  const [solved, setSolved] = useState<Record<string, boolean>>({});
  const [playKey, setPlayKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const current = library[Math.min(selected, library.length - 1)];

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serializePuzzleSet(library.map((e) => e.puzzle)));
    } catch {
      /* storage pieno o non disponibile */
    }
  }, [library]);

  const update = (p: Puzzle) =>
    setLibrary((lib) => lib.map((e) => (e.key === current.key ? { ...e, puzzle: p } : e)));

  const add = (puzzles: Puzzle[]) => {
    setLibrary((lib) => [...lib, ...puzzles.map((puzzle) => ({ key: newKey(), puzzle }))]);
    setSelected(library.length);
  };

  const remove = () => {
    if (library.length <= 1) return;
    if (!confirm(`Eliminare «${current.puzzle.title || 'senza titolo'}» dalla raccolta?`)) return;
    setLibrary((lib) => lib.filter((e) => e.key !== current.key));
    setSelected((s) => Math.max(0, s - 1));
  };

  const move = (delta: number) => {
    const i = selected;
    const j = i + delta;
    if (j < 0 || j >= library.length) return;
    setLibrary((lib) => {
      const out = [...lib];
      [out[i], out[j]] = [out[j], out[i]];
      return out;
    });
    setSelected(j);
  };

  const exportSet = () => {
    const blob = new Blob([serializePuzzleSet(library.map((e) => e.puzzle))], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'raccolta-puzzle.json';
    a.click();
  };

  const importSet = async (f?: File) => {
    if (!f) return;
    try {
      add(parsePuzzleSet(await f.text()).map((r) => r.puzzle));
    } catch (e) {
      alert((e as Error).message);
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const playNext = (delta: number) => {
    setSelected((s) => (s + delta + library.length) % library.length);
    setPlayKey((k) => k + 1);
  };

  const label = (p: Puzzle, i: number) => p.title || `Puzzle ${i + 1}`;

  const thumbs = useMemo(
    () =>
      library.map((e) => (
        <PuzzleBoard key={e.key} puzzle={e.puzzle} className="lib-thumb" aria-hidden label="" />
      )),
    [library],
  );

  return (
    <div className={`app ${theme}`}>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ◢
          </span>
          <span className="brand-name">EDENNA</span>
          <span className="brand-sub">Laboratorio Puzzle</span>
        </div>
        <nav className="app-tabs">
          <button className={view === 'edit' ? 'is-active' : ''} onClick={() => setView('edit')}>
            Editor
          </button>
          <button
            className={view === 'play' ? 'is-active' : ''}
            onClick={() => {
              setView('play');
              setPlayKey((k) => k + 1);
            }}
          >
            Gioca
          </button>
        </nav>
        <label className="app-theme">
          <span>Tema</span>
          <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="app-body">
        <aside className="library" aria-label="Raccolta">
          <div className="library-head">
            <h2>Raccolta</h2>
            <span className="library-count">{library.length}</span>
          </div>
          <ol className="library-list">
            {library.map((e, i) => (
              <li key={e.key}>
                <button className={i === selected ? 'is-active' : ''} onClick={() => setSelected(i)}>
                  {thumbs[i]}
                  <span className="lib-text">
                    <span className="lib-title">{label(e.puzzle, i)}</span>
                    <span className="lib-meta">
                      {e.puzzle.id ?? '—'} · {e.puzzle.width}×{e.puzzle.height}
                      {solved[e.key] ? ' · ✓' : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="library-actions">
            <button onClick={() => add([createPuzzle(4, 4)])}>+ Nuovo</button>
            <button onClick={() => add([{ ...current.puzzle, id: current.puzzle.id ? `${current.puzzle.id}-copia` : undefined }])}>
              Duplica
            </button>
            <button onClick={() => move(-1)} title="Sposta su">
              ↑
            </button>
            <button onClick={() => move(1)} title="Sposta giù">
              ↓
            </button>
            <button onClick={remove} disabled={library.length <= 1} className="danger">
              Elimina
            </button>
          </div>
          <div className="library-actions">
            <button onClick={exportSet}>Esporta raccolta</button>
            <button onClick={() => fileRef.current?.click()}>Importa…</button>
            <button
              onClick={() => {
                if (confirm('Sostituire la raccolta con gli esempi originali?')) {
                  setLibrary(EXAMPLES.map((puzzle) => ({ key: newKey(), puzzle })));
                  setSelected(0);
                }
              }}
            >
              Ripristina esempi
            </button>
          </div>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => importSet(e.target.files?.[0])} />
        </aside>

        <main className="app-main">
          {view === 'edit' ? (
            <PuzzleEditor value={current.puzzle} onChange={update} onImportSet={add} theme={theme} />
          ) : (
            <div className="play">
              <div className="play-head">
                <button onClick={() => playNext(-1)} aria-label="Precedente">
                  ‹
                </button>
                <div>
                  <h1>{label(current.puzzle, selected)}</h1>
                  {current.puzzle.description && <p>{current.puzzle.description}</p>}
                </div>
                <button onClick={() => playNext(1)} aria-label="Successivo">
                  ›
                </button>
              </div>
              <PuzzlePlayer
                key={`${current.key}-${playKey}`}
                puzzle={current.puzzle}
                theme={theme}
                className="play-board"
                onSolve={() => setSolved((s) => ({ ...s, [current.key]: true }))}
              />
              <div className="play-foot">
                {solved[current.key] ? (
                  <>
                    <span className="ok">Completato.</span>
                    <button onClick={() => setPlayKey((k) => k + 1)}>Ricomincia</button>
                    <button onClick={() => playNext(1)}>Prossimo ›</button>
                  </>
                ) : (
                  <span>Clic sul cerchio, segui con il puntatore, clic sull’uscita. Oppure trascina, o usa frecce e Invio.</span>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
