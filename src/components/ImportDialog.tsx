import { useEffect, useRef, useState } from 'react';
import type { ParseResult, PuzzleCollection } from '../engine';
import { PuzzleBoard } from './PuzzleBoard';
import { type ImportDestination, type ImportResult, applyImport, pickPuzzles } from './collectionOps';

/** Cosa si sta importando: i puzzle letti e i metadati della raccolta di origine. */
export interface ImportSource {
  name: string;
  description?: string;
  results: ParseResult[];
}

export interface ImportDialogProps {
  /** `null` = dialogo chiuso. */
  source: ImportSource | null;
  collections: PuzzleCollection[];
  /** Raccolta attiva, destinazione proposta per "aggiungi" e "sostituisci". */
  target: number;
  onConfirm: (result: ImportResult) => void;
  onCancel: () => void;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Riassunto leggibile di un import. */
export function importSummary(r: ImportResult): string {
  return `${plural(r.added, 'puzzle importato', 'puzzle importati')}.`;
}

/**
 * Finestra di importazione: si scelgono i puzzle del file, dove metterli
 * (aggiungere, sostituire, nuova raccolta). I puzzle importati ricevono
 * sempre id interni nuovi, quindi non possono entrare in conflitto.
 */
export function ImportDialog({ source, collections, target, onConfirm, onCancel }: ImportDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [destination, setDestination] = useState<ImportDestination>('append');
  const [name, setName] = useState('');

  // Ogni nuova sorgente: tutto selezionato, nome dal file.
  useEffect(() => {
    if (!source) return;
    setChecked(new Set(source.results.map((_, i) => i)));
    setName(source.name);
    setDestination(collections.length ? 'append' : 'new');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (source && !d.open) d.showModal?.();
    if (!source && d.open) d.close?.();
  }, [source]);

  const current = collections[target];

  if (!source) return <dialog ref={ref} className="ep-import" />;

  const all = source.results;
  const selected = pickPuzzles(
    all.map((r) => r.puzzle),
    checked,
  );
  const toggle = (i: number) =>
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  const warnings = all.reduce((n, r) => n + r.warnings.length, 0);

  const confirm = () =>
    onConfirm(applyImport(collections, target, selected, { destination, name: name.trim() || source.name, description: source.description }));

  return (
    <dialog
      ref={ref}
      className="ep-import"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <form
        method="dialog"
        className="ep-import__body"
        onSubmit={(e) => {
          e.preventDefault();
          if (selected.length) confirm();
        }}
      >
        <header className="ep-import__head">
          <h2>Importa puzzle</h2>
          <span className="ep-muted">
            «{source.name}» · {plural(all.length, 'puzzle', 'puzzle')}
            {warnings ? ` · ${plural(warnings, 'avviso', 'avvisi')}` : ''}
          </span>
        </header>

        <div className="ep-import__bulk">
          <button type="button" onClick={() => setChecked(new Set(all.map((_, i) => i)))}>
            Tutti
          </button>
          <button type="button" onClick={() => setChecked(new Set())}>
            Nessuno
          </button>
          <span className="ep-muted">{selected.length} selezionati</span>
        </div>

        <ul className="ep-import__list">
          {all.map((r, i) => {
            const p = r.puzzle;
            return (
              <li key={i}>
                <label className={checked.has(i) ? 'is-on' : ''}>
                  <input type="checkbox" checked={checked.has(i)} onChange={() => toggle(i)} />
                  <PuzzleBoard puzzle={p} className="ep-library__thumb" aria-hidden label="" />
                  <span className="ep-library__text">
                    <span className="ep-library__title">{p.title || `Puzzle ${i + 1}`}</span>
                    <span className="ep-library__meta">
                      {p.width}×{p.height}
                    </span>
                    {r.warnings.length > 0 && (
                      <span className="ep-import__warn" title={r.warnings.join('\n')}>
                        {plural(r.warnings.length, 'avviso', 'avvisi')}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <fieldset className="ep-import__opts">
          <legend>Destinazione</legend>
          {current && (
            <>
              <label>
                <input type="radio" checked={destination === 'append'} onChange={() => setDestination('append')} />
                Aggiungi a «{current.name}»
              </label>
              <label>
                <input type="radio" checked={destination === 'replace'} onChange={() => setDestination('replace')} />
                Sostituisci il contenuto di «{current.name}»
              </label>
            </>
          )}
          <label className="ep-import__new">
            <input type="radio" checked={destination === 'new'} onChange={() => setDestination('new')} />
            Nuova raccolta
            <input
              type="text"
              value={name}
              aria-label="Nome della nuova raccolta"
              onFocus={() => setDestination('new')}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        </fieldset>

        {destination === 'replace' && current && (
          <p className="ep-notice ep-notice--error">
            I {current.puzzles.length} puzzle attuali di «{current.name}» verranno rimossi.
          </p>
        )}

        <footer className="ep-import__foot">
          <button type="button" className="ep-btn" onClick={onCancel}>
            Annulla
          </button>
          <button type="submit" className="ep-btn ep-btn--primary" disabled={!selected.length}>
            Importa {selected.length || ''}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
