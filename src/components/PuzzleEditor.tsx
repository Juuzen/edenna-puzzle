import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import {
  COLORS,
  MAX_SIZE,
  type Color,
  DIRECTIONS,
  type Path,
  type Puzzle,
  type PuzzleBackground,
  type PuzzlePalette,
  type PuzzleRainbow,
  type RainbowLayer,
  type ColorRole,
  type ContrastLevel,
  CONTRAST_TARGETS,
  DEFAULT_BACKGROUND_ANGLE,
  RAINBOW_PERIOD_MAX,
  RAINBOW_PERIOD_MIN,
  checkColor,
  normalizeAngle,
  normalizeHexColor,
  suggestColors,
  suggestPalette,
  type SolveResult,
  type Symmetry,
  type ValidationResult,
  autoEndDirection,
  createPuzzle,
  endDirection,
  getPoint,
  indexPuzzle,
  parsePuzzleSet,
  resizePuzzle,
  serializePuzzle,
  setSymmetry,
  solve,
  validate,
  PuzzleFormatError,
} from '../engine';
import {
  DEFAULT_TOOL,
  SHAPE_PRESETS,
  SHAPE_SIZE,
  type Target,
  type ToolKind,
  type ToolState,
  applyTool,
  bridgeLossNotice,
  bridgeProblem,
  emptyShape,
  hitTest,
  initialLattice,
  isAlreadyThere,
  itemLossNotice,
  keepId,
  latticeTarget,
  moveLattice,
  nextEndDirection,
  pickEndDirection,
  shapeFromRows,
  shouldReset,
  targetKey,
  toolCellItem,
  toolTargets,
} from './editorTools';
import { PuzzleBoard, clientToGrid } from './PuzzleBoard';
import { PuzzlePlayer } from './PuzzlePlayer';
import { Bridge, CellSymbol, Hexagon, LINE, START_R, U, colorVar } from './Symbols';
import { EXIT_LENGTH } from './tracing';
import { backgroundCss } from './background';
import { downloadText, slugify } from './collectionOps';
import { rainbowLayers, rainbowWorstContrast } from './rainbow';
import { RainbowBoardMarks, RainbowMark } from './RainbowMarks';

export interface PuzzleEditorProps {
  /** Puzzle iniziale (non controllato). */
  defaultValue?: Puzzle;
  /** Puzzle controllato: se cambia dall'esterno l'editor lo carica. */
  value?: Puzzle;
  onChange?: (p: Puzzle) => void;
  /**
   * Se il file importato contiene più puzzle, li passa qui. Senza questo
   * handler viene caricato solo il primo.
   */
  onImportSet?: (puzzles: Puzzle[]) => void;
  className?: string;
}

const SYMMETRY_LABELS: Record<Symmetry, string> = {
  none: 'Nessuna',
  horizontal: 'Orizzontale',
  vertical: 'Verticale',
  rotational: 'Rotazionale',
};

const COLOR_LABELS: Record<Color, string> = {
  black: 'Nero',
  white: 'Bianco',
  cyan: 'Ciano',
  magenta: 'Magenta',
  yellow: 'Giallo',
  red: 'Rosso',
  green: 'Verde',
  blue: 'Blu',
  orange: 'Arancione',
};

interface ToolDef {
  kind: ToolKind;
  label: string;
  hint: string;
}
const TOOL_GROUPS: { title: string; tools: ToolDef[] }[] = [
  {
    title: 'Punti',
    tools: [
      { kind: 'start', label: 'Partenza', hint: 'Clic su un incrocio' },
      { kind: 'end', label: 'Uscita', hint: 'Sul bordo o accanto a un lato assente: avvicina il puntatore al lato verso cui deve uscire (R per ruotare)' },
      { kind: 'hexagon', label: 'Esagono', hint: 'Su incrocio o lato: il percorso ci deve passare' },
      { kind: 'bridge', label: 'Ponte', hint: 'Incrocio interno con 4 lati: il percorso può passarci due volte, sempre dritto' },
    ],
  },
  {
    title: 'Lati',
    tools: [
      { kind: 'gap', label: 'Interrotto', hint: 'Lato spezzato, non percorribile' },
      { kind: 'missing', label: 'Senza lato', hint: 'Toglie del tutto il lato (trascina per più lati)' },
    ],
  },
  {
    title: 'Celle',
    tools: [
      { kind: 'square', label: 'Quadrato', hint: 'Colori diversi in regioni diverse' },
      { kind: 'star', label: 'Stella', hint: 'Esattamente due simboli del suo colore nella regione' },
      { kind: 'polyomino', label: 'Poliomino', hint: 'La regione deve avere questa forma' },
      { kind: 'eliminator', label: 'Eliminatore', hint: 'Annulla un altro simbolo della regione' },
      { kind: 'triangle', label: 'Triangoli', hint: 'Quanti lati della cella percorrere' },
    ],
  },
  { title: 'Altro', tools: [{ kind: 'erase', label: 'Gomma', hint: 'Cancella qualsiasi elemento' }] },
];

const TOOL_LIST = TOOL_GROUPS.flatMap((g) => g.tools);
/** Tasti 1–9 e 0 per i primi dieci strumenti, nell'ordine della palette. */
const TOOL_KEYS = '1234567890';
const toolKey = (kind: ToolKind): string | undefined => {
  const i = TOOL_LIST.findIndex((t) => t.kind === kind);
  return i >= 0 && i < TOOL_KEYS.length ? TOOL_KEYS[i] : undefined;
};

const usesColor = (k: ToolKind) => k === 'square' || k === 'star' || k === 'eliminator' || k === 'triangle';

// ---------------------------------------------------------------------------
// Cronologia (annulla/ripeti)

function useHistory(initial: Puzzle) {
  const [state, setState] = useState({ past: [] as Puzzle[], present: initial, future: [] as Puzzle[] });
  const push = useCallback((p: Puzzle, coalesce = false) => {
    setState((s) =>
      p === s.present
        ? s
        : { past: coalesce ? s.past : [...s.past.slice(-199), s.present], present: p, future: [] },
    );
  }, []);
  const undo = useCallback(() => {
    setState((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s));
  }, []);
  const redo = useCallback(() => {
    setState((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s));
  }, []);
  const reset = useCallback((p: Puzzle) => setState({ past: [], present: p, future: [] }), []);
  return { ...state, push, undo, redo, reset, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}

// ---------------------------------------------------------------------------

const DEFAULT_BG_COLORS: [string, string] = ['#eef1f5', '#c9d6e8'];
const ANGLE_PRESETS: { angle: number; label: string; title: string }[] = [
  { angle: 180, label: '↓', title: 'Dall’alto in basso' },
  { angle: 90, label: '→', title: 'Da sinistra a destra' },
  { angle: 135, label: '↘', title: 'Diagonale verso il basso' },
  { angle: 45, label: '↗', title: 'Diagonale verso l’alto' },
];

const PALETTE_ROLES: { role: ColorRole; label: string }[] = [
  { role: 'line', label: 'Griglia' },
  { role: 'path', label: 'Tracciamento' },
  { role: 'success', label: 'Risolto' },
];

/** Colori predefiniti, letti dalle variabili CSS di `el`. */
function readThemeColors(el: Element | null): Required<PuzzlePalette> {
  const fallback = { line: '#b9c3cf', path: '#1f5fd6', success: '#0f9b8e' };
  if (!el) return fallback;
  const css = getComputedStyle(el);
  const get = (name: string, def: string) => normalizeHexColor(css.getPropertyValue(name)) ?? def;
  return {
    line: get('--ep-line', fallback.line),
    path: get('--ep-path', fallback.path),
    success: get('--ep-success', fallback.success),
  };
}

const LEVEL_TEXT: Record<ContrastLevel, string> = { good: 'Buono', low: 'Basso', bad: 'Insufficiente' };

/**
 * Colori di griglia e percorsi con contrasto e colori consigliati per lo
 * sfondo scelto. I suggerimenti si applicano solo con un clic.
 */
function PaletteControls({
  background,
  palette,
  themeColors,
  onChange,
  settle,
}: {
  background: PuzzleBackground;
  palette?: PuzzlePalette;
  themeColors: Required<PuzzlePalette>;
  onChange: (p: PuzzlePalette | undefined, continuous: boolean) => void;
  settle: { onBlur: () => void; onPointerUp: () => void; onKeyUp: () => void };
}) {
  const eff: Required<PuzzlePalette> = { ...themeColors, ...palette };
  const set = (role: ColorRole, color: string | undefined, continuous: boolean) => {
    const next: PuzzlePalette = { ...palette };
    if (color) next[role] = color;
    else delete next[role];
    onChange(Object.keys(next).length ? next : undefined, continuous);
  };
  const others = (role: ColorRole): PuzzlePalette =>
    role === 'line' ? {} : role === 'path' ? { line: eff.line } : { line: eff.line, path: eff.path };
  const rows = PALETTE_ROLES.map((r) => ({
    ...r,
    color: eff[r.role],
    custom: !!palette?.[r.role],
    check: checkColor(background, r.role, eff[r.role], others(r.role)),
    suggestions: suggestColors(background, r.role, others(r.role)),
  }));
  const problems = rows.filter((r) => r.check.level !== 'good');

  return (
    <div className="ep-palette">
      {rows.map((r) => (
        <div key={r.role} className="ep-palette__row">
          <div className="ep-palette__main">
            <input
              type="color"
              value={r.color}
              aria-label={`Colore ${r.label.toLowerCase()}`}
              onChange={(e) => set(r.role, e.target.value, true)}
              {...settle}
            />
            <span className="ep-palette__label">
              {r.label}
              {!r.custom && <span className="ep-muted"> · predefinito</span>}
            </span>
            <span
              className={`ep-contrast ep-contrast--${r.check.level}`}
              title={`Contrasto con lo sfondo (nel punto peggiore): ${LEVEL_TEXT[r.check.level].toLowerCase()}. Minimo consigliato ${CONTRAST_TARGETS[r.role].good}:1.`}
            >
              {r.check.ratio.toFixed(1)}:1
            </span>
            {r.custom && (
              <button type="button" className="ep-palette__reset" title="Torna al colore predefinito" onClick={() => set(r.role, undefined, false)}>
                ↺
              </button>
            )}
          </div>
          {r.check.issues.length > 0 && <p className={`ep-palette__issue ep-palette__issue--${r.check.level}`}>{r.check.issues.join(', ')}</p>}
          <div className="ep-palette__suggest" role="group" aria-label={`Colori consigliati per ${r.label.toLowerCase()}`}>
            {r.suggestions.map((s) => (
              <button
                key={s.color}
                type="button"
                className={`ep-palette__swatch${s.color === r.color ? ' is-active' : ''}`}
                style={{ background: s.color }}
                title={`${s.color} · contrasto ${s.ratio.toFixed(1)}:1`}
                aria-label={`Usa ${s.color}`}
                onClick={() => set(r.role, s.color, false)}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="ep-row">
        <button type="button" className="ep-btn" onClick={() => onChange(suggestPalette(background), false)}>
          Applica consigliati
        </button>
        {palette && (
          <button type="button" className="ep-btn" onClick={() => onChange(undefined, false)}>
            Colori predefiniti
          </button>
        )}
      </div>
      {rows.some((r) => r.suggestions[0]?.level === 'bad') && (
        <p className="ep-notice ep-notice--error">
          Lo sfondo passa da molto chiaro a molto scuro: nessun colore si vede bene su tutto il pannello. Avvicina la
          luminosità dei due colori del gradiente.
        </p>
      )}
      {problems.length > 0 && (
        <p className="ep-note">
          Su questo sfondo {problems.map((p) => p.label.toLowerCase()).join(', ')}{' '}
          {problems.length === 1 ? 'potrebbe non vedersi bene' : 'potrebbero non vedersi bene'}: prova i colori consigliati.
        </p>
      )}
    </div>
  );
}

/**
 * Controlli dello sfondo. `onChange(bg, continuous)`: `continuous` è vero
 * mentre si trascina un selettore, così tutta la regolazione diventa un
 * solo passo di "annulla".
 */
function BackgroundControls({
  value,
  palette,
  themeColors,
  onChange,
  onPaletteChange,
  onSettle,
}: {
  value?: PuzzleBackground;
  palette?: PuzzlePalette;
  themeColors: Required<PuzzlePalette>;
  onChange: (bg: PuzzleBackground | undefined, continuous: boolean) => void;
  onPaletteChange: (p: PuzzlePalette | undefined, continuous: boolean) => void;
  onSettle: () => void;
}) {
  const eff = { ...themeColors, ...palette };
  const kind = !value ? 'default' : value.colors.length === 1 ? 'solid' : 'gradient';
  const c0 = value?.colors[0] ?? DEFAULT_BG_COLORS[0];
  const c1 = value?.colors[1] ?? DEFAULT_BG_COLORS[1];
  const angle = value?.angle ?? DEFAULT_BACKGROUND_ANGLE;
  const make = (k: typeof kind, a = c0, b = c1, ang = angle): PuzzleBackground | undefined =>
    k === 'default'
      ? undefined
      : k === 'solid'
        ? { colors: [a] }
        : ang === DEFAULT_BACKGROUND_ANGLE
          ? { colors: [a, b] }
          : { colors: [a, b], angle: normalizeAngle(ang) };
  const settle = { onBlur: onSettle, onPointerUp: onSettle, onKeyUp: onSettle };
  return (
    <>
      <div className="ep-seg ep-seg--full">
        {(
          [
            ['default', 'Predefinito'],
            ['solid', 'Colore'],
            ['gradient', 'Gradiente'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" className={kind === k ? 'is-active' : ''} onClick={() => onChange(make(k), false)}>
            {label}
          </button>
        ))}
      </div>
      {value && (
        <div className="ep-bg">
          <span className="ep-bg__preview" style={{ background: backgroundCss(value) }} aria-hidden>
            <i style={{ background: eff.line }} />
            <i style={{ background: eff.path }} />
          </span>
          <input
            type="color"
            value={c0}
            aria-label={kind === 'gradient' ? 'Colore iniziale' : 'Colore'}
            onChange={(e) => onChange(make(kind, e.target.value), true)}
            {...settle}
          />
          {kind === 'gradient' && (
            <>
              <button
                type="button"
                className="ep-btn ep-bg__swap"
                title="Inverti i colori"
                onClick={() => onChange(make(kind, c1, c0), false)}
              >
                ⇄
              </button>
              <input
                type="color"
                value={c1}
                aria-label="Colore finale"
                onChange={(e) => onChange(make(kind, c0, e.target.value), true)}
                {...settle}
              />
            </>
          )}
        </div>
      )}
      {kind === 'gradient' && (
        <>
          <label className="ep-field">
            <span>Direzione: {angle}°</span>
            <input
              type="range"
              min={0}
              max={359}
              value={angle}
              onChange={(e) => onChange(make(kind, c0, c1, +e.target.value), true)}
              {...settle}
            />
          </label>
          <div className="ep-seg">
            {ANGLE_PRESETS.map((p) => (
              <button
                key={p.angle}
                type="button"
                title={p.title}
                className={angle === p.angle ? 'is-active' : ''}
                onClick={() => onChange(make(kind, c0, c1, p.angle), false)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}
      {value && (
        <PaletteControls
          background={value}
          palette={palette}
          themeColors={themeColors}
          onChange={onPaletteChange}
          settle={settle}
        />
      )}
    </>
  );
}

const RAINBOW_ROWS: { key: keyof PuzzleRainbow; label: string; period: number }[] = [
  { key: 'elements', label: 'Elementi di gioco', period: 8 },
  { key: 'background', label: 'Sfondo', period: 20 },
];

const contrastLevel = (role: ColorRole, ratio: number): ContrastLevel =>
  ratio >= CONTRAST_TARGETS[role].good ? 'good' : ratio >= CONTRAST_TARGETS[role].min ? 'low' : 'bad';

/**
 * Arcobaleno: due livelli indipendenti, ciascuno con la durata del ciclo.
 * Il cursore usa lo stesso meccanismo dello sfondo (un passo di annulla).
 */
function RainbowControls({
  value,
  background,
  colors,
  onChange,
  onSettle,
}: {
  value?: PuzzleRainbow;
  background?: PuzzleBackground;
  /** Colori effettivi di griglia e percorso, per il contrasto nel ciclo. */
  colors: Required<PuzzlePalette>;
  onChange: (r: PuzzleRainbow | undefined, continuous: boolean) => void;
  onSettle: () => void;
}) {
  const settle = { onBlur: onSettle, onPointerUp: onSettle, onKeyUp: onSettle };
  const set = (key: keyof PuzzleRainbow, layer: RainbowLayer | undefined, continuous: boolean) => {
    const next: PuzzleRainbow = { ...value };
    if (layer) next[key] = layer;
    else delete next[key];
    onChange(Object.keys(next).length ? next : undefined, continuous);
  };
  const cycle = value?.background
    ? (['line', 'path'] as const).map((role) => {
        const ratio = rainbowWorstContrast(colors[role], background);
        return { role, label: role === 'line' ? 'Griglia' : 'Percorso', ratio, level: contrastLevel(role, ratio) };
      })
    : [];
  return (
    <div className="ep-rb">
      {RAINBOW_ROWS.map((r) => {
        const layer = value?.[r.key];
        const id = `ep-rb-${r.key}`;
        return (
          <div key={r.key} className="ep-rb__layer">
            <label className="ep-check">
              <input
                type="checkbox"
                checked={!!layer}
                aria-controls={layer ? id : undefined}
                onChange={(e) => set(r.key, e.target.checked ? { period: r.period } : undefined, false)}
              />
              {r.label}
            </label>
            {layer && (
              <label className="ep-field ep-rb__speed" id={id}>
                <span>
                  Ciclo completo: <output className="ep-rb__value">{layer.period} s</output>
                </span>
                <input
                  type="range"
                  min={RAINBOW_PERIOD_MIN}
                  max={RAINBOW_PERIOD_MAX}
                  step={1}
                  value={layer.period}
                  aria-valuetext={`${layer.period} secondi per ciclo`}
                  onChange={(e) => set(r.key, { period: +e.target.value }, true)}
                  {...settle}
                />
                <span className="ep-rb__scale" aria-hidden>
                  <span>veloce</span>
                  <span>lento</span>
                </span>
              </label>
            )}
          </div>
        );
      })}
      {cycle.length > 0 && (
        <div className="ep-rb__contrast">
          <span>Contrasto nel ciclo</span>
          {cycle.map((c) => (
            <span
              key={c.role}
              className={`ep-contrast ep-contrast--${c.level}`}
              title={`${c.label} sullo sfondo, nel punto peggiore del ciclo: ${LEVEL_TEXT[c.level].toLowerCase()}. Minimo consigliato ${CONTRAST_TARGETS[c.role].good}:1.`}
            >
              {c.label} {c.ratio.toFixed(1)}:1
            </span>
          ))}
        </div>
      )}
      <p className="ep-note">Si vede in Prova e in Gioca. Le regole usano sempre il colore di partenza.</p>
    </div>
  );
}

const RAINBOW_LAYER_TEXT = { elements: 'elementi', background: 'sfondo' } as const;

/** Piccola icona SVG per i pulsanti degli strumenti. */
function ToolIcon({ kind, tool }: { kind: ToolKind; tool: ToolState }) {
  let body: ReactNode;
  const lineStyle = { stroke: 'var(--ep-line)', strokeWidth: LINE, strokeLinecap: 'round' as const, fill: 'none' };
  switch (kind) {
    case 'start':
      body = (
        <g>
          <polyline points="-35,0 45,0" style={lineStyle} />
          <circle cx={-20} r={START_R} style={{ fill: 'var(--ep-line)' }} />
        </g>
      );
      break;
    case 'end':
      body = <polyline points="-45,0 25,0" style={lineStyle} />;
      break;
    case 'hexagon':
      body = (
        <g>
          <polyline points="-45,0 45,0" style={lineStyle} />
          <g transform="scale(1.6)">
            <Hexagon />
          </g>
        </g>
      );
      break;
    case 'bridge':
      body = (
        <g>
          <polyline points="-45,0 45,0" style={lineStyle} />
          <polyline points="0,-45 0,45" style={lineStyle} />
          <g style={{ stroke: 'var(--ep-hexagon)' }} transform="scale(1.1)">
            <Bridge />
          </g>
        </g>
      );
      break;
    case 'gap':
      body = (
        <g>
          <polyline points="-45,0 -15,0" style={lineStyle} />
          <polyline points="15,0 45,0" style={lineStyle} />
        </g>
      );
      break;
    case 'missing':
      body = <polyline points="-45,0 45,0" style={{ ...lineStyle, strokeDasharray: '1 26', strokeWidth: 10 }} />;
      break;
    case 'erase':
      body = (
        <g style={{ stroke: 'currentColor', strokeWidth: 9, strokeLinecap: 'round' }}>
          <line x1={-24} y1={-24} x2={24} y2={24} />
          <line x1={24} y1={-24} x2={-24} y2={24} />
        </g>
      );
      break;
    default: {
      const item = toolCellItem({ ...tool, kind }) ?? { type: 'polyomino' as const, shape: ['#'] };
      body = (
        <g transform="scale(1.25)">
          <CellSymbol item={item} maxPolySize={3} />
        </g>
      );
    }
  }
  return (
    <svg viewBox="-50 -50 100 100" className="ep-tool__icon" aria-hidden>
      {body}
    </svg>
  );
}

// ---------------------------------------------------------------------------

export function PuzzleEditor({
  defaultValue,
  value,
  onChange,
  onImportSet,
  className,
}: PuzzleEditorProps) {
  const history = useHistory(value ?? defaultValue ?? createPuzzle(4, 4));
  const puzzle = history.present;
  const [tool, setTool] = useState<ToolState>(DEFAULT_TOOL);
  const [hover, setHover] = useState<Target | null>(null);
  /** Posizione del cursore da tastiera sulla board (reticolo, vedi `latticeTarget`). */
  const [kb, setKb] = useState<{ x: number; y: number } | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: 'info' | 'error' | 'ok' } | null>(null);
  const [mode, setMode] = useState<'edit' | 'test'>('edit');
  const [side, setSide] = useState<'build' | 'look'>('build');
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonDraft, setJsonDraft] = useState<string | null>(null);
  const [jsonKey, setJsonKey] = useState(0);
  const [solveState, setSolveState] = useState<{ running: boolean; result?: SolveResult; show: boolean }>({
    running: false,
    show: false,
  });
  const [testResult, setTestResult] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const paint = useRef<{ mode: 'add' | 'remove'; done: Set<string>; base: Puzzle } | null>(null);
  const lastEmitted = useRef<Puzzle | null>(null);

  // Valore controllato cambiato dall'esterno (altro puzzle o modifica non
  // fatta qui) → ricarica e scarta tutto ciò che riguardava il precedente.
  useEffect(() => {
    if (value && shouldReset(value, puzzle, lastEmitted.current)) {
      history.reset(value);
      lastEmitted.current = value;
      paint.current = null;
      bgDragging.current = false;
      setHover(null);
      setSolveState({ running: false, show: false });
      setTestResult(null);
      setJsonDraft(null);
      setJsonKey((k) => k + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Notifica le modifiche.
  useEffect(() => {
    if (puzzle !== lastEmitted.current && puzzle !== value) {
      lastEmitted.current = puzzle;
      onChange?.(puzzle);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle]);

  // Qualsiasi modifica invalida il risultato del solver.
  useEffect(() => setSolveState((s) => (s.result || s.show ? { running: false, show: false } : s)), [puzzle]);

  const flash = useCallback((text: string, tone: 'info' | 'error' | 'ok' = 'info') => {
    setNotice({ text, tone });
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  /** Ogni modifica mantiene l'id del puzzle (anche importando o svuotando). */
  const commit = (p: Puzzle, coalesce = false) => history.push(keepId(p, puzzle.id), coalesce);
  /** Ridimensionamento o simmetria: avvisa se qualche ponte è sparito. */
  const commitGrid = (p: Puzzle) => {
    const lost = itemLossNotice(puzzle, p) ?? bridgeLossNotice(puzzle, p);
    if (lost) flash(lost, 'info');
    commit(p);
  };

  // --- scorciatoie
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        history.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [history]);

  // --- interazione con la board

  const targetAt = (e: PointerEvent<SVGSVGElement>): Target | null => {
    if (!svgRef.current) return null;
    const g = clientToGrid(svgRef.current, e.clientX, e.clientY);
    const t = hitTest(puzzle, g, toolTargets(tool.kind));
    // Con lo strumento Uscita la direzione segue la posizione del puntatore.
    if (t?.kind === 'point' && tool.kind === 'end') {
      const dir = pickEndDirection(puzzle, t.at, g);
      return dir ? { ...t, dir } : t;
    }
    return t;
  };

  // R / Maiusc+R: ruota la direzione dell'uscita sotto il puntatore.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      if (e.key.toLowerCase() !== 'r' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (mode !== 'edit' || tool.kind !== 'end' || hover?.kind !== 'point') return;
      const idx = indexPuzzle(puzzle);
      if (getPoint(idx, hover.at)?.type !== 'end') return;
      const dir = nextEndDirection(puzzle, hover.at, endDirection(idx, hover.at), e.shiftKey ? -1 : 1);
      if (!dir) return;
      e.preventDefault();
      const r = applyTool(puzzle, tool, { ...hover, dir }, 'add');
      commit(r.puzzle);
      setHover({ ...hover, dir });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, tool, hover, puzzle]);

  /** Applica lo strumento a un bersaglio: lo aggiunge o, se c'è già, lo toglie. */
  const place = (t: Target) => {
    const m = isAlreadyThere(puzzle, tool, t) ? 'remove' : 'add';
    const r = applyTool(puzzle, tool, t, m);
    if (r.notice) flash(r.notice, 'error');
    else if (r.removedBridges) flash(bridgeLossNotice(puzzle, r.puzzle)!);
    commit(r.puzzle);
    return m;
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    // Un secondo dito mentre si sta già disegnando: il primo gesto continua.
    if (paint.current) return;
    const t = targetAt(e);
    if (!t) return;
    svgRef.current?.setPointerCapture(e.pointerId);
    const m = isAlreadyThere(puzzle, tool, t) ? 'remove' : 'add';
    paint.current = { mode: m, done: new Set([targetKey(t)]), base: puzzle };
    const r = applyTool(puzzle, tool, t, m);
    if (r.notice) flash(r.notice, 'error');
    else if (r.removedBridges) flash(bridgeLossNotice(puzzle, r.puzzle)!);
    commit(r.puzzle);
  };

  // --- tastiera sulla board: frecce per muoversi, Invio o Spazio per applicare lo strumento
  const kbTarget = (pos: { x: number; y: number } | null): Target | null => {
    if (!pos) return null;
    const t = latticeTarget(puzzle, pos.x, pos.y, toolTargets(tool.kind));
    if (t?.kind === 'point' && tool.kind === 'end') {
      const dir = autoEndDirection(indexPuzzle(puzzle), t.at);
      return dir ? { ...t, dir } : t;
    }
    return t;
  };
  const kbMoveTo = (pos: { x: number; y: number } | null) => {
    if (!pos) return;
    setKb(pos);
    setHover(kbTarget(pos));
  };
  const onBoardKey = (e: ReactKeyboardEvent<SVGSVGElement>) => {
    if (mode !== 'edit' || e.ctrlKey || e.metaKey || e.altKey) return;
    const kinds = toolTargets(tool.kind);
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key]) {
      e.preventDefault();
      const [dx, dy] = arrows[e.key];
      kbMoveTo(kb ? (moveLattice(puzzle, kinds, kb, dx, dy) ?? kb) : initialLattice(puzzle, kinds));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const pos = kb ?? initialLattice(puzzle, kinds);
      const t = kbTarget(pos);
      if (!pos || !t) return;
      setKb(pos);
      place(t);
      setHover(t);
    } else if (e.key === 'Escape' && kb) {
      setKb(null);
      setHover(null);
    }
  };
  // Cambiando strumento la posizione precedente potrebbe non essere più valida.
  useEffect(() => {
    setKb(null);
  }, [tool.kind]);
  // Descrizione per chi non vede la board: dove si trova il cursore e cosa farebbe Invio.
  const kbText = useMemo(() => {
    const t = kb && mode === 'edit' ? kbTarget(kb) : null;
    if (!t) return '';
    const where =
      t.kind === 'cell'
        ? `cella, colonna ${t.at.x + 1}, riga ${t.at.y + 1}`
        : t.kind === 'point'
          ? `incrocio, colonna ${t.at.x + 1}, riga ${t.at.y + 1}`
          : `lato ${t.at.dir === 'h' ? 'orizzontale' : 'verticale'}, colonna ${t.at.x + 1}, riga ${t.at.y + 1}`;
    return `${where}. ${isAlreadyThere(puzzle, tool, t) ? 'Elemento già presente: Invio lo toglie.' : 'Invio applica lo strumento.'}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kb, puzzle, tool, mode]);

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const t = targetAt(e);
    setHover(t);
    const pt = paint.current;
    if (!pt || !t) return;
    const k = targetKey(t);
    if (pt.done.has(k)) return;
    pt.done.add(k);
    // Trascinando si dipinge con la stessa modalità del primo clic, e tutto
    // il trascinamento è un solo passo di "annulla".
    const already = isAlreadyThere(puzzle, tool, t);
    if ((pt.mode === 'add') === already) return;
    const r = applyTool(puzzle, tool, t, pt.mode);
    if (r.removedBridges) flash(bridgeLossNotice(puzzle, r.puzzle)!);
    commit(r.puzzle, true);
  };

  const endPaint = () => {
    paint.current = null;
  };
  // Un gesto interrotto (finestra che perde il focus, cattura persa) non lascia il disegno "attaccato".
  useEffect(() => {
    window.addEventListener('blur', endPaint);
    return () => window.removeEventListener('blur', endPaint);
  }, []);

  // --- anteprima dello strumento sotto il puntatore
  const overlay = useMemo(() => {
    if (!hover || mode !== 'edit') return null;
    const remove = isAlreadyThere(puzzle, tool, hover);
    const cls = `ep-hover${remove || tool.kind === 'erase' ? ' ep-hover--remove' : ''}`;
    if (hover.kind === 'cell') {
      const item = toolCellItem(tool);
      return (
        <g className={cls} transform={`translate(${(hover.at.x + 0.5) * U},${(hover.at.y + 0.5) * U})`}>
          <rect x={-46} y={-46} width={92} height={92} rx={10} className="ep-hover__box" />
          {item && !remove && tool.kind !== 'erase' && (
            <g className="ep-hover__ghost">
              <CellSymbol item={item} />
            </g>
          )}
        </g>
      );
    }
    if (hover.kind === 'point') {
      const bad =
        !remove &&
        ((tool.kind === 'end' && !autoEndDirection(indexPuzzle(puzzle), hover.at)) ||
          (tool.kind === 'bridge' && !!bridgeProblem(puzzle, hover.at)));
      const ghost = tool.kind === 'end' && !remove && hover.dir ? DIRECTIONS[hover.dir] : null;
      return (
        <g className={`${cls}${bad ? ' ep-hover--bad' : ''}`} transform={`translate(${hover.at.x * U},${hover.at.y * U})`}>
          <circle r={30} className="ep-hover__box" />
          {ghost && (
            <polyline
              className="ep-hover__ghost ep-hover__exit"
              strokeWidth={LINE}
              points={`0,0 ${ghost.x * EXIT_LENGTH * U},${ghost.y * EXIT_LENGTH * U}`}
            />
          )}
        </g>
      );
    }
    const { x, y, dir } = hover.at;
    return (
      <g className={cls}>
        <rect
          className="ep-hover__box"
          x={dir === 'h' ? x * U + 10 : x * U - 22}
          y={dir === 'h' ? y * U - 22 : y * U + 10}
          width={dir === 'h' ? U - 20 : 44}
          height={dir === 'h' ? 44 : U - 20}
          rx={10}
        />
      </g>
    );
  }, [hover, tool, puzzle, mode]);

  // --- import / export

  const loadText = (text: string) => {
    try {
      const set = parsePuzzleSet(text);
      const warnings = set.flatMap((r) => r.warnings);
      if (set.length > 1 && onImportSet) {
        onImportSet(set.map((r) => r.puzzle));
        flash(`Importati ${set.length} puzzle.`, 'ok');
        return true;
      }
      commit(set[0].puzzle);
      flash(
        set.length > 1
          ? `Il file contiene ${set.length} puzzle: caricato il primo.`
          : warnings.length
            ? `Importato con ${warnings.length} avvisi: ${warnings[0]}`
            : 'Puzzle importato.',
        warnings.length ? 'info' : 'ok',
      );
      return true;
    } catch (err) {
      flash(err instanceof PuzzleFormatError ? err.message : `Errore: ${(err as Error).message}`, 'error');
      return false;
    }
  };

  // --- solver
  const runSolver = () => {
    setSolveState({ running: true, show: false });
    // Lascia il tempo al browser di mostrare lo stato "in corso".
    window.setTimeout(() => {
      const result = solve(puzzle, { maxSolutions: 2, timeLimitMs: 4000 });
      setSolveState({ running: false, result, show: result.solutions.length > 0 });
    }, 30);
  };

  const solverText = (r: SolveResult) => {
    const n = r.solutions.length;
    if (n === 0) return r.exhaustive ? 'Nessuna soluzione: il puzzle è impossibile.' : 'Nessuna soluzione trovata entro il tempo limite.';
    if (n === 1) return r.exhaustive ? 'Soluzione unica.' : 'Trovata una soluzione (ricerca non completa).';
    return 'Più soluzioni possibili.';
  };

  // --- controlli di coerenza
  const issues = useMemo(() => {
    const out: string[] = [];
    if (!puzzle.points.some((p) => p.type === 'start')) out.push('Manca una partenza.');
    if (!puzzle.points.some((p) => p.type === 'end')) out.push('Manca un’uscita.');
    const idx = indexPuzzle(puzzle);
    for (const p of puzzle.points) {
      if (p.type === 'end' && !autoEndDirection(idx, p)) out.push(`L’uscita in ${p.x},${p.y} non ha sbocco.`);
    }
    return out;
  }, [puzzle]);

  // --- scorciatoie: 1-9 e 0 strumenti, M modifica, P prova, S cerca soluzioni
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const toolIdx = TOOL_KEYS.indexOf(e.key);
      if (e.key.length === 1 && toolIdx >= 0 && TOOL_LIST[toolIdx]) {
        e.preventDefault();
        const kind = TOOL_LIST[toolIdx].kind;
        if (kind === 'bridge' && puzzle.symmetry !== 'none') {
          flash('Il ponte non è disponibile con la simmetria attiva.', 'error');
          return;
        }
        setTool((t) => ({ ...t, kind }));
        setMode('edit');
      } else if (k === 'm') {
        setMode('edit');
      } else if (k === 'p') {
        setMode('test');
        setTestResult(null);
      } else if (k === 's' && !solveState.running && issues.length === 0) {
        e.preventDefault();
        runSolver();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle, solveState.running, issues]);

  const json = useMemo(() => serializePuzzle(puzzle), [puzzle]);
  const shownSolution: Path[] | null = solveState.show && solveState.result?.solutions[0] ? solveState.result.solutions[0] : null;
  const shownEliminated = useMemo(
    () => (shownSolution ? validate(puzzle, shownSolution).eliminated : []),
    [shownSolution, puzzle],
  );

  const setMeta = (patch: Partial<Puzzle>) => {
    const next = { ...puzzle, ...patch };
    (Object.keys(patch) as (keyof Puzzle)[]).forEach((k) => {
      if (next[k] === '' || next[k] === undefined) delete next[k];
    });
    commit(next, true);
  };

  /** Vero mentre si trascina un selettore dello sfondo (stesso passo di annulla). */
  const bgDragging = useRef(false);
  const setLook = (
    patch: { background?: PuzzleBackground; palette?: PuzzlePalette; rainbow?: PuzzleRainbow },
    continuous: boolean,
  ) => {
    const next = { ...puzzle, ...patch };
    if (!next.background) delete next.background;
    if (!next.rainbow) delete next.rainbow;
    // Senza sfondo proprio i colori fissi non hanno senso: decide il tema.
    if (!next.palette || !next.background) delete next.palette;
    commit(next, bgDragging.current);
    bgDragging.current = continuous;
  };
  const setBackground = (background: PuzzleBackground | undefined, continuous: boolean) =>
    setLook({ background }, continuous);
  const setPalette = (palette: PuzzlePalette | undefined, continuous: boolean) => setLook({ palette }, continuous);
  const setRainbow = (rainbow: PuzzleRainbow | undefined, continuous: boolean) => setLook({ rainbow }, continuous);
  const rbLayers = rainbowLayers(puzzle.rainbow);
  const rbText = rbLayers.map((l) => RAINBOW_LAYER_TEXT[l]).join(' e ');

  /** Colori predefiniti, per i controlli di contrasto. */
  const rootRef = useRef<HTMLDivElement>(null);
  const [themeColors, setThemeColors] = useState<Required<PuzzlePalette>>(() => readThemeColors(null));
  useEffect(() => setThemeColors(readThemeColors(rootRef.current)), []);

  const sizeOptions = Array.from({ length: MAX_SIZE }, (_, i) => i + 1);

  return (
    <div ref={rootRef} className={`ep-editor-host${className ? ` ${className}` : ''}`}>
    <div className={`ep-editor${jsonOpen ? ' ep-editor--json' : ''}`}>
      {/* ------------------------------------------------ strumenti */}
      <aside className="ep-editor__tools" aria-label="Strumenti e aspetto">
        <div
          className="ep-seg ep-seg--full"
          role="tablist"
          aria-label="Pannello"
          onKeyDown={(e) => {
            const other = side === 'build' ? 'look' : 'build';
            const next =
              e.key === 'ArrowRight' || e.key === 'ArrowLeft' ? other : e.key === 'Home' ? 'build' : e.key === 'End' ? 'look' : null;
            if (!next) return;
            e.preventDefault();
            setSide(next);
            document.getElementById(`ep-tab-${next}`)?.focus();
          }}
        >
          <button
            type="button"
            role="tab"
            id="ep-tab-build"
            aria-selected={side === 'build'}
            aria-controls="ep-panel-side"
            tabIndex={side === 'build' ? 0 : -1}
            className={side === 'build' ? 'is-active' : ''}
            onClick={() => setSide('build')}
          >
            Costruisci
          </button>
          <button
            type="button"
            role="tab"
            id="ep-tab-look"
            aria-selected={side === 'look'}
            aria-controls="ep-panel-side"
            tabIndex={side === 'look' ? 0 : -1}
            className={side === 'look' ? 'is-active' : ''}
            onClick={() => setSide('look')}
          >
            Aspetto
            {rbLayers.length > 0 && (
              <>
                <RainbowMark size={9} className="ep-tab__mark" />
                <span className="ep-sr"> (arcobaleno attivo)</span>
              </>
            )}
          </button>
        </div>
        <div id="ep-panel-side" role="tabpanel" aria-labelledby={`ep-tab-${side}`} className="ep-tabpanel">

        {side === 'look' ? (
          <>
            <section className="ep-group">
              <h3 className="ep-group__title">Sfondo</h3>
              <BackgroundControls
                value={puzzle.background}
                palette={puzzle.palette}
                themeColors={themeColors}
                onChange={setBackground}
                onPaletteChange={setPalette}
                onSettle={() => (bgDragging.current = false)}
              />
            </section>
            <section className="ep-group">
              <h3 className="ep-group__title">Arcobaleno</h3>
              <RainbowControls
                value={puzzle.rainbow}
                background={puzzle.background}
                colors={puzzle.background ? { ...themeColors, ...puzzle.palette } : themeColors}
                onChange={setRainbow}
                onSettle={() => (bgDragging.current = false)}
              />
            </section>
          </>
        ) : (
          <>
        {TOOL_GROUPS.map((g) => (
          <section key={g.title} className="ep-group">
            <h3 className="ep-group__title">{g.title}</h3>
            <div className="ep-tools">
              {g.tools.map((t) => (
                <button
                  key={t.kind}
                  type="button"
                  className={`ep-tool${tool.kind === t.kind ? ' is-active' : ''}`}
                  onClick={() => {
                    setTool({ ...tool, kind: t.kind });
                    setMode('edit');
                  }}
                  disabled={t.kind === 'bridge' && puzzle.symmetry !== 'none'}
                  aria-describedby={t.kind === 'bridge' && puzzle.symmetry !== 'none' ? 'ep-bridge-note' : undefined}
                  aria-keyshortcuts={toolKey(t.kind)}
                  title={
                    t.kind === 'bridge' && puzzle.symmetry !== 'none'
                      ? `${t.label} — Non disponibile con la simmetria attiva`
                      : `${t.label}${toolKey(t.kind) ? ` (${toolKey(t.kind)})` : ''} — ${t.hint}`
                  }
                  aria-pressed={tool.kind === t.kind}
                >
                  <ToolIcon kind={t.kind} tool={tool} />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
            {g.title === 'Punti' && puzzle.symmetry !== 'none' && (
              <p id="ep-bridge-note" className="ep-note">
                Il ponte non è disponibile con la simmetria attiva. Per usarlo, imposta «Nessuna» in Griglia.
              </p>
            )}
          </section>
        ))}

        {usesColor(tool.kind) && (
          <section className="ep-group">
            <h3 className="ep-group__title">Colore</h3>
            <div className="ep-swatches">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`ep-swatch${tool.color === c ? ' is-active' : ''}`}
                  style={{ background: colorVar(c) }}
                  title={COLOR_LABELS[c]}
                  aria-label={COLOR_LABELS[c]}
                  aria-pressed={tool.color === c}
                  onClick={() => setTool({ ...tool, color: c })}
                />
              ))}
            </div>
          </section>
        )}

        {tool.kind === 'triangle' && (
          <section className="ep-group">
            <h3 className="ep-group__title">Numero</h3>
            <div className="ep-seg">
              {([1, 2, 3] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={tool.triangleCount === n ? 'is-active' : ''}
                  onClick={() => setTool({ ...tool, triangleCount: n })}
                >
                  {n}
                </button>
              ))}
            </div>
          </section>
        )}

        {tool.kind === 'polyomino' && (
          <section className="ep-group">
            <h3 className="ep-group__title">Forma</h3>
            <div className="ep-shape" role="group" aria-label="Forma del poliomino">
              {tool.shape.map((row, y) =>
                row.map((on, x) => (
                  <button
                    key={`${x},${y}`}
                    type="button"
                    className={`ep-shape__cell${on ? ' is-on' : ''}${tool.negative ? ' is-neg' : ''}`}
                    aria-pressed={on}
                    aria-label={`Riga ${y + 1}, colonna ${x + 1}`}
                    onClick={() => {
                      const shape = tool.shape.map((r) => [...r]);
                      shape[y][x] = !shape[y][x];
                      setTool({ ...tool, shape });
                    }}
                  />
                )),
              )}
            </div>
            <div className="ep-presets">
              {SHAPE_PRESETS.map((p) => (
                <button key={p.name} type="button" title={p.name} onClick={() => setTool({ ...tool, shape: shapeFromRows(p.rows) })}>
                  <svg viewBox="-50 -50 100 100" aria-hidden>
                    <CellSymbol item={{ type: 'polyomino', shape: p.rows }} maxPolySize={3} />
                  </svg>
                </button>
              ))}
              <button type="button" title="Cancella la forma" aria-label="Cancella la forma" onClick={() => setTool({ ...tool, shape: emptyShape() })}>
                ∅
              </button>
            </div>
            <label className="ep-check">
              <input type="checkbox" checked={tool.rotatable} onChange={(e) => setTool({ ...tool, rotatable: e.target.checked })} />
              Ruotabile
            </label>
            <label className="ep-check">
              <input type="checkbox" checked={tool.negative} onChange={(e) => setTool({ ...tool, negative: e.target.checked })} />
              Negativo (sottrae)
            </label>
            <p className="ep-note">Massimo {SHAPE_SIZE}×{SHAPE_SIZE}. I poliomini contano per le stelle come giallo (blu se negativi).</p>
          </section>
        )}
            <section className="ep-group">
              <h3 className="ep-group__title">Griglia</h3>
              <div className="ep-row">
                <label className="ep-field">
                  <span>Larghezza</span>
                  <select value={puzzle.width} onChange={(e) => commitGrid(resizePuzzle(puzzle, +e.target.value, puzzle.height))}>
                    {sizeOptions.map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <label className="ep-field">
                  <span>Altezza</span>
                  <select value={puzzle.height} onChange={(e) => commitGrid(resizePuzzle(puzzle, puzzle.width, +e.target.value))}>
                    {sizeOptions.map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="ep-field">
                <span>Simmetria</span>
                <select value={puzzle.symmetry} onChange={(e) => commitGrid(setSymmetry(puzzle, e.target.value as Symmetry))}>
                  {(Object.keys(SYMMETRY_LABELS) as Symmetry[]).map((s) => (
                    <option key={s} value={s}>
                      {SYMMETRY_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <p className="ep-note">Se riduci la griglia, gli elementi fuori dai nuovi bordi vengono tolti. Ctrl+Z li ripristina.</p>
            </section>
          </>
        )}
        </div>
      </aside>

      {/* ------------------------------------------------ area centrale */}
      <main className="ep-editor__stage">
        <div className="ep-toolbar">
          <label className="ep-toolbar__title">
            <span className="ep-sr">Titolo del puzzle</span>
            <input
              value={puzzle.title ?? ''}
              placeholder="Titolo del puzzle"
              onChange={(e) => setMeta({ title: e.target.value })}
            />
          </label>
          <div className="ep-seg" role="group" aria-label="Modalità">
            <button type="button" className={mode === 'edit' ? 'is-active' : ''} aria-pressed={mode === 'edit'} aria-keyshortcuts="M" title="Modifica (M)" onClick={() => setMode('edit')}>
              Modifica
            </button>
            <button
              type="button"
              className={mode === 'test' ? 'is-active' : ''}
              aria-pressed={mode === 'test'}
              aria-keyshortcuts="P"
              title="Prova (P)"
              onClick={() => {
                setMode('test');
                setTestResult(null);
              }}
            >
              Prova
            </button>
          </div>
          {rbLayers.length > 0 && (
            <button
              type="button"
              className="ep-rb-badge"
              title={`Arcobaleno su ${rbText}. ${mode === 'edit' ? "In Modifica i colori restano fermi: si vede in Prova e in Gioca. " : ''}Clic per le impostazioni.`}
              onClick={() => setSide('look')}
            >
              <RainbowMark size={12} />
              Arcobaleno
              <span className="ep-sr">: {rbText}</span>
            </button>
          )}
          <div className="ep-toolbar__spacer" />
          <div className="ep-toolbar__group">
            <button
              type="button"
              className="ep-btn"
              onClick={runSolver}
              disabled={solveState.running || issues.length > 0}
              aria-keyshortcuts="S"
              title={issues.length > 0 ? `Prima correggi il puzzle: ${issues[0]}` : 'Cerca tutti i percorsi che risolvono il puzzle (S)'}
            >
              {solveState.running ? 'Calcolo…' : 'Cerca soluzioni'}
            </button>
            {mode === 'edit' && solveState.result && solveState.result.solutions.length > 0 && (
              <button type="button" className="ep-btn" onClick={() => setSolveState((s) => ({ ...s, show: !s.show }))}>
                {solveState.show ? 'Nascondi soluzione' : 'Mostra soluzione'}
              </button>
            )}
          </div>
          <div className="ep-toolbar__group">
            <button type="button" className="ep-btn" onClick={() => downloadText(`${slugify(puzzle.title)}.json`, json)} title="Scarica solo questo puzzle come file JSON">
              Esporta puzzle
            </button>
            <button
              type="button"
              className="ep-btn ep-btn--danger"
              onClick={() => {
                commit(createPuzzle(puzzle.width, puzzle.height));
                flash('Puzzle azzerato. Ctrl+Z per annullare.');
              }}
              title="Toglie tutti gli elementi dal puzzle (si annulla con Ctrl+Z)"
              aria-label="Azzera puzzle"
            >
              Azzera
            </button>
          </div>
          <div className="ep-toolbar__group">
            <button type="button" className="ep-btn" onClick={history.undo} disabled={!history.canUndo} title="Annulla (Ctrl+Z)" aria-label="Annulla">
              ↶
            </button>
            <button type="button" className="ep-btn" onClick={history.redo} disabled={!history.canRedo} title="Ripeti (Ctrl+Shift+Z)" aria-label="Ripeti">
              ↷
            </button>
            <button
              type="button"
              className={`ep-btn ep-btn--toggle${jsonOpen ? ' is-active' : ''}`}
              aria-expanded={jsonOpen}
              aria-controls="ep-json-drawer"
              aria-label="JSON del puzzle"
              title="Mostra o nascondi il JSON del puzzle"
              onClick={() => {
                setJsonOpen((o) => !o);
                setJsonDraft(null);
              }}
            >
              {'{ }'}
            </button>
          </div>
        </div>

        <div className="ep-stage">
          {mode === 'edit' ? (
            <PuzzleBoard
              ref={svgRef}
              className="ep-editor-board"
              puzzle={puzzle}
              paths={shownSolution}
              status={shownSolution ? 'success' : 'idle'}
              eliminated={shownEliminated}
              overlay={
                <>
                  <RainbowBoardMarks puzzle={puzzle} />
                  {overlay}
                </>
              }
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endPaint}
              onPointerCancel={endPaint}
              onLostPointerCapture={endPaint}
              onPointerLeave={() => setHover(kbTarget(kb))}
              tabIndex={0}
              role="application"
              label="Board del puzzle. Frecce per muoverti, Invio o Spazio per applicare lo strumento, Esc per uscire."
              onKeyDown={onBoardKey}
              onBlur={() => {
                setKb(null);
                setHover(null);
              }}
              style={{ touchAction: 'none', cursor: 'crosshair' }}
            />
          ) : (
            <PuzzlePlayer
              key={json}
              puzzle={puzzle}
              lockOnSolve={false}
              onSolve={(r: ValidationResult) =>
                setTestResult(r.eliminated.length ? `Risolto (con ${r.eliminated.length} simboli eliminati).` : 'Risolto!')
              }
              onFail={(r) => setTestResult(r.messages[0] ?? `Non valido: ${r.errors.length} simboli non soddisfatti.`)}
              onStart={() => setTestResult(null)}
            />
          )}
        </div>
        <div className="ep-sr" aria-live="polite">
          {kbText}
        </div>
        <div className="ep-status" aria-live="polite">
          <div className="ep-status__verify">
            {issues.map((i) => (
              <p key={i} className="ep-notice ep-notice--error">
                {i}
              </p>
            ))}
            {solveState.result && (
              <p className={`ep-notice ep-notice--${solveState.result.solutions.length === 1 && solveState.result.exhaustive ? 'ok' : 'info'}`}>
                {solverText(solveState.result)}{' '}
                <span className="ep-muted">
                  ({solveState.result.checked} percorsi, {solveState.result.elapsedMs} ms)
                </span>
              </p>
            )}
          </div>
          <div className="ep-status__hint">
            {mode === 'test'
              ? (testResult ?? 'Clic sulla partenza, poi muovi il puntatore e clicca sull’uscita. Frecce e Invio da tastiera.')
              : notice
                ? <span className={`ep-notice ep-notice--${notice.tone}`}>{notice.text}</span>
                : (TOOL_GROUPS.flatMap((g) => g.tools).find((t) => t.kind === tool.kind)?.hint ?? '')}
          </div>
        </div>
      </main>

      {/* ------------------------------------------------ cassetto JSON */}
      {jsonOpen && (
        <aside id="ep-json-drawer" className="ep-editor__side" aria-label="JSON del puzzle">
          <section className="ep-group ep-group--grow">
            <textarea
              key={jsonKey}
              className="ep-json"
              spellCheck={false}
              value={jsonDraft ?? json}
              onChange={(e) => setJsonDraft(e.target.value)}
              aria-label="Puzzle in formato JSON"
            />
            <div className="ep-row">
              <button
                type="button"
                className="ep-btn ep-btn--primary"
                disabled={jsonDraft === null || jsonDraft === json}
                onClick={() => {
                  if (loadText(jsonDraft ?? '')) {
                    setJsonDraft(null);
                    setJsonKey((k) => k + 1);
                  }
                }}
              >
                Applica
              </button>
              <button
                type="button"
                className="ep-btn"
                disabled={jsonDraft === null}
                onClick={() => {
                  setJsonDraft(null);
                  setJsonKey((k) => k + 1);
                }}
              >
                Ripristina
              </button>
            </div>
            <p className="ep-note">Modifica il JSON o incolla quello di un altro puzzle, poi premi «Applica»: sostituisce il puzzle aperto (si annulla con Ctrl+Z).</p>
            {notice && <p className={`ep-notice ep-notice--${notice.tone}`}>{notice.text}</p>}
          </section>
        </aside>
      )}
    </div>
    </div>
  );
}
