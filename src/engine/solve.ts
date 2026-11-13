import {
  edgeBetween,
  edgeRefKey,
  getPoint,
  indexPuzzle,
  isEdgeTraversable,
  maxPasses,
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

  // Passaggi per punto (fino a 2 sui ponti) e lati già percorsi.
  const passes = new Map<string, number>();
  const usedEdges = new Set<string>();
  const full = (c: Coord, k: string) => (passes.get(k) ?? 0) >= maxPasses(idx, c);
  const enter = (k: string) => passes.set(k, (passes.get(k) ?? 0) + 1);
  const leave = (k: string) => passes.set(k, passes.get(k)! - 1);
  const path: Coord[] = [];
  const mpath: Coord[] = [];

  const isEnd = (c: Coord) => getPoint(idx, c)?.type === 'end';

  // Con un ponte attraversato due volte, l'anello fra i due passaggi si può
  // percorrere nei due versi: stessi lati, stesso disegno finale. Le due
  // varianti contano come una sola soluzione.
  const seenEdgeSets = new Set<string>();
  const isNewSolution = (paths: Path[]) => {
    const keys: string[] = [];
    for (const p of paths) for (let i = 1; i < p.length; i++) keys.push(edgeRefKey(edgeBetween(p[i - 1], p[i])));
    const k = `${pointKey(paths[0][0].x, paths[0][0].y)}|${keys.sort().join(';')}`;
    if (seenEdgeSets.has(k)) return false;
    seenEdgeSets.add(k);
    return true;
  };

  const dfs = (cur: Coord) => {
    if (aborted) return;
    if ((++steps & 1023) === 0 && Date.now() > deadline) {
      aborted = true;
      return;
    }
    if (isEnd(cur) && (sym === 'none' || isEnd(mirror(cur)))) {
      const paths = sym === 'none' ? [[...path]] : [[...path], [...mpath]];
      checked++;
      if (validate(puzzle, paths).valid && isNewSolution(paths)) {
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
      if (next.x < 0 || next.y < 0 || next.x > puzzle.width || next.y > puzzle.height) continue;
      if (full(next, nk)) continue;
      const edge = edgeBetween(cur, next);
      const ek = edgeRefKey(edge);
      if (usedEdges.has(ek) || !isEdgeTraversable(idx, edge)) continue;
      let mk = '';
      let mnext: Coord | null = null;
      if (sym !== 'none') {
        const mcur = mpath[mpath.length - 1];
        mnext = mirror(next);
        mk = pointKey(mnext.x, mnext.y);
        if (mk === nk || full(mnext, mk)) continue;
        if (!isEdgeTraversable(idx, edgeBetween(mcur, mnext))) continue;
      }
      enter(nk);
      usedEdges.add(ek);
      path.push(next);
      if (mnext) {
        enter(mk);
        mpath.push(mnext);
      }
      dfs(next);
      path.pop();
      leave(nk);
      usedEdges.delete(ek);
      if (mnext) {
        mpath.pop();
        leave(mk);
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
    passes.clear();
    usedEdges.clear();
    path.length = 0;
    mpath.length = 0;
    enter(sk);
    path.push({ x: s.x, y: s.y });
    if (sym !== 'none') {
      const m = mirror(s);
      if (getPoint(idx, m)?.type !== 'start') continue;
      // Per simmetria (s, m) e (m, s) danno le stesse soluzioni: basta una.
      doneStarts.add(pointKey(m.x, m.y));
      enter(pointKey(m.x, m.y));
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
