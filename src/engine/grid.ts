import {
  type CellItem,
  type CellSpec,
  type PointSpec,
  type Coord,
  type Direction,
  type EdgeItem,
  type EdgeOrientation,
  type PointItem,
  type Puzzle,
  type Symmetry,
  DIRECTIONS,
  FORMAT_ID,
  FORMAT_VERSION,
} from './types';

// ---------------------------------------------------------------------------
// Chiavi

export const pointKey = (x: number, y: number) => `${x},${y}`;
export const cellKey = (x: number, y: number) => `${x},${y}`;
export const edgeKey = (x: number, y: number, dir: EdgeOrientation) => `${x},${y},${dir}`;

export interface EdgeRef {
  x: number;
  y: number;
  dir: EdgeOrientation;
}

/** Lato che collega due punti adiacenti. */
export function edgeBetween(a: Coord, b: Coord): EdgeRef {
  if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1) {
    throw new Error(`Punti non adiacenti: ${a.x},${a.y} → ${b.x},${b.y}`);
  }
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), dir: a.y === b.y ? 'h' : 'v' };
}

export const edgeRefKey = (e: EdgeRef) => edgeKey(e.x, e.y, e.dir);

/** I due estremi di un lato. */
export function edgeEnds(e: EdgeRef): [Coord, Coord] {
  return e.dir === 'h'
    ? [{ x: e.x, y: e.y }, { x: e.x + 1, y: e.y }]
    : [{ x: e.x, y: e.y }, { x: e.x, y: e.y + 1 }];
}

/** Le celle (0, 1 o 2) che confinano con un lato. */
export function edgeCells(p: { width: number; height: number }, e: EdgeRef): Coord[] {
  const out: Coord[] =
    e.dir === 'h'
      ? [
          { x: e.x, y: e.y - 1 },
          { x: e.x, y: e.y },
        ]
      : [
          { x: e.x - 1, y: e.y },
          { x: e.x, y: e.y },
        ];
  return out.filter((c) => inCellBounds(p, c));
}

/** Le celle (1–4) che toccano un punto. */
export function pointCells(p: { width: number; height: number }, c: Coord): Coord[] {
  return [
    { x: c.x - 1, y: c.y - 1 },
    { x: c.x, y: c.y - 1 },
    { x: c.x - 1, y: c.y },
    { x: c.x, y: c.y },
  ].filter((cc) => inCellBounds(p, cc));
}

export function inPointBounds(p: { width: number; height: number }, c: Coord) {
  return c.x >= 0 && c.y >= 0 && c.x <= p.width && c.y <= p.height;
}
export function inCellBounds(p: { width: number; height: number }, c: Coord) {
  return c.x >= 0 && c.y >= 0 && c.x < p.width && c.y < p.height;
}
export function inEdgeBounds(p: { width: number; height: number }, e: EdgeRef) {
  if (e.x < 0 || e.y < 0) return false;
  return e.dir === 'h' ? e.x < p.width && e.y <= p.height : e.x <= p.width && e.y < p.height;
}

// ---------------------------------------------------------------------------
// Indice per lookup veloci

export interface PuzzleIndex {
  puzzle: Puzzle;
  points: Map<string, PointItem>;
  edges: Map<string, EdgeItem>;
  cells: Map<string, CellItem>;
}

const indexCache = new WeakMap<Puzzle, PuzzleIndex>();

export function indexPuzzle(puzzle: Puzzle): PuzzleIndex {
  const cached = indexCache.get(puzzle);
  if (cached) return cached;
  const idx: PuzzleIndex = {
    puzzle,
    points: new Map(puzzle.points.map((it) => [pointKey(it.x, it.y), it])),
    edges: new Map(puzzle.edges.map((it) => [edgeKey(it.x, it.y, it.dir), it])),
    cells: new Map(puzzle.cells.map((it) => [cellKey(it.x, it.y), it])),
  };
  indexCache.set(puzzle, idx);
  return idx;
}

export function getPoint(idx: PuzzleIndex, c: Coord) {
  return idx.points.get(pointKey(c.x, c.y));
}
export function getEdge(idx: PuzzleIndex, e: EdgeRef) {
  return idx.edges.get(edgeRefKey(e));
}
export function getCell(idx: PuzzleIndex, c: Coord) {
  return idx.cells.get(cellKey(c.x, c.y));
}

/** Un lato esiste nella griglia e si può percorrere per intero. */
export function isEdgeTraversable(idx: PuzzleIndex, e: EdgeRef) {
  if (!inEdgeBounds(idx.puzzle, e)) return false;
  const item = getEdge(idx, e);
  return !item || item.type === 'hexagon';
}

/** Lato esistente ma interrotto: si può entrare solo per un tratto. */
export function isEdgeGap(idx: PuzzleIndex, e: EdgeRef) {
  return inEdgeBounds(idx.puzzle, e) && getEdge(idx, e)?.type === 'gap';
}

/** Un lato che non c'è (fuori griglia o marcato `missing`). */
function isEdgeAbsent(idx: PuzzleIndex, e: EdgeRef) {
  return !inEdgeBounds(idx.puzzle, e) || getEdge(idx, e)?.type === 'missing';
}

export function neighbor(c: Coord, d: Direction): Coord {
  const v = DIRECTIONS[d];
  return { x: c.x + v.x, y: c.y + v.y };
}

/**
 * Direzione verso cui sporge l'uscita in un punto, o null se il punto non
 * può ospitare un'uscita (serve un lato assente accanto). Stesso ordine di
 * ricerca di windmill-client: sinistra, destra, su, giù.
 */
export function autoEndDirection(idx: PuzzleIndex, c: Coord): Direction | null {
  const order: Direction[] = ['left', 'right', 'up', 'down'];
  for (const d of order) {
    const n = neighbor(c, d);
    if (!inPointBounds(idx.puzzle, n) || isEdgeAbsent(idx, edgeBetween(c, n))) return d;
  }
  return null;
}

export function endDirection(idx: PuzzleIndex, c: Coord): Direction | null {
  const item = getPoint(idx, c);
  if (item?.type === 'end' && item.dir) {
    const n = neighbor(c, item.dir);
    if (!inPointBounds(idx.puzzle, n) || isEdgeAbsent(idx, edgeBetween(c, n))) return item.dir;
  }
  return autoEndDirection(idx, c);
}

// ---------------------------------------------------------------------------
// Simmetria

export function reflectPoint(sym: Symmetry, w: number, h: number, c: Coord): Coord {
  switch (sym) {
    case 'horizontal':
      return { x: w - c.x, y: c.y };
    case 'vertical':
      return { x: c.x, y: h - c.y };
    case 'rotational':
      return { x: w - c.x, y: h - c.y };
    default:
      return { ...c };
  }
}

export function reflectDirection(sym: Symmetry, d: Direction): Direction {
  const flipX = sym === 'horizontal' || sym === 'rotational';
  const flipY = sym === 'vertical' || sym === 'rotational';
  if (flipX && (d === 'left' || d === 'right')) return d === 'left' ? 'right' : 'left';
  if (flipY && (d === 'up' || d === 'down')) return d === 'up' ? 'down' : 'up';
  return d;
}

export function directionBetween(a: Coord, b: Coord): Direction {
  if (b.x > a.x) return 'right';
  if (b.x < a.x) return 'left';
  if (b.y > a.y) return 'down';
  return 'up';
}

// ---------------------------------------------------------------------------
// Creazione e modifica (immutabili)

export function createPuzzle(width = 4, height = 4): Puzzle {
  return {
    format: FORMAT_ID,
    version: FORMAT_VERSION,
    width,
    height,
    symmetry: 'none',
    points: [
      { x: 0, y: height, type: 'start' },
      { x: width, y: 0, type: 'end' },
    ],
    edges: [],
    cells: [],
  };
}

const samePos = (a: Coord, b: Coord) => a.x === b.x && a.y === b.y;

/** Sostituisce (o rimuove, se `item` è null) il simbolo su un punto. */
export function setPoint(p: Puzzle, at: Coord, item: PointSpec | null): Puzzle {
  let points = p.points.filter((it) => !samePos(it, at));
  if (item) points.push({ ...item, x: at.x, y: at.y } as PointItem);
  // In un puzzle simmetrico partenze e uscite vanno sempre in coppia.
  if (p.symmetry !== 'none') {
    const mirror = reflectPoint(p.symmetry, p.width, p.height, at);
    const prev = p.points.find((it) => samePos(it, at));
    const isSE = (t?: string) => t === 'start' || t === 'end';
    if (!samePos(mirror, at) && (isSE(item?.type) || isSE(prev?.type))) {
      points = points.filter((it) => !samePos(it, mirror));
      if (item && isSE(item.type)) {
        const m: PointItem =
          item.type === 'end' && 'dir' in item && item.dir
            ? { type: 'end', dir: reflectDirection(p.symmetry, item.dir), ...mirror }
            : ({ type: item.type, ...mirror } as PointItem);
        points.push(m);
      }
    }
  }
  return sanitize({ ...p, points });
}

export function setEdge(p: Puzzle, e: EdgeRef, type: EdgeItem['type'] | null): Puzzle {
  const edges = p.edges.filter((it) => !(it.x === e.x && it.y === e.y && it.dir === e.dir));
  if (type) edges.push({ x: e.x, y: e.y, dir: e.dir, type });
  return sanitize({ ...p, edges });
}

export function setCell(p: Puzzle, at: Coord, item: CellSpec | null): Puzzle {
  const cells = p.cells.filter((it) => !samePos(it, at));
  if (item) cells.push({ ...item, x: at.x, y: at.y } as CellItem);
  return { ...p, cells };
}

export function setSymmetry(p: Puzzle, symmetry: Symmetry): Puzzle {
  return ensureEndpoints(sanitize({ ...p, symmetry }));
}

/**
 * Garantisce almeno una partenza e un'uscita (dopo un cambio di simmetria
 * possono sparire per conflitto). L'uscita viene cercata lungo il bordo in un
 * punto libero il cui riflesso sia anch'esso libero.
 */
export function ensureEndpoints(p: Puzzle): Puzzle {
  let out = p;
  const has = (t: string) => out.points.some((it) => it.type === t);
  const free = (c: Coord) => !out.points.some((it) => samePos(it, c));
  const candidates: Coord[] = [];
  for (let x = p.width; x >= 0; x--) candidates.push({ x, y: 0 });
  for (let y = 0; y <= p.height; y++) candidates.push({ x: p.width, y }, { x: 0, y });
  for (let x = 0; x <= p.width; x++) candidates.push({ x, y: p.height });
  const pick = () =>
    candidates.find((c) => {
      if (!free(c)) return false;
      if (out.symmetry === 'none') return true;
      const m = reflectPoint(out.symmetry, out.width, out.height, c);
      return !samePos(m, c) && free(m);
    });
  if (!has('start')) {
    const c = free({ x: 0, y: p.height }) ? { x: 0, y: p.height } : pick();
    if (c) out = setPoint(out, c, { type: 'start' });
  }
  if (!has('end')) {
    const c = pick();
    if (c) out = setPoint(out, c, { type: 'end' });
  }
  return out;
}

/**
 * Rende coerente il puzzle con la sua simmetria (come `Grid.sanitize` in
 * windmill-client): ogni partenza/uscita ha la sua gemella speculare, e un
 * punto che coincide con il proprio riflesso non può esserlo.
 * Rimuove anche le direzioni d'uscita non più valide.
 */
export function sanitize(p: Puzzle): Puzzle {
  let points = p.points.filter((it) => inPointBounds(p, it));
  if (p.symmetry !== 'none') {
    const byKey = new Map(points.map((it) => [pointKey(it.x, it.y), it]));
    // Prima le partenze, poi le uscite: se il riflesso di un'uscita è una
    // partenza, vince la partenza.
    for (const kind of ['start', 'end'] as const) {
      for (const it of [...byKey.values()]) {
        if (it.type !== kind || byKey.get(pointKey(it.x, it.y)) !== it) continue;
        const m = reflectPoint(p.symmetry, p.width, p.height, it);
        const mk = pointKey(m.x, m.y);
        if (samePos(m, it)) {
          byKey.delete(pointKey(it.x, it.y));
          continue;
        }
        const other = byKey.get(mk);
        if (other?.type === kind) continue;
        if (kind === 'end' && other?.type === 'start') {
          byKey.delete(pointKey(it.x, it.y));
          continue;
        }
        byKey.set(
          mk,
          it.type === 'end' && it.dir
            ? { type: 'end', dir: reflectDirection(p.symmetry, it.dir), ...m }
            : ({ type: it.type, ...m } as PointItem),
        );
      }
    }
    points = [...byKey.values()];
  }
  const out = { ...p, points, edges: p.edges.filter((e) => inEdgeBounds(p, e)) };
  out.cells = p.cells.filter((c) => inCellBounds(p, c));
  // Toglie una `dir` esplicita che non punta più verso un lato assente.
  const idx = indexPuzzle(out);
  out.points = out.points.map((it) => {
    if (it.type === 'end' && it.dir && endDirection(idx, it) !== it.dir) {
      const { dir: _drop, ...rest } = it;
      return rest;
    }
    return it;
  });
  return out;
}

/**
 * Cambia le dimensioni mantenendo tutto ciò che ci sta ancora. Se partenza
 * e uscita erano nella posizione di default, le riposiziona (come l'originale).
 */
export function resizePuzzle(p: Puzzle, width: number, height: number): Puzzle {
  const startDefault = p.points.some((it) => it.type === 'start' && it.x === 0 && it.y === p.height);
  const endDefault = p.points.some((it) => it.type === 'end' && it.x === p.width && it.y === 0);
  let points = p.points.filter(
    (it) =>
      !(startDefault && it.type === 'start' && it.x === 0 && it.y === p.height) &&
      !(endDefault && it.type === 'end' && it.x === p.width && it.y === 0),
  );
  let next: Puzzle = { ...p, width, height, points };
  next = { ...next, points: next.points.filter((it) => inPointBounds(next, it)) };
  points = next.points;
  if (startDefault || !points.some((it) => it.type === 'start')) {
    points = points.filter((it) => !(it.x === 0 && it.y === height));
    points.push({ x: 0, y: height, type: 'start' });
  }
  if (endDefault || !points.some((it) => it.type === 'end')) {
    points = points.filter((it) => !(it.x === width && it.y === 0));
    points.push({ x: width, y: 0, type: 'end' });
  }
  return sanitize({ ...next, points });
}

/** Righe `#`/`.` → matrice booleana. */
export function shapeToGrid(rows: string[]): boolean[][] {
  const w = Math.max(0, ...rows.map((r) => r.length));
  return rows.map((r) => Array.from({ length: w }, (_, i) => r[i] === '#' || r[i] === 'X' || r[i] === 'x'));
}

/** Matrice booleana → righe `#`/`.` ritagliate al minimo rettangolo. */
export function gridToShape(grid: boolean[][]): string[] {
  const ys = grid.map((r, y) => (r.some(Boolean) ? y : -1)).filter((y) => y >= 0);
  if (!ys.length) return [];
  const xs: number[] = [];
  grid.forEach((r) => r.forEach((v, x) => v && xs.push(x)));
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const out: string[] = [];
  for (let y = y0; y <= y1; y++) {
    let s = '';
    for (let x = x0; x <= x1; x++) s += grid[y]?.[x] ? '#' : '.';
    out.push(s);
  }
  return out;
}
