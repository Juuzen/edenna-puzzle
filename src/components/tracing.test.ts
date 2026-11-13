import { describe, expect, it } from 'vitest';
import { createPuzzle, indexPuzzle, setPoint, setSymmetry, type Coord, type Direction } from '../engine';
import { CAPTURE_RADIUS, bridgeOverpasses, distanceToGrid, headPosition, moveTrace, startTrace, stepTrace, type TraceState } from './tracing';

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
      s = moveTrace(idx, s, { x: 1.18 + e, y: 2.82 + e });
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

  it('al centro di una cella il puntatore viene ignorato', () => {
    const s = drive(idx, { x: 0, y: 4 }, [{ x: 0, y: 3.5 }]).s;
    const before = headPosition(s);
    for (const p of [{ x: 0.5, y: 3.5 }, { x: 0.45, y: 3.4 }, { x: 0.6, y: 3.6 }, { x: 1.5, y: 2.5 }]) {
      expect(distanceToGrid(idx.puzzle, p)).toBeGreaterThan(CAPTURE_RADIUS);
      expect(headPosition(moveTrace(idx, s, p))).toEqual(before);
    }
  });

  it('attraversare una cella in diagonale: la testa aspetta e riparte sulla linea', () => {
    // dal lato sinistro della cella in basso a sinistra al suo angolo opposto
    const r = drive(idx, { x: 0, y: 4 }, [{ x: 0, y: 3.5 }, { x: 0.5, y: 3.5 }, { x: 0.9, y: 3.05 }, { x: 1, y: 3 }]);
    expect(headPosition(r.s)).toEqual({ x: 1, y: 3 });
    expect(r.s.path.map((c) => `${c.x},${c.y}`)).toEqual(['0,4', '0,3', '1,3']);
  });

  it('il percorso segue ancora il puntatore vicino all’uscita', () => {
    expect(distanceToGrid(idx.puzzle, { x: 4.18, y: 0.05 })).toBeLessThan(CAPTURE_RADIUS);
  });
});

describe('ponte', () => {
  const bridged = setPoint(createPuzzle(3, 3), { x: 1, y: 1 }, { type: 'bridge' });
  const idx = indexPuzzle(bridged);
  const keys = (s: TraceState) => s.path.map((c) => `${c.x}${c.y}`).join(' ');
  const steps = (dirs: Direction[], s = startTrace({ x: 0, y: 3 })) => dirs.reduce((acc, d) => stepTrace(idx, acc, d), s);
  /** Fino al primo passaggio dritto sul ponte, poi giro attorno alla cella (1,1). */
  const LOOP: Coord[] = [
    { x: 0, y: 1 },
    { x: 2, y: 1 },
    { x: 2, y: 2 },
    { x: 1, y: 2 },
  ];

  it('col puntatore: secondo passaggio dritto, poi oltre', () => {
    const r = drive(idx, { x: 0, y: 3 }, [...LOOP, { x: 1, y: 1 }, { x: 1, y: 0 }]);
    expect(keys(r.s)).toBe('03 02 01 11 21 22 12 11 10');
    expect(r.maxJump).toBeLessThan(0.1);
  });

  it('col puntatore: sul ponte non si curva', () => {
    const r = drive(idx, { x: 0, y: 3 }, [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 0.5 }]);
    expect(keys(r.s)).toBe('03 02 01 11');
    expect(headPosition(r.s)).toEqual({ x: 1, y: 1 });
    // Dritto invece si prosegue.
    expect(keys(stepTrace(idx, r.s, 'right'))).toBe('03 02 01 11 21');
    expect(keys(stepTrace(idx, r.s, 'up'))).toBe('03 02 01 11');
    expect(keys(stepTrace(idx, r.s, 'down'))).toBe('03 02 01 11');
  });

  it('lato già percorso e terzo passaggio non consentiti', () => {
    // Secondo passaggio: dal ponte non si torna sul lato del primo (verso sinistra).
    const r = drive(idx, { x: 0, y: 3 }, [...LOOP, { x: 1, y: 1 }, { x: 0.5, y: 1 }]);
    expect(keys(r.s)).toBe('03 02 01 11 21 22 12 11');
    expect(headPosition(r.s)).toEqual({ x: 1, y: 1 });
    // Su un punto normale già visitato ci si ferma prima, come sempre.
    const s = steps(['up', 'up', 'right', 'right', 'down', 'left', 'left']);
    expect(keys(s)).toBe('03 02 01 11 21 22 12');
    expect(s.dir).toBe('left');
    expect(s.t).toBeGreaterThan(0);
    expect(s.t).toBeLessThan(1);
  });

  it('retromarcia dal secondo passaggio libera il lato', () => {
    const r = drive(idx, { x: 0, y: 3 }, [...LOOP, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }]);
    expect(keys(r.s)).toBe('03 02 01 11 21 22');
  });

  it('da tastiera', () => {
    let s = steps(['up', 'up', 'right', 'right', 'down', 'left', 'up', 'up']);
    expect(keys(s)).toBe('03 02 01 11 21 22 12 11 10');
    // Indietro oltre il secondo passaggio, poi di nuovo avanti.
    s = steps(['down', 'down'], s);
    expect(keys(s)).toBe('03 02 01 11 21 22 12');
    s = steps(['up'], s);
    expect(keys(s)).toBe('03 02 01 11 21 22 12 11');
    // Dal ponte: sinistra (lato del primo passaggio) e destra non si percorrono.
    expect(keys(stepTrace(idx, s, 'left'))).toBe(keys(s));
    expect(keys(stepTrace(idx, s, 'right'))).toBe(keys(s));
  });
});

describe('sovrapposizione sul ponte', () => {
  const idx = indexPuzzle(setPoint(createPuzzle(3, 3), { x: 1, y: 1 }, { type: 'bridge' }));
  const path = [[0, 3], [0, 2], [0, 1], [1, 1], [2, 1], [2, 2], [1, 2], [1, 1]].map(([x, y]) => ({ x, y }));

  it('solo il secondo passaggio, fino alla testa', () => {
    expect(bridgeOverpasses(idx, path.slice(0, 4), { x: 1, y: 1 })).toEqual([]);
    // Testa ferma sul ponte: solo la metà d'arrivo.
    expect(bridgeOverpasses(idx, path, { x: 1, y: 1 })).toEqual([[{ x: 1, y: 1.5 }, { x: 1, y: 1 }]]);
    expect(bridgeOverpasses(idx, path, { x: 1, y: 0.8 })).toEqual([[{ x: 1, y: 1.5 }, { x: 1, y: 1 }, { x: 1, y: 0.8 }]]);
    expect(bridgeOverpasses(idx, [...path, { x: 1, y: 0 }], null)).toEqual([[{ x: 1, y: 1.5 }, { x: 1, y: 1 }, { x: 1, y: 0.5 }]]);
  });
});
