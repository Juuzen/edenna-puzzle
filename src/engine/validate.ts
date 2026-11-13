import {
  type EdgeRef,
  edgeBetween,
  edgeCells,
  edgeKey,
  edgeRefKey,
  getPoint,
  indexPuzzle,
  isEdgeTraversable,
  maxPasses,
  pointCells,
  pointKey,
  reflectPoint,
} from './grid';
import { fitPolyominoes, type PieceSpec } from './polyomino';
import type { CellItem, Color, Coord, Path, Puzzle } from './types';

/** Riferimento a un simbolo del puzzle (per evidenziare errori ecc.). */
export type SymbolRef =
  | { kind: 'cell'; x: number; y: number }
  | { kind: 'point'; x: number; y: number }
  | { kind: 'edge'; x: number; y: number; dir: 'h' | 'v' };

export const symbolRefKey = (r: SymbolRef) =>
  r.kind === 'edge' ? `e:${r.x},${r.y},${r.dir}` : `${r.kind[0]}:${r.x},${r.y}`;

export interface ValidationResult {
  valid: boolean;
  /** Simboli non soddisfatti. */
  errors: SymbolRef[];
  /** Simboli annullati dalle Y (compresi i simboli Y usati). */
  eliminated: SymbolRef[];
  /** Le regioni in cui il percorso divide la griglia. */
  regions: Coord[][];
  /** Problemi strutturali del percorso o limiti di calcolo. */
  messages: string[];
}

/** Colore "effettivo" di un simbolo di cella, quello che conta per le stelle. */
export function symbolColor(item: CellItem): Color | null {
  switch (item.type) {
    case 'square':
    case 'star':
      return item.color;
    case 'polyomino':
      return item.color ?? (item.negative ? 'blue' : 'yellow');
    case 'eliminator':
      return item.color ?? 'white';
    case 'triangle':
      return item.color ?? 'orange';
  }
}

// ---------------------------------------------------------------------------

/** Controlla che i percorsi siano legali (partenze, uscite, lati, incroci). */
export function checkPathStructure(puzzle: Puzzle, paths: Path[]): string[] {
  const idx = indexPuzzle(puzzle);
  const msgs: string[] = [];
  const expected = puzzle.symmetry === 'none' ? 1 : 2;
  if (paths.length !== expected) {
    msgs.push(`Servono ${expected} percorsi, ricevuti ${paths.length}.`);
    return msgs;
  }
  // Un punto si attraversa una volta (due sui ponti), un lato mai due volte.
  const passes = new Map<string, number>();
  const usedEdges = new Set<string>();
  for (const path of paths) {
    if (path.length < 2) {
      msgs.push('Percorso troppo corto.');
      continue;
    }
    if (getPoint(idx, path[0])?.type !== 'start') msgs.push('Il percorso non parte da una partenza.');
    if (getPoint(idx, path[path.length - 1])?.type !== 'end') msgs.push('Il percorso non termina su un’uscita.');
    path.forEach((c, i) => {
      const k = pointKey(c.x, c.y);
      const n = (passes.get(k) ?? 0) + 1;
      passes.set(k, n);
      if (n > maxPasses(idx, c)) msgs.push(`Il punto ${k} è attraversato più volte.`);
      if (i > 0) {
        const prev = path[i - 1];
        if (Math.abs(prev.x - c.x) + Math.abs(prev.y - c.y) !== 1) {
          msgs.push(`Salto non valido fra ${pointKey(prev.x, prev.y)} e ${k}.`);
        } else {
          const e = edgeBetween(prev, c);
          if (!isEdgeTraversable(idx, e)) {
            msgs.push(`Il lato fra ${pointKey(prev.x, prev.y)} e ${k} non è percorribile.`);
          }
          const ek = edgeRefKey(e);
          if (usedEdges.has(ek)) msgs.push(`Il lato fra ${pointKey(prev.x, prev.y)} e ${k} è percorso più volte.`);
          usedEdges.add(ek);
        }
      }
    });
  }
  if (expected === 2 && paths[0].length === paths[1].length) {
    const ok = paths[0].every((c, i) => {
      const m = reflectPoint(puzzle.symmetry, puzzle.width, puzzle.height, c);
      return m.x === paths[1][i].x && m.y === paths[1][i].y;
    });
    if (!ok) msgs.push('Il secondo percorso non è il riflesso del primo.');
  } else if (expected === 2) {
    msgs.push('Il secondo percorso non è il riflesso del primo.');
  }
  return msgs;
}

/** Divide le celle in regioni separate dai lati percorsi. */
export function computeRegions(puzzle: Puzzle, usedEdges: Set<string>): Coord[][] {
  const { width: w, height: h } = puzzle;
  const regionOf = new Int32Array(w * h).fill(-1);
  const regions: Coord[][] = [];
  for (let sy = 0; sy < h; sy++) {
    for (let sx = 0; sx < w; sx++) {
      if (regionOf[sy * w + sx] >= 0) continue;
      const id = regions.length;
      const cells: Coord[] = [];
      const stack: Coord[] = [{ x: sx, y: sy }];
      regionOf[sy * w + sx] = id;
      while (stack.length) {
        const c = stack.pop()!;
        cells.push(c);
        const moves: [Coord, string][] = [
          [{ x: c.x - 1, y: c.y }, edgeKey(c.x, c.y, 'v')],
          [{ x: c.x + 1, y: c.y }, edgeKey(c.x + 1, c.y, 'v')],
          [{ x: c.x, y: c.y - 1 }, edgeKey(c.x, c.y, 'h')],
          [{ x: c.x, y: c.y + 1 }, edgeKey(c.x, c.y + 1, 'h')],
        ];
        for (const [n, ek] of moves) {
          if (n.x < 0 || n.y < 0 || n.x >= w || n.y >= h) continue;
          if (usedEdges.has(ek) || regionOf[n.y * w + n.x] >= 0) continue;
          regionOf[n.y * w + n.x] = id;
          stack.push(n);
        }
      }
      regions.push(cells.sort((a, b) => a.y - b.y || a.x - b.x));
    }
  }
  return regions;
}

// ---------------------------------------------------------------------------

/** Un simbolo che vive in una regione e può essere annullato da una Y. */
interface RegionSymbol {
  ref: SymbolRef;
  /** Per i simboli di cella. */
  cell?: CellItem;
  /** Esagono non toccato dal percorso: sempre un errore. */
  unmetHexagon?: boolean;
}

interface RegionContext {
  puzzle: Puzzle;
  cells: Coord[];
  usedEdges: Set<string>;
  polyBudget: number;
  timedOut: boolean;
  fitCache: Map<string, boolean>;
}

/** Restituisce i simboli in errore (vuoto = regione valida). */
function checkSymbols(symbols: RegionSymbol[], ctx: RegionContext): SymbolRef[] {
  const errors: SymbolRef[] = [];
  const cellSyms = symbols.filter((s): s is RegionSymbol & { cell: CellItem } => !!s.cell);

  for (const s of symbols) if (s.unmetHexagon) errors.push(s.ref);

  // Triangoli: numero di lati percorsi attorno alla cella.
  for (const s of cellSyms) {
    if (s.cell.type !== 'triangle') continue;
    const { x, y } = s.cell;
    const n = [
      edgeKey(x, y, 'h'),
      edgeKey(x, y + 1, 'h'),
      edgeKey(x, y, 'v'),
      edgeKey(x + 1, y, 'v'),
    ].filter((k) => ctx.usedEdges.has(k)).length;
    if (n !== s.cell.count) errors.push(s.ref);
  }

  // Quadrati: un solo colore per regione.
  const squares = new Map<Color, SymbolRef[]>();
  for (const s of cellSyms) {
    if (s.cell.type !== 'square') continue;
    const list = squares.get(s.cell.color) ?? [];
    list.push(s.ref);
    squares.set(s.cell.color, list);
  }
  if (squares.size > 1) {
    const groups = [...squares.values()];
    // Con due colori si segnala il gruppo minoritario (entrambi se pari).
    const min = groups.length === 2 ? Math.min(...groups.map((g) => g.length)) : Infinity;
    for (const g of groups) if (groups.length !== 2 || g.length === min) errors.push(...g);
  }

  // Stelle: esattamente due simboli di quel colore nella regione.
  const colorCount = new Map<Color, number>();
  for (const s of cellSyms) {
    const c = symbolColor(s.cell);
    if (c) colorCount.set(c, (colorCount.get(c) ?? 0) + 1);
  }
  for (const s of cellSyms) {
    if (s.cell.type === 'star' && colorCount.get(s.cell.color) !== 2) errors.push(s.ref);
  }

  // Poliomini.
  const polys = cellSyms.filter((s) => s.cell.type === 'polyomino');
  if (polys.length) {
    const key = polys.map((s) => symbolRefKey(s.ref)).join(';');
    let ok = ctx.fitCache.get(key);
    if (ok === undefined) {
      const specs: PieceSpec[] = polys.map((s) => {
        const c = s.cell as Extract<CellItem, { type: 'polyomino' }>;
        return { shape: c.shape, rotatable: !!c.rotatable, negative: !!c.negative };
      });
      const r = fitPolyominoes(ctx.puzzle.width, ctx.puzzle.height, ctx.cells, specs, ctx.polyBudget);
      if (r.timedOut) ctx.timedOut = true;
      ok = r.ok;
      ctx.fitCache.set(key, ok);
    }
    if (!ok) errors.push(...polys.map((s) => s.ref));
  }
  return errors;
}

/** Combinazioni di k elementi di un array. */
function* combinations<T>(items: T[], k: number, start = 0, acc: T[] = []): Generator<T[]> {
  if (acc.length === k) {
    yield acc;
    return;
  }
  for (let i = start; i <= items.length - (k - acc.length); i++) {
    acc.push(items[i]);
    yield* combinations(items, k, i + 1, acc);
    acc.pop();
  }
}

function checkRegion(
  symbols: RegionSymbol[],
  ctx: RegionContext,
): { errors: SymbolRef[]; eliminated: SymbolRef[] } {
  const ys = symbols.filter((s) => s.cell?.type === 'eliminator');
  const others = symbols.filter((s) => s.cell?.type !== 'eliminator');
  if (!ys.length) return { errors: checkSymbols(others, ctx), eliminated: [] };

  // Ogni Y annulla esattamente un altro simbolo. Due Y possono annullarsi a
  // vicenda. Un simbolo annullato deve essere davvero necessario: se
  // rimettendolo la regione resta valida, quella Y non aveva nulla da fare.
  const maxK = Math.min(ys.length, others.length);
  for (let k = maxK; k >= 0; k--) {
    if ((ys.length - k) % 2 !== 0) continue;
    for (const removed of combinations(others, k)) {
      const removedSet = new Set(removed);
      const kept = others.filter((s) => !removedSet.has(s));
      if (checkSymbols(kept, ctx).length) continue;
      const allNeeded = removed.every((r) => checkSymbols([...kept, r], ctx).length > 0);
      if (!allNeeded) continue;
      return { errors: [], eliminated: [...removed.map((r) => r.ref), ...ys.map((y) => y.ref)] };
    }
  }
  return { errors: [...ys.map((y) => y.ref), ...checkSymbols(others, ctx)], eliminated: [] };
}

export interface ValidateOptions {
  /** Passi massimi per ogni ricerca sui poliomini. */
  polyominoBudget?: number;
}

/**
 * Valida una soluzione. `paths` contiene un percorso, o due se il puzzle è
 * simmetrico (il secondo è il riflesso del primo).
 */
export function validate(puzzle: Puzzle, paths: Path[], opts: ValidateOptions = {}): ValidationResult {
  const messages = checkPathStructure(puzzle, paths);
  const usedPoints = new Set<string>();
  const usedEdges = new Set<string>();
  for (const path of paths) {
    path.forEach((c, i) => {
      usedPoints.add(pointKey(c.x, c.y));
      if (i > 0 && Math.abs(path[i - 1].x - c.x) + Math.abs(path[i - 1].y - c.y) === 1) {
        usedEdges.add(edgeRefKey(edgeBetween(path[i - 1], c)));
      }
    });
  }
  const regions = computeRegions(puzzle, usedEdges);
  const regionOf = new Map<string, number>();
  regions.forEach((cells, r) => cells.forEach((c) => regionOf.set(pointKey(c.x, c.y), r)));

  const perRegion: RegionSymbol[][] = regions.map(() => []);
  const globalErrors: SymbolRef[] = [];
  const addToRegionOf = (cells: Coord[], sym: RegionSymbol) => {
    const r = cells.length ? regionOf.get(pointKey(cells[0].x, cells[0].y)) : undefined;
    if (r === undefined) globalErrors.push(sym.ref);
    else perRegion[r].push(sym);
  };

  for (const cell of puzzle.cells) {
    const r = regionOf.get(pointKey(cell.x, cell.y));
    if (r !== undefined) perRegion[r].push({ ref: { kind: 'cell', x: cell.x, y: cell.y }, cell });
  }
  // Esagoni non toccati: appartengono alla regione che li circonda (un punto
  // o un lato non percorso non separa le celle vicine).
  for (const p of puzzle.points) {
    if (p.type !== 'hexagon' || usedPoints.has(pointKey(p.x, p.y))) continue;
    addToRegionOf(pointCells(puzzle, p), { ref: { kind: 'point', x: p.x, y: p.y }, unmetHexagon: true });
  }
  for (const e of puzzle.edges) {
    if (e.type !== 'hexagon' || usedEdges.has(edgeRefKey(e))) continue;
    const ref: EdgeRef = { x: e.x, y: e.y, dir: e.dir };
    addToRegionOf(edgeCells(puzzle, ref), { ref: { kind: 'edge', ...ref }, unmetHexagon: true });
  }

  const errors: SymbolRef[] = [...globalErrors];
  const eliminated: SymbolRef[] = [];
  let timedOut = false;
  regions.forEach((cells, r) => {
    if (!perRegion[r].length) return;
    const ctx: RegionContext = {
      puzzle,
      cells,
      usedEdges,
      polyBudget: opts.polyominoBudget ?? 200_000,
      timedOut: false,
      fitCache: new Map(),
    };
    const res = checkRegion(perRegion[r], ctx);
    errors.push(...res.errors);
    eliminated.push(...res.eliminated);
    timedOut ||= ctx.timedOut;
  });
  if (timedOut) messages.push('Verifica dei poliomini interrotta: troppe combinazioni.');

  return {
    valid: messages.length === 0 && errors.length === 0,
    errors,
    eliminated,
    regions,
    messages,
  };
}
