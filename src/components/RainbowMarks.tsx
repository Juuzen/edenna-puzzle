/**
 * Segno statico dell'arcobaleno, per dove l'effetto non si anima (editor,
 * miniature): una piccola ruota cromatica. I colori sono quelli del ciclo
 * vero (elementColorAt), non decorativi.
 */
import { elementColorAt } from './rainbow';

const SEGMENTS = 12;
const STEP = 360 / SEGMENTS;
const WHEEL = Array.from({ length: SEGMENTS }, (_, i) => elementColorAt(0, i * STEP));

const polar = (r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return `${Math.round(r * Math.cos(a) * 100) / 100},${Math.round(r * Math.sin(a) * 100) / 100}`;
};

/** Settori di cerchio (raggio `r1`) centrati nell'origine. */
function Wheel({ r1 }: { r1: number }) {
  return (
    <>
      {WHEEL.map((c, i) => {
        const a = i * STEP;
        const b = a + STEP;
        return <path key={i} d={`M0,0L${polar(r1, a)}A${r1},${r1} 0 0 1 ${polar(r1, b)}Z`} fill={c} />;
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
      <Wheel r1={10} />
      <circle r={3.2} className="ep-rainbow-mark__hub" />
    </svg>
  );
}
