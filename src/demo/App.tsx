import { useEffect, useState } from 'react';
import {
  ImportDialog,
  PuzzleEditor,
  PuzzleLibrary,
  PuzzlePlayer,
  backgroundCss,
  newCollection,
  parseCollection,
  parsePuzzle,
  parsePuzzleSet,
  replaceAt,
  serializeCollection,
  type ImportSource,
  type LibraryPosition,
  type Puzzle,
  type PuzzleCollection,
} from '../index';

/** Esempi inclusi nel repository (cartella /examples). */
const EXAMPLES: Puzzle[] = Object.entries(
  import.meta.glob('../../examples/*.json', { eager: true, import: 'default' }) as Record<string, unknown>,
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, raw]) => parsePuzzle(raw).puzzle);

const EXAMPLES_NAME = 'Esempi';
const STORAGE_KEY = 'edenna-puzzle:collections';
/** Chiave della vecchia raccolta unica: viene migrata alla prima apertura. */
const LEGACY_KEY = 'edenna-puzzle:library';

const examplesCollection = (): PuzzleCollection => ({ name: EXAMPLES_NAME, puzzles: EXAMPLES });

function loadCollections(): PuzzleCollection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as { collections?: unknown[] };
      const list = (data.collections ?? [])
        .map((c) => parseCollection(c).collection)
        .filter((c) => c.puzzles.length);
      if (list.length) return list;
    }
  } catch {
    /* archivio corrotto: si prova la vecchia chiave, poi gli esempi */
  }
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const puzzles = parsePuzzleSet(legacy).map((r) => r.puzzle);
      if (puzzles.length) return [{ name: 'La mia raccolta', puzzles }];
    }
  } catch {
    /* ignorato */
  }
  return [examplesCollection()];
}

function saveCollections(list: PuzzleCollection[]) {
  try {
    const collections = list.map((c) => JSON.parse(serializeCollection(c)));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ collections }));
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* storage pieno o non disponibile */
  }
}

const THEMES = [
  { id: 'ep-theme-edenna', label: 'Edenna (chiaro)' },
  { id: 'ep-theme-edenna-dark', label: 'Edenna (scuro)' },
  { id: 'ep-theme-classic', label: 'Classico' },
];

export function App() {
  const [collections, setCollections] = useState<PuzzleCollection[]>(loadCollections);
  const [active, setActive] = useState<LibraryPosition>({ collection: 0, puzzle: 0 });
  const [view, setView] = useState<'edit' | 'play'>('edit');
  const [theme, setTheme] = useState(THEMES[0].id);
  const [solved, setSolved] = useState<Set<Puzzle>>(new Set());
  const [playKey, setPlayKey] = useState(0);
  /** Raccolta incollata nell'editor (scheda JSON) in attesa di conferma. */
  const [pasted, setPasted] = useState<ImportSource | null>(null);

  const ci = Math.min(active.collection, collections.length - 1);
  const col = collections[ci];
  const pi = Math.min(active.puzzle, col.puzzles.length - 1);
  const current = col.puzzles[pi];

  useEffect(() => saveCollections(collections), [collections]);

  const update = (p: Puzzle) =>
    setCollections((list) =>
      replaceAt(list, ci, { ...list[ci], puzzles: replaceAt(list[ci].puzzles, pi, p) }),
    );

  const playNext = (delta: number) => {
    const n = col.puzzles.length;
    setActive({ collection: ci, puzzle: (pi + delta + n) % n });
    setPlayKey((k) => k + 1);
  };

  const restoreExamples = () => {
    const i = collections.findIndex((c) => c.name === EXAMPLES_NAME);
    const msg =
      i >= 0
        ? `Ripristinare la raccolta «${EXAMPLES_NAME}» con gli esempi originali?`
        : `Aggiungere la raccolta «${EXAMPLES_NAME}» con gli esempi originali?`;
    if (!confirm(msg)) return;
    if (i >= 0) {
      setCollections(replaceAt(collections, i, examplesCollection()));
      setActive({ collection: i, puzzle: 0 });
    } else {
      setCollections([...collections, newCollection(EXAMPLES_NAME, collections, EXAMPLES)]);
      setActive({ collection: collections.length, puzzle: 0 });
    }
  };

  const label = (p: Puzzle, i: number) => p.title || `Puzzle ${i + 1}`;

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
        <button className="app-restore" onClick={restoreExamples}>
          Ripristina esempi
        </button>
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
        <PuzzleLibrary
          collections={collections}
          onChange={setCollections}
          active={{ collection: ci, puzzle: pi }}
          onActiveChange={setActive}
          isSolved={(p) => solved.has(p)}
          theme={theme}
        />

        <main className="app-main">
          {view === 'edit' ? (
            <PuzzleEditor
              value={current}
              onChange={update}
              onImportSet={(puzzles) =>
                setPasted({ name: 'Incollata', results: puzzles.map((puzzle) => ({ puzzle, warnings: [] })) })
              }
              theme={theme}
            />
          ) : (
            <div className="play" style={current.background ? { background: backgroundCss(current.background) } : undefined}>
              <div className="play-head">
                <button onClick={() => playNext(-1)} aria-label="Precedente">
                  ‹
                </button>
                <div>
                  <h1>{label(current, pi)}</h1>
                  {current.description && <p>{current.description}</p>}
                </div>
                <button onClick={() => playNext(1)} aria-label="Successivo">
                  ›
                </button>
              </div>
              <PuzzlePlayer
                key={`${ci}-${pi}-${playKey}`}
                puzzle={current}
                theme={theme}
                className="play-board"
                onSolve={() => setSolved((s) => new Set(s).add(current))}
              />
              <div className="play-foot">
                {solved.has(current) ? (
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

      <ImportDialog
        source={pasted}
        collections={collections}
        target={ci}
        theme={theme}
        onCancel={() => setPasted(null)}
        onConfirm={(r) => {
          setPasted(null);
          setCollections(r.collections);
          setActive({ collection: r.collection, puzzle: Math.max(0, r.puzzles.length - r.added) });
        }}
      />
    </div>
  );
}
