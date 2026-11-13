/**
 * Indicatori statici dell'arcobaleno, per dove l'effetto non si anima
 * (editor in Modifica, miniature): un piccolo segno a ruota cromatica e,
 * sulla board, anelli attorno agli elementi coinvolti e un bordo sul pannello.
 * I colori sono quelli del ciclo vero (elementColorAt), non decorativi.
 */
import { useId, type ReactNode } from 'react';
import type { Puzzle } from '../engine';
import { MARGIN, U } from './Symbols';
import { elementColorAt } from './rainbow';

const SEGMENTS = 12;
const STEP = 360 / SEGMENTS;
const WHEEL = Array.from({ length: SEGMENTS }, (_, i) => elementColorAt(0, i * STEP));

const polar = (r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return `${Math.round(r * Math.cos(a) * 100) / 100},${Math.round(r * Math.sin(a) * 100) / 100}`;
};

/** Settori di corona circolare (raggio interno `r0`, esterno `r1`) centrati nell'origine. */
function Wheel({ r0, r1 }: { r0: number; r1: number }) {
  return (
    <>
      {WHEEL.map((c, i) => {
        const a = i * STEP;
        const b = a + STEP;
        const d =
          r0 > 0
            ? `M${polar(r1, a)}A${r1},${r1} 0 0 1 ${polar(r1, b)}L${polar(r0, b)}A${r0},${r0} 0 0 0 ${polar(r0, a)}Z`
            : `M0,0L${polar(r1, a)}A${r1},${r1} 0 0 1 ${polar(r1, b)}Z`;
        return <path key={i} d={d} fill={c} />;
      })}
    </>
  );
}

/** Segno "arcobaleno attivo": ruota cromatica piena, per testi e miniature. */
export function RainbowMark({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={`ep-rainbow-mark${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="-10 -10 20 20"
      aria-hidden
      focusable="false"
    >
      <Wheel r0={0} r1={10} />
      <circle r={3.2} className="ep-rainbow-mark__hub" />
    </svg>
  );
}

/** Raggi degli anelli (unità SVG, cella = 100). */
const RING = { cell: 33, hexagon: 17, bridge: 41 } as const;
const RING_W = 2.5;

/**
 * Segni da mettere nell'overlay della board in Modifica: anello attorno a
 * simboli, esagoni e ponti (se gli elementi sono in arcobaleno) e bordo del
 * pannello (se lo è lo sfondo). Non toccano i colori base.
 */
export function RainbowBoardMarks({ puzzle }: { puzzle: Puzzle }) {
  const gid = `ep-rbm${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const r = puzzle.rainbow;
  if (!r?.elements && !r?.background) return null;
  const ring = (key: string, x: number, y: number, radius: number) => (
    <g key={key} transform={`translate(${x},${y})`}>
      <Wheel r0={radius - RING_W / 2} r1={radius + RING_W / 2} />
    </g>
  );
  const rings: ReactNode[] = [];
  if (r.elements) {
    for (const c of puzzle.cells) rings.push(ring(`c${c.x},${c.y}`, (c.x + 0.5) * U, (c.y + 0.5) * U, RING.cell));
    for (const p of puzzle.points) {
      if (p.type === 'hexagon') rings.push(ring(`h${p.x},${p.y}`, p.x * U, p.y * U, RING.hexagon));
      if (p.type === 'bridge') rings.push(ring(`b${p.x},${p.y}`, p.x * U, p.y * U, RING.bridge));
    }
    for (const e of puzzle.edges)
      if (e.type === 'hexagon')
        rings.push(
          ring(`e${e.x},${e.y},${e.dir}`, (e.x + (e.dir === 'h' ? 0.5 : 0)) * U, (e.y + (e.dir === 'v' ? 0.5 : 0)) * U, RING.hexagon),
        );
  }
  // Stessa geometria del pannello in PuzzleBoard.
  const panel = { x: -MARGIN + 6, y: -MARGIN + 6, w: puzzle.width * U + MARGIN * 2 - 12, h: puzzle.height * U + MARGIN * 2 - 12 };
  return (
    <g className="ep-rainbow-marks" pointerEvents="none" aria-hidden>
      {r.background && (
        <>
          <defs>
            <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={panel.x} y1={panel.y} x2={panel.x + panel.w} y2={panel.y + panel.h}>
              {WHEEL.map((c, i) => (
                <stop key={i} offset={i / (SEGMENTS - 1)} stopColor={c} />
              ))}
            </linearGradient>
          </defs>
          <rect
            x={panel.x}
            y={panel.y}
            width={panel.w}
            height={panel.h}
            rx={18}
            fill="none"
            stroke={`url(#${gid})`}
            strokeWidth={3}
          />
        </>
      )}
      {rings}
    </g>
  );
}
