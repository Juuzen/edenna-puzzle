import { describe, expect, it } from 'vitest';
import {
  CONTRAST_TARGETS,
  PATH_ON_LINE_MIN,
  checkColor,
  contrastRatio,
  hexToRgb,
  hslToHex,
  hexToHsl,
  hexToOklch,
  oklchToHex,
  hueDistance,
  minContrast,
  suggestColors,
  suggestPalette,
  type ColorRole,
} from './color';
import type { PuzzleBackground } from './types';

const BGS: Record<string, PuzzleBackground> = {
  chiaro: { colors: ['#eef1f5'] },
  scuro: { colors: ['#0d1420'] },
  saturo: { colors: ['#d4384a'] },
  'blu medio': { colors: ['#3a6fb0'] },
  gradiente: { colors: ['#fdf6e3', '#9fc3d6'], angle: 135 },
  'gradiente scuro': { colors: ['#0d1420', '#3a2a5c'] },
};

describe('conversioni e contrasto', () => {
  it('valori noti WCAG', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#123456', '#123456')).toBe(1);
  });

  it('hsl andata e ritorno', () => {
    for (const c of ['#1f5fd6', '#0f9b8e', '#b9c3cf', '#ff0000']) {
      expect(hslToHex(hexToHsl(c))).toBe(c);
    }
    expect(hexToRgb('#abc')).toEqual({ r: 170, g: 187, b: 204 });
    expect(hueDistance('#ff0000', '#0000ff')).toBeCloseTo(120, 0);
  });

  it('su un gradiente conta il punto peggiore', () => {
    const bg: PuzzleBackground = { colors: ['#ffffff', '#000000'] };
    expect(minContrast('#ffffff', bg)).toBeCloseTo(1, 5);
    expect(minContrast('#000000', bg)).toBeCloseTo(1, 5);
    expect(minContrast('#777777', bg)).toBeLessThan(2);
  });
});

describe('controlli', () => {
  it('livelli e motivi', () => {
    const bg = BGS.scuro;
    expect(checkColor(bg, 'path', '#6ea8ff').level).toBe('good');
    expect(checkColor(bg, 'path', '#1f2a3a').level).toBe('bad');
    const onLine = checkColor(bg, 'path', '#8899aa', { line: '#8899aa' });
    expect(onLine.issues).toContain('si confonde con la griglia');
    const twin = checkColor(bg, 'success', '#6ea8ff', { path: '#6ea8ff' });
    expect(twin.issues).toContain('troppo simile al percorso in tracciamento');
  });
});

describe('suggerimenti', () => {
  for (const [name, bg] of Object.entries(BGS)) {
    it(`sfondo ${name}: ogni suggerimento rispetta le soglie`, () => {
      const pal = suggestPalette(bg);
      for (const role of ['line', 'path', 'success'] as ColorRole[]) {
        const others = role === 'line' ? {} : role === 'path' ? { line: pal.line } : { line: pal.line, path: pal.path };
        const list = suggestColors(bg, role, others);
        expect(list.length).toBeGreaterThanOrEqual(2);
        for (const s of list) {
          expect(s.ratio).toBeGreaterThanOrEqual(CONTRAST_TARGETS[role].min);
          if (role !== 'line') expect(contrastRatio(s.color, pal.line)).toBeGreaterThanOrEqual(PATH_ON_LINE_MIN);
        }
        expect(checkColor(bg, role, pal[role], others).level).toBe('good');
      }
    });
  }

  it('la griglia resta discreta (non bianco/nero puro su sfondi normali)', () => {
    for (const bg of [BGS.chiaro, BGS.scuro]) {
      const line = suggestPalette(bg).line;
      expect(minContrast(line, bg)).toBeLessThan(4);
    }
  });

  it('sfondo impossibile (chiaro → scuro): propone comunque il massimo ottenibile', () => {
    const list = suggestColors({ colors: ['#fdf6e3', '#1a4d6e'] }, 'path');
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].level).toBe('bad');
  });
});

describe('suggerimenti indipendenti fra chiamate', () => {
  it('la griglia su sfondo rosso è intonata al rosso, anche dopo altri sfondi', () => {
    suggestColors({ colors: ['#0d1420'] }, 'line');
    const red = suggestColors({ colors: ['#d4384a'] }, 'line')[0].color;
    const h = hexToHsl(red).h;
    expect(Math.min(h, 360 - h)).toBeLessThan(20);
    expect(suggestColors({ colors: ['#d4384a'] }, 'line')).toEqual(suggestColors({ colors: ['#d4384a'] }, 'line'));
  });
});

describe('OKLCH', () => {
  it('andata e ritorno sui colori del tema', () => {
    for (const hex of ['#1c222b', '#ffffff', '#12b5c9', '#c2358f', '#e9b322', '#d4384a', '#2fa652', '#2f63d8', '#ef7d1a'])
      expect(oklchToHex(hexToOklch(hex))).toBe(hex);
  });

  it('valori noti', () => {
    const w = hexToOklch('#ffffff');
    expect(w.l).toBeCloseTo(1, 3);
    expect(w.c).toBeLessThan(1e-3);
    const red = hexToOklch('#ff0000');
    expect(red.l).toBeCloseTo(0.628, 2);
    expect(red.c).toBeCloseTo(0.258, 2);
    expect(red.h).toBeCloseTo(29.2, 0);
  });
});
