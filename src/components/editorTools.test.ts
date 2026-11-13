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
import {
  DEFAULT_TOOL,
  applyTool,
  bridgeLossNotice,
  bridgeProblem,
  countItems,
  initialLattice,
  isAlreadyThere,
  itemLossNotice,
  latticeTarget,
  moveLattice,
  keepId,
  nextEndDirection,
  pickEndDirection,
  shouldReset,
  toolTargets,
  type Target,
} from './editorTools';
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

describe('sincronizzazione editor ↔ raccolta', () => {
  const A = { ...createPuzzle(2, 2), id: 'p1' };
  const B = { ...createPuzzle(3, 3), id: 'p2' };

  it('A modificato → B → ritorno su A ricarica A (bug dei puzzle scambiati)', () => {
    const A1 = { ...A, title: 'modificato' };
    // L'editor ha emesso A1, poi è passato a B: al reset lastEmitted diventa B.
    expect(shouldReset(B, A1, A1)).toBe(true);
    // Tornando su A1 con l'editor che mostra B, va ricaricato anche se A1 era l'ultima emissione.
    expect(shouldReset(A1, B, A1)).toBe(true);
  });

  it('non ricarica l’eco delle proprie modifiche', () => {
    const A1 = { ...A, title: '1' };
    const A2 = { ...A, title: '2' };
    expect(shouldReset(A1, A1, A1)).toBe(false);
    // il genitore è ancora indietro di una modifica
    expect(shouldReset(A1, A2, A1)).toBe(false);
  });

  it('ricarica una modifica esterna dello stesso puzzle', () => {
    const ext = { ...A, title: 'da fuori' };
    expect(shouldReset(ext, A, A)).toBe(true);
    expect(shouldReset(undefined, A, null)).toBe(false);
  });

  it('keepId conserva l’identità', () => {
    const imported = { ...createPuzzle(4, 4), id: 'p9' };
    expect(keepId(imported, 'p1').id).toBe('p1');
    expect('id' in keepId(imported, undefined)).toBe(false);
    expect(keepId(A, 'p1')).toBe(A);
  });
});

describe('strumento Ponte', () => {
  const BRIDGE_TOOL = { ...DEFAULT_TOOL, kind: 'bridge' as const };
  const at = (x: number, y: number): Target => ({ kind: 'point', at: { x, y } });

  it('si piazza solo dove è consentito', () => {
    const p = createPuzzle(3, 3);
    const ok = applyTool(p, BRIDGE_TOOL, at(1, 1), 'add');
    expect(ok.notice).toBeUndefined();
    expect(ok.puzzle.points).toContainEqual({ x: 1, y: 1, type: 'bridge' });
    expect(isAlreadyThere(ok.puzzle, BRIDGE_TOOL, at(1, 1))).toBe(true);

    const edge = applyTool(p, BRIDGE_TOOL, at(0, 1), 'add');
    expect(edge.puzzle).toBe(p);
    expect(edge.notice).toMatch(/incrocio interno/);
    expect(bridgeProblem(p, { x: 0, y: 1 })).toMatch(/incrocio interno/);

    const sym = setSymmetry(p, 'rotational');
    const r = applyTool(sym, BRIDGE_TOOL, at(1, 1), 'add');
    expect(r.puzzle).toBe(sym);
    expect(r.notice).toMatch(/simmetrici/);
  });

  it('segnala i ponti rimossi da un lato interrotto o da un cambio di griglia', () => {
    const p = setPoint(setPoint(createPuzzle(3, 3), { x: 1, y: 1 }, { type: 'bridge' }), { x: 2, y: 2 }, { type: 'bridge' });
    const gap = applyTool(p, { ...DEFAULT_TOOL, kind: 'gap' }, { kind: 'edge', at: { x: 1, y: 1, dir: 'h' } }, 'add');
    expect(gap.removedBridges).toBe(1);
    expect(bridgeLossNotice(p, gap.puzzle)).toBe('Rimosso 1 ponte non più valido.');
    expect(bridgeLossNotice(p, setSymmetry(p, 'vertical'))).toBe('Rimossi 2 ponti non più validi.');
    expect(bridgeLossNotice(p, p)).toBeNull();
    const hex = applyTool(p, { ...DEFAULT_TOOL, kind: 'hexagon' }, { kind: 'edge', at: { x: 1, y: 1, dir: 'h' } }, 'add');
    expect(hex.removedBridges).toBeUndefined();
  });
});

describe('navigazione da tastiera', () => {
  const p = createPuzzle(2, 2);

  it('mappa il reticolo su incroci, celle e lati', () => {
    const all = toolTargets('erase');
    expect(latticeTarget(p, 0, 0, all)).toEqual({ kind: 'point', at: { x: 0, y: 0 } });
    expect(latticeTarget(p, 1, 1, all)).toEqual({ kind: 'cell', at: { x: 0, y: 0 } });
    expect(latticeTarget(p, 1, 0, all)).toEqual({ kind: 'edge', at: { x: 0, y: 0, dir: 'h' } });
    expect(latticeTarget(p, 0, 1, all)).toEqual({ kind: 'edge', at: { x: 0, y: 0, dir: 'v' } });
    expect(latticeTarget(p, 5, 0, all)).toBeNull();
    expect(latticeTarget(p, -1, 0, all)).toBeNull();
  });

  it('rispetta i tipi ammessi dallo strumento', () => {
    expect(latticeTarget(p, 1, 1, toolTargets('start'))).toBeNull();
    expect(latticeTarget(p, 2, 2, toolTargets('start'))).not.toBeNull();
    expect(latticeTarget(p, 1, 0, toolTargets('square'))).toBeNull();
  });

  it('salta le posizioni non utili muovendosi', () => {
    expect(moveLattice(p, toolTargets('square'), { x: 1, y: 1 }, 1, 0)).toEqual({ x: 3, y: 1 });
    expect(moveLattice(p, toolTargets('start'), { x: 0, y: 0 }, 1, 0)).toEqual({ x: 2, y: 0 });
    expect(moveLattice(p, toolTargets('erase'), { x: 0, y: 0 }, 1, 0)).toEqual({ x: 1, y: 0 });
  });

  it('non esce dalla board', () => {
    expect(moveLattice(p, toolTargets('square'), { x: 3, y: 3 }, 1, 0)).toBeNull();
    expect(moveLattice(p, toolTargets('square'), { x: 1, y: 1 }, -1, 0)).toBeNull();
  });

  it('parte dal centro', () => {
    expect(initialLattice(p, toolTargets('start'))).toEqual({ x: 2, y: 2 });
    expect(initialLattice(p, toolTargets('square'))).not.toBeNull();
  });
});

describe('avviso sugli elementi tolti', () => {
  it('conta gli elementi e segnala la perdita', () => {
    const big = { ...createPuzzle(3, 3), cells: [{ x: 2, y: 2, type: 'square' as const, color: 'black' as const }] };
    const small = { ...createPuzzle(2, 2), cells: [] };
    expect(countItems(big)).toBe(1);
    expect(itemLossNotice(big, small)).toMatch(/ha tolto 1 elemento/);
    expect(itemLossNotice(small, big)).toBeNull();
  });
});
