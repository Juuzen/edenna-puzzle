import {
  DIRECTIONS,
  type Coord,
  type Direction,
  type Path,
  type PuzzleIndex,
  directionBetween,
  edgeBetween,
  edgeRefKey,
  endDirection,
  getPoint,
  goesStraight,
  inPointBounds,
  isEdgeGap,
  isEdgeTraversable,
  maxPasses,
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
  /**
   * Ultima posizione del puntatore ricevuta da `moveTrace` (anche fuori dalla
   * griglia): misura quanto si è mosso, cioè quanta strada può fare la testa.
   * Assente dopo un passo da tastiera: il puntatore va riagganciato.
   */
  pointer?: Coord;
  /**
   * Il puntatore è uscito dalla griglia: la testa resta ferma finché non le
   * torna vicino (`REGRAB_RADIUS`).
   */
  detached?: boolean;
}

/** Lunghezza dell'uscita (come END_LENGTH/GRID_UNIT dell'originale). */
export const EXIT_LENGTH = 0.2;
/** Quanto si può entrare in un lato interrotto. */
const GAP_REACH = 0.3;
/** Quanto ci si può avvicinare a un punto già occupato. */
const COLLIDE_REACH = 0.75;
/** Margine quando i due serpenti simmetrici si vengono incontro. */
const MEET_REACH = 0.4;

/** `pointer`: dove si trova il puntatore all'inizio (di norma sulla partenza). */
export function startTrace(at: Coord, pointer: Coord = at): TraceState {
  return { path: [{ ...at }], dir: null, t: 0, pointer: { ...pointer } };
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
  const mirror = (c: Coord) => reflectPoint(sym, idx.puzzle.width, idx.puzzle.height, c);
  // Passaggi per punto (fino a 2 sui ponti) e lati già percorsi.
  const passes = new Map<string, number>();
  const used = new Set<string>();
  const add = (path: Coord[]) =>
    path.forEach((c, i) => {
      const k = pointKey(c.x, c.y);
      passes.set(k, (passes.get(k) ?? 0) + 1);
      if (i > 0) used.add(edgeRefKey(edgeBetween(path[i - 1], c)));
    });
  add(s.path);
  if (sym !== 'none') add(s.path.map(mirror));

  const single = (f: Coord, d: Direction): number => {
    if (getPoint(idx, f)?.type === 'end' && endDirection(idx, f) === d) return EXIT_LENGTH;
    const n = neighbor(f, d);
    if (!inPointBounds(idx.puzzle, n)) return 0;
    const e = edgeBetween(f, n);
    if (isEdgeGap(idx, e)) return GAP_REACH;
    if (!isEdgeTraversable(idx, e) || used.has(edgeRefKey(e))) return 0;
    if ((passes.get(pointKey(n.x, n.y)) ?? 0) >= maxPasses(idx, n)) return COLLIDE_REACH;
    return 1;
  };

  // Sul ponte si va solo dritto: niente svolte dal punto d'incrocio.
  const prev = s.path[s.path.length - 2];
  if (prev && getPoint(idx, from)?.type === 'bridge' && !goesStraight(prev, from, neighbor(from, dir))) return 0;

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
 * Distanza massima (in celle) fra il puntatore e una linea della griglia
 * perché il percorso lo segua. Oltre questa soglia, per esempio al centro di
 * una cella, il puntatore viene ignorato e la testa resta dov'è.
 */
export const CAPTURE_RADIUS = 0.25;

/** Distanza del puntatore dalla linea della griglia più vicina (uscite comprese). */
export function distanceToGrid(p: { width: number; height: number }, c: Coord): number {
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const e = EXIT_LENGTH;
  const yr = clamp(Math.round(c.y), 0, p.height);
  const dh = Math.hypot(c.x - clamp(c.x, -e, p.width + e), c.y - yr);
  const xr = clamp(Math.round(c.x), 0, p.width);
  const dv = Math.hypot(c.x - xr, c.y - clamp(c.y, -e, p.height + e));
  return Math.min(dh, dv);
}

const ALL_DIRS = Object.keys(DIRECTIONS) as Direction[];
const OPPOSITE: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/**
 * Penalità (in celle) per cambiare tratto passando "attraverso" il vertice
 * quando la testa è già avanzata: evita lo sfarfallio quando il puntatore
 * oscilla sulla diagonale di un incrocio.
 */
const SWITCH_HYSTERESIS = 0.08;

/**
 * Penalità (in celle) per svoltare a un incrocio invece di proseguire dritto:
 * con il puntatore appena fuori linea il percorso non curva da solo, si
 * svolta solo quando lo spostamento laterale supera quello in avanti.
 */
export const TURN_BIAS = 0.1;

/** Strada che la testa può fare lungo la griglia per ogni unità di movimento del puntatore. */
const TRAVEL_FACTOR = 1.5;
/** Strada in più concessa a ogni evento: recupera il ritardo accumulato nelle curve. */
const TRAVEL_SLACK = 0.03;

/**
 * Dopo un'uscita dalla griglia, distanza (in celle) dalla testa entro cui il
 * puntatore riaggancia il percorso.
 */
export const REGRAB_RADIUS = 0.5;

/** Un possibile tratto su cui portare la testa. */
interface Candidate {
  /** Come si arriva al tratto partendo dallo stato attuale. */
  kind: 'stay' | 'current' | 'branch' | 'back' | 'forward';
  dir: Direction;
  /** Avanzamento lungo il tratto. */
  t: number;
  /** Distanza dal puntatore. */
  dist: number;
  /** Distanza più le penalità: decide fra i tratti. */
  score: number;
}

/**
 * Porta la testa verso il punto della griglia migliore per `target`,
 * percorrendo al massimo `budget` celle lungo le linee.
 */
function advance(idx: PuzzleIndex, state: TraceState, target: Coord, budget: number): TraceState {
  let s: TraceState = { path: [...state.path], dir: state.dir, t: state.t };
  /** Consuma budget: restituisce quanto si può davvero percorrere di `len`. */
  const spend = (len: number) => {
    const m = Math.min(len, budget);
    budget -= m;
    return m;
  };

  const evalSeg = (base: Coord, d: Direction, max: number) => {
    const v = DIRECTIONS[d];
    const t = Math.max(0, Math.min(dot({ x: target.x - base.x, y: target.y - base.y }, v), max));
    return { t, dist: Math.hypot(base.x + v.x * t - target.x, base.y + v.y * t - target.y) };
  };

  for (let guard = 0; guard < 64 && budget > 1e-9; guard++) {
    const v = traceHead(s);
    const prevDir = s.path.length >= 2 ? directionBetween(v, s.path[s.path.length - 2]) : null;
    /** Direzione con cui si è arrivati al vertice: proseguire così è "dritto". */
    const inDir = prevDir ? OPPOSITE[prevDir] : null;
    const turn = (from: Direction | null, d: Direction) => (from && d !== from ? TURN_BIAS : 0);
    const cands: Candidate[] = [];

    // 1. Restare sul tratto attuale (o sul vertice, se non si è su un tratto).
    if (s.dir) {
      const r = evalSeg(v, s.dir, reach(idx, s, v, s.dir));
      cands.push({ kind: 'current', dir: s.dir, ...r, score: r.dist });
    } else {
      const dist = Math.hypot(v.x - target.x, v.y - target.y);
      cands.push({ kind: 'stay', dir: 'up', t: 0, dist, score: dist });
    }

    // 2. Altri tratti che escono dall'ultimo vertice, compreso il ritorno.
    // Se la testa è già avanzata, cambiare tratto è un salto: va penalizzato.
    // Il tratto dritto viene per primo: a parità vince lui.
    const jumpPenalty = s.dir && s.t > 0.02 ? SWITCH_HYSTERESIS : 0;
    const dirs = inDir ? [inDir, ...ALL_DIRS.filter((d) => d !== inDir)] : ALL_DIRS;
    for (const d of dirs) {
      if (d === s.dir) continue;
      if (d === prevDir) {
        const r = evalSeg(v, d, 1);
        if (r.t > 0) cands.push({ kind: 'back', dir: d, ...r, score: r.dist + jumpPenalty });
        continue;
      }
      const max = reach(idx, s, v, d);
      if (max <= 0) continue;
      const r = evalSeg(v, d, max);
      if (r.t > 0 || (!s.dir && d === inDir)) {
        cands.push({ kind: 'branch', dir: d, ...r, score: r.dist + jumpPenalty + turn(inDir, d) });
      }
    }

    // 3. Tratti che escono dal vertice successivo (si può svoltare solo se
    // il tratto attuale è percorribile per intero).
    if (s.dir && reach(idx, s, v, s.dir) >= 1) {
      const w = neighbor(v, s.dir);
      const ahead: TraceState = { path: [...s.path, w], dir: null, t: 0 };
      for (const d of ALL_DIRS) {
        if (d === OPPOSITE[s.dir]) continue;
        const max = reach(idx, ahead, w, d);
        if (max <= 0) continue;
        const r = evalSeg(w, d, max);
        if (r.t > 0) cands.push({ kind: 'forward', dir: d, ...r, score: r.dist + turn(s.dir, d) });
      }
    }

    let best = cands[0];
    if (s.dir) {
      // A parità vince il primo, cioè il tratto attuale.
      for (const c of cands) if (c.score < best.score - 1e-9) best = c;
    } else {
      // Fermi su un vertice: le penalità scelgono fra i tratti, ma si parte
      // solo se il tratto scelto avvicina davvero la testa al puntatore.
      let branch: Candidate | null = null;
      for (const c of cands.slice(1)) if (!branch || c.score < branch.score - 1e-9) branch = c;
      if (branch && branch.dist < best.dist - 1e-9) best = branch;
    }

    if (best.kind === 'stay') break;

    if (best.kind === 'current') {
      const dir = s.dir!;
      const toNext = best.t >= 1 - 1e-9 && reach(idx, s, v, dir) >= 1;
      const goal = toNext ? 1 : best.t;
      const t = s.t + Math.sign(goal - s.t) * spend(Math.abs(goal - s.t));
      if (toNext && t >= 1 - 1e-9) {
        // Raggiunto il vertice successivo: lo si aggiunge e si riprova da lì.
        s = { path: [...s.path, neighbor(v, dir)], dir: null, t: 0 };
        continue;
      }
      s = t <= 1e-9 ? { ...s, dir: null, t: 0 } : { ...s, t };
      break;
    }

    if (best.kind === 'forward') {
      // Si arriva prima al vertice successivo, poi si sceglie da lì.
      const need = 1 - s.t;
      const m = spend(need);
      if (m < need - 1e-9) {
        s = { ...s, t: s.t + m };
        break;
      }
      s = { path: [...s.path, neighbor(v, s.dir!)], dir: null, t: 0 };
      continue;
    }

    // branch/back a metà tratto: prima si torna al vertice.
    if (s.dir) {
      const t = s.t - spend(s.t);
      if (t > 1e-9) {
        s = { ...s, t };
        break;
      }
      s = { ...s, dir: null, t: 0 };
      continue;
    }

    const m = spend(best.t);
    if (best.kind === 'branch') {
      if (m >= 1 - 1e-9) {
        s = { path: [...s.path, neighbor(v, best.dir)], dir: null, t: 0 };
        continue;
      }
      s = { ...s, dir: best.dir, t: m };
      break;
    }
    // back: si accorcia il percorso.
    const path = s.path.slice(0, -1);
    if (m >= 1 - 1e-9) {
      s = { path, dir: null, t: 0 };
      continue;
    }
    s = { path, dir: OPPOSITE[best.dir], t: 1 - m };
    break;
  }
  return s;
}

/**
 * Fa avanzare il serpente verso `target` (posizione del puntatore in unità
 * di cella).
 *
 * L'obiettivo è il punto della griglia più vicino al puntatore fra quelli
 * raggiungibili senza staccarsi dal percorso: il tratto attuale, gli altri
 * tratti che escono dall'ultimo vertice (svolta o ritorno indietro) e quelli
 * che escono dal vertice successivo (curva in avanti). Agli incroci
 * proseguire dritto è favorito (`TURN_BIAS`): con il puntatore appena fuori
 * linea il percorso non svolta da solo.
 *
 * La testa non salta mai: raggiunge l'obiettivo scorrendo lungo le linee e
 * passando per i vertici, al massimo di `TRAVEL_FACTOR` volte quanto si è
 * mosso il puntatore (più un piccolo margine). Il ritardo che si accumula in
 * una curva si recupera nei movimenti successivi.
 *
 * Se il puntatore è più lontano di `capture` da ogni linea della griglia
 * (per esempio al centro di una cella) la testa resta ferma e il percorso si
 * stacca: riprende a seguire il puntatore solo quando questo torna entro
 * `REGRAB_RADIUS` dalla testa. Lo stesso vale dopo un passo da tastiera.
 */
export function moveTrace(
  idx: PuzzleIndex,
  state: TraceState,
  target: Coord,
  capture: number = CAPTURE_RADIUS,
): TraceState {
  const pointer = { x: target.x, y: target.y };
  if (distanceToGrid(idx.puzzle, target) > capture) return { ...state, pointer, detached: true };
  const head = headPosition(state);
  const fromHead = Math.hypot(head.x - target.x, head.y - target.y);
  const attached = !!state.pointer && !state.detached;
  if (!attached && fromHead > REGRAB_RADIUS) return { ...state, pointer, detached: true };
  const moved = attached ? Math.hypot(target.x - state.pointer!.x, target.y - state.pointer!.y) : fromHead;
  return { ...advance(idx, state, target, moved * TRAVEL_FACTOR + TRAVEL_SLACK), pointer };
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

/**
 * Tratti da ridisegnare sopra il resto del percorso, uno per ogni ponte
 * attraversato per la seconda volta: da metà del lato d'arrivo, per il
 * ponte, fino a metà del lato d'uscita (o fino a `tail`, la testa o lo
 * sbocco, se il percorso non è ancora andato oltre). Le occorrenze si
 * contano solo in `path`: la coda può coincidere con l'ultimo punto.
 */
export function bridgeOverpasses(idx: PuzzleIndex, path: Coord[], tail: Coord | null): Coord[][] {
  const seen = new Set<string>();
  const out: Coord[][] = [];
  const toward = (a: Coord, b: Coord) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const k = len > 0.5 ? 0.5 / len : 1;
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  };
  path.forEach((c, i) => {
    if (getPoint(idx, c)?.type !== 'bridge') return;
    const k = pointKey(c.x, c.y);
    if (!seen.has(k)) {
      seen.add(k);
      return;
    }
    const pts = [toward(c, path[i - 1]), c];
    const next = path[i + 1] ?? tail;
    if (next && (next.x !== c.x || next.y !== c.y)) pts.push(toward(c, next));
    out.push(pts);
  });
  return out;
}
