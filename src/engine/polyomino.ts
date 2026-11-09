import { shapeToGrid } from './grid';
import type { Coord } from './types';

/**
 * Verifica dei poliomini, riscritta da zero rispetto a windmill-client.
 *
 * L'originale lavorava "togliendo" pezzi da una forma con una BFS e aveva
 * dei limiti dichiarati (niente Y multiple insieme ai poliomini, negativi
 * annullati solo per conteggio). Qui il problema è formulato come copertura
 * esatta con molteplicità sull'intera griglia del puzzle:
 *
 *   per ogni cella, (#positivi che la coprono) − (#negativi che la coprono)
 *   deve valere 1 dentro la regione e 0 fuori.
 *
 * Prima si piazzano i negativi (ovunque nella griglia), poi si coprono i
 * "requisiti" risultanti con i positivi. Tutti i pezzi restano dentro la
 * griglia, come nel gioco.
 *
 * Come nel gioco (e nell'originale), se l'area positiva totale è uguale a
 * quella negativa i pezzi si annullano e la regione è valida qualunque sia
 * la sua forma.
 */

export interface PieceSpec {
  shape: string[];
  rotatable: boolean;
  negative: boolean;
}

/** Celle relative di un pezzo, normalizzate (min x/y = 0), ordinate per riga. */
type Cells = Coord[];

function normalize(cells: Cells): Cells {
  const mx = Math.min(...cells.map((c) => c.x));
  const my = Math.min(...cells.map((c) => c.y));
  return cells
    .map((c) => ({ x: c.x - mx, y: c.y - my }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

const cellsKey = (cells: Cells) => cells.map((c) => `${c.x}.${c.y}`).join('|');

export function shapeCells(shape: string[]): Cells {
  const out: Cells = [];
  shapeToGrid(shape).forEach((row, y) => row.forEach((v, x) => v && out.push({ x, y })));
  return out.length ? normalize(out) : out;
}

/** Tutte le orientazioni distinte (solo rotazioni, mai riflessioni). */
export function orientations(shape: string[], rotatable: boolean): Cells[] {
  const base = shapeCells(shape);
  if (!base.length) return [];
  if (!rotatable) return [base];
  const seen = new Map<string, Cells>();
  let cur = base;
  for (let r = 0; r < 4; r++) {
    seen.set(cellsKey(cur), cur);
    // Rotazione oraria: (x, y) → (-y, x)
    cur = normalize(cur.map((c) => ({ x: -c.y, y: c.x })));
  }
  return [...seen.values()];
}

export interface FitResult {
  ok: boolean;
  /** Vero se la ricerca è stata interrotta per eccesso di tentativi. */
  timedOut?: boolean;
  /** Piazzamento trovato (utile per debug / suggerimenti). */
  placements?: { piece: number; cells: Coord[] }[];
}

interface Piece {
  index: number;
  area: number;
  orients: Cells[];
  key: string;
}

/**
 * @param width/height dimensioni della griglia (in celle)
 * @param region celle della regione da coprire
 * @param pieces pezzi presenti nella regione
 * @param budget numero massimo di passi di ricerca
 */
export function fitPolyominoes(
  width: number,
  height: number,
  region: Coord[],
  pieces: PieceSpec[],
  budget = 200_000,
): FitResult {
  if (!pieces.length) return { ok: true };
  const toPiece = (p: PieceSpec, index: number): Piece => {
    const orients = orientations(p.shape, p.rotatable);
    return {
      index,
      area: orients[0]?.length ?? 0,
      orients,
      key: `${p.rotatable ? 'r' : 'f'}:${orients.map(cellsKey).sort()[0] ?? ''}`,
    };
  };
  const pos: Piece[] = [];
  const neg: Piece[] = [];
  pieces.forEach((p, i) => (p.negative ? neg : pos).push(toPiece(p, i)));
  const posArea = pos.reduce((s, p) => s + p.area, 0);
  const negArea = neg.reduce((s, p) => s + p.area, 0);

  if (neg.length && posArea === negArea) return { ok: true };
  if (posArea - negArea !== region.length) return { ok: false };

  const req = new Int16Array(width * height);
  for (const c of region) req[c.y * width + c.x] = 1;

  let steps = 0;
  let timedOut = false;
  const placements: { piece: number; cells: Coord[] }[] = [];

  const fits = (o: Cells, ox: number, oy: number, positive: boolean) => {
    for (const c of o) {
      const x = c.x + ox;
      const y = c.y + oy;
      if (x < 0 || y < 0 || x >= width || y >= height) return false;
      if (positive && req[y * width + x] <= 0) return false;
    }
    return true;
  };
  const apply = (o: Cells, ox: number, oy: number, delta: number) => {
    for (const c of o) req[(c.y + oy) * width + c.x + ox] += delta;
  };

  // --- Fase 2: copertura con i positivi (pezzi identici trattati una volta).
  const coverPositives = (remaining: Piece[]): boolean => {
    if (++steps > budget) {
      timedOut = true;
      return false;
    }
    let first = -1;
    for (let i = 0; i < req.length; i++) {
      if (req[i] > 0) {
        first = i;
        break;
      }
    }
    if (first < 0) return remaining.length === 0;
    if (!remaining.length) return false;
    const fx = first % width;
    const fy = Math.floor(first / width);
    const tried = new Set<string>();
    for (let k = 0; k < remaining.length; k++) {
      const piece = remaining[k];
      if (tried.has(piece.key)) continue;
      tried.add(piece.key);
      const rest = remaining.slice(0, k).concat(remaining.slice(k + 1));
      for (const o of piece.orients) {
        // La prima cella del pezzo (in ordine di lettura) deve cadere sulla
        // prima cella ancora da coprire.
        const ox = fx - o[0].x;
        const oy = fy - o[0].y;
        if (!fits(o, ox, oy, true)) continue;
        apply(o, ox, oy, -1);
        placements.push({ piece: piece.index, cells: o.map((c) => ({ x: c.x + ox, y: c.y + oy })) });
        if (coverPositives(rest)) return true;
        placements.pop();
        apply(o, ox, oy, +1);
        if (timedOut) return false;
      }
    }
    return false;
  };

  // --- Fase 1: piazzamento dei negativi, ovunque nella griglia.
  // I negativi identici vengono piazzati in ordine non decrescente di
  // posizione per non esplorare permutazioni equivalenti.
  const sortedNeg = [...neg].sort((a, b) => a.key.localeCompare(b.key));
  const placeNegatives = (i: number, minSlot: number): boolean => {
    if (i === sortedNeg.length) return coverPositives(pos);
    const piece = sortedNeg[i];
    const sameAsPrev = i > 0 && sortedNeg[i - 1].key === piece.key;
    let slot = 0;
    for (const o of piece.orients) {
      const ow = Math.max(...o.map((c) => c.x)) + 1;
      const oh = Math.max(...o.map((c) => c.y)) + 1;
      for (let oy = 0; oy + oh <= height; oy++) {
        for (let ox = 0; ox + ow <= width; ox++, slot++) {
          if (sameAsPrev && slot < minSlot) continue;
          if (++steps > budget) {
            timedOut = true;
            return false;
          }
          apply(o, ox, oy, +1);
          placements.push({ piece: piece.index, cells: o.map((c) => ({ x: c.x + ox, y: c.y + oy })) });
          if (placeNegatives(i + 1, slot)) return true;
          placements.pop();
          apply(o, ox, oy, -1);
          if (timedOut) return false;
        }
      }
    }
    return false;
  };

  const ok = placeNegatives(0, 0);
  return ok ? { ok, placements } : { ok, timedOut: timedOut || undefined };
}
