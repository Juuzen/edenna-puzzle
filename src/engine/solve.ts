import {
  edgeBetween,
  getPoint,
  indexPuzzle,
  isEdgeTraversable,
  pointKey,
  reflectPoint,
} from './grid';
import type { Coord, Path, Puzzle } from './types';
import { validate } from './validate';

export interface SolveOptions {
  /** Ferma la ricerca dopo questo numero di soluzioni. */
  maxSolutions?: number;
  /** Tempo massimo in millisecondi. */
  timeLimitMs?: number;
}

export interface SolveResult {
  /** Ogni soluzione è una lista di percorsi (2 se il puzzle è simmetrico). */
  solutions: Path[][];
  /** True se la ricerca ha esplorato tutto lo spazio. */
  exhaustive: boolean;
  /** Percorsi completi controllati. */
  checked: number;
  elapsedMs: number;
}

/**
 * Solver a forza bruta (DFS su tutti i percorsi semplici partenza → uscita).
 * Pensato per l'editor, per controllare che un puzzle abbia soluzione e
 * quante ne abbia; va bene fino a griglie di circa 6x6.
 */
export function solve(puzzle: Puzzle, opts: SolveOptions = {}): SolveResult {
  const maxSolutions = opts.maxSolutions ?? 1;
  const deadline = Date.now() + (opts.timeLimitMs ?? 3000);
  const t0 = Date.now();
  const idx = indexPuzzle(puzzle);
  const sym = puzzle.symmetry;
  const mirror = (c: Coord) => reflectPoint(sym, puzzle.width, puzzle.height, c);
  const solutions: Path[][] = [];
  let checked = 0;
  let aborted = false;
  let steps = 0;

  const visited = new Set<string>();
  const path: Coord[] = [];
  const mpath: Coord[] = [];

  const isEnd = (c: Coord) => getPoint(idx, c)?.type === 'end';

  const dfs = (cur: Coord) => {
    if (aborted) return;
    if ((++steps & 1023) === 0 && Date.now() > deadline) {
      aborted = true;
      return;
    }
    if (isEnd(cur) && (sym === 'none' || isEnd(mirror(cur)))) {
      const paths = sym === 'none' ? [[...path]] : [[...path], [...mpath]];
      checked++;
      if (validate(puzzle, paths).valid) {
        solutions.push(paths);
        if (solutions.length >= maxSolutions) {
          aborted = true;
          return;
        }
      }
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next = { x: cur.x + dx, y: cur.y + dy };
      const nk = pointKey(next.x, next.y);
      if (visited.has(nk)) continue;
      if (next.x < 0 || next.y < 0 || next.x > puzzle.width || next.y > puzzle.height) continue;
      if (!isEdgeTraversable(idx, edgeBetween(cur, next))) continue;
      let mk = '';
      let mnext: Coord | null = null;
      if (sym !== 'none') {
        const mcur = mpath[mpath.length - 1];
        mnext = mirror(next);
        mk = pointKey(mnext.x, mnext.y);
        if (mk === nk || visited.has(mk)) continue;
        if (!isEdgeTraversable(idx, edgeBetween(mcur, mnext))) continue;
      }
      visited.add(nk);
      path.push(next);
      if (mnext) {
        visited.add(mk);
        mpath.push(mnext);
      }
      dfs(next);
      path.pop();
      visited.delete(nk);
      if (mnext) {
        mpath.pop();
        visited.delete(mk);
      }
      if (aborted) return;
    }
  };

  const starts = puzzle.points.filter((p) => p.type === 'start');
  const doneStarts = new Set<string>();
  for (const s of starts) {
    if (aborted) break;
    const sk = pointKey(s.x, s.y);
    if (doneStarts.has(sk)) continue;
    doneStarts.add(sk);
    visited.clear();
    path.length = 0;
    mpath.length = 0;
    visited.add(sk);
    path.push({ x: s.x, y: s.y });
    if (sym !== 'none') {
      const m = mirror(s);
      if (getPoint(idx, m)?.type !== 'start') continue;
      // Per simmetria (s, m) e (m, s) danno le stesse soluzioni: basta una.
      doneStarts.add(pointKey(m.x, m.y));
      visited.add(pointKey(m.x, m.y));
      mpath.push(m);
    }
    dfs(path[0]);
  }

  return {
    solutions,
    exhaustive: !aborted,
    checked,
    elapsedMs: Date.now() - t0,
  };
}
