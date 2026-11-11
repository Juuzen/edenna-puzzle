import { forwardRef, useId, useMemo, type ReactNode, type SVGProps } from 'react';
import { gradientLine } from './background';
import {
  DEFAULT_BACKGROUND_ANGLE,
  type Coord,
  type Path,
  type Puzzle,
  type SymbolRef,
  DIRECTIONS,
  endDirection,
  indexPuzzle,
  reflectPoint,
  symbolRefKey,
} from '../engine';
import { CellSymbol, Hexagon, LINE, MARGIN, START_R, U, maxPolyominoSize } from './Symbols';
import { EXIT_LENGTH, type TraceState, headPosition, mirrorTrace } from './tracing';

export type BoardStatus = 'idle' | 'tracing' | 'success' | 'failure' | 'cancelled';

export interface PuzzleBoardProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  puzzle: Puzzle;
  trace?: TraceState | null;
  /** Percorsi completi da mostrare (es. soluzione trovata dal solver). */
  paths?: Path[] | null;
  status?: BoardStatus;
  errors?: SymbolRef[];
  eliminated?: SymbolRef[];
  /** Contenuto extra disegnato sopra la griglia, in unità SVG (cella = 100). */
  overlay?: ReactNode;
  /**
   * Posizione del puntatore in coordinate di griglia (cella = 1): mostra un
   * indicatore semitrasparente, e il suo riflesso nei puzzle simmetrici.
   */
  pointer?: Coord | null;
  /** Il puntatore è troppo lontano dalla griglia: l'indicatore si attenua. */
  pointerIdle?: boolean;
  /** Testo alternativo per screen reader. */
  label?: string;
}

const toSvg = (c: Coord) => `${c.x * U},${c.y * U}`;
const CURSOR_R = 22;

/** Converte una posizione del puntatore in coordinate di griglia (cella = 1). */
export function clientToGrid(svg: SVGSVGElement, clientX: number, clientY: number): Coord {
  const m = svg.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
  return { x: p.x / U, y: p.y / U };
}

/**
 * Disegno SVG di un puzzle. Non gestisce input: è usato sia dal
 * visualizzatore sia dall'editor.
 */
export const PuzzleBoard = forwardRef<SVGSVGElement, PuzzleBoardProps>(function PuzzleBoard(
  { puzzle, trace, paths, status = 'idle', errors, eliminated, overlay, pointer: cursor, pointerIdle, label, className, ...rest },
  ref,
) {
  const idx = indexPuzzle(puzzle);
  const { width: w, height: h } = puzzle;
  // `useId` contiene ":" che non va bene dentro `url(#…)`.
  const gradientId = `ep-bg${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const errSet = useMemo(() => new Set((errors ?? []).map(symbolRefKey)), [errors]);
  const elimSet = useMemo(() => new Set((eliminated ?? []).map(symbolRefKey)), [eliminated]);
  const maxPoly = useMemo(() => maxPolyominoSize(puzzle.cells), [puzzle.cells]);
  const symClass = (r: SymbolRef) =>
    errSet.has(symbolRefKey(r)) ? 'ep-sym ep-sym--error' : elimSet.has(symbolRefKey(r)) ? 'ep-sym ep-sym--eliminated' : 'ep-sym';

  // --- lati
  const lines: ReactNode[] = [];
  const edgeType = (x: number, y: number, dir: 'h' | 'v') => idx.edges.get(`${x},${y},${dir}`)?.type;
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x <= w; x++) {
      for (const dir of ['h', 'v'] as const) {
        if (dir === 'h' && x >= w) continue;
        if (dir === 'v' && y >= h) continue;
        const t = edgeType(x, y, dir);
        if (t === 'missing') continue;
        const a = { x, y };
        const b = dir === 'h' ? { x: x + 1, y } : { x, y: y + 1 };
        if (t === 'gap') {
          const k = 0.35;
          const m1 = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
          const m2 = { x: b.x - (b.x - a.x) * k, y: b.y - (b.y - a.y) * k };
          lines.push(<polyline key={`g1${x},${y}${dir}`} points={`${toSvg(a)} ${toSvg(m1)}`} />);
          lines.push(<polyline key={`g2${x},${y}${dir}`} points={`${toSvg(m2)} ${toSvg(b)}`} />);
        } else {
          lines.push(<polyline key={`l${x},${y}${dir}`} points={`${toSvg(a)} ${toSvg(b)}`} />);
        }
      }
    }
  }

  // --- partenze e uscite
  const starts: ReactNode[] = [];
  const ends: ReactNode[] = [];
  for (const p of puzzle.points) {
    if (p.type === 'start') {
      starts.push(<circle key={`s${p.x},${p.y}`} cx={p.x * U} cy={p.y * U} r={START_R} />);
    } else if (p.type === 'end') {
      const d = endDirection(idx, p);
      if (!d) continue;
      const v = DIRECTIONS[d];
      ends.push(
        <polyline
          key={`e${p.x},${p.y}`}
          points={`${p.x * U},${p.y * U} ${(p.x + v.x * EXIT_LENGTH) * U},${(p.y + v.y * EXIT_LENGTH) * U}`}
        />,
      );
    }
  }

  // --- percorsi
  const traces: { pts: Coord[] }[] = [];
  if (trace) {
    const all = [trace, mirrorTrace(idx, trace)].filter(Boolean) as TraceState[];
    for (const t of all) traces.push({ pts: [...t.path, headPosition(t)] });
  } else if (paths) {
    for (const p of paths) {
      const last = p[p.length - 1];
      const d = last ? endDirection(idx, last) : null;
      const exit = d ? { x: last.x + DIRECTIONS[d].x * EXIT_LENGTH, y: last.y + DIRECTIONS[d].y * EXIT_LENGTH } : null;
      traces.push({ pts: exit ? [...p, exit] : p });
    }
  }

  const vb = `${-MARGIN} ${-MARGIN} ${w * U + MARGIN * 2} ${h * U + MARGIN * 2}`;

  // --- sfondo del pannello (se il puzzle ne ha uno, altrimenti il tema)
  const panel = { x: -MARGIN + 6, y: -MARGIN + 6, w: w * U + MARGIN * 2 - 12, h: h * U + MARGIN * 2 - 12 };
  const bg = puzzle.background;
  const gradient =
    bg && bg.colors.length === 2
      ? {
          from: bg.colors[0],
          to: bg.colors[1],
          line: gradientLine(panel.x, panel.y, panel.w, panel.h, bg.angle ?? DEFAULT_BACKGROUND_ANGLE),
        }
      : null;
  const panelFill = gradient ? { fill: `url(#${gradientId})` } : bg ? { fill: bg.colors[0] } : undefined;
  return (
    <svg
      ref={ref}
      viewBox={vb}
      className={`ep-board ep-board--${status}${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={label ?? puzzle.title ?? 'Puzzle'}
      {...rest}
    >
      {gradient && (
        <defs>
          <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" {...gradient.line}>
            <stop offset="0" stopColor={gradient.from} />
            <stop offset="1" stopColor={gradient.to} />
          </linearGradient>
        </defs>
      )}
      <rect
        className="ep-panel"
        x={panel.x}
        y={panel.y}
        width={panel.w}
        height={panel.h}
        rx={18}
        style={panelFill}
      />
      <g className="ep-grid" strokeWidth={LINE} strokeLinecap="round" fill="none">
        {lines}
        {ends}
      </g>
      <g className="ep-starts">{starts}</g>

      <g className="ep-cells">
        {puzzle.cells.map((c) => {
          const ref: SymbolRef = { kind: 'cell', x: c.x, y: c.y };
          return (
            <g key={`c${c.x},${c.y}`} className={symClass(ref)} transform={`translate(${(c.x + 0.5) * U},${(c.y + 0.5) * U})`}>
              <circle className="ep-sym__halo" r={34} />
              <CellSymbol item={c} maxPolySize={maxPoly} />
            </g>
          );
        })}
      </g>

      <g className="ep-paths" fill="none" strokeWidth={LINE} strokeLinecap="round" strokeLinejoin="round">
        {traces.map((t, i) =>
          t.pts.length ? (
            <g key={i} className={i === 1 ? 'ep-path ep-path--mirror' : 'ep-path'}>
              <circle cx={t.pts[0].x * U} cy={t.pts[0].y * U} r={START_R} stroke="none" />
              <polyline points={t.pts.map(toSvg).join(' ')} />
            </g>
          ) : null,
        )}
      </g>

      <g className="ep-hexagons">
        {puzzle.points
          .filter((p) => p.type === 'hexagon')
          .map((p) => {
            const ref: SymbolRef = { kind: 'point', x: p.x, y: p.y };
            return (
              <g key={`hp${p.x},${p.y}`} className={symClass(ref)} transform={`translate(${p.x * U},${p.y * U})`}>
                <circle className="ep-sym__halo" r={18} />
                <Hexagon />
              </g>
            );
          })}
        {puzzle.edges
          .filter((e) => e.type === 'hexagon')
          .map((e) => {
            const ref: SymbolRef = { kind: 'edge', x: e.x, y: e.y, dir: e.dir };
            const cx = (e.x + (e.dir === 'h' ? 0.5 : 0)) * U;
            const cy = (e.y + (e.dir === 'v' ? 0.5 : 0)) * U;
            return (
              <g key={`he${e.x},${e.y},${e.dir}`} className={symClass(ref)} transform={`translate(${cx},${cy})`}>
                <circle className="ep-sym__halo" r={18} />
                <Hexagon />
              </g>
            );
          })}
      </g>
      {cursor && (
        <g className={`ep-cursors${pointerIdle ? ' ep-cursors--idle' : ''}`} pointerEvents="none">
          {puzzle.symmetry !== 'none' && (
            <circle
              className="ep-cursor ep-cursor--mirror"
              cx={reflectPoint(puzzle.symmetry, w, h, cursor).x * U}
              cy={reflectPoint(puzzle.symmetry, w, h, cursor).y * U}
              r={CURSOR_R}
            />
          )}
          <circle className="ep-cursor" cx={cursor.x * U} cy={cursor.y * U} r={CURSOR_R} />
        </g>
      )}
      {overlay}
    </svg>
  );
});
