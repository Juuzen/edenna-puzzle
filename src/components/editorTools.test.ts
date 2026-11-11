import { describe, expect, it } from 'vitest';
import {
  createPuzzle,
  endDirection,
  indexPuzzle,
  setEdge,
  setPoint,
  setSymmetry,
  validEndDirections,
  type Puzzle,
} from '../engine';
import { DEFAULT_TOOL, applyTool, isAlreadyThere, nextEndDirection, pickEndDirection, type Target } from './editorTools';
import { isTraceComplete, startTrace, stepTrace } from './tracing';

const END_TOOL = { ...DEFAULT_TOOL, kind: 'end' as const };
const C = { x: 2, y: 2 };

/** 3x3 con i lati attorno a (2,2) tolti a sinistra, sopra e a destra (come nello screenshot). */
function hub(): Puzzle {
  let p = createPuzzle(3, 3);
  p = setEdge(p, { x: 1, y: 2, dir: 'h' }, 'missing');
  p = setEdge(p, { x: 2, y: 1, dir: 'v' }, 'missing');
  p = setEdge(p, { x: 2, y: 2, dir: 'h' }, 'missing');
  return p;
}

const endAt = (p: Puzzle, at = C) => p.points.find((it) => it.type === 'end' && it.x === at.x && it.y === at.y);

describe('direzioni valide delle uscite', () => {
  it('angolo, lati assenti e punto interno', () => {
    const p = hub();
    const idx = indexPuzzle(p);
    expect(validEndDirections(idx, { x: 3, y: 0 })).toEqual(['right', 'up']);
    expect(validEndDirections(idx, C)).toEqual(['left', 'right', 'up']);
    expect(validEndDirections(idx, { x: 1, y: 1 })).toEqual([]);
  });
});

describe('scelta della direzione nell’editor', () => {
  const p = hub();

  it('segue lo scostamento del puntatore', () => {
    expect(pickEndDirection(p, C, { x: 2.3, y: 2.05 })).toBe('right');
    expect(pickEndDirection(p, C, { x: 1.95, y: 1.7 })).toBe('up');
    expect(pickEndDirection(p, C, { x: 1.7, y: 2 })).toBe('left');
    // verso il basso non c'è sbocco: vince la più vicina fra quelle valide
    expect(pickEndDirection(p, C, { x: 2.2, y: 2.4 })).toBe('right');
  });

  it('al centro resta la direzione attuale (o l’automatica)', () => {
    expect(pickEndDirection(p, C, { x: 2.01, y: 2 })).toBe('left');
    const q = setPoint(p, C, { type: 'end', dir: 'up' });
    expect(pickEndDirection(q, C, { x: 2.01, y: 2 })).toBe('up');
  });

  it('salva `dir` solo se diversa da quella automatica', () => {
    const auto = applyTool(p, END_TOOL, { kind: 'point', at: C, dir: 'left' }, 'add').puzzle;
    expect(endAt(auto)).toEqual({ x: 2, y: 2, type: 'end' });
    const up = applyTool(p, END_TOOL, { kind: 'point', at: C, dir: 'up' }, 'add').puzzle;
    expect(endAt(up)).toEqual({ x: 2, y: 2, type: 'end', dir: 'up' });
    expect(endDirection(indexPuzzle(up), C)).toBe('up');
  });

  it('clic con un’altra direzione cambia, con la stessa rimuove', () => {
    const q = applyTool(p, END_TOOL, { kind: 'point', at: C, dir: 'up' }, 'add').puzzle;
    const right: Target = { kind: 'point', at: C, dir: 'right' };
    const same: Target = { kind: 'point', at: C, dir: 'up' };
    expect(isAlreadyThere(q, END_TOOL, right)).toBe(false);
    expect(isAlreadyThere(q, END_TOOL, same)).toBe(true);
    expect(endDirection(indexPuzzle(applyTool(q, END_TOOL, right, 'add').puzzle), C)).toBe('right');
    expect(endAt(applyTool(q, END_TOOL, same, 'remove').puzzle)).toBeUndefined();
  });

  it('R ruota in senso orario fra le direzioni valide', () => {
    expect(nextEndDirection(p, C, 'up')).toBe('right');
    expect(nextEndDirection(p, C, 'right')).toBe('left');
    expect(nextEndDirection(p, C, 'left')).toBe('up');
    expect(nextEndDirection(p, C, 'up', -1)).toBe('left');
  });

  it('in simmetria la gemella riceve la direzione riflessa', () => {
    const s = setSymmetry(createPuzzle(4, 4), 'horizontal');
    const q = applyTool(s, END_TOOL, { kind: 'point', at: { x: 0, y: 0 }, dir: 'up' }, 'add').puzzle;
    const idx = indexPuzzle(q);
    expect(endDirection(idx, { x: 0, y: 0 })).toBe('up');
    expect(endDirection(idx, { x: 4, y: 0 })).toBe('up');
    const r = applyTool(s, END_TOOL, { kind: 'point', at: { x: 0, y: 0 }, dir: 'left' }, 'add').puzzle;
    expect(endDirection(indexPuzzle(r), { x: 4, y: 0 })).toBe('right');
  });
});

describe('tracciamento verso un’uscita orientata', () => {
  it('si completa solo uscendo nella direzione scelta', () => {
    let p = setPoint(hub(), C, { type: 'end', dir: 'up' });
    p = setPoint(p, { x: 2, y: 3 }, { type: 'start' });
    const idx = indexPuzzle(p);
    const at = stepTrace(idx, startTrace({ x: 2, y: 3 }), 'up');
    expect(stepTrace(idx, at, 'left')).toEqual(at);
    expect(isTraceComplete(idx, stepTrace(idx, at, 'up'))).toBe(true);
  });
});
