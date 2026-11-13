import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePuzzle, solve } from './index';

const dir = join(__dirname, '../../examples');

describe('puzzle di esempio', () => {
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    it(`${f} è valido e ha una sola soluzione`, () => {
      const { puzzle, warnings } = parsePuzzle(readFileSync(join(dir, f), 'utf8'));
      expect(warnings).toEqual([]);
      const r = solve(puzzle, { maxSolutions: 2, timeLimitMs: 10000 });
      expect(r.solutions.length).toBe(1);
      expect(r.exhaustive).toBe(true);
      // Un puzzle con ponti è pensato perché la soluzione ne attraversi uno due volte.
      const bridges = puzzle.points.filter((p) => p.type === 'bridge');
      if (bridges.length) {
        const path = r.solutions[0][0];
        const passes = (b: { x: number; y: number }) => path.filter((c) => c.x === b.x && c.y === b.y).length;
        expect(bridges.some((b) => passes(b) === 2)).toBe(true);
      }
    });
  }
});
