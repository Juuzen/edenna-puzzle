import { inCellBounds, inEdgeBounds, inPointBounds, sanitize, shapeToGrid } from './grid';
import {
  type CellItem,
  type Color,
  type Direction,
  type EdgeItem,
  type PointItem,
  type Puzzle,
  type PuzzleBackground,
  type PuzzleCollection,
  type PuzzlePalette,
  type PuzzleMeta,
  type PuzzleRainbow,
  type PuzzleShift,
  type Symmetry,
  COLORS,
  FORMAT_ID,
  FORMAT_VERSION,
  MAX_SIZE,
} from './types';

export class PuzzleFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PuzzleFormatError';
  }
}

export interface ParseResult {
  puzzle: Puzzle;
  /** Problemi non fatali (elementi scartati, duplicati, ...). */
  warnings: string[];
}

const SYMMETRIES: Symmetry[] = ['none', 'horizontal', 'vertical', 'rotational'];
const DIRS: Direction[] = ['up', 'down', 'left', 'right'];

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isColor = (v: unknown): v is Color => typeof v === 'string' && (COLORS as string[]).includes(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** "#abc" / "#AABBCC" → "#aabbcc"; null se non è un colore esadecimale. */
export function normalizeHexColor(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return `#${h.toLowerCase()}`;
}

/** Angolo in gradi riportato in [0, 360). */
export const normalizeAngle = (a: number) => ((Math.round(a) % 360) + 360) % 360;

export const DEFAULT_BACKGROUND_ANGLE = 180;

/** Legge e ripulisce un campo `background`; null se non utilizzabile. */
export function parseBackground(raw: unknown, warnings: string[] = []): PuzzleBackground | null {
  if (raw === undefined || raw === null) return null;
  if (!isObj(raw) || !Array.isArray(raw.colors)) {
    warnings.push('"background" deve avere una lista "colors", ignorato.');
    return null;
  }
  const colors: string[] = [];
  raw.colors.forEach((c, i) => {
    const n = normalizeHexColor(c);
    if (n) colors.push(n);
    else warnings.push(`background.colors[${i}]: colore "${String(c)}" non valido.`);
  });
  if (colors.length > 2) warnings.push('"background" usa al massimo 2 colori: tengo i primi due.');
  if (!colors.length) return null;
  if (colors.length === 1) return { colors: [colors[0]] };
  const out: PuzzleBackground = { colors: [colors[0], colors[1]] };
  if (raw.angle !== undefined) {
    if (typeof raw.angle === 'number' && Number.isFinite(raw.angle)) {
      const a = normalizeAngle(raw.angle);
      if (a !== DEFAULT_BACKGROUND_ANGLE) out.angle = a;
    } else warnings.push('background.angle non valido, uso 180.');
  }
  return out;
}

const PALETTE_KEYS = ['line', 'path', 'success'] as const;

/** Legge e ripulisce un campo `palette`; null se vuoto o non utilizzabile. */
export function parsePalette(raw: unknown, warnings: string[] = []): PuzzlePalette | null {
  if (raw === undefined || raw === null) return null;
  if (!isObj(raw)) {
    warnings.push('"palette" deve essere un oggetto, ignorato.');
    return null;
  }
  const out: PuzzlePalette = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!(PALETTE_KEYS as readonly string[]).includes(k)) {
      warnings.push(`palette.${k}: chiave sconosciuta, ignorata.`);
      continue;
    }
    const c = normalizeHexColor(v);
    if (c) out[k as (typeof PALETTE_KEYS)[number]] = c;
    else warnings.push(`palette.${k}: colore "${String(v)}" non valido.`);
  }
  // Ordine stabile delle chiavi.
  const sorted: PuzzlePalette = {};
  for (const k of PALETTE_KEYS) if (out[k]) sorted[k] = out[k];
  return Object.keys(sorted).length ? sorted : null;
}

export const RAINBOW_PERIOD_MIN = 1;
export const RAINBOW_PERIOD_MAX = 16;
export const RAINBOW_PERIOD_DEFAULT = 8;
const RAINBOW_KEYS = ['elements', 'background'] as const;

/** Legge e ripulisce un campo `rainbow`; null se vuoto o non utilizzabile. */
export function parseRainbow(raw: unknown, warnings: string[] = []): PuzzleRainbow | null {
  if (raw === undefined || raw === null) return null;
  if (!isObj(raw)) {
    warnings.push('"rainbow" deve essere un oggetto, ignorato.');
    return null;
  }
  const out: PuzzleRainbow = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!(RAINBOW_KEYS as readonly string[]).includes(k)) {
      warnings.push(`rainbow.${k}: chiave sconosciuta, ignorata.`);
      continue;
    }
    if (v === undefined || v === null || v === false) continue;
    let period = RAINBOW_PERIOD_DEFAULT;
    if (!isObj(v)) warnings.push(`rainbow.${k} deve essere un oggetto, uso un ciclo di ${period} s.`);
    else if (v.period !== undefined) {
      if (typeof v.period === 'number' && Number.isFinite(v.period)) {
        const c = Math.min(RAINBOW_PERIOD_MAX, Math.max(RAINBOW_PERIOD_MIN, Math.round(v.period * 10) / 10));
        if (c !== v.period) warnings.push(`rainbow.${k}.period: ${v.period} fuori da ${RAINBOW_PERIOD_MIN}–${RAINBOW_PERIOD_MAX} s, uso ${c}.`);
        period = c;
      } else warnings.push(`rainbow.${k}.period non valido, uso ${period} s.`);
    }
    out[k as (typeof RAINBOW_KEYS)[number]] = { period };
  }
  const sorted: PuzzleRainbow = {};
  for (const k of RAINBOW_KEYS) if (out[k]) sorted[k] = out[k];
  return Object.keys(sorted).length ? sorted : null;
}

/** Spostamento massimo (in celle) di `shift.x` e `shift.y`. */
export const SHIFT_MAX = MAX_SIZE;
const SHIFT_KEYS = ['x', 'y', 'rotation'] as const;

/** Legge e ripulisce un campo `shift`; null se vuoto o tutto a zero. */
export function parseShift(raw: unknown, warnings: string[] = []): PuzzleShift | null {
  if (raw === undefined || raw === null) return null;
  if (!isObj(raw)) {
    warnings.push('"shift" deve essere un oggetto, ignorato.');
    return null;
  }
  const out: PuzzleShift = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!(SHIFT_KEYS as readonly string[]).includes(k)) {
      warnings.push(`shift.${k}: chiave sconosciuta, ignorata.`);
      continue;
    }
    if (v === undefined || v === null) continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      warnings.push(`shift.${k}: valore "${String(v)}" non valido, ignorato.`);
      continue;
    }
    if (k === 'rotation') {
      const r = Math.round((((v % 360) + 360) % 360) * 10) / 10;
      const n = r >= 360 ? 0 : r;
      if (n) out.rotation = n;
    } else {
      const c = Math.min(SHIFT_MAX, Math.max(-SHIFT_MAX, Math.round(v * 100) / 100));
      if (Math.abs(v) > SHIFT_MAX) warnings.push(`shift.${k}: ${v} fuori da ±${SHIFT_MAX} celle, uso ${c}.`);
      if (c) out[k as 'x' | 'y'] = c;
    }
  }
  const sorted: PuzzleShift = {};
  for (const k of SHIFT_KEYS) if (out[k] !== undefined) sorted[k] = out[k];
  return Object.keys(sorted).length ? sorted : null;
}

/** Il puzzle ha uno sfalsamento visivo della griglia. */
export function hasShift(p: Pick<PuzzleMeta, 'shift'>): boolean {
  const s = p.shift;
  return !!s && !!(s.x || s.y || s.rotation);
}

/**
 * Legge un puzzle da testo JSON o da oggetto già parsato.
 * È tollerante: gli elementi non validi vengono scartati e segnalati in
 * `warnings`; solo un errore sulle dimensioni è fatale.
 */
export function parsePuzzle(input: string | unknown): ParseResult {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input.trim());
    } catch (e) {
      throw new PuzzleFormatError(`JSON non valido: ${(e as Error).message}`);
    }
  }
  if (!isObj(raw)) throw new PuzzleFormatError('Il puzzle deve essere un oggetto JSON.');
  const warnings: string[] = [];

  if (raw.format !== undefined && raw.format !== FORMAT_ID) {
    throw new PuzzleFormatError(`Formato sconosciuto "${String(raw.format)}" (atteso "${FORMAT_ID}").`);
  }
  if (isInt(raw.version) && raw.version > FORMAT_VERSION) {
    warnings.push(`Versione ${raw.version} più recente di quella supportata (${FORMAT_VERSION}).`);
  }
  const { width, height } = raw;
  if (!isInt(width) || !isInt(height) || width < 1 || height < 1 || width > MAX_SIZE || height > MAX_SIZE) {
    throw new PuzzleFormatError(`"width" e "height" devono essere interi fra 1 e ${MAX_SIZE}.`);
  }
  const dims = { width, height };
  let symmetry: Symmetry = 'none';
  if (raw.symmetry !== undefined) {
    if (SYMMETRIES.includes(raw.symmetry as Symmetry)) symmetry = raw.symmetry as Symmetry;
    else warnings.push(`Simmetria "${String(raw.symmetry)}" sconosciuta, uso "none".`);
  }

  const list = (name: string): Record<string, unknown>[] => {
    const v = raw[name];
    if (v === undefined) return [];
    if (!Array.isArray(v)) {
      warnings.push(`"${name}" non è una lista, ignorato.`);
      return [];
    }
    return v.filter((it, i) => {
      const ok = isObj(it) && isInt(it.x) && isInt(it.y);
      if (!ok) warnings.push(`${name}[${i}]: servono "x" e "y" interi.`);
      return ok;
    }) as Record<string, unknown>[];
  };

  const dedupe = <T extends { x: number; y: number }>(name: string, items: T[], key: (t: T) => string) => {
    const map = new Map<string, T>();
    for (const it of items) {
      const k = key(it);
      if (map.has(k)) warnings.push(`${name}: più elementi in ${k}, tengo l’ultimo.`);
      map.set(k, it);
    }
    return [...map.values()];
  };

  // --- punti
  const points: PointItem[] = [];
  list('points').forEach((it, i) => {
    const at = { x: it.x as number, y: it.y as number };
    if (!inPointBounds(dims, at)) return warnings.push(`points[${i}]: fuori griglia.`);
    if (it.type === 'start' || it.type === 'hexagon' || it.type === 'bridge') points.push({ ...at, type: it.type });
    else if (it.type === 'end') {
      const dir = DIRS.includes(it.dir as Direction) ? (it.dir as Direction) : undefined;
      if (it.dir !== undefined && !dir) warnings.push(`points[${i}]: direzione "${String(it.dir)}" ignorata.`);
      points.push(dir ? { ...at, type: 'end', dir } : { ...at, type: 'end' });
    } else warnings.push(`points[${i}]: tipo "${String(it.type)}" sconosciuto.`);
  });

  // --- lati
  const edges: EdgeItem[] = [];
  list('edges').forEach((it, i) => {
    if (it.dir !== 'h' && it.dir !== 'v') return warnings.push(`edges[${i}]: "dir" deve essere "h" o "v".`);
    const e = { x: it.x as number, y: it.y as number, dir: it.dir as 'h' | 'v' };
    if (!inEdgeBounds(dims, e)) return warnings.push(`edges[${i}]: fuori griglia.`);
    if (it.type === 'gap' || it.type === 'missing' || it.type === 'hexagon') edges.push({ ...e, type: it.type });
    else warnings.push(`edges[${i}]: tipo "${String(it.type)}" sconosciuto.`);
  });

  // --- celle
  const cells: CellItem[] = [];
  list('cells').forEach((it, i) => {
    const at = { x: it.x as number, y: it.y as number };
    if (!inCellBounds(dims, at)) return warnings.push(`cells[${i}]: fuori griglia.`);
    const color = isColor(it.color) ? it.color : undefined;
    if (it.color !== undefined && !color) warnings.push(`cells[${i}]: colore "${String(it.color)}" sconosciuto.`);
    switch (it.type) {
      case 'square':
      case 'star':
        cells.push({ ...at, type: it.type, color: color ?? 'black' });
        break;
      case 'eliminator':
        cells.push(color ? { ...at, type: 'eliminator', color } : { ...at, type: 'eliminator' });
        break;
      case 'triangle': {
        const count = it.count === 2 || it.count === 3 ? it.count : 1;
        if (it.count !== undefined && it.count !== count) warnings.push(`cells[${i}]: triangoli da 1 a 3.`);
        cells.push(color ? { ...at, type: 'triangle', count, color } : { ...at, type: 'triangle', count });
        break;
      }
      case 'polyomino': {
        const shape = Array.isArray(it.shape) ? it.shape.filter((r): r is string => typeof r === 'string') : [];
        if (!shapeToGrid(shape).some((r) => r.some(Boolean))) {
          warnings.push(`cells[${i}]: poliomino senza forma.`);
          break;
        }
        const poly: CellItem = { ...at, type: 'polyomino', shape };
        if (it.rotatable) poly.rotatable = true;
        if (it.negative) poly.negative = true;
        if (color) poly.color = color;
        cells.push(poly);
        break;
      }
      default:
        warnings.push(`cells[${i}]: tipo "${String(it.type)}" sconosciuto.`);
    }
  });

  const background = parseBackground(raw.background, warnings);
  const palette = parsePalette(raw.palette, warnings);
  const rainbow = parseRainbow(raw.rainbow, warnings);
  const shift = parseShift(raw.shift, warnings);

  const puzzle: Puzzle = {
    format: FORMAT_ID,
    version: FORMAT_VERSION,
    ...(typeof raw.id === 'string' ? { id: raw.id } : {}),
    ...(typeof raw.title === 'string' ? { title: raw.title } : {}),
    ...(background ? { background } : {}),
    ...(palette ? { palette } : {}),
    ...(rainbow ? { rainbow } : {}),
    ...(shift ? { shift } : {}),
    ...(isObj(raw.data) ? { data: raw.data } : {}),
    width,
    height,
    symmetry,
    points: dedupe('points', points, (p) => `${p.x},${p.y}`),
    edges: dedupe('edges', edges, (e) => `${e.x},${e.y},${e.dir}`),
    cells: dedupe('cells', cells, (c) => `${c.x},${c.y}`),
  };
  const clean = sanitize(puzzle);
  for (const b of puzzle.points) {
    if (b.type === 'bridge' && !clean.points.includes(b)) {
      warnings.push(`Ponte in ${b.x},${b.y} scartato: serve un incrocio interno con 4 lati percorribili, senza simmetria.`);
    }
  }
  if (!clean.points.some((p) => p.type === 'start')) warnings.push('Il puzzle non ha partenze.');
  if (!clean.points.some((p) => p.type === 'end')) warnings.push('Il puzzle non ha uscite.');
  return { puzzle: clean, warnings };
}

/**
 * Legge una raccolta: un array di puzzle o `{ "puzzles": [...] }`.
 * Un singolo puzzle viene restituito come raccolta di uno.
 */
export function parsePuzzleSet(input: string | unknown): ParseResult[] {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (e) {
      throw new PuzzleFormatError(`JSON non valido: ${(e as Error).message}`);
    }
  }
  if (Array.isArray(raw)) return raw.map((p) => parsePuzzle(p));
  if (isObj(raw) && Array.isArray(raw.puzzles)) return raw.puzzles.map((p) => parsePuzzle(p));
  return [parsePuzzle(raw)];
}

export const SET_FORMAT_ID = `${FORMAT_ID}-set`;

export interface CollectionParseResult {
  collection: PuzzleCollection;
  /** Un risultato per puzzle, con i rispettivi avvisi. */
  results: ParseResult[];
}

/**
 * Legge una raccolta con i suoi metadati (`name`, `id`, `description`).
 * Accetta anche un array semplice o un singolo puzzle:
 * in quel caso il nome è il titolo del puzzle o `fallbackName`.
 */
export function parseCollection(input: string | unknown, fallbackName = 'Importata'): CollectionParseResult {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (e) {
      throw new PuzzleFormatError(`JSON non valido: ${(e as Error).message}`);
    }
  }
  const results = parsePuzzleSet(raw);
  const meta = isObj(raw) && Array.isArray(raw.puzzles) ? raw : null;
  const metaName = meta && typeof meta.name === 'string' ? meta.name.trim() : '';
  const name = metaName || (results.length === 1 && results[0].puzzle.title) || fallbackName;
  const collection: PuzzleCollection = {
    ...(meta && typeof meta.id === 'string' && meta.id ? { id: meta.id } : {}),
    name,
    ...(meta && typeof meta.description === 'string' && meta.description ? { description: meta.description } : {}),
    puzzles: results.map((r) => r.puzzle),
  };
  return { collection, results };
}

// ---------------------------------------------------------------------------
// Serializzazione: JSON leggibile, un elemento per riga, ordine stabile.

const byPos = (a: { x: number; y: number }, b: { x: number; y: number }) => a.y - b.y || a.x - b.x;

const KEY_ORDER = ['x', 'y', 'dir', 'type', 'color', 'count', 'shape', 'rotatable', 'negative'];
/** Stesso oggetto con le chiavi in ordine canonico (output stabile). */
function canonical<T extends object>(item: T): T {
  const entries = Object.entries(item).filter(([, v]) => v !== undefined);
  entries.sort(([a], [b]) => {
    const ia = KEY_ORDER.indexOf(a);
    const ib = KEY_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  return Object.fromEntries(entries) as T;
}

export function toPuzzleObject(p: Puzzle): Puzzle {
  const background = p.background ? parseBackground(p.background) : null;
  const palette = p.palette ? parsePalette(p.palette) : null;
  const rainbow = p.rainbow ? parseRainbow(p.rainbow) : null;
  const shift = p.shift ? parseShift(p.shift) : null;
  const out: Puzzle = {
    format: FORMAT_ID,
    version: FORMAT_VERSION,
    ...(p.id ? { id: p.id } : {}),
    ...(p.title ? { title: p.title } : {}),
    ...(background ? { background } : {}),
    ...(palette ? { palette } : {}),
    ...(rainbow ? { rainbow } : {}),
    ...(shift ? { shift } : {}),
    width: p.width,
    height: p.height,
    symmetry: p.symmetry,
    points: [...p.points].sort(byPos).map(canonical),
    edges: [...p.edges].sort((a, b) => byPos(a, b) || a.dir.localeCompare(b.dir)).map(canonical),
    cells: [...p.cells].sort(byPos).map(canonical),
    ...(p.data ? { data: p.data } : {}),
  };
  return out;
}

export function serializePuzzle(p: Puzzle): string {
  const obj = toPuzzleObject(p) as unknown as Record<string, unknown>;
  const lines = Object.entries(obj).map(([k, v]) => {
    if (Array.isArray(v)) {
      if (!v.length) return `  ${JSON.stringify(k)}: []`;
      return `  ${JSON.stringify(k)}: [\n${v.map((it) => `    ${JSON.stringify(it)}`).join(',\n')}\n  ]`;
    }
    return `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`;
  });
  return `{\n${lines.join(',\n')}\n}\n`;
}

export function serializePuzzleSet(puzzles: Puzzle[]): string {
  return serializeCollectionBody(puzzles, []);
}

/** Come `serializePuzzleSet`, con in testa id, nome e descrizione della raccolta. */
export function serializeCollection(c: PuzzleCollection): string {
  const head: string[] = [];
  if (c.id) head.push(`  "id": ${JSON.stringify(c.id)}`);
  head.push(`  "name": ${JSON.stringify(c.name)}`);
  if (c.description) head.push(`  "description": ${JSON.stringify(c.description)}`);
  return serializeCollectionBody(c.puzzles, head);
}

function serializeCollectionBody(puzzles: Puzzle[], head: string[]): string {
  const body = puzzles.map((p) =>
    serializePuzzle(p)
      .trimEnd()
      .split('\n')
      .map((l) => `    ${l}`)
      .join('\n'),
  );
  const lines = [`  "format": "${SET_FORMAT_ID}"`, ...head];
  const list = body.length ? `[\n${body.join(',\n')}\n  ]` : '[]';
  return `{\n${lines.join(',\n')},\n  "puzzles": ${list}\n}\n`;
}
