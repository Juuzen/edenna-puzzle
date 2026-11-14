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
  | { x: number; y: number; type: 'hexagon' }
  /** Ponte: incrocio interno che il percorso può attraversare due volte. */
  | { x: number; y: number; type: 'bridge' };

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

/** Sfondo del pannello: tinta unita o gradiente lineare di due colori. */
export interface PuzzleBackground {
  /** 1 colore = tinta unita, 2 = gradiente. Formato "#rrggbb". */
  colors: [string] | [string, string];
  /** Gradi, convenzione CSS (0 = verso l'alto, 90 = verso destra, 180 = verso il basso). Default 180. */
  angle?: number;
}

/**
 * Colori di griglia e percorsi ("#rrggbb"). Valgono solo insieme a
 * `background`: senza uno sfondo proprio decide il tema.
 */
export interface PuzzlePalette {
  /** Linee della griglia, uscite e cerchio di partenza. */
  line?: string;
  /** Percorso mentre si traccia. */
  path?: string;
  /** Percorso a soluzione corretta. */
  success?: string;
}

/** Un livello dell'effetto arcobaleno: presente = attivo. */
export interface RainbowLayer {
  /** Secondi per un ciclo completo dei colori (RAINBOW_PERIOD_MIN–MAX). */
  period: number;
}

/**
 * Effetto arcobaleno, puramente visivo: i colori ciclano partendo da quello
 * base, che resta l'unico usato dalle regole. La griglia non è coinvolta.
 */
export interface PuzzleRainbow {
  /** Simboli di cella, esagoni e ponti. */
  elements?: RainbowLayer;
  /** Sfondo del pannello. */
  background?: RainbowLayer;
}

/**
 * Sfalsamento visivo della griglia: si vede spostata e ruotata, con
 * avvolgimento ai bordi del pannello, e il giocatore traccia su ciò che
 * vede. Le regole non cambiano.
 */
export interface PuzzleShift {
  /** Spostamento orizzontale in celle (positivo = destra). */
  x?: number;
  /** Spostamento verticale in celle (positivo = giù). */
  y?: number;
  /** Rotazione in gradi, senso orario (negativo = antiorario), attorno al centro della griglia. Da -20 a 20. */
  rotation?: number;
}

export interface PuzzleMeta {
  /**
   * Identificativo interno, univoco tra tutte le raccolte (`p1`, `p2`, …).
   * Lo assegna la gestione delle raccolte: non va mostrato né modificato.
   */
  id?: string;
  title?: string;
  /** Se manca si usa il colore del tema. */
  background?: PuzzleBackground;
  /** Colori di griglia e percorsi (solo con `background`). */
  palette?: PuzzlePalette;
  /** Colori che ciclano durante il gioco (solo visivo). */
  rainbow?: PuzzleRainbow;
  /** Griglia spostata e ruotata (solo visivo). */
  shift?: PuzzleShift;
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

/** Raccolta di puzzle con nome (file `edenna-puzzle-set`). */
export interface PuzzleCollection {
  /** Identificativo interno univoco (`c1`, `c2`, …), come `PuzzleMeta.id`. */
  id?: string;
  name: string;
  description?: string;
  puzzles: Puzzle[];
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
