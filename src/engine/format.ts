import { inCellBounds, inEdgeBounds, inPointBounds, sanitize, shapeToGrid } from './grid';
import {
  type CellItem,
  type Color,
  type Direction,
  type EdgeItem,
  type PointItem,
  type Puzzle,
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

/**
 * Legge un puzzle da testo JSON o da oggetto già parsato.
 * È tollerante: gli elementi non validi vengono scartati e segnalati in
 * `warnings`; solo un errore sulle dimensioni è fatale.
 */
export function parsePuzzle(input: string | unknown): ParseResult {
  let raw: unknown = input;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (/^[A-Za-z0-9_\-+/=]+_0$/.test(trimmed)) {
      // Codice di windmill.thefifthmatt.com incollato direttamente.
      return { puzzle: decodeWindmillCode(trimmed), warnings: [] };
    }
    try {
      raw = JSON.parse(trimmed);
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
    if (it.type === 'start' || it.type === 'hexagon') points.push({ ...at, type: it.type });
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

  const puzzle: Puzzle = {
    format: FORMAT_ID,
    version: FORMAT_VERSION,
    ...(typeof raw.id === 'string' ? { id: raw.id } : {}),
    ...(typeof raw.title === 'string' ? { title: raw.title } : {}),
    ...(typeof raw.author === 'string' ? { author: raw.author } : {}),
    ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
    ...(isObj(raw.data) ? { data: raw.data } : {}),
    width,
    height,
    symmetry,
    points: dedupe('points', points, (p) => `${p.x},${p.y}`),
    edges: dedupe('edges', edges, (e) => `${e.x},${e.y},${e.dir}`),
    cells: dedupe('cells', cells, (c) => `${c.x},${c.y}`),
  };
  const clean = sanitize(puzzle);
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
  const out: Puzzle = {
    format: FORMAT_ID,
    version: FORMAT_VERSION,
    ...(p.id ? { id: p.id } : {}),
    ...(p.title ? { title: p.title } : {}),
    ...(p.author ? { author: p.author } : {}),
    ...(p.description ? { description: p.description } : {}),
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
  const body = puzzles.map((p) =>
    serializePuzzle(p)
      .trimEnd()
      .split('\n')
      .map((l) => `    ${l}`)
      .join('\n'),
  );
  return `{\n  "format": "${FORMAT_ID}-set",\n  "puzzles": [\n${body.join(',\n')}\n  ]\n}\n`;
}

// ---------------------------------------------------------------------------
// Codici legacy di windmill.thefifthmatt.com (protobuf `Storage`, vedi
// grid.proto nel progetto originale). Decoder/encoder minimali scritti a
// mano per non dipendere da protobuf.js.

const LEGACY_COLORS: (Color | undefined)[] = [
  undefined,
  'black',
  'white',
  'cyan',
  'magenta',
  'yellow',
  'red',
  'green',
  'blue',
  'orange',
];
const LEGACY_SYMMETRY: Symmetry[] = ['none', 'none', 'horizontal', 'vertical', 'rotational'];

/** Valori dell'enum `Type` di grid.proto. */
const T = {
  NONE: 1,
  BASIC: 2,
  START: 3,
  END: 4,
  DISJOINT: 5,
  HEXAGON: 6,
  SQUARE: 7,
  STAR: 8,
  TETRIS: 9,
  ERROR: 10,
  TRIANGLE: 11,
} as const;

class Reader {
  pos = 0;
  constructor(
    public buf: Uint8Array,
    public end = buf.length,
  ) {}
  done() {
    return this.pos >= this.end;
  }
  varint(): number {
    let result = 0;
    let shift = 0;
    for (;;) {
      if (this.pos >= this.end) throw new PuzzleFormatError('Codice Windmill troncato.');
      const b = this.buf[this.pos++];
      result += (b & 0x7f) * 2 ** shift;
      if (!(b & 0x80)) return result;
      shift += 7;
      if (shift > 63) throw new PuzzleFormatError('Varint non valido.');
    }
  }
  sub(): Reader {
    const len = this.varint();
    const r = new Reader(this.buf, this.pos + len);
    r.pos = this.pos;
    this.pos += len;
    if (this.pos > this.end) throw new PuzzleFormatError('Codice Windmill troncato.');
    return r;
  }
  skip(wire: number) {
    if (wire === 0) this.varint();
    else if (wire === 1) this.pos += 8;
    else if (wire === 2) this.pos = this.sub().end;
    else if (wire === 5) this.pos += 4;
    else throw new PuzzleFormatError(`Wire type ${wire} non supportato.`);
  }
}

const zigzag = (n: number) => (n % 2 ? -(n + 1) / 2 : n / 2);

interface LegacyEntity {
  type: number;
  color: number;
  count: number;
  triangleCount: number;
  shape?: { width: number; grid: boolean[]; free: boolean; negative: boolean };
  orientation?: { h: number; v: number };
}

function readEntity(r: Reader): LegacyEntity {
  const e: LegacyEntity = { type: 0, color: 0, count: 0, triangleCount: 0 };
  while (!r.done()) {
    const tag = r.varint();
    const field = Math.floor(tag / 8);
    const wire = tag & 7;
    if (field === 1 && wire === 0) e.type = r.varint();
    else if (field === 2 && wire === 0) e.color = r.varint();
    else if (field === 3 && wire === 2) {
      const s = r.sub();
      const o = { h: 0, v: 0 };
      while (!s.done()) {
        const t = s.varint();
        if (t >> 3 === 1 && (t & 7) === 0) o.h = zigzag(s.varint());
        else if (t >> 3 === 2 && (t & 7) === 0) o.v = zigzag(s.varint());
        else s.skip(t & 7);
      }
      e.orientation = o;
    } else if (field === 4 && wire === 2) {
      const s = r.sub();
      const shape = { width: 0, grid: [] as boolean[], free: false, negative: false };
      while (!s.done()) {
        const t = s.varint();
        const f = t >> 3;
        const w = t & 7;
        if (f === 1 && w === 0) shape.width = s.varint();
        else if (f === 2 && w === 2) {
          const g = s.sub();
          while (!g.done()) shape.grid.push(g.varint() !== 0);
        } else if (f === 2 && w === 0) shape.grid.push(s.varint() !== 0);
        else if (f === 3 && w === 0) shape.free = s.varint() !== 0;
        else if (f === 4 && w === 0) shape.negative = s.varint() !== 0;
        else s.skip(w);
      }
      e.shape = shape;
    } else if (field === 5 && wire === 0) e.count = r.varint();
    else if (field === 6 && wire === 0) e.triangleCount = r.varint();
    else r.skip(wire);
  }
  return e;
}

function base64ToBytes(s: string): Uint8Array {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(s + pad);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

function bytesToBase64(b: Uint8Array): string {
  let s = '';
  b.forEach((x) => (s += String.fromCharCode(x)));
  return btoa(s);
}

/** Estrae il codice da un URL di windmill.thefifthmatt.com o lo restituisce così com'è. */
export function extractWindmillCode(text: string): string {
  const m = text.trim().match(/([A-Za-z0-9_\-+=]+_0)(?:[?#].*)?$/);
  if (!m) throw new PuzzleFormatError('Nessun codice Windmill riconosciuto (deve finire con "_0").');
  return m[1];
}

/** Converte un codice (o URL) di The Windmill nel formato JSON di edenna-puzzle. */
export function decodeWindmillCode(input: string): Puzzle {
  const code = extractWindmillCode(input);
  const b64 = code.slice(0, -2).replace(/_/g, '/').replace(/-/g, '+');
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(b64);
  } catch {
    throw new PuzzleFormatError('Codice Windmill non valido (base64).');
  }
  const r = new Reader(bytes);
  let storeWidth = 0;
  let symmetryNum = 0;
  const entities: LegacyEntity[] = [];
  while (!r.done()) {
    const tag = r.varint();
    const field = Math.floor(tag / 8);
    const wire = tag & 7;
    if (field === 1 && wire === 0) storeWidth = r.varint();
    else if (field === 2 && wire === 2) {
      const e = readEntity(r.sub());
      for (let i = 0; i < Math.max(1, e.count); i++) entities.push(e);
    } else if (field === 3 && wire === 0) symmetryNum = r.varint();
    else r.skip(wire);
  }
  if (!storeWidth || !entities.length || entities.length % storeWidth !== 0) {
    throw new PuzzleFormatError('Codice Windmill non valido (dimensioni).');
  }
  const storeHeight = entities.length / storeWidth;
  const width = Math.floor(storeWidth / 2);
  const height = Math.floor(storeHeight / 2);
  if (width < 1 || height < 1 || width > MAX_SIZE || height > MAX_SIZE) {
    throw new PuzzleFormatError(`Dimensioni ${width}x${height} non supportate.`);
  }

  const points: PointItem[] = [];
  const edges: EdgeItem[] = [];
  const cells: CellItem[] = [];
  for (let b = 0; b < storeHeight; b++) {
    for (let a = 0; a < storeWidth; a++) {
      const e = entities[a + storeWidth * b];
      const type = e.type || T.BASIC;
      if (type === T.BASIC) continue;
      const x = Math.floor(a / 2);
      const y = Math.floor(b / 2);
      const evenA = a % 2 === 0;
      const evenB = b % 2 === 0;
      const color = LEGACY_COLORS[e.color];
      if (evenA && evenB) {
        if (type === T.START) points.push({ x, y, type: 'start' });
        else if (type === T.END) points.push({ x, y, type: 'end' });
        else if (type === T.HEXAGON) points.push({ x, y, type: 'hexagon' });
      } else if (!evenA && !evenB) {
        if (type === T.SQUARE && color) cells.push({ x, y, type: 'square', color });
        else if (type === T.STAR && color) cells.push({ x, y, type: 'star', color });
        else if (type === T.ERROR) cells.push({ x, y, type: 'eliminator' });
        else if (type === T.TRIANGLE) {
          const count = Math.min(3, Math.max(1, e.triangleCount || 1)) as 1 | 2 | 3;
          cells.push({ x, y, type: 'triangle', count });
        } else if (type === T.TETRIS && e.shape && e.shape.width > 0 && e.shape.grid.length) {
          const rows: string[] = [];
          for (let i = 0; i < e.shape.grid.length; i += e.shape.width) {
            rows.push(
              e.shape.grid
                .slice(i, i + e.shape.width)
                .map((v) => (v ? '#' : '.'))
                .join(''),
            );
          }
          const poly: CellItem = { x, y, type: 'polyomino', shape: rows };
          if (e.shape.free) poly.rotatable = true;
          if (e.shape.negative) poly.negative = true;
          if (color) poly.color = color;
          cells.push(poly);
        }
      } else {
        const dir = evenA ? 'v' : 'h';
        const t = type === T.NONE ? 'missing' : type === T.DISJOINT ? 'gap' : type === T.HEXAGON ? 'hexagon' : null;
        if (t) edges.push({ x, y, dir, type: t });
      }
    }
  }
  return sanitize({
    format: FORMAT_ID,
    version: FORMAT_VERSION,
    width,
    height,
    symmetry: LEGACY_SYMMETRY[symmetryNum] ?? 'none',
    points,
    edges,
    cells,
    data: { windmillCode: code },
  });
}

// --- encoder (usato nei test di andata e ritorno; utile anche per esportare)

class Writer {
  bytes: number[] = [];
  varint(n: number) {
    while (n > 127) {
      this.bytes.push((n % 128) | 0x80);
      n = Math.floor(n / 128);
    }
    this.bytes.push(n);
  }
  tag(field: number, wire: number) {
    this.varint(field * 8 + wire);
  }
  message(field: number, inner: Writer) {
    this.tag(field, 2);
    this.varint(inner.bytes.length);
    this.bytes.push(...inner.bytes);
  }
}

/** Converte un puzzle nel codice di The Windmill (ignora i metadati). */
export function encodeWindmillCode(p: Puzzle): string {
  const sw = p.width * 2 + 1;
  const sh = p.height * 2 + 1;
  const ents: (Writer | null)[] = Array.from({ length: sw * sh }, () => null);
  const ent = (a: number, b: number, fill: (w: Writer) => void) => {
    const w = new Writer();
    fill(w);
    ents[a + sw * b] = w;
  };
  const colorNum = (c?: Color) => (c ? LEGACY_COLORS.indexOf(c) : 0);
  for (const pt of p.points) {
    const t = pt.type === 'start' ? T.START : pt.type === 'end' ? T.END : T.HEXAGON;
    ent(pt.x * 2, pt.y * 2, (w) => (w.tag(1, 0), w.varint(t)));
  }
  for (const e of p.edges) {
    const t = e.type === 'missing' ? T.NONE : e.type === 'gap' ? T.DISJOINT : T.HEXAGON;
    const [a, b] = e.dir === 'h' ? [e.x * 2 + 1, e.y * 2] : [e.x * 2, e.y * 2 + 1];
    ent(a, b, (w) => (w.tag(1, 0), w.varint(t)));
  }
  for (const c of p.cells) {
    ent(c.x * 2 + 1, c.y * 2 + 1, (w) => {
      if (c.type === 'square' || c.type === 'star') {
        w.tag(1, 0);
        w.varint(c.type === 'square' ? T.SQUARE : T.STAR);
        w.tag(2, 0);
        w.varint(colorNum(c.color));
      } else if (c.type === 'eliminator') {
        w.tag(1, 0);
        w.varint(T.ERROR);
      } else if (c.type === 'triangle') {
        w.tag(1, 0);
        w.varint(T.TRIANGLE);
        w.tag(6, 0);
        w.varint(c.count);
      } else {
        w.tag(1, 0);
        w.varint(T.TETRIS);
        if (c.color) {
          w.tag(2, 0);
          w.varint(colorNum(c.color));
        }
        const grid = shapeToGrid(c.shape);
        const s = new Writer();
        s.tag(1, 0);
        s.varint(grid[0]?.length ?? 0);
        const packed = new Writer();
        grid.flat().forEach((v) => packed.varint(v ? 1 : 0));
        s.message(2, packed);
        if (c.rotatable) (s.tag(3, 0), s.varint(1));
        if (c.negative) (s.tag(4, 0), s.varint(1));
        w.message(4, s);
      }
    });
  }
  const out = new Writer();
  out.tag(1, 0);
  out.varint(sw);
  let empty = 0;
  const flush = () => {
    if (!empty) return;
    const w = new Writer();
    if (empty > 1) (w.tag(5, 0), w.varint(empty));
    out.message(2, w);
    empty = 0;
  };
  ents.forEach((w) => {
    if (!w) {
      empty++;
      return;
    }
    flush();
    out.message(2, w);
  });
  flush();
  const symNum = LEGACY_SYMMETRY.lastIndexOf(p.symmetry);
  if (p.symmetry !== 'none') (out.tag(3, 0), out.varint(symNum));
  return bytesToBase64(Uint8Array.from(out.bytes)).replace(/\//g, '_').replace(/\+/g, '-') + '_0';
}
