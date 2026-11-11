import type { ReactNode } from 'react';
import type { CellItem, CellSpec, Color } from '../engine';
import { shapeToGrid, symbolColor } from '../engine';

/** Unità di disegno: una cella = 100 (come GRID_UNIT dell'originale). */
export const U = 100;
export const LINE = 20;
export const START_R = 25;
export const MARGIN = 60;

/** Le tinte vengono da variabili CSS, così il tema le può cambiare. */
export const colorVar = (c: Color) => `var(--ep-c-${c})`;

const TETRIS = 18;
const TETRIS_SPACE = 3;

interface SymbolProps {
  item: CellSpec;
  /** Lato massimo dei poliomini nel puzzle, per scalarli in modo uniforme. */
  maxPolySize?: number;
}

/**
 * Forme sovrapposte che compongono un unico simbolo. Per il bianco il bordo
 * si disegna prima sotto a tutte le forme (più spesso) e poi si copre con il
 * solo riempimento: i bordi interni della sovrapposizione non si vedono.
 */
function Merged({ white, paint, children }: { white: boolean; paint: { fill: string }; children: ReactNode }) {
  if (!white) return <g style={paint}>{children}</g>;
  return (
    <>
      <g className="ep-white-under" style={paint}>
        {children}
      </g>
      <g style={paint}>{children}</g>
    </>
  );
}

/** Disegna un simbolo di cella centrato nell'origine. */
export function CellSymbol({ item, maxPolySize = 4 }: SymbolProps) {
  const full = item as CellItem;
  const color = symbolColor(full) ?? 'black';
  const fill = colorVar(color);
  // Le variabili CSS funzionano in modo affidabile solo nello `style`, non
  // negli attributi di presentazione SVG.
  const paint = { fill };
  const cls = color === 'white' ? 'ep-white' : undefined;
  switch (item.type) {
    case 'square':
      return <rect className={cls} x={-20} y={-20} width={40} height={40} rx={13} style={paint} />;
    case 'star':
      return (
        <Merged white={!!cls} paint={paint}>
          <rect x={-15} y={-15} width={30} height={30} />
          <rect x={-15} y={-15} width={30} height={30} transform="rotate(45)" />
        </Merged>
      );
    case 'eliminator':
      return (
        <Merged white={!!cls} paint={paint}>
          {[-90, 30, 150].map((a) => (
            <rect key={a} x={0} y={-4} width={16} height={8} transform={`rotate(${a})`} />
          ))}
        </Merged>
      );
    case 'triangle': {
      const r = 9;
      const h = (r * Math.sqrt(3)) / 2;
      const step = r * 2 + 5;
      const n = item.count;
      return (
        <g className={cls} style={paint}>
          {Array.from({ length: n }, (_, i) => (
            <polygon
              key={i}
              points={`0,${-h} ${r},${h} ${-r},${h}`}
              transform={`translate(${i * step - ((n - 1) * step) / 2},0)`}
            />
          ))}
        </g>
      );
    }
    case 'polyomino': {
      const grid = shapeToGrid(item.shape);
      const rows = grid.length;
      const cols = grid[0]?.length ?? 0;
      const w = TETRIS * cols + TETRIS_SPACE * (cols - 1);
      const h = TETRIS * rows + TETRIS_SPACE * (rows - 1);
      const allowed = TETRIS * 3.4 * (item.rotatable ? 0.75 : 1);
      const maxDim = TETRIS * maxPolySize + TETRIS_SPACE * (maxPolySize - 1);
      const scale = maxDim <= allowed ? 1 : allowed / maxDim;
      const neg = !!item.negative;
      const inset = neg ? 2.5 : 0;
      return (
        <g transform={`${item.rotatable ? 'rotate(-15) ' : ''}scale(${scale}) translate(${-w / 2},${-h / 2})`}>
          {grid.flatMap((row, y) =>
            row.map((on, x) =>
              on ? (
                <rect
                  key={`${x},${y}`}
                  x={(TETRIS + TETRIS_SPACE) * x + inset}
                  y={(TETRIS + TETRIS_SPACE) * y + inset}
                  width={TETRIS - inset * 2}
                  height={TETRIS - inset * 2}
                  rx={neg ? 0 : 2}
                  className={cls}
                  style={neg ? { fill: 'none', stroke: fill, strokeWidth: 4 } : { fill }}
                />
              ) : null,
            ),
          )}
        </g>
      );
    }
  }
}

/** Esagono (su punto o lato), centrato nell'origine. */
export function Hexagon({ r = 9 }: { r?: number }) {
  const s = r / 2;
  const h = (r * Math.sqrt(3)) / 2;
  return (
    <polygon
      className="ep-hexagon"
      points={`${-r},0 ${-s},${-h} ${s},${-h} ${r},0 ${s},${h} ${-s},${h}`}
    />
  );
}

/** Dimensione massima dei poliomini (per scalarli tutti allo stesso modo). */
export function maxPolyominoSize(cells: CellItem[]) {
  let m = 0;
  for (const c of cells) {
    if (c.type !== 'polyomino') continue;
    const g = shapeToGrid(c.shape);
    m = Math.max(m, g.length, g[0]?.length ?? 0);
  }
  return Math.max(m, 1);
}
