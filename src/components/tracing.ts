import {
  DIRECTIONS,
  type Coord,
  type Direction,
  type Path,
  type PuzzleIndex,
  directionBetween,
  edgeBetween,
  endDirection,
  getPoint,
  inPointBounds,
  isEdgeGap,
  isEdgeTraversable,
  neighbor,
  pointKey,
  reflectDirection,
  reflectPoint,
} from '../engine';

/**
 * Stato del "serpente" mentre il giocatore traccia: i punti già raggiunti e
 * un tratto parziale (`dir`, `t` in [0,1]) oltre l'ultimo punto.
 * Tutte le distanze sono in unità di cella.
 */
export interface TraceState {
  path: Path;
  dir: Direction | null;
  t: number;
}

/** Lunghezza dell'uscita (come END_LENGTH/GRID_UNIT dell'originale). */
export const EXIT_LENGTH = 0.2;
/** Quanto si può entrare in un lato interrotto. */
const GAP_REACH = 0.3;
/** Quanto ci si può avvicinare a un punto già occupato. */
const COLLIDE_REACH = 0.75;
/** Margine quando i due serpenti simmetrici si vengono incontro. */
const MEET_REACH = 0.4;

export function startTrace(at: Coord): TraceState {
  return { path: [{ ...at }], dir: null, t: 0 };
}

export const traceHead = (s: TraceState) => s.path[s.path.length - 1];

export function mirrorTrace(idx: PuzzleIndex, s: TraceState): TraceState | null {
  const { symmetry, width, height } = idx.puzzle;
  if (symmetry === 'none') return null;
  return {
    path: s.path.map((c) => reflectPoint(symmetry, width, height, c)),
    dir: s.dir ? reflectDirection(symmetry, s.dir) : null,
    t: s.t,
  };
}

/** Il serpente è uscito dall'uscita: si può convalidare. */
export function isTraceComplete(idx: PuzzleIndex, s: TraceState) {
  const head = traceHead(s);
  if (!s.dir || s.t < EXIT_LENGTH - 0.02) return false;
  if (getPoint(idx, head)?.type !== 'end') return false;
  return endDirection(idx, head) === s.dir;
}

/** Percorsi completi da passare a `validate` (1 o 2). */
export function tracePaths(idx: PuzzleIndex, s: TraceState): Path[] {
  const m = mirrorTrace(idx, s);
  return m ? [s.path, m.path] : [s.path];
}

/** Massimo avanzamento consentito da `from` verso `dir`. */
function reach(idx: PuzzleIndex, s: TraceState, from: Coord, dir: Direction): number {
  const sym = idx.puzzle.symmetry;
  const occupied = new Set(s.path.map((c) => pointKey(c.x, c.y)));
  const mirror = (c: Coord) => reflectPoint(sym, idx.puzzle.width, idx.puzzle.height, c);
  if (sym !== 'none') s.path.forEach((c) => occupied.add(pointKey(mirror(c).x, mirror(c).y)));

  const single = (f: Coord, d: Direction): number => {
    if (getPoint(idx, f)?.type === 'end' && endDirection(idx, f) === d) return EXIT_LENGTH;
    const n = neighbor(f, d);
    if (!inPointBounds(idx.puzzle, n)) return 0;
    const e = edgeBetween(f, n);
    if (isEdgeGap(idx, e)) return GAP_REACH;
    if (!isEdgeTraversable(idx, e)) return 0;
    if (occupied.has(pointKey(n.x, n.y))) return COLLIDE_REACH;
    return 1;
  };

  let r = single(from, dir);
  if (sym !== 'none' && r > 0) {
    const mf = mirror(from);
    const md = reflectDirection(sym, dir);
    r = Math.min(r, single(mf, md));
    const n = neighbor(from, dir);
    const mn = neighbor(mf, md);
    // Le due teste si incontrano su un punto o a metà dello stesso lato.
    if (n.x === mn.x && n.y === mn.y) r = Math.min(r, 1 - MEET_REACH);
    if (mn.x === from.x && mn.y === from.y && mf.x === n.x && mf.y === n.y) r = Math.min(r, MEET_REACH);
  }
  return r;
}

const dot = (a: Coord, b: Coord) => a.x * b.x + a.y * b.y;

/**
 * Fa avanzare il serpente verso `target` (posizione del puntatore in unità
 * di cella). Si muove solo lungo la griglia, torna indietro se il puntatore
 * ripercorre il tratto precedente e "aggancia" gli angoli per rendere
 * naturali le curve.
 */
export function moveTrace(idx: PuzzleIndex, state: TraceState, target: Coord): TraceState {
  let s: TraceState = { path: [...state.path], dir: state.dir, t: state.t };
  for (let guard = 0; guard < 64; guard++) {
    const v = traceHead(s);
    const rel = { x: target.x - v.x, y: target.y - v.y };
    if (!s.dir) {
      const prev = s.path.length >= 2 ? directionBetween(v, s.path[s.path.length - 2]) : null;
      const cands = (Object.keys(DIRECTIONS) as Direction[])
        .map((d) => ({ d, p: dot(rel, DIRECTIONS[d]) }))
        .filter((c) => c.p > 0.02)
        .sort((a, b) => b.p - a.p);
      let moved = false;
      for (const { d } of cands) {
        if (d === prev) {
          const popped = s.path.pop()!;
          s = { path: s.path, dir: directionBetween(traceHead(s), popped), t: 1 };
          moved = true;
          break;
        }
        if (reach(idx, s, v, d) > 0) {
          s = { ...s, dir: d, t: 0 };
          moved = true;
          break;
        }
      }
      if (!moved) break;
      continue;
    }
    const d = DIRECTIONS[s.dir];
    const proj = dot(rel, d);
    const perp = Math.abs(rel.x * d.y - rel.y * d.x);
    const max = reach(idx, s, v, s.dir);
    let t = Math.max(0, Math.min(proj, max));
    // Aggancio agli angoli: se il puntatore è molto di lato, completa o
    // annulla il tratto per poter svoltare.
    if (perp > 0.3 && max >= 1) t = t > 0.5 ? 1 : t < 0.5 ? 0 : t;
    if (t >= 1 && max >= 1) {
      s = { path: [...s.path, neighbor(v, s.dir)], dir: null, t: 0 };
      continue;
    }
    if (t <= 0) {
      // Tornati al vertice: al giro successivo si sceglie una nuova
      // direzione (quella attuale ha proiezione <= 0 e non verrà ripresa).
      s = { ...s, dir: null, t: 0 };
      continue;
    }
    s = { ...s, t };
    break;
  }
  return s;
}

/**
 * Movimento da tastiera: un passo intero lungo `dir` (o indietro). All'uscita
 * il passo porta direttamente in fondo allo sbocco.
 */
export function stepTrace(idx: PuzzleIndex, state: TraceState, dir: Direction): TraceState {
  const s: TraceState = { path: [...state.path], dir: state.dir, t: state.t };
  const v = traceHead(s);
  // Se si è a metà di un tratto, prima si torna al vertice.
  if (s.dir) {
    if (s.dir === dir) {
      const r = reach(idx, { ...s, dir: null, t: 0 }, v, dir);
      return r >= 1 ? { path: [...s.path, neighbor(v, dir)], dir: null, t: 0 } : { ...s, t: r };
    }
    return { ...s, dir: null, t: 0 };
  }
  const prev = s.path.length >= 2 ? directionBetween(v, s.path[s.path.length - 2]) : null;
  if (dir === prev) return { path: s.path.slice(0, -1), dir: null, t: 0 };
  const r = reach(idx, s, v, dir);
  if (r >= 1) return { path: [...s.path, neighbor(v, dir)], dir: null, t: 0 };
  if (r > 0) return { ...s, dir, t: r };
  return s;
}

/** Punto della testa (con il tratto parziale), in unità di cella. */
export function headPosition(s: TraceState): Coord {
  const v = traceHead(s);
  if (!s.dir) return v;
  const d = DIRECTIONS[s.dir];
  return { x: v.x + d.x * s.t, y: v.y + d.y * s.t };
}
