import { memo, useEffect, useRef, useState, type KeyboardEvent } from 'react';
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
  moveItem,
  newCollection,
  pickPuzzles,
  removeAt,
  replaceAt,
  slugify,
  uniqueName,
  withFreshIds,
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
    // Raccolta e puzzle ricevono id nuovi: la copia non condivide nulla con l'originale.
    const c = newCollection(`${col.name} (copia)`, collections, col.puzzles);
    if (col.description) c.description = col.description;
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
    setPuzzles([...puzzles, ...withFreshIds([newPuzzle()], collections)]);
    go(ci, puzzles.length);
  };
  /** Duplica il puzzle `i` subito sotto di sé e seleziona la copia. */
  const duplicate = (i = pi) => {
    if (!puzzles[i]) return;
    const list = [...puzzles];
    list.splice(i + 1, 0, ...withFreshIds([puzzles[i]], collections));
    setPuzzles(list);
    go(ci, i + 1);
  };
  /** Sposta il puzzle `i` di una posizione; il puzzle attivo resta lo stesso. */
  const moveAt = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= puzzles.length) return;
    setPuzzles(moveItem(puzzles, i, j));
    go(ci, i === pi ? j : i < pi && j >= pi ? pi - 1 : i > pi && j <= pi ? pi + 1 : pi);
  };
  /** Elimina il puzzle `i` (con conferma); la selezione resta sullo stesso puzzle se possibile. */
  const removePuzzle = (i = pi) => {
    const p = puzzles[i];
    if (!p || puzzles.length <= 1) return;
    if (!confirm(`Eliminare «${p.title || `Puzzle ${i + 1}`}» dalla raccolta?`)) return;
    setPuzzles(removeAt(puzzles, i));
    go(ci, i < pi ? pi - 1 : i === pi ? Math.max(0, Math.min(pi, puzzles.length - 2)) : pi);
  };

  // --- menu "⋯" delle righe
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (menuFor === null) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenuFor(null);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menuFor]);
  // Cambiando raccolta o modalità il menu si chiude.
  useEffect(() => setMenuFor(null), [ci, selecting]);
  const menuAction = (fn: () => void) => () => {
    setMenuFor(null);
    fn();
  };

  /**
   * Tastiera nei menu ⋯: frecce, Home e Fine tra le voci attive; Esc chiude e
   * riporta il focus sul pulsante; Tab chiude senza trattenere il focus.
   */
  const menuKeys = (close: () => void) => (e: KeyboardEvent<HTMLDivElement>) => {
    const menu = e.currentTarget;
    const items = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const focus = (i: number) => items[(i + items.length) % items.length]?.focus();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focus(at + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focus(at < 0 ? -1 : at - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focus(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focus(-1);
    } else if (e.key === 'Escape') {
      menu.parentElement?.querySelector<HTMLButtonElement>('.ep-library__more-btn')?.focus();
      close();
    } else if (e.key === 'Tab') {
      close();
    }
  };

  // --- menu "⋯" della raccolta
  const [colMenu, setColMenu] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!colMenu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !colMenuRef.current?.contains(e.target as Node)) setColMenu(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [colMenu]);
  const colAction = (fn: () => void) => () => {
    setColMenu(false);
    fn();
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
    const copies = withFreshIds(pickPuzzles(puzzles, selected), collections);
    onChange(replaceAt(collections, target, { ...dest, puzzles: [...dest.puzzles, ...copies] }));
    flash(`${copies.length} puzzle copiati in «${dest.name}».`);
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
    <aside className={`ep-library${className ? ` ${className}` : ''}`} aria-label="Raccolte">
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
              <option key={c.id ?? i} value={i}>
                {c.name} ({c.puzzles.length})
              </option>
            ))}
          </select>
        )}
        <div className="ep-library__collmenu" ref={colMenuRef}>
          <button
            type="button"
            className={`ep-library__more-btn${colMenu ? ' is-open' : ''}`}
            aria-label={`Azioni sulla raccolta «${col?.name ?? ''}»`}
            aria-haspopup="menu"
            aria-expanded={colMenu}
            onClick={() => setColMenu((o) => !o)}
          >
            ⋯
          </button>
          {colMenu && (
            <div role="menu" aria-label="Azioni sulla raccolta" className="ep-library__menu" onKeyDown={menuKeys(() => setColMenu(false))}>
              <button type="button" role="menuitem" autoFocus onClick={colAction(addCollection)}>
                Nuova raccolta
              </button>
              <button type="button" role="menuitem" disabled={!col} onClick={colAction(() => col && setRenaming(col.name))}>
                Rinomina
              </button>
              <button type="button" role="menuitem" disabled={!col} onClick={colAction(duplicateCollection)}>
                Duplica raccolta
              </button>
              <button
                type="button"
                role="menuitem"
                className="is-danger"
                disabled={collections.length <= 1}
                title={collections.length <= 1 ? 'Deve restare almeno una raccolta' : undefined}
                onClick={colAction(deleteCollection)}
              >
                Elimina raccolta
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ---------------------------------------------- lista */}
      <div className="ep-library__bar">
        <span>{puzzles.length} puzzle</span>
        {!selecting && (
          <button type="button" onClick={addPuzzle} title={`Nuovo puzzle in «${col?.name ?? ''}»`} disabled={!col}>
            + Puzzle
          </button>
        )}
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
                <option key={c.id ?? i} value={i}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" onClick={removeSelected} disabled={!selected.size} className="is-danger">
            Elimina ({selected.size})
          </button>
        </div>
      )}
      <ol className="ep-library__list">
        {puzzles.map((p, i) => (
          <li key={p.id ?? i} className="ep-library__item">
            <button
              type="button"
              className={`ep-library__open${i === pi ? ' is-active' : ''}${selecting && selected.has(i) ? ' is-selected' : ''}`}
              onClick={() => (selecting ? toggle(i) : go(ci, i))}
              aria-pressed={selecting ? selected.has(i) : undefined}
            >
              {selecting && <input type="checkbox" tabIndex={-1} readOnly checked={selected.has(i)} aria-hidden />}
              <Thumb puzzle={p} />
              <span className="ep-library__text">
                <span className="ep-library__title">{p.title || `Puzzle ${i + 1}`}</span>
                <span className="ep-library__meta">
                  {p.width}×{p.height}
                  {isSolved?.(p, i) ? ' · ✓' : ''}
                </span>
              </span>
            </button>
            {!selecting && (
              <div className={`ep-library__more${menuFor === i ? ' is-open' : ''}`} ref={menuFor === i ? menuRef : undefined}>
                <button
                  type="button"
                  className={`ep-library__more-btn${menuFor === i ? ' is-open' : ''}`}
                  aria-label={`Azioni per «${p.title || `Puzzle ${i + 1}`}»`}
                  aria-haspopup="menu"
                  aria-expanded={menuFor === i}
                  onClick={() => setMenuFor(menuFor === i ? null : i)}
                >
                  ⋯
                </button>
                {menuFor === i && (
                  <div
                    role="menu"
                    aria-label={`Azioni per «${p.title || `Puzzle ${i + 1}`}»`}
                    className={`ep-library__menu${i >= 2 && i >= puzzles.length - 2 ? ' ep-library__menu--up' : ''}`}
                    onKeyDown={menuKeys(() => setMenuFor(null))}
                  >
                    <button type="button" role="menuitem" autoFocus onClick={menuAction(() => duplicate(i))}>
                      Duplica
                    </button>
                    <button type="button" role="menuitem" disabled={i <= 0} onClick={menuAction(() => moveAt(i, -1))}>
                      Sposta su
                    </button>
                    <button type="button" role="menuitem" disabled={i >= puzzles.length - 1} onClick={menuAction(() => moveAt(i, 1))}>
                      Sposta giù
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="is-danger"
                      disabled={puzzles.length <= 1}
                      title={puzzles.length <= 1 ? 'Una raccolta deve avere almeno un puzzle' : undefined}
                      onClick={menuAction(() => removePuzzle(i))}
                    >
                      Elimina
                    </button>
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>

      {/* ---------------------------------------------- file */}
      <div className="ep-library__actions">
        <button
          type="button"
          onClick={() => exportPuzzles(puzzles)}
          disabled={!col}
          title={col ? `Scarica «${col.name}» (${puzzles.length} puzzle) come file JSON` : undefined}
        >
          Esporta raccolta
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} title="Importa un puzzle o una raccolta da un file JSON">
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
