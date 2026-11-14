import { describe, expect, it } from 'vitest';
import { MARGIN, U } from './Symbols';
import { boardFrame, shiftGeometry, shiftPeriodCells, shiftTransform, tileIntersects, wrapCentered, wrapTiles } from './shift';

describe('contenitore quadrato', () => {
  it('griglia 3×5: viewBox quadrato centrato sulla griglia', () => {
    const f = boardFrame(3, 5);
    const side = 5 * U + 2 * MARGIN;
    expect(f.box.w).toBe(side);
    expect(f.box.h).toBe(side);
    expect(f.box.x + f.box.w / 2).toBe(1.5 * U);
    expect(f.box.y + f.box.h / 2).toBe(2.5 * U);
    expect(f.panel.w).toBe(f.panel.h);
    expect(f.period).toBe(f.panel.w);
  });

  it('griglia quadrata: stesso viewBox di prima', () => {
    expect(boardFrame(4, 4).viewBox).toBe(`${-MARGIN} ${-MARGIN} ${4 * U + 2 * MARGIN} ${4 * U + 2 * MARGIN}`);
    expect(shiftPeriodCells(4, 4)).toBeCloseTo(4 + (2 * MARGIN - 12) / U);
  });
});

describe('sfalsamento', () => {
  it('normalizza lo spostamento in [-p/2, p/2)', () => {
    expect(wrapCentered(0, 10)).toBe(0);
    expect(wrapCentered(6, 10)).toBe(-4);
    expect(wrapCentered(-6, 10)).toBe(4);
    expect(wrapCentered(25, 10)).toBe(-5);
    const f = boardFrame(4, 4);
    expect(shiftGeometry(f, { x: 1, y: -1 }).dx).toBe(U);
    expect(shiftGeometry(f, { x: 1 + f.period / U }).dx).toBeCloseTo(U);
  });

  it('trasformazione con rotazione attorno al centro', () => {
    const f = boardFrame(2, 2);
    expect(shiftTransform(f, { dx: 10, dy: 20, rotation: 90 }, 1, 0)).toBe(
      `translate(${100 + 10 + f.period} 120) rotate(90) translate(-100 -100)`,
    );
  });

  it('senza sfalsamento basta la copia centrale', () => {
    const f = boardFrame(4, 4);
    expect(wrapTiles(f, shiftGeometry(f, undefined), 4, 4)).toEqual([[0, 0]]);
    const g = boardFrame(3, 6);
    expect(wrapTiles(g, shiftGeometry(g, undefined), 3, 6)).toEqual([[0, 0]]);
  });

  it('mezza cella a destra: rientra da sinistra', () => {
    const f = boardFrame(4, 4);
    expect(wrapTiles(f, shiftGeometry(f, { x: 0.5 }), 4, 4)).toEqual([
      [-1, 0],
      [0, 0],
    ]);
  });

  it('4×4 a 45°: le punte rientrano da tutti e quattro i lati', () => {
    const f = boardFrame(4, 4);
    const tiles = wrapTiles(f, shiftGeometry(f, { rotation: 45 }), 4, 4);
    for (const t of [[-1, 0], [1, 0], [0, -1], [0, 1], [0, 0]]) expect(tiles).toContainEqual(t);
  });

  it('una copia a due periodi non tocca mai il pannello', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let n = 0; n < 500; n++) {
      const w = 1 + Math.floor(rnd() * 12);
      const h = 1 + Math.floor(rnd() * 12);
      const f = boardFrame(w, h);
      const g = shiftGeometry(f, { x: (rnd() - 0.5) * 24, y: (rnd() - 0.5) * 24, rotation: rnd() * 360 });
      for (let i = -2; i <= 2; i++) {
        for (const j of [-2, 2]) {
          expect(tileIntersects(f, g, w, h, i, j)).toBe(false);
          expect(tileIntersects(f, g, w, h, j, i)).toBe(false);
        }
      }
    }
  });
});
