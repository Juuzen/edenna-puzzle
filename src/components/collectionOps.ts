import type { Puzzle, PuzzleCollection } from '../engine';

/**
 * Operazioni immutabili su raccolte e liste di puzzle. Non dipendono da
 * React: le usa `PuzzleLibrary`, ma si possono usare anche da sole.
 */

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return list;
  const out = [...list];
  const [it] = out.splice(from, 1);
  out.splice(to, 0, it);
  return out;
}

export function removeAt<T>(list: T[], index: number): T[] {
  if (index < 0 || index >= list.length) return list;
  return list.filter((_, i) => i !== index);
}

export function replaceAt<T>(list: T[], index: number, item: T): T[] {
  if (index < 0 || index >= list.length) return list;
  return list.map((it, i) => (i === index ? item : it));
}

/** Gli elementi agli indici dati, nell'ordine della lista. */
export function pickPuzzles<T>(list: T[], indices: Iterable<number>): T[] {
  const set = new Set(indices);
  return list.filter((_, i) => set.has(i));
}

/** `id` se libero, altrimenti `id-2`, `id-3`… */
export function uniqueId(id: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(id)) return id;
  const base = id.replace(/-\d+$/, '');
  for (let n = 2; ; n++) {
    const c = `${base}-${n}`;
    if (!set.has(c)) return c;
  }
}

/** Stesso principio di `uniqueId` per i nomi delle raccolte: "Nome (2)". */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(name)) return name;
  const base = name.replace(/ \(\d+\)$/, '');
  for (let n = 2; ; n++) {
    const c = `${base} (${n})`;
    if (!set.has(c)) return c;
  }
}

const ids = (list: Puzzle[]) => list.map((p) => p.id).filter((x): x is string => !!x);

/** Copia di un puzzle con id univoco nella lista (suffisso `-copia`). */
export function duplicatePuzzle(p: Puzzle, list: Puzzle[]): Puzzle {
  if (!p.id) return { ...p };
  return { ...p, id: uniqueId(`${p.id}-copia`, ids(list)) };
}

export type MergeMode = 'append' | 'replace';
export type ConflictPolicy = 'rename' | 'overwrite' | 'skip';

export interface MergeResult {
  puzzles: Puzzle[];
  added: number;
  renamed: number;
  overwritten: number;
  skipped: number;
}

/**
 * Unisce `incoming` a `existing`.
 * - `replace`: il risultato è solo `incoming` (gli id duplicati interni al
 *   file vengono comunque resi univoci).
 * - `append`: in coda; un puzzle con un `id` già presente viene rinominato,
 *   sovrascrive quello esistente (nella sua posizione) o viene saltato.
 */
export function mergePuzzles(
  existing: Puzzle[],
  incoming: Puzzle[],
  opts: { mode: MergeMode; onConflict?: ConflictPolicy },
): MergeResult {
  const res: MergeResult = { puzzles: [], added: 0, renamed: 0, overwritten: 0, skipped: 0 };
  const out = opts.mode === 'replace' ? [] : [...existing];
  const policy = opts.mode === 'replace' ? 'rename' : (opts.onConflict ?? 'rename');
  for (const p of incoming) {
    const clash = p.id ? out.findIndex((q) => q.id === p.id) : -1;
    if (clash < 0) {
      out.push(p);
      res.added++;
    } else if (policy === 'skip') {
      res.skipped++;
    } else if (policy === 'overwrite' && clash < (opts.mode === 'replace' ? 0 : existing.length)) {
      out[clash] = p;
      res.overwritten++;
    } else {
      out.push({ ...p, id: uniqueId(p.id!, ids(out)) });
      res.added++;
      res.renamed++;
    }
  }
  res.puzzles = out;
  return res;
}

/** Id dei puzzle in arrivo che esistono già nella lista. */
export function conflictingIds(existing: Puzzle[], incoming: Puzzle[]): Set<string> {
  const have = new Set(ids(existing));
  return new Set(ids(incoming).filter((id) => have.has(id)));
}

export function newCollection(name: string, taken: PuzzleCollection[], puzzles: Puzzle[] = []): PuzzleCollection {
  return { name: uniqueName(name, taken.map((c) => c.name)), puzzles };
}

export type ImportDestination = 'append' | 'replace' | 'new';

export interface ImportResult extends MergeResult {
  collections: PuzzleCollection[];
  /** Indice della raccolta che ha ricevuto i puzzle. */
  collection: number;
}

/**
 * Applica un import: aggiunge a `target`, lo sostituisce, oppure crea una
 * nuova raccolta chiamata `name` (reso univoco).
 */
export function applyImport(
  collections: PuzzleCollection[],
  target: number,
  incoming: Puzzle[],
  opts: { destination: ImportDestination; onConflict?: ConflictPolicy; name?: string; description?: string },
): ImportResult {
  if (opts.destination === 'new' || !collections[target]) {
    const merged = mergePuzzles([], incoming, { mode: 'replace' });
    const c = newCollection(opts.name || 'Importata', collections, merged.puzzles);
    if (opts.description) c.description = opts.description;
    return { ...merged, collections: [...collections, c], collection: collections.length };
  }
  const cur = collections[target];
  const merged = mergePuzzles(cur.puzzles, incoming, {
    mode: opts.destination === 'replace' ? 'replace' : 'append',
    onConflict: opts.onConflict,
  });
  return {
    ...merged,
    collections: replaceAt(collections, target, { ...cur, puzzles: merged.puzzles }),
    collection: target,
  };
}

/** Testo → nome di file sicuro. */
export function slugify(s?: string, fallback = 'puzzle'): string {
  return (
    (s || fallback)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || fallback
  );
}

/** Scarica un testo come file (solo browser). */
export function downloadText(name: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
