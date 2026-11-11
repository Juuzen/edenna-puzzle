import { memo, useRef, useState } from 'react';
import {
  type Puzzle,
  type PuzzleCollection,
  PuzzleFormatError,
  createPuzzle,
  parseCollection,
  serializeCollection,
} from '../engine';
import { PuzzleBoard } from './PuzzleBoard';
import { ImportDialog, importSummary, type ImportSource } from './ImportDialog';
import {
  downloadText,
  duplicatePuzzle,
  mergePuzzles,
  moveItem,
  newCollection,
  pickPuzzles,
  removeAt,
  replaceAt,
  slugify,
  uniqueName,
} from './collectionOps';

export interface LibraryPosition {
  collection: number;
  puzzle: number;
}

export interface PuzzleLibraryProps {
  collections: PuzzleCollection[];
  onChange: (collections: PuzzleCollection[]) => void;
  /** Raccolta e puzzle selezionati. */
  active: LibraryPosition;
  onActiveChange: (a: LibraryPosition) => void;
  /** Puzzle creato da "Nuovo". Default: 4x4 vuoto. */
  newPuzzle?: () => Puzzle;
  /** Mostra un ✓ accanto ai puzzle risolti. */
  isSolved?: (p: Puzzle, index: number) => boolean;
  /** Tema delle miniature. */
  theme?: string;
  className?: string;
}

const Thumb = memo(function Thumb({ puzzle }: { puzzle: Puzzle }) {
  return <PuzzleBoard puzzle={puzzle} className="ep-library__thumb" aria-hidden label="" />;
});

/**
 * Gestione delle raccolte di puzzle: più raccolte con nome, lista con
 * miniature, riordino, selezione multipla, esportazione (intera o dei
 * selezionati) e importazione con scelta.
 *
 * È controllato: lo stato vive in chi lo usa (che decide anche dove salvarlo).
 */
export function PuzzleLibrary({
  collections,
  onChange,
  active,
  onActiveChange,
  newPuzzle = () => createPuzzle(4, 4),
  isSolved,
  theme = 'ep-theme-edenna',
  className,
}: PuzzleLibraryProps) {
  const ci = Math.max(0, Math.min(active.collection, collections.length - 1));
  const col = collections[ci] as PuzzleCollection | undefined;
  const puzzles = col?.puzzles ?? [];
  const pi = Math.max(0, Math.min(active.puzzle, puzzles.length - 1));

  const [renaming, setRenaming] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState<ImportSource | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const flash = (text: string, tone: 'ok' | 'error' = 'ok') => {
    setNotice({ text, tone });
    window.setTimeout(() => setNotice((n) => (n?.text === text ? null : n)), 4000);
  };

  const go = (collection: number, puzzle = 0) => onActiveChange({ collection, puzzle });
  const setPuzzles = (list: Puzzle[]) => col && onChange(replaceAt(collections, ci, { ...col, puzzles: list }));
  const clearSelection = () => setSelected(new Set());

  // --- raccolte
  const addCollection = () => {
    const c = newCollection('Nuova raccolta', collections, [newPuzzle()]);
    onChange([...collections, c]);
    go(collections.length);
    setRenaming(c.name);
    clearSelection();
  };
  const duplicateCollection = () => {
    if (!col) return;
    const { id: _id, ...rest } = col;
    const c = { ...rest, name: uniqueName(`${col.name} (copia)`, collections.map((x) => x.name)) };
    onChange([...collections, c]);
    go(collections.length, pi);
  };
  const deleteCollection = () => {
    if (!col || collections.length <= 1) return;
    if (!confirm(`Eliminare la raccolta «${col.name}» e i suoi ${puzzles.length} puzzle?`)) return;
    onChange(removeAt(collections, ci));
    go(Math.max(0, ci - 1));
    clearSelection();
  };
  const commitRename = () => {
    if (renaming === null || !col) return;
    const name = renaming.trim();
    setRenaming(null);
    if (!name || name === col.name) return;
    const taken = collections.filter((_, i) => i !== ci).map((c) => c.name);
    onChange(replaceAt(collections, ci, { ...col, name: uniqueName(name, taken) }));
  };

  // --- puzzle
  const addPuzzle = () => {
    setPuzzles([...puzzles, newPuzzle()]);
    go(ci, puzzles.length);
  };
  const duplicate = () => {
    if (!puzzles[pi]) return;
    const list = [...puzzles];
    list.splice(pi + 1, 0, duplicatePuzzle(puzzles[pi], puzzles));
    setPuzzles(list);
    go(ci, pi + 1);
  };
  const move = (delta: number) => {
    const j = pi + delta;
    if (j < 0 || j >= puzzles.length) return;
    setPuzzles(moveItem(puzzles, pi, j));
    go(ci, j);
  };
  const removePuzzle = () => {
    const p = puzzles[pi];
    if (!p || puzzles.length <= 1) return;
    if (!confirm(`Eliminare «${p.title || 'senza titolo'}» dalla raccolta?`)) return;
    setPuzzles(removeAt(puzzles, pi));
    go(ci, Math.max(0, pi - 1));
  };

  // --- selezione multipla
  const toggle = (i: number) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  const removeSelected = () => {
    const keep = puzzles.filter((_, i) => !selected.has(i));
    if (!keep.length) {
      flash('Una raccolta deve avere almeno un puzzle.', 'error');
      return;
    }
    if (!confirm(`Eliminare ${selected.size} puzzle da «${col?.name}»?`)) return;
    setPuzzles(keep);
    go(ci, 0);
    clearSelection();
  };
  const copySelectedTo = (target: number) => {
    const dest = collections[target];
    if (!dest) return;
    const r = mergePuzzles(dest.puzzles, pickPuzzles(puzzles, selected), { mode: 'append', onConflict: 'rename' });
    onChange(replaceAt(collections, target, { ...dest, puzzles: r.puzzles }));
    flash(`${r.added} puzzle copiati in «${dest.name}».`);
  };

  // --- import / export
  const exportPuzzles = (list: Puzzle[], suffix = '') => {
    if (!col) return;
    downloadText(`${slugify(col.name, 'raccolta')}${suffix}.json`, serializeCollection({ ...col, puzzles: list }));
  };
  const openFile = async (f?: File) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!f) return;
    try {
      const { collection, results } = parseCollection(await f.text(), f.name.replace(/\.[^.]+$/, ''));
      if (!results.length) {
        flash('Il file non contiene puzzle.', 'error');
        return;
      }
      setImporting({ name: collection.name, description: collection.description, results });
    } catch (e) {
      flash(e instanceof PuzzleFormatError ? e.message : `Errore: ${(e as Error).message}`, 'error');
    }
  };

  const others = collections.map((c, i) => ({ c, i })).filter((x) => x.i !== ci);

  return (
    <aside className={`ep-library ${theme}${className ? ` ${className}` : ''}`} aria-label="Raccolte">
      {/* ---------------------------------------------- raccolta attiva */}
      <div className="ep-library__head">
        {renaming !== null ? (
          <input
            className="ep-library__name"
            autoFocus
            value={renaming}
            aria-label="Nome della raccolta"
            onChange={(e) => setRenaming(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenaming(null);
            }}
          />
        ) : (
          <select
            className="ep-library__name"
            value={ci}
            aria-label="Raccolta"
            onChange={(e) => {
              go(+e.target.value);
              clearSelection();
            }}
          >
            {collections.map((c, i) => (
              <option key={i} value={i}>
                {c.name} ({c.puzzles.length})
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="ep-library__actions ep-library__actions--top">
        <button type="button" onClick={addCollection} title="Nuova raccolta">
          + Raccolta
        </button>
        <button type="button" onClick={() => col && setRenaming(col.name)} disabled={!col}>
          Rinomina
        </button>
        <button type="button" onClick={duplicateCollection} disabled={!col}>
          Duplica
        </button>
        <button type="button" onClick={deleteCollection} disabled={collections.length <= 1} className="is-danger">
          Elimina
        </button>
      </div>

      {/* ---------------------------------------------- lista */}
      <div className="ep-library__bar">
        <span>{puzzles.length} puzzle</span>
        <button
          type="button"
          className={selecting ? 'is-active' : ''}
          aria-pressed={selecting}
          onClick={() => {
            setSelecting(!selecting);
            clearSelection();
          }}
        >
          {selecting ? 'Fine' : 'Seleziona'}
        </button>
      </div>
      {selecting && (
        <div className="ep-library__actions">
          <button type="button" onClick={() => setSelected(new Set(puzzles.map((_, i) => i)))}>
            Tutti
          </button>
          <button type="button" onClick={clearSelection} disabled={!selected.size}>
            Nessuno
          </button>
          <button type="button" onClick={() => exportPuzzles(pickPuzzles(puzzles, selected), '-selezione')} disabled={!selected.size}>
            Esporta ({selected.size})
          </button>
          {others.length > 0 && (
            <select
              value=""
              disabled={!selected.size}
              aria-label="Copia i selezionati in un'altra raccolta"
              onChange={(e) => e.target.value !== '' && copySelectedTo(+e.target.value)}
            >
              <option value="">Copia in…</option>
              {others.map(({ c, i }) => (
                <option key={i} value={i}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" onClick={removeSelected} disabled={!selected.size} className="is-danger">
            Elimina
          </button>
        </div>
      )}
      <ol className="ep-library__list">
        {puzzles.map((p, i) => (
          <li key={i}>
            <button
              type="button"
              className={`${i === pi ? 'is-active' : ''}${selecting && selected.has(i) ? ' is-selected' : ''}`}
              onClick={() => (selecting ? toggle(i) : go(ci, i))}
              aria-pressed={selecting ? selected.has(i) : undefined}
            >
              {selecting && <input type="checkbox" tabIndex={-1} readOnly checked={selected.has(i)} aria-hidden />}
              <Thumb puzzle={p} />
              <span className="ep-library__text">
                <span className="ep-library__title">{p.title || `Puzzle ${i + 1}`}</span>
                <span className="ep-library__meta">
                  {p.id ?? '—'} · {p.width}×{p.height}
                  {isSolved?.(p, i) ? ' · ✓' : ''}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      {/* ---------------------------------------------- azioni */}
      {!selecting && (
        <div className="ep-library__actions">
          <button type="button" onClick={addPuzzle}>
            + Nuovo
          </button>
          <button type="button" onClick={duplicate} disabled={!puzzles.length}>
            Duplica
          </button>
          <button type="button" onClick={() => move(-1)} disabled={pi <= 0} title="Sposta su">
            ↑
          </button>
          <button type="button" onClick={() => move(1)} disabled={pi >= puzzles.length - 1} title="Sposta giù">
            ↓
          </button>
          <button type="button" onClick={removePuzzle} disabled={puzzles.length <= 1} className="is-danger">
            Elimina
          </button>
        </div>
      )}
      <div className="ep-library__actions">
        <button type="button" onClick={() => exportPuzzles(puzzles)} disabled={!col}>
          Esporta raccolta
        </button>
        <button type="button" onClick={() => fileRef.current?.click()}>
          Importa…
        </button>
      </div>
      {notice && <p className={`ep-library__notice ep-library__notice--${notice.tone}`}>{notice.text}</p>}
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json,.txt"
        hidden
        onChange={(e) => openFile(e.target.files?.[0])}
      />

      <ImportDialog
        source={importing}
        collections={collections}
        target={ci}
        theme={theme}
        onCancel={() => setImporting(null)}
        onConfirm={(r) => {
          setImporting(null);
          onChange(r.collections);
          // Si va al primo puzzle aggiunto.
          go(r.collection, Math.max(0, r.puzzles.length - r.added));
          clearSelection();
          flash(importSummary(r));
        }}
      />
    </aside>
  );
}
