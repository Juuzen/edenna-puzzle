/**
 * Geometria della board: contenitore quadrato e sfalsamento visivo.
 *
 * Tutto in unità SVG (cella = U). Il viewBox è un quadrato centrato sulla
 * griglia, quindi le coordinate di griglia non cambiano e `clientToGrid`
 * restituisce sempre la posizione logica (quella di Modifica).
 *
 * Lo sfalsamento sposta e ruota solo il disegno; ciò che esce dal pannello
 * rientra dal lato opposto (wrap «Pacman»), disegnando copie traslate di un
 * periodo pari al lato del pannello.
 */
import type { PuzzleShift } from '../engine';
import { MARGIN, U } from './Symbols';

/** Rientro del pannello dal bordo del viewBox. */
export const PANEL_INSET = 6;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoardFrame {
  /** Attributo `viewBox` (quadrato). */
  viewBox: string;
  /** Il quadrato del viewBox. */
  box: Rect;
  /** Il pannello di sfondo (quadrato, rientrato di PANEL_INSET). */
  panel: Rect;
  /** Centro della griglia. */
  cx: number;
  cy: number;
  /** Periodo dell'avvolgimento: il lato del pannello. */
  period: number;
}

/** Contenitore quadrato con la griglia `w`×`h` al centro. */
export function boardFrame(w: number, h: number): BoardFrame {
  const side = Math.max(w, h) * U + 2 * MARGIN;
  const cx = (w * U) / 2;
  const cy = (h * U) / 2;
  const box = { x: cx - side / 2, y: cy - side / 2, w: side, h: side };
  const panel = {
    x: box.x + PANEL_INSET,
    y: box.y + PANEL_INSET,
    w: side - 2 * PANEL_INSET,
    h: side - 2 * PANEL_INSET,
  };
  return { viewBox: `${box.x} ${box.y} ${box.w} ${box.h}`, box, panel, cx, cy, period: panel.w };
}

/** Periodo dell'avvolgimento in celle (oltre ±metà, le posizioni si ripetono). */
export const shiftPeriodCells = (w: number, h: number) => boardFrame(w, h).period / U;

/** Riporta `v` in [-p/2, p/2). */
export function wrapCentered(v: number, p: number): number {
  const r = (((v + p / 2) % p) + p) % p;
  return r - p / 2;
}

export interface ShiftGeometry {
  /** Spostamento normalizzato in unità SVG. */
  dx: number;
  dy: number;
  /** Rotazione in gradi. */
  rotation: number;
}

export function shiftGeometry(frame: BoardFrame, shift: PuzzleShift | undefined): ShiftGeometry {
  return {
    dx: wrapCentered((shift?.x ?? 0) * U, frame.period),
    dy: wrapCentered((shift?.y ?? 0) * U, frame.period),
    rotation: shift?.rotation ?? 0,
  };
}

/** Trasformazione SVG della copia (i, j): sposta, ruota attorno al centro e trasla di i, j periodi. */
export function shiftTransform(frame: BoardFrame, g: ShiftGeometry, i = 0, j = 0): string {
  const tx = frame.cx + g.dx + i * frame.period;
  const ty = frame.cy + g.dy + j * frame.period;
  return `translate(${tx} ${ty}) rotate(${g.rotation}) translate(${-frame.cx} ${-frame.cy})`;
}

/**
 * Margine attorno alla griglia che il disegno può occupare: uscite
 * (EXIT_LENGTH·U + LINE/2 = 30), partenze (START_R = 25), aloni e cursore.
 */
const CONTENT_PAD = 35;

/** Riquadro della copia (i, j) dopo la trasformazione. */
function tileBounds(frame: BoardFrame, g: ShiftGeometry, w: number, h: number, i: number, j: number): Rect {
  const rad = (g.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const px of [-CONTENT_PAD, w * U + CONTENT_PAD]) {
    for (const py of [-CONTENT_PAD, h * U + CONTENT_PAD]) {
      const vx = px - frame.cx;
      const vy = py - frame.cy;
      xs.push(frame.cx + g.dx + i * frame.period + vx * cos - vy * sin);
      ys.push(frame.cy + g.dy + j * frame.period + vx * sin + vy * cos);
    }
  }
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** La copia (i, j) entra almeno in parte nel pannello. */
export function tileIntersects(frame: BoardFrame, g: ShiftGeometry, w: number, h: number, i: number, j: number): boolean {
  const b = tileBounds(frame, g, w, h, i, j);
  const p = frame.panel;
  return b.x < p.x + p.w && b.x + b.w > p.x && b.y < p.y + p.h && b.y + b.h > p.y;
}

/**
 * Copie da disegnare: quelle, fra i, j ∈ {-1, 0, 1}, che toccano il pannello.
 * Con lo spostamento normalizzato una copia a 2 periodi non lo raggiunge mai.
 */
export function wrapTiles(frame: BoardFrame, g: ShiftGeometry, w: number, h: number): [number, number][] {
  const out: [number, number][] = [];
  for (const j of [-1, 0, 1]) {
    for (const i of [-1, 0, 1]) {
      if (tileIntersects(frame, g, w, h, i, j)) out.push([i, j]);
    }
  }
  return out;
}
