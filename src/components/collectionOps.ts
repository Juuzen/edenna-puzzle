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

/** Nome libero: "Nome", altrimenti "Nome (2)", "Nome (3)"… */
export function uniqueName(name: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(name)) return name;
  const base = name.replace(/ \(\d+\)$/, '');
  for (let n = 2; ; n++) {
    const c = `${base} (${n})`;
    if (!set.has(c)) return c;
  }
}

// ---------------------------------------------------------------------------
// Id interni
//
// Puzzle e raccolte hanno un id interno (`p1`, `p2`… e `c1`, `c2`…) che serve
// solo a riferirli in modo univoco (editor, libreria, viewer): non si mostra
// e non si modifica. Gli id dei puzzle sono univoci su tutte le raccolte.
// La generazione è deterministica: il prossimo id è il massimo esistente + 1.

export type IdPrefix = 'p' | 'c';

const ID_PATTERN: Record<IdPrefix, RegExp> = { p: /^p([1-9]\d*)$/, c: /^c([1-9]\d*)$/ };

const idNumber = (prefix: IdPrefix, id: string | undefined): number => {
  const m = id ? ID_PATTERN[prefix].exec(id) : null;
  return m ? Number(m[1]) : 0;
};

/** `true` se `id` è nella forma `p<n>` / `c<n>`. */
export const isValidId = (prefix: IdPrefix, id: string | undefined) => idNumber(prefix, id) > 0;

/** Primo id libero dopo il più alto tra quelli presi. */
export function nextId(prefix: IdPrefix, taken: Iterable<string | undefined>): string {
  let max = 0;
  for (const id of taken) max = Math.max(max, idNumber(prefix, id));
  return `${prefix}${max + 1}`;
}

/** Tutti gli id dei puzzle, in tutte le raccolte. */
export function allPuzzleIds(collections: PuzzleCollection[]): string[] {
  return collections.flatMap((c) => c.puzzles.map((p) => p.id)).filter((x): x is string => !!x);
}

const withId = <T extends { id?: string }>(item: T, id: string): T => (item.id === id ? item : { ...item, id });

/**
 * Assegna un id a raccolte e puzzle che non ce l'hanno, ce l'hanno in un
 * formato diverso o lo condividono con un elemento precedente. Gli id validi
 * restano invariati, e così gli oggetti che non cambiano (stesso riferimento).
 */
export function ensureIds(collections: PuzzleCollection[]): PuzzleCollection[] {
  const seenC = new Set<string>();
  const seenP = new Set<string>();
  let nextC = idNumber('c', nextId('c', collections.map((c) => c.id)));
  let nextP = idNumber('p', nextId('p', allPuzzleIds(collections)));
  let changed = false;
  const out = collections.map((c) => {
    let cid = c.id;
    if (!cid || !isValidId('c', cid) || seenC.has(cid)) cid = `c${nextC++}`;
    seenC.add(cid);
    let puzzlesChanged = false;
    const puzzles = c.puzzles.map((p) => {
      let pid = p.id;
      if (!pid || !isValidId('p', pid) || seenP.has(pid)) pid = `p${nextP++}`;
      seenP.add(pid);
      const q = withId(p, pid);
      if (q !== p) puzzlesChanged = true;
      return q;
    });
    if (cid === c.id && !puzzlesChanged) return c;
    changed = true;
    return { ...c, id: cid, puzzles: puzzlesChanged ? puzzles : c.puzzles };
  });
  return changed ? out : collections;
}

/**
 * Copie di `puzzles` con id nuovi, liberi rispetto a `collections` (e a
 * `extraTaken`). Da usare per ogni puzzle che entra in una raccolta: nuovo,
 * duplicato, copiato o importato.
 */
export function withFreshIds(
  puzzles: Puzzle[],
  collections: PuzzleCollection[],
  extraTaken: Iterable<string> = [],
): Puzzle[] {
  let n = idNumber('p', nextId('p', [...allPuzzleIds(collections), ...extraTaken]));
  return puzzles.map((p) => ({ ...p, id: `p${n++}` }));
}

/** Sostituisce il puzzle con lo stesso id di `p`, in qualunque raccolta. */
export function replacePuzzleById(collections: PuzzleCollection[], p: Puzzle): PuzzleCollection[] {
  if (!p.id) return collections;
  for (let ci = 0; ci < collections.length; ci++) {
    const i = collections[ci].puzzles.findIndex((q) => q.id === p.id);
    if (i >= 0) {
      if (collections[ci].puzzles[i] === p) return collections;
      return replaceAt(collections, ci, { ...collections[ci], puzzles: replaceAt(collections[ci].puzzles, i, p) });
    }
  }
  return collections;
}

/** Posizione del puzzle con id `id`, o `null`. */
export function findPuzzle(collections: PuzzleCollection[], id: string | undefined): { collection: number; puzzle: number } | null {
  if (!id) return null;
  for (let ci = 0; ci < collections.length; ci++) {
    const i = collections[ci].puzzles.findIndex((q) => q.id === id);
    if (i >= 0) return { collection: ci, puzzle: i };
  }
  return null;
}

/**
 * Nuova raccolta con nome reso univoco, id proprio e puzzle con id nuovi
 * (i puzzle passati vengono copiati, non condivisi).
 */
export function newCollection(name: string, taken: PuzzleCollection[], puzzles: Puzzle[] = []): PuzzleCollection {
  return {
    id: nextId('c', taken.map((c) => c.id)),
    name: uniqueName(name, taken.map((c) => c.name)),
    puzzles: withFreshIds(puzzles, taken),
  };
}

export type ImportDestination = 'append' | 'replace' | 'new';

export interface ImportResult {
  collections: PuzzleCollection[];
  /** Indice della raccolta che ha ricevuto i puzzle. */
  collection: number;
  /** Puzzle della raccolta di destinazione dopo l'import. */
  puzzles: Puzzle[];
  /** Quanti puzzle sono stati aggiunti (in coda a `puzzles`). */
  added: number;
}

/**
 * Applica un import: aggiunge in coda a `target`, ne sostituisce il contenuto
 * oppure crea una nuova raccolta chiamata `name` (resa univoca). I puzzle in
 * arrivo ricevono sempre id nuovi, quindi non ci sono conflitti.
 */
export function applyImport(
  collections: PuzzleCollection[],
  target: number,
  incoming: Puzzle[],
  opts: { destination: ImportDestination; name?: string; description?: string },
): ImportResult {
  if (opts.destination === 'new' || !collections[target]) {
    const c = newCollection(opts.name || 'Importata', collections, incoming);
    if (opts.description) c.description = opts.description;
    return { collections: [...collections, c], collection: collections.length, puzzles: c.puzzles, added: c.puzzles.length };
  }
  const cur = collections[target];
  const fresh = withFreshIds(incoming, collections);
  const puzzles = opts.destination === 'replace' ? fresh : [...cur.puzzles, ...fresh];
  return {
    collections: replaceAt(collections, target, { ...cur, puzzles }),
    collection: target,
    puzzles,
    added: fresh.length,
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
