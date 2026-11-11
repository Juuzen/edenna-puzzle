import { describe, expect, it } from 'vitest';
import { createPuzzle, type Puzzle, type PuzzleCollection } from '../engine';
import { gradientLine } from './background';
import {
  applyImport,
  ensureIds,
  findPuzzle,
  moveItem,
  newCollection,
  nextId,
  pickPuzzles,
  removeAt,
  replacePuzzleById,
  slugify,
  uniqueName,
  withFreshIds,
} from './collectionOps';

const P = (id?: string, title?: string): Puzzle => ({ ...createPuzzle(2, 2), ...(id ? { id } : {}), ...(title ? { title } : {}) });
const idsOf = (l: Puzzle[]) => l.map((p) => p.id ?? '-');
const C = (id: string | undefined, name: string, puzzles: Puzzle[]): PuzzleCollection => ({ ...(id ? { id } : {}), name, puzzles });

describe('operazioni sulle liste', () => {
  it('moveItem, removeAt e pickPuzzles', () => {
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
    const l = [1, 2, 3];
    expect(moveItem(l, 0, 3)).toBe(l);
    expect(moveItem(l, -1, 0)).toBe(l);
    expect(removeAt(l, 1)).toEqual([1, 3]);
    expect(removeAt(l, 5)).toBe(l);
    expect(pickPuzzles(['a', 'b', 'c', 'd'], [3, 0])).toEqual(['a', 'd']);
  });

  it('nomi univoci', () => {
    expect(uniqueName('Stanza', [])).toBe('Stanza');
    expect(uniqueName('Stanza', ['Stanza', 'Stanza (2)'])).toBe('Stanza (3)');
  });

  it('slugify', () => {
    expect(slugify('Città già è')).toBe('citta-gia-e');
    expect(slugify('', 'raccolta')).toBe('raccolta');
  });
});

describe('id interni', () => {
  it('nextId: massimo + 1, ignora gli id in altri formati', () => {
    expect(nextId('p', [])).toBe('p1');
    expect(nextId('p', ['p1', 'p7', 'p3', undefined, 'x9', 'c12', 'p0', 'p01'])).toBe('p8');
    expect(nextId('c', ['c2', 'p9'])).toBe('c3');
  });

  it('ensureIds assegna id mancanti, non validi o duplicati in modo deterministico', () => {
    const shared = P('p2');
    const cols = [C(undefined, 'A', [P(), shared, P('vecchio-id')]), C('c1', 'B', [shared, P('p2')])];
    const a = ensureIds(cols);
    const b = ensureIds(cols);
    expect(a).toEqual(b);
    expect(a.map((c) => c.id)).toEqual(['c2', 'c1']);
    expect(idsOf(a[0].puzzles)).toEqual(['p3', 'p2', 'p4']);
    expect(idsOf(a[1].puzzles)).toEqual(['p5', 'p6']);
    // id validi: stesso oggetto
    expect(a[0].puzzles[1]).toBe(shared);
    // la copia condivisa nell'altra raccolta diventa un oggetto distinto
    expect(a[1].puzzles[0]).not.toBe(shared);
  });

  it('ensureIds non tocca nulla se gli id sono già corretti', () => {
    const cols = [C('c1', 'A', [P('p1'), P('p2')]), C('c2', 'B', [P('p3')])];
    expect(ensureIds(cols)).toBe(cols);
  });

  it('withFreshIds: copie distinte con id liberi su tutte le raccolte', () => {
    const src = P('p1', 'X');
    const cols = [C('c1', 'A', [src]), C('c2', 'B', [P('p4')])];
    const [copy] = withFreshIds([src], cols);
    expect(copy.id).toBe('p5');
    expect(copy).not.toBe(src);
    expect(copy.title).toBe('X');
    expect(idsOf(withFreshIds([P(), P()], cols, ['p9']))).toEqual(['p10', 'p11']);
  });

  it('newCollection: id, nome univoco e puzzle copiati', () => {
    const src = P('p1');
    const cols = [C('c1', 'Uno', [src])];
    const c = newCollection('Uno', cols, [src]);
    expect(c).toMatchObject({ id: 'c2', name: 'Uno (2)' });
    expect(idsOf(c.puzzles)).toEqual(['p2']);
    expect(c.puzzles[0]).not.toBe(src);
  });

  it('replacePuzzleById e findPuzzle lavorano sull’id, non sulla posizione', () => {
    const cols = [C('c1', 'A', [P('p1'), P('p2')]), C('c2', 'B', [P('p3')])];
    const edited = { ...P('p3'), title: 'nuovo' };
    const r = replacePuzzleById(cols, edited);
    expect(r[1].puzzles[0]).toBe(edited);
    expect(r[0]).toBe(cols[0]);
    expect(replacePuzzleById(cols, P('p99'))).toBe(cols);
    expect(findPuzzle(cols, 'p3')).toEqual({ collection: 1, puzzle: 0 });
    expect(findPuzzle(cols, 'p99')).toBeNull();
  });
});

describe('applyImport', () => {
  const cols: PuzzleCollection[] = [C('c1', 'Uno', [P('p1')]), C('c2', 'Due', [P('p2')])];

  it('aggiunge alla raccolta indicata con id nuovi', () => {
    const r = applyImport(cols, 1, [P('p1'), P('altro')], { destination: 'append' });
    expect(r.collection).toBe(1);
    expect(idsOf(r.collections[1].puzzles)).toEqual(['p2', 'p3', 'p4']);
    expect(r.added).toBe(2);
    expect(r.collections[0]).toBe(cols[0]);
  });

  it('sostituisce il contenuto', () => {
    const r = applyImport(cols, 0, [P('q')], { destination: 'replace' });
    expect(idsOf(r.collections[0].puzzles)).toEqual(['p3']);
    expect(r.collections[0].name).toBe('Uno');
  });

  it('crea una nuova raccolta con nome univoco', () => {
    const r = applyImport(cols, 0, [P('q')], { destination: 'new', name: 'Uno', description: 'd' });
    expect(r.collection).toBe(2);
    expect(r.collections[2]).toMatchObject({ id: 'c3', name: 'Uno (2)', description: 'd' });
    expect(idsOf(r.collections[2].puzzles)).toEqual(['p3']);
  });
});

describe('gradientLine', () => {
  // Rettangolo 0..200 x 0..100: centro (100, 50).
  it('angoli principali come in CSS', () => {
    expect(gradientLine(0, 0, 200, 100, 180)).toEqual({ x1: 100, y1: 0, x2: 100, y2: 100 });
    expect(gradientLine(0, 0, 200, 100, 0)).toEqual({ x1: 100, y1: 100, x2: 100, y2: 0 });
    expect(gradientLine(0, 0, 200, 100, 90)).toEqual({ x1: 0, y1: 50, x2: 200, y2: 50 });
  });

  it('in diagonale gli angoli del rettangolo stanno su 0% e 100%', () => {
    const g = gradientLine(0, 0, 100, 100, 135);
    // su un quadrato a 135° va dall'angolo in alto a sinistra a quello in basso a destra
    expect(g.x1).toBeCloseTo(0, 2);
    expect(g.y1).toBeCloseTo(0, 2);
    expect(g.x2).toBeCloseTo(100, 2);
    expect(g.y2).toBeCloseTo(100, 2);
  });
});
