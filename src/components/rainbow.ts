/**
 * Effetto arcobaleno (solo visivo). I colori dei simboli e dello sfondo
 * diventano `oklch()` con la tinta legata a un angolo animato in CSS
 * (`--ep-rb-el`, `--ep-rb-bg`, vedi theme.css): nessun loop JS.
 *
 * - Elementi: ogni colore base ha una fase fissa. Stessa base → stesso colore
 *   a ogni istante; basi diverse restano sempre distanti almeno 40°.
 * - Sfondo: ruota solo la tinta, luminosità conservata (OKLCH), così il
 *   contrasto con griglia e percorsi resta stabile.
 */
import type { CSSProperties } from 'react';
import {
  type Color,
  type PuzzleBackground,
  type PuzzleRainbow,
  type RainbowLayer,
  contrastRatio,
  hexToOklch,
  oklchToHex,
} from '../engine';

/**
 * Tinta OKLCH di partenza di ogni colore. Passi di 40° nell'ordine delle
 * tinte reali (rosso ≈ 20°, arancio ≈ 54°, giallo ≈ 85°, verde ≈ 149°,
 * ciano ≈ 209°, blu ≈ 263°, magenta ≈ 346°); bianco e nero, che una tinta
 * non ce l'hanno, occupano i due posti liberi.
 */
export const RAINBOW_PHASES: Record<Color, number> = {
  red: 20,
  orange: 60,
  yellow: 100,
  green: 140,
  white: 180,
  cyan: 220,
  blue: 260,
  black: 300,
  magenta: 340,
};
/** Esagoni e ponti: scuri come il nero, ne condividono la fase. */
export const RAINBOW_HEXAGON_PHASE = RAINBOW_PHASES.black;

/** Luminosità e croma dei simboli in arcobaleno (≥ 3:1 sul pannello del tema). */
export const RAINBOW_EL_L = 0.58;
export const RAINBOW_EL_C = 0.16;
/** Croma minima dello sfondo: anche un grigio diventa un pastello. */
export const RAINBOW_BG_MIN_C = 0.05;
/** Pannello del tema (`--ep-panel`), base dello sfondo quando il puzzle non ne ha uno. */
export const DEFAULT_PANEL = '#eef1f5';
/** Con "riduci movimento" il ciclo rallenta molto, senza fermarsi. */
export const reducedPeriod = (period: number) => Math.max(120, period * 8);

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const hue = (angleVar: string, phase: number) => `calc(var(${angleVar}) + ${Math.round(phase)}deg)`;

/** Colore di un simbolo all'angolo `t` del ciclo (in gradi). */
export const elementColorAt = (phase: number, t: number) =>
  oklchToHex({ l: RAINBOW_EL_L, c: RAINBOW_EL_C, h: (phase + t) % 360 });

/** Punto di partenza di un colore di sfondo: luminosità propria, croma minima garantita. */
export function backgroundBase(hex: string) {
  const o = hexToOklch(hex);
  return { l: o.l, c: Math.max(o.c, RAINBOW_BG_MIN_C), h: o.c < 1e-3 ? 250 : o.h };
}

/** Colore di sfondo all'angolo `t` del ciclo. */
export function backgroundColorAt(hex: string, t: number): string {
  const b = backgroundBase(hex);
  return oklchToHex({ ...b, h: (b.h + t) % 360 });
}

/** Colori dello sfondo da far ciclare (quello del tema se il puzzle non ne ha). */
export const rainbowBackgroundColors = (bg?: PuzzleBackground) => bg?.colors ?? [DEFAULT_PANEL];

/** Livelli attivi, per gli indicatori ("elementi", "sfondo"). */
export function rainbowLayers(r?: PuzzleRainbow): ('elements' | 'background')[] {
  const out: ('elements' | 'background')[] = [];
  if (r?.elements) out.push('elements');
  if (r?.background) out.push('background');
  return out;
}

/**
 * Ritardo negativo che allinea un'animazione all'orologio della pagina:
 * elementi montati in momenti diversi (board, contorno della pagina)
 * ciclano in fase.
 */
export function rainbowDelay(period: number, now = performance.now()): string {
  return `${-r3((now / 1000) % period)}s`;
}

function layerVars(prefix: 'el' | 'bg', layer: RainbowLayer, now?: number): Record<string, string> {
  const slow = reducedPeriod(layer.period);
  return {
    [`--ep-rb-${prefix}-dur`]: `${layer.period}s`,
    [`--ep-rb-${prefix}-delay`]: rainbowDelay(layer.period, now),
    [`--ep-rb-${prefix}-dur-rm`]: `${slow}s`,
    [`--ep-rb-${prefix}-delay-rm`]: rainbowDelay(slow, now),
  };
}

/** Variabili CSS dei simboli in arcobaleno. */
export function elementVars(layer: RainbowLayer, now?: number): Record<string, string> {
  const v = layerVars('el', layer, now);
  const oklch = (phase: number) => `oklch(${RAINBOW_EL_L} ${RAINBOW_EL_C} ${hue('--ep-rb-el', phase)})`;
  for (const [c, phase] of Object.entries(RAINBOW_PHASES)) v[`--ep-c-${c}`] = oklch(phase);
  v['--ep-hexagon'] = oklch(RAINBOW_HEXAGON_PHASE);
  return v;
}

/** Variabili CSS dello sfondo in arcobaleno: `--ep-bg-a` e (gradiente) `--ep-bg-b`. */
export function backgroundVars(layer: RainbowLayer, bg?: PuzzleBackground, now?: number): Record<string, string> {
  const v = layerVars('bg', layer, now);
  rainbowBackgroundColors(bg).forEach((hex, i) => {
    const b = backgroundBase(hex);
    v[i ? '--ep-bg-b' : '--ep-bg-a'] = `oklch(${r3(b.l)} ${r3(b.c)} ${hue('--ep-rb-bg', b.h)})`;
  });
  return v;
}

export interface RainbowStyle {
  className: string;
  style: CSSProperties;
}

/**
 * Classi e variabili da applicare all'elemento che anima l'arcobaleno.
 * `null` se il puzzle non ha livelli attivi (o se `only` li esclude).
 */
export function rainbowStyle(
  rainbow: PuzzleRainbow | undefined,
  bg: PuzzleBackground | undefined,
  { only, now }: { only?: 'background'; now?: number } = {},
): RainbowStyle | null {
  const cls: string[] = [];
  let vars: Record<string, string> = {};
  if (rainbow?.elements && only !== 'background') {
    cls.push('ep-rainbow-el');
    vars = { ...vars, ...elementVars(rainbow.elements, now) };
  }
  if (rainbow?.background) {
    cls.push('ep-rainbow-bg');
    vars = { ...vars, ...backgroundVars(rainbow.background, bg, now) };
  }
  return cls.length ? { className: cls.join(' '), style: vars as CSSProperties } : null;
}

/** Sfondo CSS che segue l'arcobaleno (per il contorno della pagina di gioco). */
export function rainbowBackgroundCss(bg?: PuzzleBackground): string {
  if (!bg || bg.colors.length === 1) return 'var(--ep-bg-a)';
  return `linear-gradient(${bg.angle ?? 180}deg, var(--ep-bg-a), var(--ep-bg-b))`;
}

/**
 * Contrasto peggiore di un colore (es. griglia o percorso) sullo sfondo
 * mentre cicla, campionando la tinta ogni 30°.
 */
export function rainbowWorstContrast(color: string, bg?: PuzzleBackground): number {
  let worst = Infinity;
  for (const hex of rainbowBackgroundColors(bg))
    for (let t = 0; t < 360; t += 30) worst = Math.min(worst, contrastRatio(color, backgroundColorAt(hex, t)));
  return worst;
}
