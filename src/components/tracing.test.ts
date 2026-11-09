import { describe, expect, it } from 'vitest';
import { createPuzzle, indexPuzzle, setSymmetry, type Coord } from '../engine';
import { headPosition, moveTrace, startTrace, type TraceState } from './tracing';

/** Simula il puntatore lungo una serie di punti, a piccoli passi. */
function drive(idx: ReturnType<typeof indexPuzzle>, start: Coord, waypoints: Coord[], step = 0.02) {
  let s: TraceState = startTrace(start);
  let cur = { ...start };
  const heads: Coord[] = [headPosition(s)];
  let maxJump = 0;
  let worst: { from: Coord; to: Coord; at: Coord } | null = null;
  for (const w of waypoints) {
    const dist = Math.hypot(w.x - cur.x, w.y - cur.y);
    const n = Math.max(1, Math.ceil(dist / step));
    const from = { ...cur };
    for (let i = 1; i <= n; i++) {
      const p = { x: from.x + ((w.x - from.x) * i) / n, y: from.y + ((w.y - from.y) * i) / n };
      const prevHead = headPosition(s);
      s = moveTrace(idx, s, p);
      const h = headPosition(s);
      const j = Math.hypot(h.x - prevHead.x, h.y - prevHead.y);
      if (j > maxJump) {
        maxJump = j;
        worst = { from: prevHead, to: h, at: p };
      }
      heads.push(h);
    }
    cur = { ...w };
  }
  return { s, maxJump, worst, heads };
}

describe('tracciamento con il puntatore', () => {
  const idx = indexPuzzle(createPuzzle(4, 4));

  it('svolta netta a un incrocio: nessun salto della testa', () => {
    // da (0,4) su fino a (0,3), poi a destra
    const r = drive(idx, { x: 0, y: 4 }, [{ x: 0, y: 3 }, { x: 1, y: 3 }]);
    expect(r.maxJump).toBeLessThan(0.1);
    expect(headPosition(r.s)).toEqual({ x: 1, y: 3 });
  });

  // Se il puntatore "taglia" la curva passando a distanza r dall'incrocio,
  // la testa deve comunque passare per l'incrocio: salta da un braccio
  // all'altro di circa r·√2. È il minimo possibile, non uno sfarfallio.
  it('curva "tagliata" vicino all’incrocio: salto limitato a r·√2', () => {
    const r = drive(idx, { x: 0, y: 4 }, [{ x: 0, y: 3.4 }, { x: 0.15, y: 3.1 }, { x: 0.4, y: 3.0 }, { x: 1, y: 3 }]);
    expect(r.maxJump).toBeLessThan(0.15 * Math.SQRT2 + 0.02);
    expect(headPosition(r.s)).toEqual({ x: 1, y: 3 });
  });

  it('svolta con il puntatore leggermente fuori linea', () => {
    const r = drive(idx, { x: 0, y: 4 }, [{ x: 0.12, y: 3.0 }, { x: 0.12, y: 2.88 }, { x: 0.8, y: 2.9 }]);
    expect(r.maxJump).toBeLessThan(0.12 * Math.SQRT2 + 0.02);
    expect(headPosition(r.s)).toEqual({ x: 0.8, y: 3 });
  });

  it('oscillare sulla diagonale di un incrocio non fa sfarfallare il percorso', () => {
    // arriva a (1,3) e poi oscilla attorno alla diagonale verso (1.3,2.7)
    let s = drive(idx, { x: 0, y: 4 }, [{ x: 0, y: 3 }, { x: 1, y: 3 }]).s;
    const heads: Coord[] = [];
    for (let i = 0; i < 40; i++) {
      const e = i % 2 ? 0.01 : -0.01;
      s = moveTrace(idx, s, { x: 1.3 + e, y: 2.7 + e });
      heads.push(headPosition(s));
    }
    const distinct = new Set(heads.slice(5).map((h) => `${h.x.toFixed(3)},${h.y.toFixed(3)}`));
    expect(distinct.size).toBeLessThanOrEqual(2);
    // e tra due posizioni consecutive la distanza resta piccola
    for (let i = 1; i < heads.length; i++) {
      expect(Math.hypot(heads[i].x - heads[i - 1].x, heads[i].y - heads[i - 1].y)).toBeLessThan(0.1);
    }
  });

  it('tornare indietro accorcia il percorso senza salti', () => {
    const r = drive(idx, { x: 0, y: 4 }, [{ x: 0, y: 3 }, { x: 1, y: 3 }, { x: 0, y: 3 }, { x: 0, y: 4 }]);
    expect(r.maxJump).toBeLessThan(0.1);
    expect(r.s.path).toHaveLength(1);
  });

  it('movimento veloce: segue il puntatore anche a grandi passi', () => {
    const r = drive(idx, { x: 0, y: 4 }, [{ x: 0, y: 2 }, { x: 2, y: 2 }], 0.7);
    expect(headPosition(r.s)).toEqual({ x: 2, y: 2 });
  });

  it('simmetria: il percorso speculare segue senza salti', () => {
    const p = setSymmetry({ ...createPuzzle(4, 4), points: [{ x: 0, y: 4, type: 'start' }, { x: 0, y: 0, type: 'end' }] }, 'horizontal');
    const r = drive(indexPuzzle(p), { x: 0, y: 4 }, [{ x: 0, y: 3 }, { x: 1, y: 3 }, { x: 1, y: 2 }]);
    expect(r.maxJump).toBeLessThan(0.15);
    expect(headPosition(r.s)).toEqual({ x: 1, y: 2 });
  });
});
