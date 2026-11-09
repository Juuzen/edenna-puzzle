/**
 * Modello dati di un puzzle.
 *
 * È lo stesso oggetto che viene esportato/importato in JSON: niente classi,
 * niente stato nascosto. Tutte le funzioni del motore lo trattano come
 * immutabile.
 *
 * Sistema di coordinate (come in windmill-client):
 * - una griglia di `width` x `height` celle;
 * - i punti (incroci) vanno da (0,0) a (width,height), y cresce verso il basso;
 * - le celle vanno da (0,0) a (width-1,height-1); la cella (x,y) ha come
 *   angolo in alto a sinistra il punto (x,y);
 * - un lato "h" in (x,y) collega i punti (x,y) e (x+1,y);
 *   un lato "v" in (x,y) collega i punti (x,y) e (x,y+1).
 */

export const FORMAT_ID = 'edenna-puzzle';
export const FORMAT_VERSION = 1;

export type Color =
  | 'black'
  | 'white'
  | 'cyan'
  | 'magenta'
  | 'yellow'
  | 'red'
  | 'green'
  | 'blue'
  | 'orange';

export const COLORS: readonly Color[] = [
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

export type Symmetry = 'none' | 'horizontal' | 'vertical' | 'rotational';

export type Direction = 'up' | 'down' | 'left' | 'right';

export type EdgeOrientation = 'h' | 'v';

/** Simboli su un punto (incrocio). */
export type PointItem =
  | { x: number; y: number; type: 'start' }
  /** `dir` è opzionale: se manca viene calcolata in automatico. */
  | { x: number; y: number; type: 'end'; dir?: Direction }
  | { x: number; y: number; type: 'hexagon' };

/** Modifiche/simboli su un lato. */
export type EdgeItem = {
  x: number;
  y: number;
  dir: EdgeOrientation;
  /**
   * - `gap`: lato interrotto, non percorribile (si vede il taglio);
   * - `missing`: lato assente, non percorribile e non disegnato;
   * - `hexagon`: il percorso deve passare su questo lato.
   */
  type: 'gap' | 'missing' | 'hexagon';
};

/**
 * Forma di un poliomino: righe di caratteri, `#` (o `X`) = pieno,
 * qualsiasi altro carattere = vuoto. Esempio: ["##", "#."]
 */
export type ShapeRows = string[];

/** Simboli dentro una cella. */
export type CellItem =
  | { x: number; y: number; type: 'square'; color: Color }
  | { x: number; y: number; type: 'star'; color: Color }
  | {
      x: number;
      y: number;
      type: 'polyomino';
      shape: ShapeRows;
      /** Se vero il pezzo può essere ruotato (mai specchiato). */
      rotatable?: boolean;
      /** Poliomino negativo (in blu): sottrae area. */
      negative?: boolean;
      /** Default: giallo se positivo, blu se negativo. Conta per le stelle. */
      color?: Color;
    }
  /** Il simbolo a Y: annulla un altro simbolo della sua regione. */
  | { x: number; y: number; type: 'eliminator'; color?: Color }
  | { x: number; y: number; type: 'triangle'; count: 1 | 2 | 3; color?: Color };

export type CellType = CellItem['type'];

/** `Omit` che funziona sulle unioni (distribuito su ogni membro). */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** Un simbolo di cella senza posizione. */
export type CellSpec = DistributiveOmit<CellItem, 'x' | 'y'>;
/** Un simbolo di punto senza posizione. */
export type PointSpec = DistributiveOmit<PointItem, 'x' | 'y'>;
export type PointType = PointItem['type'];
export type EdgeType = EdgeItem['type'];

export interface PuzzleMeta {
  id?: string;
  title?: string;
  author?: string;
  description?: string;
  /** Campo libero per l'applicazione che ospita il puzzle (es. Edenna OS). */
  data?: Record<string, unknown>;
}

export interface Puzzle extends PuzzleMeta {
  format: typeof FORMAT_ID;
  version: typeof FORMAT_VERSION;
  width: number;
  height: number;
  symmetry: Symmetry;
  points: PointItem[];
  edges: EdgeItem[];
  cells: CellItem[];
}

export interface Coord {
  x: number;
  y: number;
}

/** Un percorso è la lista dei punti attraversati, in ordine. */
export type Path = Coord[];

export const DIRECTIONS: Record<Direction, Coord> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const MAX_SIZE = 12;
