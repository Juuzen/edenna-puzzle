import { describe, expect, it } from 'vitest';
import { createPuzzle, type Puzzle, type PuzzleCollection } from '../engine';
import { gradientLine } from './background';
import {
  applyImport,
  conflictingIds,
  duplicatePuzzle,
  mergePuzzles,
  moveItem,
  pickPuzzles,
  removeAt,
  slugify,
  uniqueId,
  uniqueName,
} from './collectionOps';

const P = (id?: string, title?: string): Puzzle => ({ ...createPuzzle(2, 2), ...(id ? { id } : {}), ...(title ? { title } : {}) });
const idsOf = (l: Puzzle[]) => l.map((p) => p.id ?? '-');

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

  it('id e nomi univoci', () => {
    expect(uniqueId('b12', [])).toBe('b12');
    expect(uniqueId('b12', ['b12'])).toBe('b12-2');
    expect(uniqueId('b12', ['b12', 'b12-2'])).toBe('b12-3');
    expect(uniqueId('b12-2', ['b12-2'])).toBe('b12-3');
    expect(uniqueName('Stanza', ['Stanza', 'Stanza (2)'])).toBe('Stanza (3)');
    expect(duplicatePuzzle(P('x'), [P('x'), P('x-copia')]).id).toBe('x-copia-2');
    expect(duplicatePuzzle(P(), []).id).toBeUndefined();
  });

  it('slugify', () => {
    expect(slugify('Città già è')).toBe('citta-gia-e');
    expect(slugify('', 'raccolta')).toBe('raccolta');
  });
});

describe('mergePuzzles', () => {
  const existing = [P('a', 'A1'), P('b', 'B1'), P()];
  const incoming = [P('b', 'B2'), P('c'), P()];

  it('append + rename', () => {
    const r = mergePuzzles(existing, incoming, { mode: 'append', onConflict: 'rename' });
    expect(idsOf(r.puzzles)).toEqual(['a', 'b', '-', 'b-2', 'c', '-']);
    expect([r.added, r.renamed, r.overwritten, r.skipped]).toEqual([3, 1, 0, 0]);
  });

  it('append + overwrite: sostituisce nella stessa posizione', () => {
    const r = mergePuzzles(existing, incoming, { mode: 'append', onConflict: 'overwrite' });
    expect(idsOf(r.puzzles)).toEqual(['a', 'b', '-', 'c', '-']);
    expect(r.puzzles[1].title).toBe('B2');
    expect([r.added, r.overwritten]).toEqual([2, 1]);
  });

  it('append + skip', () => {
    const r = mergePuzzles(existing, incoming, { mode: 'append', onConflict: 'skip' });
    expect(idsOf(r.puzzles)).toEqual(['a', 'b', '-', 'c', '-']);
    expect(r.puzzles[1].title).toBe('B1');
    expect(r.skipped).toBe(1);
  });

  it('replace: solo i nuovi, con id interni resi univoci', () => {
    const r = mergePuzzles(existing, [P('x'), P('x')], { mode: 'replace', onConflict: 'skip' });
    expect(idsOf(r.puzzles)).toEqual(['x', 'x-2']);
  });

  it('id in conflitto', () => {
    expect([...conflictingIds(existing, incoming)]).toEqual(['b']);
  });
});

describe('applyImport', () => {
  const cols: PuzzleCollection[] = [
    { name: 'Uno', puzzles: [P('a')] },
    { name: 'Due', puzzles: [P('z')] },
  ];

  it('aggiunge alla raccolta indicata', () => {
    const r = applyImport(cols, 1, [P('a')], { destination: 'append' });
    expect(r.collection).toBe(1);
    expect(idsOf(r.collections[1].puzzles)).toEqual(['z', 'a']);
    expect(r.collections[0]).toBe(cols[0]);
  });

  it('sostituisce il contenuto', () => {
    const r = applyImport(cols, 0, [P('q')], { destination: 'replace' });
    expect(idsOf(r.collections[0].puzzles)).toEqual(['q']);
    expect(r.collections[0].name).toBe('Uno');
  });

  it('crea una nuova raccolta con nome univoco', () => {
    const r = applyImport(cols, 0, [P('q')], { destination: 'new', name: 'Uno', description: 'd' });
    expect(r.collection).toBe(2);
    expect(r.collections[2]).toMatchObject({ name: 'Uno (2)', description: 'd' });
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
