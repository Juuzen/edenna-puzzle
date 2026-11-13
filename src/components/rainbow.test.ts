import { describe, expect, it } from 'vitest';
import { COLORS, contrastRatio, hexToOklch } from '../engine';
import {
  DEFAULT_PANEL,
  RAINBOW_HEXAGON_PHASE,
  RAINBOW_PHASES,
  RAINBOW_PHASE_STEP,
  backgroundColorAt,
  elementColorAt,
  rainbowLayers,
  rainbowStyle,
  rainbowWorstContrast,
  reducedPeriod,
} from './rainbow';

/** Colori del tema (theme.css). */
const THEME: Record<string, string> = {
  black: '#1c222b',
  white: '#ffffff',
  cyan: '#12b5c9',
  magenta: '#c2358f',
  yellow: '#e9b322',
  red: '#d4384a',
  green: '#2fa652',
  blue: '#2f63d8',
  orange: '#ef7d1a',
};
const dist = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

describe('fasi degli elementi', () => {
  it('una fase per colore più una per esagoni e ponti, tutte distanti almeno 36°', () => {
    expect(Object.keys(RAINBOW_PHASES).sort()).toEqual([...COLORS].sort());
    const phases = [...Object.values(RAINBOW_PHASES), RAINBOW_HEXAGON_PHASE];
    expect(new Set(phases).size).toBe(phases.length);
    for (let i = 0; i < phases.length; i++)
      for (let j = i + 1; j < phases.length; j++)
        expect(dist(phases[i], phases[j])).toBeGreaterThanOrEqual(RAINBOW_PHASE_STEP);
  });

  it('i colori con una tinta partono vicino alla propria', () => {
    for (const [c, hex] of Object.entries(THEME)) {
      if (c === 'black' || c === 'white') continue;
      expect(dist(RAINBOW_PHASES[c as keyof typeof RAINBOW_PHASES], hexToOklch(hex).h)).toBeLessThanOrEqual(15);
    }
  });

  it('sempre ben visibili sul pannello del tema (≥ 3:1)', () => {
    for (let t = 0; t < 360; t += 10) expect(contrastRatio(elementColorAt(0, t), DEFAULT_PANEL)).toBeGreaterThanOrEqual(3);
  });
});

describe('sfondo', () => {
  it('conserva la luminosità e colora anche i grigi', () => {
    const base = hexToOklch('#1e3a5f');
    for (let t = 0; t < 360; t += 45) expect(hexToOklch(backgroundColorAt('#1e3a5f', t)).l).toBeCloseTo(base.l, 1);
    expect(hexToOklch(backgroundColorAt(DEFAULT_PANEL, 90)).c).toBeGreaterThan(0.03);
  });

  it('contrasto peggiore della griglia del tema ancora sufficiente', () => {
    expect(rainbowWorstContrast('#b9c3cf')).toBeGreaterThan(1.3);
    expect(rainbowWorstContrast('#1f5fd6')).toBeGreaterThanOrEqual(3);
  });
});

describe('stile e orologio', () => {
  it('classi e variabili solo per i livelli attivi', () => {
    expect(rainbowStyle(undefined, undefined)).toBeNull();
    expect(rainbowStyle({}, undefined)).toBeNull();
    const el = rainbowStyle({ elements: { period: 5 } }, undefined)!;
    expect(el.className).toBe('ep-rainbow-el');
    const vars = el.style as Record<string, string>;
    expect(vars['--ep-c-red']).toContain('var(--ep-rb-el)');
    // Esagoni e ponti non condividono il punto di partenza con nessun colore.
    for (const c of COLORS) expect(vars['--ep-hexagon']).not.toBe(vars[`--ep-c-${c}`]);
    expect(vars['--ep-hexagon']).toContain(`+ ${RAINBOW_HEXAGON_PHASE}deg`);
    expect(vars['--ep-bg-a']).toBeUndefined();
    const both = rainbowStyle({ elements: { period: 5 }, background: { period: 9 } }, { colors: ['#000000', '#ffffff'] })!;
    expect(both.className).toBe('ep-rainbow-el ep-rainbow-bg');
    expect((both.style as Record<string, string>)['--ep-bg-b']).toContain('var(--ep-rb-bg)');
    expect(rainbowStyle({ elements: { period: 5 } }, undefined, { only: 'background' })).toBeNull();
    expect(rainbowLayers({ background: { period: 3 } })).toEqual(['background']);
  });

  it('durate normali e con movimento ridotto', () => {
    const vars = rainbowStyle({ elements: { period: 6 } }, undefined)!.style as Record<string, string>;
    expect(vars['--ep-rb-el-dur']).toBe('6s');
    expect(vars['--ep-rb-el-dur-rm']).toBe('120s');
    expect(reducedPeriod(4)).toBe(120);
    expect(reducedPeriod(30)).toBe(240);
  });
});
