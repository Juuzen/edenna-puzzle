/**
 * Colori e contrasto (WCAG 2.x), senza dipendenze. Serve all'editor per
 * consigliare colori di griglia e percorsi ben visibili su uno sfondo.
 */
import type { PuzzleBackground, PuzzlePalette } from './types';

export interface RGB {
  r: number;
  g: number;
  b: number;
}
export interface HSL {
  /** 0–360 */
  h: number;
  /** 0–1 */
  s: number;
  /** 0–1 */
  l: number;
}

export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (!/^[0-9a-f]{6}$/i.test(h) || Number.isNaN(n)) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

export const hexToHsl = (hex: string) => rgbToHsl(hexToRgb(hex));
export const hslToHex = (hsl: HSL) => rgbToHex(hslToRgb(hsl));

/** Mescola due colori (t = 0 → a, t = 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex({ r: A.r + (B.r - A.r) * t, g: A.g + (B.g - A.g) * t, b: A.b + (B.b - A.b) * t });
}

/** `rgba(...)` da un colore esadecimale. */
export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Luminanza relativa WCAG. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Rapporto di contrasto WCAG, da 1 a 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Distanza fra le tinte di due colori, in gradi (0–180). */
export function hueDistance(a: string, b: string): number {
  const d = Math.abs(hexToHsl(a).h - hexToHsl(b).h) % 360;
  return d > 180 ? 360 - d : d;
}

/** Colori dello sfondo da controllare: estremi e punto medio del gradiente. */
export function backgroundSamples(bg: PuzzleBackground): string[] {
  if (bg.colors.length === 1) return [bg.colors[0]];
  const [a, b] = bg.colors;
  return [a, mix(a, b, 0.25), mix(a, b, 0.5), mix(a, b, 0.75), b];
}

/** Contrasto nel punto peggiore dello sfondo. */
export function minContrast(color: string, bg: PuzzleBackground): number {
  return Math.min(...backgroundSamples(bg).map((c) => contrastRatio(color, c)));
}

// ---------------------------------------------------------------------------
// Soglie e controlli

export type ColorRole = keyof Required<PuzzlePalette>;

/**
 * Soglie di contrasto sullo sfondo.
 * - griglia: deve vedersi ma restare discreta (i temi inclusi sono ~1.6:1);
 * - percorsi: 3:1, il minimo WCAG per gli elementi grafici (1.4.11).
 */
export const CONTRAST_TARGETS: Record<ColorRole, { min: number; good: number; aim: number }> = {
  line: { min: 1.5, good: 2, aim: 2.3 },
  path: { min: 3, good: 3, aim: 4.2 },
  success: { min: 3, good: 3, aim: 4.2 },
};
/** Il percorso scorre sopra la griglia: deve staccarsene. */
export const PATH_ON_LINE_MIN = 1.5;
/** Il percorso risolto deve distinguersi da quello in tracciamento. */
export const SUCCESS_HUE_MIN = 30;
export const SUCCESS_CONTRAST_MIN = 1.3;

export type ContrastLevel = 'good' | 'low' | 'bad';

export interface ColorCheck {
  /** Contrasto sullo sfondo, nel punto peggiore. */
  ratio: number;
  level: ContrastLevel;
  /** Motivi leggibili quando il livello non è "good". */
  issues: string[];
}

const worse = (a: ContrastLevel, b: ContrastLevel): ContrastLevel =>
  a === 'bad' || b === 'bad' ? 'bad' : a === 'low' || b === 'low' ? 'low' : 'good';

/** Controlla un colore nel suo ruolo, rispetto allo sfondo e agli altri colori. */
export function checkColor(
  bg: PuzzleBackground,
  role: ColorRole,
  color: string,
  others: PuzzlePalette = {},
): ColorCheck {
  const t = CONTRAST_TARGETS[role];
  const ratio = minContrast(color, bg);
  let level: ContrastLevel = ratio >= t.good ? 'good' : ratio >= t.min ? 'low' : 'bad';
  const issues: string[] = [];
  if (level === 'bad') issues.push('poco visibile sullo sfondo');
  else if (level === 'low') issues.push('contrasto con lo sfondo basso');
  if ((role === 'path' || role === 'success') && others.line && contrastRatio(color, others.line) < PATH_ON_LINE_MIN) {
    level = worse(level, 'low');
    issues.push('si confonde con la griglia');
  }
  if (role === 'success' && others.path && !distinctFromPath(color, others.path)) {
    level = worse(level, 'low');
    issues.push('troppo simile al percorso in tracciamento');
  }
  return { ratio, level, issues };
}

function distinctFromPath(success: string, path: string) {
  const hp = hexToHsl(path);
  const hs = hexToHsl(success);
  // Fra due grigi la tinta non conta: decide il contrasto.
  const hueOk = hp.s > 0.15 && hs.s > 0.15 && hueDistance(success, path) >= SUCCESS_HUE_MIN;
  return hueOk || contrastRatio(success, path) >= SUCCESS_CONTRAST_MIN;
}

// ---------------------------------------------------------------------------
// Suggerimenti

export interface ColorSuggestion {
  color: string;
  /** Contrasto sullo sfondo, nel punto peggiore. */
  ratio: number;
  level: ContrastLevel;
}

/**
 * Tinte e saturazioni candidate per ruolo (oltre a quelle derivate dallo
 * sfondo). `aim` sostituisce l'obiettivo del ruolo: per la griglia si
 * propongono intensità diverse (tenue, standard, marcata) più che tinte.
 */
const ROLE_TONES: Record<ColorRole, { h: number; s: number; aim?: number }[]> = {
  line: [
    { h: 215, s: 0.14 },
    { h: 215, s: 0.14, aim: 1.8 },
    { h: 215, s: 0.14, aim: 3 },
    { h: 40, s: 0.14 },
  ],
  path: [
    { h: 218, s: 0.78 },
    { h: 265, s: 0.7 },
    { h: 330, s: 0.7 },
    { h: 30, s: 0.85 },
    { h: 190, s: 0.75 },
  ],
  success: [
    { h: 170, s: 0.75 },
    { h: 140, s: 0.65 },
    { h: 45, s: 0.85 },
    { h: 195, s: 0.75 },
  ],
};

/**
 * Colori consigliati per un ruolo su uno sfondo, dal migliore. Per ogni tinta
 * candidata si sceglie la luminosità che porta il contrasto (nel punto
 * peggiore dello sfondo) più vicino all'obiettivo del ruolo, rispettando i
 * vincoli con gli altri colori: colori armonici, non bianco o nero per forza.
 * Se lo sfondo non permette di raggiungere la soglia (es. gradiente dal
 * bianco al nero) si propone il massimo possibile.
 */
export function suggestColors(
  bg: PuzzleBackground,
  role: ColorRole,
  others: PuzzlePalette = {},
  count = 4,
): ColorSuggestion[] {
  const t = CONTRAST_TARGETS[role];
  // Copie: i toni vengono adattati allo sfondo qui sotto.
  const tones = ROLE_TONES[role].map((tone) => ({ ...tone }));
  // Tinte derivate dallo sfondo (se non è un grigio).
  const base = hexToHsl(bg.colors[0]);
  if (base.s > 0.12) {
    if (role === 'line') {
      // Grigi intonati allo sfondo al posto di quelli freddi.
      for (const tone of tones) if (tone.h === 215) Object.assign(tone, { h: base.h, s: Math.min(0.25, base.s * 0.4) });
    }
    else tones.push({ h: (base.h + 180) % 360, s: 0.7 });
  }

  const valid = (c: string) => {
    if ((role === 'path' || role === 'success') && others.line && contrastRatio(c, others.line) < PATH_ON_LINE_MIN)
      return false;
    if (role === 'success' && others.path && !distinctFromPath(c, others.path)) return false;
    return true;
  };

  const picks: ColorSuggestion[] = [];
  for (const tone of tones) {
    const aim = tone.aim ?? t.aim;
    let best: { color: string; ratio: number; score: number } | null = null;
    for (let i = 4; i <= 96; i++) {
      const color = hslToHex({ h: tone.h, s: tone.s, l: i / 100 });
      if (!valid(color)) continue;
      const ratio = minContrast(color, bg);
      // Sopra l'obiettivo: il più vicino. Sotto: penalizzato, vince il più alto.
      const score = ratio >= aim ? ratio - aim : 100 + (aim - ratio);
      if (!best || score < best.score) best = { color, ratio, score };
    }
    if (!best) continue;
    const dup = picks.some((p) => looksSame(p.color, best!.color));
    if (dup) continue;
    const level: ContrastLevel = best.ratio >= t.good ? 'good' : best.ratio >= t.min ? 'low' : 'bad';
    picks.push({ color: best.color, ratio: Math.round(best.ratio * 100) / 100, level });
  }
  // Rete di sicurezza: bianco e nero, solo se le tinte non bastano (per la
  // griglia sarebbero troppo forti).
  for (const color of role === 'line' ? [] : ['#ffffff', '#000000']) {
    if (picks.length >= Math.min(count, 2)) break;
    if (!valid(color) || picks.some((p) => p.color === color)) continue;
    const ratio = minContrast(color, bg);
    if (ratio >= t.min) picks.push({ color, ratio: Math.round(ratio * 100) / 100, level: ratio >= t.good ? 'good' : 'low' });
  }
  const rank = { good: 0, low: 1, bad: 2 };
  // Ordinamento stabile: prima i validi, poi l'ordine di preferenza delle tinte.
  return picks
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank[a.p.level] - rank[b.p.level] || a.i - b.i)
    .slice(0, count)
    .map((x) => x.p);
}

/** Due colori che a occhio si confondono (es. quasi-neri di tinta diversa). */
function looksSame(a: string, b: string): boolean {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const dist = Math.hypot(A.r - B.r, A.g - B.g, A.b - B.b);
  const la = hexToHsl(a).l;
  const lb = hexToHsl(b).l;
  const extreme = (la < 0.15 && lb < 0.15) || (la > 0.88 && lb > 0.88);
  return (extreme && dist < 48) || (contrastRatio(a, b) < 1.08 && hueDistance(a, b) < 20);
}

/** Palette completa e coerente: griglia, poi percorso su di essa, poi soluzione. */
export function suggestPalette(bg: PuzzleBackground): Required<PuzzlePalette> {
  const line = suggestColors(bg, 'line', {}, 1)[0]?.color ?? '#808080';
  const path = suggestColors(bg, 'path', { line }, 1)[0]?.color ?? '#ffffff';
  const success = suggestColors(bg, 'success', { line, path }, 1)[0]?.color ?? '#000000';
  return { line, path, success };
}
