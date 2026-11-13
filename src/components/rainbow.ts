/**
 * Effetto arcobaleno (solo visivo). I colori dei simboli e dello sfondo
 * diventano `oklch()` con la tinta legata a un angolo animato in CSS
 * (`--ep-rb-el`, `--ep-rb-bg`, vedi theme.css): nessun loop JS.
 *
 * - Elementi: ogni colore base ha una fase fissa. Stessa base → stesso colore
 *   a ogni istante; basi diverse restano sempre distanti almeno 36°.
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

/** Distanza minima fra le fasi di partenza, in gradi (10 posizioni su 360°). */
export const RAINBOW_PHASE_STEP = 36;

/**
 * Tinta OKLCH di partenza di ogni colore: 10 posizioni a passi di 36°, nell'ordine
 * delle tinte reali (rosso ≈ 20°, arancio ≈ 54°, giallo ≈ 85°, verde ≈ 149°,
 * ciano ≈ 209°, blu ≈ 263°, magenta ≈ 346°), ognuno a meno di 15° dalla propria.
 * Bianco e nero, che una tinta non ce l'hanno, occupano due posti liberi.
 */
export const RAINBOW_PHASES: Record<Color, number> = {
  red: 14,
  orange: 50,
  yellow: 86,
  white: 122,
  green: 158,
  cyan: 194,
  black: 230,
  blue: 266,
  magenta: 338,
};
/** Esagoni e ponti hanno un punto di partenza tutto loro, diverso da ogni colore. */
export const RAINBOW_HEXAGON_PHASE = 302;

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
 * Allinea le animazioni arcobaleno di un elemento all'origine della
 * timeline del documento: elementi montati in momenti diversi (board,
 * contorno della pagina, board rimontata) ciclano in fase. Il tempo di
 * partenza resta valido anche se cambiano durata o "riduci movimento".
 */
export function syncRainbowClock(el: Element | null): void {
  if (!el || typeof el.getAnimations !== 'function' || typeof CSSAnimation === 'undefined') return;
  for (const a of el.getAnimations())
    if (a instanceof CSSAnimation && a.animationName.startsWith('ep-rainbow') && a.startTime !== 0) a.startTime = 0;
}

function layerVars(prefix: 'el' | 'bg', layer: RainbowLayer): Record<string, string> {
  return {
    [`--ep-rb-${prefix}-dur`]: `${layer.period}s`,
    [`--ep-rb-${prefix}-dur-rm`]: `${reducedPeriod(layer.period)}s`,
  };
}

/** Variabili CSS dei simboli in arcobaleno. */
export function elementVars(layer: RainbowLayer): Record<string, string> {
  const v = layerVars('el', layer);
  const oklch = (phase: number) => `oklch(${RAINBOW_EL_L} ${RAINBOW_EL_C} ${hue('--ep-rb-el', phase)})`;
  for (const [c, phase] of Object.entries(RAINBOW_PHASES)) v[`--ep-c-${c}`] = oklch(phase);
  v['--ep-hexagon'] = oklch(RAINBOW_HEXAGON_PHASE);
  return v;
}

/** Variabili CSS dello sfondo in arcobaleno: `--ep-bg-a` e (gradiente) `--ep-bg-b`. */
export function backgroundVars(layer: RainbowLayer, bg?: PuzzleBackground): Record<string, string> {
  const v = layerVars('bg', layer);
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
  { only }: { only?: 'background' } = {},
): RainbowStyle | null {
  const cls: string[] = [];
  let vars: Record<string, string> = {};
  if (rainbow?.elements && only !== 'background') {
    cls.push('ep-rainbow-el');
    vars = { ...vars, ...elementVars(rainbow.elements) };
  }
  if (rainbow?.background) {
    cls.push('ep-rainbow-bg');
    vars = { ...vars, ...backgroundVars(rainbow.background, bg) };
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
