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
    });
  }
});
