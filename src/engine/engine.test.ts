import { describe, expect, it } from 'vitest';
import {
  createPuzzle,
  decodeWindmillCode,
  encodeWindmillCode,
  endDirection,
  fitPolyominoes,
  indexPuzzle,
  orientations,
  parsePuzzle,
  reflectPoint,
  resizePuzzle,
  serializePuzzle,
  setCell,
  setEdge,
  setPoint,
  setSymmetry,
  solve,
  validate,
  type CellItem,
  type Path,
  type Puzzle,
} from './index';

const P = (pts: [number, number][]): Path => pts.map(([x, y]) => ({ x, y }));

/** Puzzle 2x2 con partenza in basso a sinistra e uscita in alto a destra. */
function base(w = 2, h = 2): Puzzle {
  return createPuzzle(w, h);
}
function withCells(p: Puzzle, cells: CellItem[]): Puzzle {
  return cells.reduce((acc, c) => setCell(acc, c, c), p);
}

// ---------------------------------------------------------------------------

describe('codici legacy di The Windmill', () => {
  // Generato con protobuf.js 5.0.1 e grid.proto del progetto originale,
  // replicando Grid.getHash (RLE delle celle vuote).
  const REF =
    'CAcSAigGEgIIBBIAEgQIBxACEgIIBhIECAgQCRICKAUSAggGEgIoBRIECAswAxIAEgIIChIAEg4ICSIKCAISBAEBAAEYARICCAESAggDEgIoAhICCAUSAigDGAI=_0';

  it('decodifica un codice prodotto dall’implementazione originale', () => {
    const p = decodeWindmillCode(REF);
    expect(p.width).toBe(3);
    expect(p.height).toBe(2);
    expect(p.symmetry).toBe('horizontal');
    const pts = p.points.map((x) => `${x.type}@${x.x},${x.y}`).sort();
    // La simmetria orizzontale aggiunge le gemelle di partenza e uscita.
    expect(pts).toEqual(['end@0,0', 'end@3,0', 'hexagon@1,1', 'start@0,2', 'start@3,2'].sort());
    expect(p.edges).toEqual(
      expect.arrayContaining([
        { x: 1, y: 0, dir: 'v', type: 'hexagon' },
        { x: 1, y: 2, dir: 'h', type: 'gap' },
        { x: 3, y: 1, dir: 'v', type: 'missing' },
      ]),
    );
    const cells = Object.fromEntries(p.cells.map((c) => [`${c.x},${c.y}`, c]));
    expect(cells['0,0']).toMatchObject({ type: 'square', color: 'white' });
    expect(cells['1,0']).toMatchObject({ type: 'star', color: 'orange' });
    expect(cells['0,1']).toMatchObject({ type: 'triangle', count: 3 });
    expect(cells['1,1']).toMatchObject({ type: 'eliminator' });
    expect(cells['2,1']).toMatchObject({ type: 'polyomino', shape: ['##', '.#'], rotatable: true });
  });

  it('accetta anche un URL', () => {
    expect(decodeWindmillCode(`https://example.com/play/${REF}`).width).toBe(3);
  });

  it('andata e ritorno encode → decode', () => {
    const p = decodeWindmillCode(REF);
    const again = decodeWindmillCode(encodeWindmillCode(p));
    const strip = (x: Puzzle) => serializePuzzle({ ...x, data: undefined });
    expect(strip(again)).toBe(strip(p));
  });

  it('rifiuta codici non validi', () => {
    expect(() => decodeWindmillCode('abc')).toThrow();
    expect(() => decodeWindmillCode('AAAA_0')).toThrow();
  });
});

describe('formato JSON', () => {
  it('andata e ritorno serialize → parse', () => {
    let p = withCells(base(3, 3), [
      { x: 0, y: 0, type: 'square', color: 'black' },
      { x: 1, y: 1, type: 'polyomino', shape: ['#.', '##'], rotatable: true, negative: true },
      { x: 2, y: 2, type: 'triangle', count: 2 },
    ]);
    p = setEdge(p, { x: 0, y: 1, dir: 'h' }, 'gap');
    p = setPoint(p, { x: 1, y: 1 }, { type: 'hexagon' });
    p = { ...p, title: 'Test', data: { room: 'B-12' } };
    const { puzzle, warnings } = parsePuzzle(serializePuzzle(p));
    expect(warnings).toEqual([]);
    expect(serializePuzzle(puzzle)).toBe(serializePuzzle(p));
  });

  it('scarta elementi non validi con avvisi', () => {
    const { puzzle, warnings } = parsePuzzle({
      width: 2,
      height: 2,
      points: [
        { x: 0, y: 2, type: 'start' },
        { x: 2, y: 0, type: 'end' },
        { x: 9, y: 9, type: 'hexagon' },
      ],
      cells: [{ x: 0, y: 0, type: 'boh' }],
    });
    expect(puzzle.points).toHaveLength(2);
    expect(puzzle.cells).toHaveLength(0);
    expect(warnings.length).toBe(2);
  });

  it('dimensioni non valide sono un errore', () => {
    expect(() => parsePuzzle({ width: 0, height: 2 })).toThrow();
    expect(() => parsePuzzle('{nope')).toThrow();
  });
});

describe('griglia', () => {
  it('direzione automatica delle uscite', () => {
    const p = base(3, 3);
    const idx = indexPuzzle(p);
    expect(endDirection(idx, { x: 3, y: 0 })).toBe('right');
    expect(endDirection(idx, { x: 1, y: 0 })).toBe('up');
    expect(endDirection(idx, { x: 1, y: 1 })).toBeNull();
  });

  it('la simmetria duplica partenze e uscite in modo coerente', () => {
    for (const sym of ['horizontal', 'vertical', 'rotational'] as const) {
      const p = setSymmetry(base(4, 4), sym);
      const starts = p.points.filter((x) => x.type === 'start');
      const ends = p.points.filter((x) => x.type === 'end');
      expect(starts).toHaveLength(2);
      expect(ends).toHaveLength(2);
      for (const it of [...starts, ...ends]) {
        const m = reflectPoint(sym, 4, 4, it);
        expect(p.points.find((o) => o.x === m.x && o.y === m.y)?.type).toBe(it.type);
      }
    }
  });

  it('ridimensionare sposta partenza e uscita di default', () => {
    const p = resizePuzzle(base(2, 2), 4, 3);
    expect(p.points.find((x) => x.type === 'start')).toMatchObject({ x: 0, y: 3 });
    expect(p.points.find((x) => x.type === 'end')).toMatchObject({ x: 4, y: 0 });
  });
});

describe('poliomini', () => {
  it('orientazioni di una L', () => {
    expect(orientations(['#.', '#.', '##'], true)).toHaveLength(4);
    expect(orientations(['##', '##'], true)).toHaveLength(1);
    expect(orientations(['#.', '##'], false)).toHaveLength(1);
  });

  const region = (w: number, h: number) =>
    Array.from({ length: w * h }, (_, i) => ({ x: i % w, y: Math.floor(i / w) }));

  it('due domino coprono un 2x2', () => {
    expect(fitPolyominoes(2, 2, region(2, 2), [
      { shape: ['##'], rotatable: false, negative: false },
      { shape: ['##'], rotatable: false, negative: false },
    ]).ok).toBe(true);
  });

  it('un domino verticale fisso non copre una riga 1x2', () => {
    expect(fitPolyominoes(2, 1, region(2, 1), [{ shape: ['#', '#'], rotatable: false, negative: false }]).ok).toBe(false);
    expect(fitPolyominoes(2, 1, region(2, 1), [{ shape: ['#', '#'], rotatable: true, negative: false }]).ok).toBe(true);
  });

  it('un negativo sottrae area', () => {
    // Regione di 3 celle a L dentro una griglia 2x2, coperta da un 2x2 meno un monomino.
    const r = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }];
    expect(fitPolyominoes(2, 2, r, [
      { shape: ['##', '##'], rotatable: false, negative: false },
      { shape: ['#'], rotatable: false, negative: true },
    ]).ok).toBe(true);
  });

  it('positivi e negativi che si annullano', () => {
    expect(fitPolyominoes(3, 3, region(3, 3), [
      { shape: ['###'], rotatable: false, negative: false },
      { shape: ['#', '#', '#'], rotatable: false, negative: true },
    ]).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Validazione. Griglia 2x2: partenza (0,2), uscita (2,0).
//
//  (0,0)───(1,0)───(2,0)
//    │  c00  │  c10  │
//  (0,1)───(1,1)───(2,1)
//    │  c01  │  c11  │
//  (0,2)───(1,2)───(2,2)

const STRAIGHT_UP = P([[0, 2], [0, 1], [0, 0], [1, 0], [2, 0]]); // nessuna separazione
const MIDDLE = P([[0, 2], [0, 1], [1, 1], [2, 1], [2, 0]]); // separa riga 0 da riga 1
const VERTICAL_SPLIT = P([[0, 2], [1, 2], [1, 1], [1, 0], [2, 0]]); // separa colonne

describe('validazione', () => {
  it('percorso vuoto di simboli è valido', () => {
    expect(validate(base(), [STRAIGHT_UP]).valid).toBe(true);
  });

  it('percorso strutturalmente sbagliato', () => {
    const r = validate(base(), [P([[0, 2], [1, 1]])]);
    expect(r.valid).toBe(false);
    expect(r.messages.length).toBeGreaterThan(0);
  });

  it('quadrati di colori diversi vanno separati', () => {
    const p = withCells(base(), [
      { x: 0, y: 0, type: 'square', color: 'black' },
      { x: 0, y: 1, type: 'square', color: 'white' },
    ]);
    expect(validate(p, [STRAIGHT_UP]).valid).toBe(false);
    expect(validate(p, [MIDDLE]).valid).toBe(true);
    expect(validate(p, [VERTICAL_SPLIT]).valid).toBe(false);
  });

  it('stelle: esattamente due dello stesso colore', () => {
    const p = withCells(base(), [
      { x: 0, y: 0, type: 'star', color: 'orange' },
      { x: 1, y: 0, type: 'star', color: 'orange' },
    ]);
    expect(validate(p, [MIDDLE]).valid).toBe(true);
    expect(validate(p, [VERTICAL_SPLIT]).valid).toBe(false);
    // Un quadrato arancione nella stessa regione conta come terzo simbolo.
    const p3 = setCell(p, { x: 0, y: 1 }, { type: 'square', color: 'orange' });
    expect(validate(p3, [STRAIGHT_UP]).valid).toBe(false);
    // Stella + quadrato dello stesso colore: coppia valida.
    const p4 = withCells(base(), [
      { x: 0, y: 0, type: 'star', color: 'cyan' },
      { x: 1, y: 0, type: 'square', color: 'cyan' },
    ]);
    expect(validate(p4, [MIDDLE]).valid).toBe(true);
  });

  it('triangoli contano i lati percorsi attorno alla cella', () => {
    const p = withCells(base(), [{ x: 0, y: 0, type: 'triangle', count: 2 }]);
    expect(validate(p, [STRAIGHT_UP]).valid).toBe(true); // lato sinistro e superiore
    expect(validate(p, [MIDDLE]).valid).toBe(false); // solo il lato inferiore
    const p3 = withCells(base(), [{ x: 0, y: 0, type: 'triangle', count: 3 }]);
    expect(validate(p3, [P([[0, 2], [0, 1], [0, 0], [1, 0], [1, 1], [2, 1], [2, 0]])]).valid).toBe(true);
  });

  it('esagoni su punti e lati', () => {
    let p = setPoint(base(), { x: 1, y: 1 }, { type: 'hexagon' });
    expect(validate(p, [STRAIGHT_UP]).valid).toBe(false);
    expect(validate(p, [MIDDLE]).valid).toBe(true);
    p = setEdge(base(), { x: 0, y: 2, dir: 'h' }, 'hexagon');
    expect(validate(p, [STRAIGHT_UP]).valid).toBe(false);
    expect(validate(p, [VERTICAL_SPLIT]).valid).toBe(true);
    const r = validate(p, [STRAIGHT_UP]);
    expect(r.errors).toEqual([{ kind: 'edge', x: 0, y: 2, dir: 'h' }]);
  });

  it('lati interrotti non sono percorribili', () => {
    const p = setEdge(base(), { x: 0, y: 1, dir: 'v' }, 'gap');
    expect(validate(p, [STRAIGHT_UP]).valid).toBe(false);
  });

  it('poliomini nella regione', () => {
    const p = withCells(base(), [{ x: 0, y: 1, type: 'polyomino', shape: ['##'] }]);
    expect(validate(p, [MIDDLE]).valid).toBe(true); // regione inferiore = 2 celle orizzontali
    expect(validate(p, [VERTICAL_SPLIT]).valid).toBe(false); // regione = 2 celle verticali
    const rot = setCell(p, { x: 0, y: 1 }, { type: 'polyomino', shape: ['##'], rotatable: true });
    expect(validate(rot, [VERTICAL_SPLIT]).valid).toBe(true);
  });

  describe('eliminatori (Y)', () => {
    it('una Y da sola è un errore', () => {
      const p = withCells(base(), [{ x: 0, y: 0, type: 'eliminator' }]);
      const r = validate(p, [STRAIGHT_UP]);
      expect(r.valid).toBe(false);
      expect(r.errors).toEqual([{ kind: 'cell', x: 0, y: 0 }]);
    });

    it('una Y annulla un quadrato fuori posto', () => {
      const p = withCells(base(), [
        { x: 0, y: 0, type: 'square', color: 'black' },
        { x: 1, y: 0, type: 'square', color: 'white' },
        { x: 0, y: 1, type: 'eliminator' },
      ]);
      const r = validate(p, [STRAIGHT_UP]);
      expect(r.valid).toBe(true);
      expect(r.eliminated).toHaveLength(2);
    });

    it('una Y non può annullare un simbolo già soddisfatto', () => {
      const p = withCells(base(), [
        { x: 0, y: 0, type: 'square', color: 'black' },
        { x: 0, y: 1, type: 'eliminator' },
      ]);
      expect(validate(p, [STRAIGHT_UP]).valid).toBe(false);
    });

    it('due Y si annullano a vicenda', () => {
      const p = withCells(base(), [
        { x: 0, y: 0, type: 'eliminator' },
        { x: 1, y: 1, type: 'eliminator' },
      ]);
      expect(validate(p, [STRAIGHT_UP]).valid).toBe(true);
    });

    it('una Y annulla un esagono mancato nella sua regione', () => {
      let p = setPoint(base(), { x: 1, y: 1 }, { type: 'hexagon' });
      p = setCell(p, { x: 1, y: 1 }, { type: 'eliminator' });
      expect(validate(p, [STRAIGHT_UP]).valid).toBe(true);
    });

    it('una Y insieme ai poliomini', () => {
      // Regione di 4 celle con un dominio e un tromino: uno dei due va annullato.
      const p = withCells(base(), [
        { x: 0, y: 0, type: 'polyomino', shape: ['##', '##'] },
        { x: 1, y: 0, type: 'polyomino', shape: ['#'] },
        { x: 1, y: 1, type: 'eliminator' },
      ]);
      expect(validate(p, [STRAIGHT_UP]).valid).toBe(true);
    });
  });

  it('puzzle simmetrico con due percorsi', () => {
    const p = setSymmetry(
      { ...base(2, 2), points: [{ x: 0, y: 2, type: 'start' }, { x: 0, y: 0, type: 'end' }] },
      'horizontal',
    );
    const a = P([[0, 2], [0, 1], [0, 0]]);
    const b = P([[2, 2], [2, 1], [2, 0]]);
    expect(validate(p, [a, b]).valid).toBe(true);
    expect(validate(p, [a]).valid).toBe(false);
    expect(validate(p, [a, P([[2, 2], [1, 2], [1, 1]])]).valid).toBe(false);
  });
});

describe('solver', () => {
  it('griglia 1x1 vuota: due soluzioni', () => {
    const r = solve(base(1, 1), { maxSolutions: 10 });
    expect(r.solutions).toHaveLength(2);
    expect(r.exhaustive).toBe(true);
  });

  it('trova la soluzione dei quadrati', () => {
    const p = withCells(base(3, 3), [
      { x: 0, y: 0, type: 'square', color: 'black' },
      { x: 2, y: 2, type: 'square', color: 'white' },
      { x: 2, y: 0, type: 'square', color: 'white' },
      { x: 0, y: 2, type: 'square', color: 'black' },
    ]);
    const r = solve(p);
    expect(r.solutions.length).toBe(1);
    expect(validate(p, r.solutions[0]).valid).toBe(true);
  });

  it('riconosce un puzzle impossibile', () => {
    const p = withCells(base(1, 1), [
      { x: 0, y: 0, type: 'square', color: 'black' },
    ]);
    const imp = setCell(p, { x: 0, y: 0 }, { type: 'star', color: 'black' });
    const r = solve(imp);
    expect(r.solutions).toHaveLength(0);
    expect(r.exhaustive).toBe(true);
  });

  it('puzzle simmetrico', () => {
    const p = setSymmetry(
      { ...base(3, 3), points: [{ x: 0, y: 3, type: 'start' }, { x: 0, y: 0, type: 'end' }] },
      'horizontal',
    );
    const r = solve(p);
    expect(r.solutions.length).toBe(1);
    expect(r.solutions[0]).toHaveLength(2);
  });
});
