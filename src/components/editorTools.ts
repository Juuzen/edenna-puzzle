import {
  type CellSpec,
  type Color,
  type Coord,
  type Direction,
  type EdgeRef,
  type Puzzle,
  DIRECTIONS,
  canPlaceBridge,
  countBridges,
  endDirection,
  getCell,
  getEdge,
  getPoint,
  gridToShape,
  inCellBounds,
  inEdgeBounds,
  inPointBounds,
  indexPuzzle,
  setCell,
  setEdge,
  setPoint,
  validEndDirections,
} from '../engine';

export type ToolKind =
  | 'start'
  | 'end'
  | 'hexagon'
  | 'bridge'
  | 'gap'
  | 'missing'
  | 'square'
  | 'star'
  | 'polyomino'
  | 'eliminator'
  | 'triangle'
  | 'erase';

export interface ToolState {
  kind: ToolKind;
  color: Color;
  triangleCount: 1 | 2 | 3;
  /** Griglia 5x5 della forma del poliomino. */
  shape: boolean[][];
  rotatable: boolean;
  negative: boolean;
}

export const SHAPE_SIZE = 5;

export function emptyShape(): boolean[][] {
  return Array.from({ length: SHAPE_SIZE }, () => Array(SHAPE_SIZE).fill(false));
}

export function shapeFromRows(rows: string[]): boolean[][] {
  const g = emptyShape();
  rows.forEach((r, y) => [...r].forEach((ch, x) => y < SHAPE_SIZE && x < SHAPE_SIZE && (g[y][x] = ch === '#')));
  return g;
}

export const SHAPE_PRESETS: { name: string; rows: string[] }[] = [
  { name: 'Monomino', rows: ['#'] },
  { name: 'Domino', rows: ['##'] },
  { name: 'I3', rows: ['###'] },
  { name: 'L3', rows: ['#.', '##'] },
  { name: 'O', rows: ['##', '##'] },
  { name: 'I4', rows: ['####'] },
  { name: 'L4', rows: ['#.', '#.', '##'] },
  { name: 'T4', rows: ['###', '.#.'] },
  { name: 'S4', rows: ['.##', '##.'] },
  { name: 'Croce', rows: ['.#.', '###', '.#.'] },
];

export const DEFAULT_TOOL: ToolState = {
  kind: 'square',
  color: 'black',
  triangleCount: 1,
  shape: shapeFromRows(['#.', '#.', '##']),
  rotatable: false,
  negative: false,
};

export type Target =
  /** `dir`: direzione scelta per un'uscita (solo con lo strumento Uscita). */
  | { kind: 'point'; at: Coord; dir?: Direction }
  | { kind: 'edge'; at: EdgeRef }
  | { kind: 'cell'; at: Coord };

export const targetKey = (t: Target) =>
  t.kind === 'edge'
    ? `e${t.at.x},${t.at.y},${t.at.dir}`
    : `${t.kind[0]}${t.at.x},${t.at.y}${t.kind === 'point' && t.dir ? `,${t.dir}` : ''}`;

/** Sotto questa distanza (in celle) dal punto la direzione non segue il puntatore. */
const END_DIR_DEADZONE = 0.08;

/**
 * Direzione d'uscita da usare in `at` con il puntatore in `g`: fra quelle
 * valide, la più allineata allo scostamento del puntatore dal punto. Vicino
 * al centro resta quella attuale (o l'automatica).
 */
export function pickEndDirection(p: Puzzle, at: Coord, g: Coord): Direction | null {
  const idx = indexPuzzle(p);
  const valid = validEndDirections(idx, at);
  if (!valid.length) return null;
  const dx = g.x - at.x;
  const dy = g.y - at.y;
  if (Math.hypot(dx, dy) < END_DIR_DEADZONE) {
    const cur = getPoint(idx, at)?.type === 'end' ? endDirection(idx, at) : null;
    return cur && valid.includes(cur) ? cur : valid[0];
  }
  let best = valid[0];
  let bestDot = -Infinity;
  for (const d of valid) {
    const dot = DIRECTIONS[d].x * dx + DIRECTIONS[d].y * dy;
    if (dot > bestDot + 1e-9) {
      best = d;
      bestDot = dot;
    }
  }
  return best;
}

/** Direzione successiva (in senso orario) fra quelle valide per un'uscita. */
export function nextEndDirection(p: Puzzle, at: Coord, from: Direction | null, step: 1 | -1 = 1): Direction | null {
  const valid = validEndDirections(indexPuzzle(p), at);
  if (!valid.length) return null;
  const cw: Direction[] = ['up', 'right', 'down', 'left'];
  const sorted = cw.filter((d) => valid.includes(d));
  const i = from ? sorted.indexOf(from) : -1;
  if (i < 0) return sorted[0];
  return sorted[(i + step + sorted.length) % sorted.length];
}

type TargetKind = Target['kind'];

export function toolTargets(kind: ToolKind): TargetKind[] {
  switch (kind) {
    case 'start':
    case 'end':
    case 'bridge':
      return ['point'];
    case 'hexagon':
      return ['point', 'edge'];
    case 'gap':
    case 'missing':
      return ['edge'];
    case 'erase':
      return ['point', 'edge', 'cell'];
    default:
      return ['cell'];
  }
}

/**
 * Navigazione da tastiera: la board è un reticolo di (2w+1)×(2h+1) posizioni.
 * Coordinate pari/pari = incroci, dispari/dispari = celle, le altre = lati.
 */
export function latticeTarget(p: Puzzle, lx: number, ly: number, kinds: TargetKind[]): Target | null {
  if (!Number.isInteger(lx) || !Number.isInteger(ly) || lx < 0 || ly < 0 || lx > 2 * p.width || ly > 2 * p.height) return null;
  const evenX = lx % 2 === 0;
  const evenY = ly % 2 === 0;
  const t: Target =
    evenX && evenY
      ? { kind: 'point', at: { x: lx / 2, y: ly / 2 } }
      : !evenX && !evenY
        ? { kind: 'cell', at: { x: (lx - 1) / 2, y: (ly - 1) / 2 } }
        : !evenX
          ? { kind: 'edge', at: { x: (lx - 1) / 2, y: ly / 2, dir: 'h' } }
          : { kind: 'edge', at: { x: lx / 2, y: (ly - 1) / 2, dir: 'v' } };
  return kinds.includes(t.kind) ? t : null;
}

/** Prossima posizione utile nella direzione data (salta quelle che lo strumento non può usare). */
export function moveLattice(p: Puzzle, kinds: TargetKind[], from: Coord, dx: number, dy: number): Coord | null {
  let x = from.x + dx;
  let y = from.y + dy;
  while (x >= 0 && y >= 0 && x <= 2 * p.width && y <= 2 * p.height) {
    if (latticeTarget(p, x, y, kinds)) return { x, y };
    x += dx;
    y += dy;
  }
  return null;
}

/** Prima posizione utile, partendo dal centro della board. */
export function initialLattice(p: Puzzle, kinds: TargetKind[]): Coord | null {
  const cx = p.width;
  const cy = p.height;
  for (let r = 0; r <= Math.max(2 * p.width, 2 * p.height); r++) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) === r && latticeTarget(p, x, y, kinds)) return { x, y };
      }
    }
  }
  return null;
}

/** Quanti elementi (celle, lati, punti diversi da partenza e uscita) ha `p`. */
export function countItems(p: Puzzle): number {
  return p.cells.length + p.edges.length + p.points.filter((it) => it.type !== 'start' && it.type !== 'end').length;
}

/** Avviso se un ridimensionamento o un cambio di simmetria ha tolto elementi. */
export function itemLossNotice(before: Puzzle, after: Puzzle): string | null {
  const lost = countItems(before) - countItems(after);
  if (lost <= 0) return null;
  return `La modifica ha tolto ${lost} ${lost === 1 ? 'elemento' : 'elementi'}. Ctrl+Z ${lost === 1 ? 'lo ripristina' : 'li ripristina'}.`;
}

/** Trova cosa c'è sotto il puntatore, tra i tipi ammessi dallo strumento. */
export function hitTest(p: Puzzle, g: Coord, kinds: TargetKind[]): Target | null {
  const pt = { x: Math.round(g.x), y: Math.round(g.y) };
  const dPoint = Math.hypot(g.x - pt.x, g.y - pt.y);
  // Lato più vicino: orizzontale o verticale.
  const hEdge: EdgeRef = { x: Math.floor(g.x), y: Math.round(g.y), dir: 'h' };
  const vEdge: EdgeRef = { x: Math.round(g.x), y: Math.floor(g.y), dir: 'v' };
  const dh = Math.abs(g.y - hEdge.y);
  const dv = Math.abs(g.x - vEdge.x);
  const edge = dh <= dv ? hEdge : vEdge;
  const dEdge = Math.min(dh, dv);
  const cell = { x: Math.floor(g.x), y: Math.floor(g.y) };

  const okPoint = kinds.includes('point') && inPointBounds(p, pt);
  const okEdge = kinds.includes('edge') && inEdgeBounds(p, edge);
  const okCell = kinds.includes('cell') && inCellBounds(p, cell);

  if (kinds.length === 1) {
    if (okPoint && dPoint < 0.6) return { kind: 'point', at: pt };
    if (okEdge && dEdge < 0.45) return { kind: 'edge', at: edge };
    if (okCell) return { kind: 'cell', at: cell };
    return null;
  }
  if (okPoint && dPoint < 0.24) return { kind: 'point', at: pt };
  if (okEdge && dEdge < (kinds.includes('cell') ? 0.16 : 0.45)) return { kind: 'edge', at: edge };
  if (okCell) return { kind: 'cell', at: cell };
  if (okPoint && dPoint < 0.5) return { kind: 'point', at: pt };
  return null;
}

/** L'elemento di cella che lo strumento piazzerebbe. */
export function toolCellItem(tool: ToolState): CellSpec | null {
  switch (tool.kind) {
    case 'square':
    case 'star':
      return { type: tool.kind, color: tool.color };
    case 'eliminator':
      return tool.color === 'white' ? { type: 'eliminator' } : { type: 'eliminator', color: tool.color };
    case 'triangle':
      return tool.color === 'orange'
        ? { type: 'triangle', count: tool.triangleCount }
        : { type: 'triangle', count: tool.triangleCount, color: tool.color };
    case 'polyomino': {
      const shape = gridToShape(tool.shape);
      if (!shape.length) return null;
      const item: CellSpec = { type: 'polyomino', shape };
      if (tool.rotatable) item.rotatable = true;
      if (tool.negative) item.negative = true;
      return item;
    }
    default:
      return null;
  }
}

const sameJSON = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** True se nel bersaglio c'è già esattamente ciò che lo strumento metterebbe. */
export function isAlreadyThere(p: Puzzle, tool: ToolState, t: Target): boolean {
  const idx = indexPuzzle(p);
  if (t.kind === 'point') {
    const cur = getPoint(idx, t.at);
    if (!cur) return false;
    if (tool.kind === 'erase') return true;
    // Un'uscita con un'altra direzione non è "già lì": il clic la cambia.
    if (tool.kind === 'end' && cur.type === 'end' && t.dir) return endDirection(idx, t.at) === t.dir;
    return tool.kind === cur.type;
  }
  if (t.kind === 'edge') {
    const cur = getEdge(idx, t.at);
    return !!cur && (tool.kind === cur.type || tool.kind === 'erase');
  }
  const cur = getCell(idx, t.at);
  if (!cur) return false;
  if (tool.kind === 'erase') return true;
  const want = toolCellItem(tool);
  const { x: _x, y: _y, ...rest } = cur;
  return sameJSON(canonicalItem(rest), canonicalItem(want));
}

function canonicalItem(o: unknown) {
  if (!o || typeof o !== 'object') return o;
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
}

export interface ApplyResult {
  puzzle: Puzzle;
  /** Messaggio per l'utente quando l'azione non è possibile. */
  notice?: string;
  /** Ponti spariti come effetto collaterale (es. lato interrotto accanto). */
  removedBridges?: number;
}

/** Perché lo strumento Ponte non si può usare in `at`, o null se si può. */
export function bridgeProblem(p: Puzzle, at: Coord): string | null {
  if (canPlaceBridge(p, at)) return null;
  if (p.symmetry !== 'none') return 'Ponte non disponibile nei puzzle simmetrici.';
  return 'Il ponte va su un incrocio interno con 4 lati percorribili.';
}

/** Avviso se passando da `before` ad `after` sono spariti dei ponti. */
export function bridgeLossNotice(before: Puzzle, after: Puzzle): string | null {
  const n = countBridges(before) - countBridges(after);
  if (n <= 0) return null;
  return n === 1 ? 'Rimosso 1 ponte non più valido.' : `Rimossi ${n} ponti non più validi.`;
}

/**
 * Applica lo strumento al bersaglio. `mode` indica se si sta aggiungendo o
 * togliendo (deciso al primo clic di un trascinamento).
 */
export function applyTool(p: Puzzle, tool: ToolState, t: Target, mode: 'add' | 'remove'): ApplyResult {
  if (mode === 'remove' || tool.kind === 'erase') {
    if (t.kind === 'point') return { puzzle: setPoint(p, t.at, null) };
    if (t.kind === 'edge') return { puzzle: setEdge(p, t.at, null) };
    return { puzzle: setCell(p, t.at, null) };
  }
  if (t.kind === 'point') {
    if (tool.kind === 'end') {
      const valid = validEndDirections(indexPuzzle(p), t.at);
      if (!valid.length) {
        return { puzzle: p, notice: 'Le uscite vanno sul bordo o accanto a un lato assente.' };
      }
      const dir = t.dir && valid.includes(t.dir) ? t.dir : valid[0];
      // `dir` si salva solo se serve: se coincide con quella automatica il
      // JSON resta pulito. In simmetria serve sempre, perché la gemella
      // riceva la direzione riflessa.
      const explicit = dir !== valid[0] || p.symmetry !== 'none';
      return { puzzle: setPoint(p, t.at, explicit ? { type: 'end', dir } : { type: 'end' }) };
    }
    if (tool.kind === 'bridge') {
      const problem = bridgeProblem(p, t.at);
      if (problem) return { puzzle: p, notice: problem };
    }
    if (tool.kind === 'start' || tool.kind === 'hexagon' || tool.kind === 'bridge') {
      return { puzzle: setPoint(p, t.at, { type: tool.kind }) };
    }
    return { puzzle: p };
  }
  if (t.kind === 'edge') {
    if (tool.kind === 'gap' || tool.kind === 'missing' || tool.kind === 'hexagon') {
      const next = setEdge(p, t.at, tool.kind);
      const removed = countBridges(p) - countBridges(next);
      return removed > 0 ? { puzzle: next, removedBridges: removed } : { puzzle: next };
    }
    return { puzzle: p };
  }
  const item = toolCellItem(tool);
  if (!item) return { puzzle: p, notice: 'Disegna prima la forma del poliomino.' };
  return { puzzle: setCell(p, t.at, item) };
}

// ---------------------------------------------------------------------------
// Sincronizzazione con il valore controllato

/**
 * Se l'editor deve ricaricare `value` (scartando la cronologia).
 * - stesso oggetto del puzzle mostrato → no;
 * - id diverso → è un altro puzzle → sì;
 * - stesso id ma oggetto diverso: sì, a meno che sia l'eco dell'ultima
 *   modifica emessa dall'editor (`lastEmitted`).
 */
export function shouldReset(value: Puzzle | undefined, present: Puzzle, lastEmitted: Puzzle | null): boolean {
  if (!value || value === present) return false;
  if (value.id !== present.id) return true;
  return value !== lastEmitted;
}

/** `p` con l'id `id` (o senza, se `id` è assente): l'identità di un puzzle non cambia modificandolo. */
export function keepId(p: Puzzle, id: string | undefined): Puzzle {
  if (p.id === id) return p;
  const next = { ...p };
  if (id === undefined) delete next.id;
  else next.id = id;
  return next;
}
