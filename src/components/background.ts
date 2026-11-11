import type { CSSProperties } from 'react';
import { DEFAULT_BACKGROUND_ANGLE, type PuzzleBackground, type PuzzlePalette, withAlpha } from '../engine';

/** Variabili CSS del tema che corrispondono ai colori della palette. */
export function paletteCssVars(p?: PuzzlePalette): CSSProperties | undefined {
  if (!p) return undefined;
  const v: Record<string, string> = {};
  if (p.line) {
    v['--ep-line'] = p.line;
    v['--ep-start'] = p.line;
  }
  if (p.path) {
    v['--ep-path'] = p.path;
    v['--ep-path-glow'] = withAlpha(p.path, 0.4);
  }
  if (p.success) {
    v['--ep-success'] = p.success;
    v['--ep-success-glow'] = withAlpha(p.success, 0.5);
  }
  return Object.keys(v).length ? (v as CSSProperties) : undefined;
}

export interface GradientLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Estremi della linea di un gradiente su un rettangolo (x, y, w, h), con la
 * stessa geometria di CSS `linear-gradient(<angle>deg, …)`: 0° va verso
 * l'alto, 90° verso destra, e la linea è lunga quanto basta perché i due
 * angoli opposti del rettangolo cadano esattamente su 0% e 100%.
 */
export function gradientLine(x: number, y: number, w: number, h: number, angle: number): GradientLine {
  const a = (angle * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const cx = x + w / 2;
  const cy = y + h / 2;
  // `+ 0` trasforma -0 in 0.
  const r = (v: number) => Math.round(v * 1000) / 1000 + 0;
  return { x1: r(cx - dx * half), y1: r(cy - dy * half), x2: r(cx + dx * half), y2: r(cy + dy * half) };
}

/** Equivalente CSS dello sfondo (utile per anteprime fuori dall'SVG). */
export function backgroundCss(b: PuzzleBackground): string {
  if (b.colors.length === 1) return b.colors[0];
  return `linear-gradient(${b.angle ?? DEFAULT_BACKGROUND_ANGLE}deg, ${b.colors[0]}, ${b.colors[1]})`;
}
