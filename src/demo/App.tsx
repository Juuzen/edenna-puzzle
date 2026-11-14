import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ImportDialog,
  PuzzleEditor,
  PuzzleLibrary,
  PuzzlePlayer,
  allPuzzleIds,
  backgroundCss,
  ensureIds,
  hasShift,
  parseCollection,
  parsePuzzle,
  parsePuzzleSet,
  rainbowBackgroundCss,
  rainbowStyle,
  syncRainbowClock,
  replacePuzzleById,
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

/** Raccolte salvate, con gli id interni garantiti (assegnati se mancano). */
function loadCollections(): PuzzleCollection[] {
  return ensureIds(readCollections());
}

function readCollections(): PuzzleCollection[] {
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

export function App() {
  const [collections, setCollections] = useState<PuzzleCollection[]>(loadCollections);
  const [active, setActive] = useState<LibraryPosition>({ collection: 0, puzzle: 0 });
  const [view, setView] = useState<'edit' | 'play'>('edit');
  /** Id dei puzzle risolti in questa sessione. */
  const [solved, setSolved] = useState<Set<string>>(new Set());
  const [playKey, setPlayKey] = useState(0);
  /** Raccolta visibile o nascosta: nascosta lascia più spazio alla board. */
  const [libraryOpen, setLibraryOpen] = useState(true);
  /** Raccolta incollata nell'editor (scheda JSON) in attesa di conferma. */
  const [pasted, setPasted] = useState<ImportSource | null>(null);

  const ci = Math.min(active.collection, collections.length - 1);
  const col = collections[ci];
  const pi = Math.min(active.puzzle, col.puzzles.length - 1);
  const current = col.puzzles[pi];

  // Contorno della pagina di gioco: se lo sfondo è in arcobaleno cicla in
  // fase con il pannello (stesso orologio, vedi syncRainbowClock).
  const rbBgPeriod = current.rainbow?.background?.period;
  const bgKey = current.background?.colors.join() ?? '';
  const playRainbow = useMemo(
    () => (rbBgPeriod ? rainbowStyle({ background: { period: rbBgPeriod } }, current.background) : null),
    [rbBgPeriod, bgKey],
  );
  const playRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => syncRainbowClock(playRef.current), [playRainbow, view]);
  const playStyle = playRainbow
    ? { ...playRainbow.style, background: rainbowBackgroundCss(current.background) }
    : current.background
      ? { background: backgroundCss(current.background) }
      : undefined;

  useEffect(() => saveCollections(collections), [collections]);

  // I puzzle eliminati non restano segnati come risolti (gli id possono essere riusati).
  useEffect(() => {
    const ids = new Set(allPuzzleIds(collections));
    setSolved((s) => ([...s].every((id) => ids.has(id)) ? s : new Set([...s].filter((id) => ids.has(id)))));
  }, [collections]);

  /** Ogni modifica passa da qui: gli id interni restano sempre presenti e univoci. */
  const changeCollections = (list: PuzzleCollection[]) => setCollections(ensureIds(list));

  // L'editor emette il puzzle modificato: si aggiorna quello con lo stesso id,
  // ovunque sia, mai "quello selezionato adesso".
  const update = (p: Puzzle) => setCollections((list) => replacePuzzleById(list, p));

  const isSolved = (p: Puzzle) => !!p.id && solved.has(p.id);

  const playNext = (delta: number) => {
    const n = col.puzzles.length;
    setActive({ collection: ci, puzzle: (pi + delta + n) % n });
    setPlayKey((k) => k + 1);
  };

  const label = (p: Puzzle, i: number) => p.title || `Puzzle ${i + 1}`;

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            ◢
          </span>
          <span className="brand-name">EDENNA</span>
          <span className="brand-sub">Laboratorio Puzzle</span>
        </div>
        <button
          type="button"
          className="app-library-toggle"
          aria-pressed={libraryOpen}
          aria-controls="app-library"
          onClick={() => setLibraryOpen((o) => !o)}
        >
          Raccolta
        </button>
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
      </header>

      <div className={`app-body${libraryOpen ? '' : ' app-body--wide'}`}>
        {libraryOpen && (
          <div id="app-library" className="app-library">
            <PuzzleLibrary
              collections={collections}
              onChange={changeCollections}
              active={{ collection: ci, puzzle: pi }}
              onActiveChange={setActive}
              isSolved={isSolved}
            />
          </div>
        )}

        <main className="app-main">
          {view === 'edit' ? (
            <PuzzleEditor
              value={current}
              onChange={update}
              onImportSet={(puzzles) =>
                setPasted({ name: 'Incollata', results: puzzles.map((puzzle) => ({ puzzle, warnings: [] })) })
              }
            />
          ) : (
            <div ref={playRef} className={playRainbow ? `play ${playRainbow.className}` : 'play'} style={playStyle}>
              <div className="play-head">
                <button onClick={() => playNext(-1)} aria-label="Precedente">
                  ‹
                </button>
                <div>
                  <h1>{label(current, pi)}</h1>
                </div>
                <button onClick={() => playNext(1)} aria-label="Successivo">
                  ›
                </button>
              </div>
              <PuzzlePlayer
                key={`${current.id ?? `${ci}-${pi}`}-${playKey}`}
                puzzle={current}
                className="play-board"
                onSolve={() => current.id && setSolved((s) => new Set(s).add(current.id!))}
              />
              <div className="play-foot">
                {isSolved(current) ? (
                  <>
                    <span className="ok">Completato.</span>
                    <button onClick={() => setPlayKey((k) => k + 1)}>Ricomincia</button>
                    <button onClick={() => playNext(1)}>Prossimo ›</button>
                  </>
                ) : (
                  <span>
                    {hasShift(current)
                      ? 'Clic sul cerchio, segui con il puntatore, clic sull’uscita. Oppure trascina.'
                      : 'Clic sul cerchio, segui con il puntatore, clic sull’uscita. Oppure trascina, o usa frecce e Invio.'}
                  </span>
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
        onCancel={() => setPasted(null)}
        onConfirm={(r) => {
          setPasted(null);
          changeCollections(r.collections);
          setActive({ collection: r.collection, puzzle: Math.max(0, r.puzzles.length - r.added) });
        }}
      />
    </div>
  );
}
