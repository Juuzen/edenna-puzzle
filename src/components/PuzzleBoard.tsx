import { forwardRef, useCallback, useId, useLayoutEffect, useMemo, useRef, type ReactNode, type SVGProps } from 'react';
import { gradientLine, paletteCssVars } from './background';
import { rainbowStyle, syncRainbowClock } from './rainbow';
import {
  DEFAULT_BACKGROUND_ANGLE,
  type Coord,
  type Path,
  type Puzzle,
  type SymbolRef,
  DIRECTIONS,
  endDirection,
  hasShift,
  indexPuzzle,
  reflectPoint,
  symbolRefKey,
} from '../engine';
import { boardFrame, shiftGeometry, shiftTransform, wrapTiles } from './shift';
import { Bridge, CellSymbol, Hexagon, LINE, OVERPASS_BORDER, START_R, U, maxPolyominoSize } from './Symbols';
import { EXIT_LENGTH, type TraceState, bridgeOverpasses, headPosition, mirrorTrace } from './tracing';

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
  /**
   * Fa ciclare i colori se il puzzle ha `rainbow` (prova e gioco). Senza,
   * il disegno resta statico con i colori base (editor, miniature).
   */
  animateRainbow?: boolean;
  /**
   * Disegna la griglia spostata e ruotata se il puzzle ha `shift` (prova e
   * gioco). Le regole non cambiano; per l'input da puntatore vedi
   * `visualToGridCandidates` in shift.ts. Senza, la griglia è dritta
   * (editor, miniature).
   */
  applyShift?: boolean;
}

/** Raggio degli angoli del pannello. */
const PANEL_RADIUS = 18;

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
  {
    puzzle,
    trace,
    paths,
    status = 'idle',
    errors,
    eliminated,
    overlay,
    pointer: cursor,
    pointerIdle,
    label,
    animateRainbow,
    applyShift,
    className,
    ...rest
  },
  ref,
) {
  const idx = indexPuzzle(puzzle);
  const { width: w, height: h } = puzzle;
  // `useId` contiene ":" che non va bene dentro `url(#…)`.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const gradientId = `ep-bg${uid}`;
  const clipId = `ep-clip${uid}`;
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

  // --- percorsi (con i tratti che passano sopra un ponte la seconda volta)
  const traces: { pts: Coord[]; over: Coord[][] }[] = [];
  const addTrace = (path: Coord[], tail: Coord | null) =>
    traces.push({ pts: tail ? [...path, tail] : path, over: bridgeOverpasses(idx, path, tail) });
  if (trace) {
    const all = [trace, mirrorTrace(idx, trace)].filter(Boolean) as TraceState[];
    for (const t of all) addTrace(t.path, headPosition(t));
  } else if (paths) {
    for (const p of paths) {
      const last = p[p.length - 1];
      const d = last ? endDirection(idx, last) : null;
      const exit = d ? { x: last.x + DIRECTIONS[d].x * EXIT_LENGTH, y: last.y + DIRECTIONS[d].y * EXIT_LENGTH } : null;
      addTrace(p, exit);
    }
  }

  // --- contenitore quadrato, con la griglia al centro
  const frame = boardFrame(w, h);
  const vb = frame.viewBox;

  // --- sfondo del pannello (se il puzzle ne ha uno, altrimenti il tema)
  const panel = frame.panel;
  const bg = puzzle.background;
  const gradient =
    bg && bg.colors.length === 2
      ? {
          from: bg.colors[0],
          to: bg.colors[1],
          line: gradientLine(panel.x, panel.y, panel.w, panel.h, bg.angle ?? DEFAULT_BACKGROUND_ANGLE),
        }
      : null;
  // Arcobaleno: variabili oklch() animate in CSS, allineate all'orologio
  // della pagina dopo ogni cambio di configurazione.
  const rbEl = animateRainbow ? puzzle.rainbow?.elements?.period : undefined;
  const rbBg = animateRainbow ? puzzle.rainbow?.background?.period : undefined;
  const rainbow = useMemo(
    () =>
      rainbowStyle(
        { ...(rbEl ? { elements: { period: rbEl } } : {}), ...(rbBg ? { background: { period: rbBg } } : {}) },
        bg,
      ),
    [rbEl, rbBg, bg?.colors[0], bg?.colors[1]],
  );
  const rbBackground = !!rbBg;
  const svgEl = useRef<SVGSVGElement | null>(null);
  const setRef = useCallback(
    (el: SVGSVGElement | null) => {
      svgEl.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );
  useLayoutEffect(() => syncRainbowClock(svgEl.current), [rainbow]);
  const panelFill = gradient
    ? { fill: `url(#${gradientId})` }
    : rbBackground
      ? { fill: 'var(--ep-bg-a)' }
      : bg
        ? { fill: bg.colors[0] }
        : undefined;
  // Colori di griglia e percorsi: sovrascrivono le variabili del tema, ma
  // solo se il puzzle ha anche uno sfondo proprio.
  const paletteVars = bg ? paletteCssVars(puzzle.palette) : undefined;
  const style =
    paletteVars || rainbow ? { ...paletteVars, ...rainbow?.style, ...rest.style } : rest.style;
  const classes = ['ep-board', `ep-board--${status}`, rainbow?.className, className].filter(Boolean).join(' ');
  // Sfalsamento (solo visivo, solo se richiesto): copie trasformate e
  // ritagliate dal pannello, così ciò che esce da un lato rientra dall'altro.
  const shifted = !!applyShift && hasShift(puzzle);
  const geo = shifted ? shiftGeometry(frame, puzzle.shift) : null;
  const tiles = geo ? wrapTiles(frame, geo, w, h) : null;
  const panelRect = { x: panel.x, y: panel.y, width: panel.w, height: panel.h, rx: PANEL_RADIUS };

  const content = (
    <>
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
              {t.over.map((o, j) => (
                <g key={j} strokeLinecap="butt">
                  {/* Bordo del colore del pannello: si vede che una linea passa sull'altra. */}
                  <polyline
                    className="ep-path__under"
                    points={o.map(toSvg).join(' ')}
                    strokeWidth={LINE + 2 * OVERPASS_BORDER}
                    style={{ stroke: panelFill?.fill ?? 'var(--ep-panel)' }}
                  />
                  <polyline points={o.map(toSvg).join(' ')} />
                </g>
              ))}
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
      <g className="ep-bridges">
        {puzzle.points
          .filter((p) => p.type === 'bridge')
          .map((p) => (
            <g key={`b${p.x},${p.y}`} transform={`translate(${p.x * U},${p.y * U})`}>
              <Bridge />
            </g>
          ))}
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
    </>
  );

  return (
    <svg
      ref={setRef}
      viewBox={vb}
      className={classes}
      role="img"
      aria-label={label ?? puzzle.title ?? 'Puzzle'}
      {...(shifted ? { 'aria-description': 'Griglia sfalsata: si gioca con mouse o touch.' } : {})}
      {...rest}
      style={style}
    >
      {(gradient || tiles) && (
        <defs>
          {gradient && (
            <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" {...gradient.line}>
              <stop offset="0" style={{ stopColor: rbBackground ? 'var(--ep-bg-a)' : gradient.from }} />
              <stop offset="1" style={{ stopColor: rbBackground ? 'var(--ep-bg-b)' : gradient.to }} />
            </linearGradient>
          )}
          {tiles && (
            <clipPath id={clipId}>
              <rect {...panelRect} />
            </clipPath>
          )}
        </defs>
      )}
      <rect className="ep-panel" {...panelRect} style={panelFill} />
      {geo && tiles ? (
        <>
          <g className="ep-shift" clipPath={`url(#${clipId})`}>
            {tiles.map(([i, j]) => (
              <g key={`${i},${j}`} transform={shiftTransform(frame, geo, i, j)}>
                {content}
              </g>
            ))}
          </g>
          {/* Bordo sopra le copie: i tagli dell'avvolgimento coincidono con il bordo. */}
          <rect className="ep-panel ep-panel--edge" {...panelRect} style={{ fill: 'none' }} pointerEvents="none" />
        </>
      ) : (
        content
      )}
    </svg>
  );
});
