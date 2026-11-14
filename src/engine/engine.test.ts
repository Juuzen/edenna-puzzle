import { describe, expect, it } from 'vitest';
import {
  createPuzzle,
  endDirection,
  fitPolyominoes,
  hasShift,
  indexPuzzle,
  orientations,
  parseCollection,
  parsePuzzle,
  parsePuzzleSet,
  reflectPoint,
  resizePuzzle,
  serializeCollection,
  serializePuzzle,
  serializePuzzleSet,
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

describe('sfondo del puzzle', () => {
  it('andata e ritorno di tinta unita e gradiente', () => {
    for (const background of [{ colors: ['#112233'] }, { colors: ['#112233', '#aabbcc'], angle: 45 }] as Puzzle['background'][]) {
      const p = { ...base(), background };
      const { puzzle, warnings } = parsePuzzle(serializePuzzle(p));
      expect(warnings).toEqual([]);
      expect(puzzle.background).toEqual(background);
    }
  });

  it('normalizza colori e angolo', () => {
    const read = (background: unknown) => parsePuzzle({ width: 2, height: 2, background });
    expect(read({ colors: ['#ABC'] }).puzzle.background).toEqual({ colors: ['#aabbcc'] });
    // angolo ignorato con un solo colore, 180 è il default e non viene scritto
    expect(read({ colors: ['#000000'], angle: 30 }).puzzle.background).toEqual({ colors: ['#000000'] });
    expect(read({ colors: ['#000000', '#ffffff'], angle: 180 }).puzzle.background).toEqual({ colors: ['#000000', '#ffffff'] });
    expect(read({ colors: ['#000000', '#ffffff'], angle: -90 }).puzzle.background?.angle).toBe(270);
    expect(read({ colors: ['#000000', '#ffffff'], angle: 720 }).puzzle.background?.angle).toBe(0);
  });

  it('scarta colori non validi con avvisi', () => {
    const r = parsePuzzle({ width: 2, height: 2, background: { colors: ['rosso', '#00ff00'] } });
    expect(r.puzzle.background).toEqual({ colors: ['#00ff00'] });
    expect(r.warnings.some((w) => w.includes('rosso'))).toBe(true);
    const none = parsePuzzle({ width: 2, height: 2, background: { colors: ['boh'] } });
    expect(none.puzzle.background).toBeUndefined();
    expect(parsePuzzle({ width: 2, height: 2, background: 'blu' }).warnings.length).toBeGreaterThan(0);
  });

  it('le modifiche del puzzle conservano lo sfondo', () => {
    const p = { ...base(3, 3), background: { colors: ['#123456'] as [string] } };
    expect(setEdge(p, { x: 0, y: 0, dir: 'h' }, 'gap').background).toEqual(p.background);
    expect(resizePuzzle(p, 4, 4).background).toEqual(p.background);
  });
});

describe('raccolte', () => {
  it('andata e ritorno con nome e descrizione', () => {
    const c = { id: 'b', name: 'Stanza B', description: 'Piano terra', puzzles: [base(), base(3, 3)] };
    const { collection, results } = parseCollection(serializeCollection(c));
    expect(collection).toEqual({ ...c, puzzles: results.map((r) => r.puzzle) });
    expect(collection.puzzles.map((p) => p.width)).toEqual([2, 3]);
  });

  it('raccolta vuota', () => {
    const { collection } = parseCollection(serializeCollection({ name: 'Vuota', puzzles: [] }));
    expect(collection).toEqual({ name: 'Vuota', puzzles: [] });
  });

  it('i vecchi formati si leggono ancora', () => {
    const list = [base(), base(3, 3)];
    expect(parseCollection(serializePuzzleSet(list), 'file').collection.name).toBe('file');
    expect(parseCollection(JSON.stringify(list)).collection.puzzles).toHaveLength(2);
    expect(parsePuzzleSet(serializeCollection({ name: 'x', puzzles: list }))).toHaveLength(2);
    // un puzzle singolo prende il nome dal titolo
    expect(parseCollection(serializePuzzle({ ...base(), title: 'Solo' })).collection.name).toBe('Solo');
  });
});

describe('palette dei colori', () => {
  it('andata e ritorno', () => {
    const p = { ...base(), background: { colors: ['#102030'] as [string] }, palette: { line: '#334455', path: '#ffcc00' } };
    const { puzzle, warnings } = parsePuzzle(serializePuzzle(p));
    expect(warnings).toEqual([]);
    expect(puzzle.palette).toEqual({ line: '#334455', path: '#ffcc00' });
  });

  it('colori non validi e chiavi sconosciute scartati con avvisi; vuota → omessa', () => {
    const r = parsePuzzle({ width: 2, height: 2, palette: { line: '#ABC', path: 'blu', glow: '#000000' } });
    expect(r.puzzle.palette).toEqual({ line: '#aabbcc' });
    expect(r.warnings.filter((w) => w.startsWith('palette'))).toHaveLength(2);
    expect(parsePuzzle({ width: 2, height: 2, palette: { path: 'x' } }).puzzle.palette).toBeUndefined();
    expect(serializePuzzle({ ...base(), palette: {} })).not.toContain('palette');
  });
});

describe('arcobaleno', () => {
  it('andata e ritorno', () => {
    const p = { ...base(), rainbow: { background: { period: 12 }, elements: { period: 4 } } };
    const json = serializePuzzle(p);
    const { puzzle, warnings } = parsePuzzle(json);
    expect(warnings).toEqual([]);
    expect(puzzle.rainbow).toEqual({ elements: { period: 4 }, background: { period: 12 } });
    // Ordine stabile: prima gli elementi.
    expect(Object.keys(JSON.parse(json).rainbow)).toEqual(['elements', 'background']);
  });

  it('periodi fuori range o non validi corretti con avvisi; chiavi sconosciute scartate', () => {
    const r = parsePuzzle({ width: 2, height: 2, rainbow: { elements: { period: 0.2 }, background: { period: 'x' }, grid: {} } });
    expect(r.puzzle.rainbow).toEqual({ elements: { period: 1 }, background: { period: 8 } });
    expect(r.warnings.filter((w) => w.startsWith('rainbow'))).toHaveLength(3);
    expect(parsePuzzle({ width: 2, height: 2, rainbow: { elements: {} } }).puzzle.rainbow).toEqual({ elements: { period: 8 } });
    expect(parsePuzzle({ width: 2, height: 2, rainbow: { elements: { period: 999 } } }).puzzle.rainbow?.elements?.period).toBe(16);
  });

  it('vuoto o disattivato → omesso; tipo errato → avviso', () => {
    expect(parsePuzzle({ width: 2, height: 2, rainbow: { elements: false } }).puzzle.rainbow).toBeUndefined();
    expect(serializePuzzle({ ...base(), rainbow: {} })).not.toContain('rainbow');
    expect(parsePuzzle({ width: 2, height: 2, rainbow: 'sì' }).warnings.length).toBeGreaterThan(0);
  });
});

describe('sfalsamento', () => {
  it('andata e ritorno con ordine stabile', () => {
    const p = { ...base(), shift: { rotation: 20, y: -0.75, x: 1.5 } };
    const json = serializePuzzle(p);
    const { puzzle, warnings } = parsePuzzle(json);
    expect(warnings).toEqual([]);
    expect(puzzle.shift).toEqual({ x: 1.5, y: -0.75, rotation: 20 });
    expect(Object.keys(JSON.parse(json).shift)).toEqual(['x', 'y', 'rotation']);
    expect(hasShift(puzzle)).toBe(true);
  });

  it('rotazione normalizzata in [0, 360)', () => {
    const rot = (r: number) => parsePuzzle({ width: 2, height: 2, shift: { rotation: r } }).puzzle.shift?.rotation;
    expect(rot(-90)).toBe(270);
    expect(rot(450)).toBe(90);
    expect(rot(360)).toBeUndefined();
    expect(rot(359.99)).toBeUndefined();
    expect(rot(12.34)).toBe(12.3);
  });

  it('spostamento limitato e arrotondato, con avviso', () => {
    const r = parsePuzzle({ width: 2, height: 2, shift: { x: 99, y: -0.123 } });
    expect(r.puzzle.shift).toEqual({ x: 12, y: -0.12 });
    expect(r.warnings.filter((w) => w.startsWith('shift'))).toHaveLength(1);
  });

  it('zeri omessi; valori e chiavi non validi scartati con avvisi', () => {
    expect(parsePuzzle({ width: 2, height: 2, shift: { x: 0, y: 0, rotation: 0 } }).puzzle.shift).toBeUndefined();
    expect(serializePuzzle({ ...base(), shift: {} })).not.toContain('shift');
    expect(hasShift(base())).toBe(false);
    const r = parsePuzzle({ width: 2, height: 2, shift: { x: 'a', z: 1, rotation: 30 } });
    expect(r.puzzle.shift).toEqual({ rotation: 30 });
    expect(r.warnings.filter((w) => w.startsWith('shift'))).toHaveLength(2);
    expect(parsePuzzle({ width: 2, height: 2, shift: 5 }).warnings.length).toBeGreaterThan(0);
  });
});
