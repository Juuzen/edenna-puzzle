import { describe, expect, it } from 'vitest';
import {
  canPlaceBridge,
  countBridges,
  createPuzzle,
  parsePuzzle,
  resizePuzzle,
  serializePuzzle,
  setEdge,
  setPoint,
  setSymmetry,
  solve,
  validate,
  type Path,
  type Puzzle,
} from './index';

const P = (pts: [number, number][]): Path => pts.map(([x, y]) => ({ x, y }));
const withBridge = (p: Puzzle, x: number, y: number) => setPoint(p, { x, y }, { type: 'bridge' });

/** 2x2, ponte al centro: partenza (0,2), uscita (2,0). */
const small = () => withBridge(createPuzzle(2, 2), 1, 1);
/** 3x3, ponte in (1,1): partenza (0,3), uscita (3,0). */
const big = () => withBridge(createPuzzle(3, 3), 1, 1);

/** Dritto/dritto: sinistra→destra, poi basso→alto. */
const STRAIGHT = P([[0, 2], [0, 1], [1, 1], [2, 1], [2, 2], [1, 2], [1, 1], [1, 0], [2, 0]]);
/** Curva/curva in (1,1): sinistra→su, poi destra→giù (non consentito). */
const CURVES = P([[0, 3], [0, 2], [0, 1], [1, 1], [1, 0], [2, 0], [2, 1], [1, 1], [1, 2], [2, 2], [3, 2], [3, 1], [3, 0]]);

describe('ponte: posizionamento', () => {
  it('canPlaceBridge', () => {
    const p = createPuzzle(3, 3);
    expect(canPlaceBridge(p, { x: 1, y: 1 })).toBe(true);
    expect(canPlaceBridge(p, { x: 0, y: 1 })).toBe(false);
    expect(canPlaceBridge(p, { x: 3, y: 2 })).toBe(false);
    expect(canPlaceBridge(setEdge(p, { x: 1, y: 1, dir: 'h' }, 'gap'), { x: 1, y: 1 })).toBe(false);
    expect(canPlaceBridge(setEdge(p, { x: 1, y: 0, dir: 'v' }, 'missing'), { x: 1, y: 1 })).toBe(false);
    // Un esagono su un lato va bene.
    expect(canPlaceBridge(setEdge(p, { x: 1, y: 0, dir: 'v' }, 'hexagon'), { x: 1, y: 1 })).toBe(true);
    expect(canPlaceBridge(setSymmetry(p, 'horizontal'), { x: 1, y: 1 })).toBe(false);
  });

  it('setPoint rifiuta un ponte non valido e sostituisce un elemento esistente', () => {
    const p = createPuzzle(3, 3);
    expect(countBridges(withBridge(p, 0, 1))).toBe(0);
    const hex = setPoint(p, { x: 1, y: 1 }, { type: 'hexagon' });
    const q = withBridge(hex, 1, 1);
    expect(q.points.filter((it) => it.x === 1 && it.y === 1)).toEqual([{ x: 1, y: 1, type: 'bridge' }]);
  });

  it('i ponti non più validi spariscono (lato, ridimensionamento, simmetria)', () => {
    const p = withBridge(withBridge(createPuzzle(3, 3), 1, 1), 2, 2);
    expect(countBridges(p)).toBe(2);
    expect(countBridges(setEdge(p, { x: 2, y: 2, dir: 'h' }, 'gap'))).toBe(1);
    expect(countBridges(setEdge(p, { x: 1, y: 1, dir: 'v' }, 'missing'))).toBe(1);
    expect(countBridges(resizePuzzle(p, 2, 2))).toBe(1); // (2,2) finisce sul bordo
    expect(countBridges(resizePuzzle(p, 4, 4))).toBe(2);
    expect(countBridges(setSymmetry(p, 'rotational'))).toBe(0);
  });
});

describe('ponte: validazione', () => {
  it('doppio passaggio dritto/dritto', () => {
    expect(validate(small(), [STRAIGHT]).messages).toEqual([]);
  });

  it('sul ponte non si curva', () => {
    // Due passaggi in curva: un errore per ciascuno.
    expect(validate(big(), [CURVES]).messages).toEqual(Array(2).fill('Sul ponte 1,1 il percorso deve andare dritto.'));
    // Neanche con un solo passaggio.
    const once = P([[0, 2], [0, 1], [1, 1], [1, 0], [2, 0]]);
    expect(validate(small(), [once]).messages).toEqual(['Sul ponte 1,1 il percorso deve andare dritto.']);
  });

  it('il ponte è facoltativo', () => {
    expect(validate(small(), [P([[0, 2], [0, 1], [0, 0], [1, 0], [2, 0]])]).valid).toBe(true);
    expect(validate(small(), [P([[0, 2], [0, 1], [1, 1], [2, 1], [2, 0]])]).valid).toBe(true);
  });

  it('doppio passaggio su un punto normale è un errore', () => {
    const p = createPuzzle(2, 2);
    expect(validate(p, [STRAIGHT]).messages).toContain('Il punto 1,1 è attraversato più volte.');
  });

  it('un lato non si percorre due volte', () => {
    const path = P([[0, 2], [0, 1], [1, 1], [2, 1], [1, 1], [1, 0], [2, 0]]);
    const msgs = validate(small(), [path]).messages;
    expect(msgs).toContain('Il lato fra 2,1 e 1,1 è percorso più volte.');
    expect(msgs.some((m) => m.includes('attraversato'))).toBe(false);
  });

  it('terzo passaggio sul ponte è un errore', () => {
    const path = P([[0, 2], [0, 1], [1, 1], [2, 1], [2, 2], [1, 2], [1, 1], [0, 1], [0, 0], [1, 0], [1, 1], [1, 0], [2, 0]]);
    expect(validate(small(), [path]).messages).toContain('Il punto 1,1 è attraversato più volte.');
  });
});

describe('ponte: solver', () => {
  it('trova l’unica soluzione che passa due volte sul ponte', () => {
    // Gli esagoni sui lati obbligano entrambi gli attraversamenti.
    let p = small();
    for (const e of [
      { x: 0, y: 1, dir: 'h' as const },
      { x: 1, y: 1, dir: 'h' as const },
      { x: 1, y: 0, dir: 'v' as const },
      { x: 1, y: 1, dir: 'v' as const },
      { x: 0, y: 1, dir: 'v' as const },
    ]) {
      p = setEdge(p, e, 'hexagon');
    }
    const r = solve(p, { maxSolutions: 2 });
    expect(r.exhaustive).toBe(true);
    expect(r.solutions).toEqual([[STRAIGHT]]);
    // Stessi lati con l'anello percorso al contrario: curva/curva, non valida.
    const twin = P([[0, 2], [0, 1], [1, 1], [1, 2], [2, 2], [2, 1], [1, 1], [1, 0], [2, 0]]);
    expect(validate(p, [twin]).valid).toBe(false);
    // Senza ponte lo stesso puzzle non ha soluzione.
    expect(solve(setPoint(p, { x: 1, y: 1 }, null), { maxSolutions: 1 }).solutions).toEqual([]);
  });
});

describe('ponte: formato JSON', () => {
  it('andata e ritorno', () => {
    const p = big();
    const { puzzle, warnings } = parsePuzzle(serializePuzzle(p));
    expect(warnings).toEqual([]);
    expect(puzzle.points).toContainEqual({ x: 1, y: 1, type: 'bridge' });
  });

  it('ponti non validi scartati con avviso', () => {
    const { puzzle, warnings } = parsePuzzle({
      width: 2,
      height: 2,
      points: [
        { x: 0, y: 2, type: 'start' },
        { x: 2, y: 0, type: 'end' },
        { x: 0, y: 1, type: 'bridge' },
        { x: 1, y: 1, type: 'bridge' },
      ],
      edges: [{ x: 1, y: 1, dir: 'h', type: 'gap' }],
    });
    expect(countBridges(puzzle)).toBe(0);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/^Ponte in 0,1 scartato/);
  });
});
