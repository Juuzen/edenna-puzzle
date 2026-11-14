import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  type Coord,
  type Direction,
  type Path,
  type Puzzle,
  type SymbolRef,
  type ValidationResult,
  hasShift,
  indexPuzzle,
  validate,
} from '../engine';
import { PuzzleBoard, clientToGrid, type BoardStatus } from './PuzzleBoard';
import {
  CAPTURE_RADIUS,
  type TraceState,
  distanceToGrid,
  isTraceComplete,
  moveTrace,
  startTrace,
  stepTrace,
  tracePaths,
} from './tracing';

export interface PuzzlePlayerProps {
  puzzle: Puzzle;
  /** Chiamata quando il giocatore completa correttamente il puzzle. */
  onSolve?: (result: ValidationResult, paths: Path[]) => void;
  /** Chiamata a ogni tentativo sbagliato. */
  onFail?: (result: ValidationResult, paths: Path[]) => void;
  /** Chiamata a ogni inizio di tracciamento (utile per suoni o log). */
  onStart?: () => void;
  /** Mostra quali simboli non sono soddisfatti dopo un errore. Default: true. */
  revealErrors?: boolean;
  /** Dopo la soluzione il puzzle resta bloccato. Default: true. */
  lockOnSolve?: boolean;
  /** Disabilita ogni interazione. */
  disabled?: boolean;
  /** Durata (ms) dell'evidenziazione degli errori. Default: 1600. */
  failureDisplayMs?: number;
  /**
   * Distanza massima (in celle) fra puntatore e linee della griglia perché il
   * percorso lo segua. Default: 0.25 (al centro delle celle il puntatore è ignorato).
   */
  captureRadius?: number;
  /** Durata (ms) della dissolvenza quando un percorso viene abbandonato. Default: 400. */
  cancelFadeMs?: number;
  /** Fa ciclare i colori dei puzzle con `rainbow`. Default: true. */
  animateRainbow?: boolean;
  /**
   * Sposta e ruota la griglia dei puzzle con `shift`. Default: true. È solo
   * visivo: si traccia dove la griglia starebbe dritta, e la tastiera non
   * traccia (resta Esc per annullare).
   */
  applyShift?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/** Distanza massima (in celle) dal centro di una partenza per iniziare. */
const START_PICK = 0.4;

/**
 * Visualizzatore giocabile.
 *
 * Mouse: clic sulla partenza e il percorso segue il puntatore; clic di nuovo
 * sull'uscita per confermare (oppure trascina e rilascia). Clic destro o Esc
 * annulla.
 * Touch/penna: trascina dalla partenza all'uscita e rilascia.
 * Tastiera: Invio/Spazio per iniziare, frecce per muovere, Invio per
 * confermare, Esc per annullare.
 *
 * Puzzle sfalsati (`shift`): il puntatore lavora sulla griglia dritta, cioè
 * si clicca la partenza dove sta in Modifica, mentre linea e griglia si
 * vedono spostate. La tastiera non traccia (solo Esc) e la board esce
 * dall'ordine di tabulazione.
 */
export function PuzzlePlayer({
  puzzle,
  onSolve,
  onFail,
  onStart,
  revealErrors = true,
  lockOnSolve = true,
  disabled = false,
  failureDisplayMs = 1600,
  captureRadius = CAPTURE_RADIUS,
  cancelFadeMs = 400,
  animateRainbow = true,
  applyShift = true,
  className,
  style,
}: PuzzlePlayerProps) {
  const idx = indexPuzzle(puzzle);
  /** Griglia sfalsata: niente tracciamento da tastiera. */
  const shifted = applyShift && hasShift(puzzle);
  const svgRef = useRef<SVGSVGElement>(null);
  const [trace, setTrace] = useState<TraceState | null>(null);
  const [status, setStatus] = useState<BoardStatus>('idle');
  const [errors, setErrors] = useState<SymbolRef[]>([]);
  const [eliminated, setEliminated] = useState<SymbolRef[]>([]);
  const [finalPaths, setFinalPaths] = useState<Path[] | null>(null);
  /** Posizione del puntatore (coordinate di griglia) mentre si traccia. */
  const [cursor, setCursor] = useState<Coord | null>(null);
  /** Percorso abbandonato che sta svanendo. */
  const [fading, setFading] = useState<TraceState | null>(null);
  const traceRef = useRef<TraceState | null>(null);
  const dragRef = useRef<{ pointerId: number; moved: boolean; mode: 'drag' | 'follow' } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const update = (t: TraceState | null) => {
    traceRef.current = t;
    setTrace(t);
  };

  const reset = useCallback(() => {
    window.clearTimeout(timer.current);
    update(null);
    setCursor(null);
    setFading(null);
    dragRef.current = null;
    setStatus('idle');
    setErrors([]);
    setEliminated([]);
    setFinalPaths(null);
  }, []);

  // Nuovo puzzle → stato pulito.
  useEffect(reset, [puzzle, reset]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const locked = disabled || (lockOnSolve && status === 'success');

  const begin = (t: TraceState) => {
    window.clearTimeout(timer.current);
    setFading(null);
    setErrors([]);
    setEliminated([]);
    setFinalPaths(null);
    setStatus('tracing');
    update(t);
    onStart?.();
  };

  /** Abbandona il percorso: svanisce con una breve dissolvenza. */
  const cancel = () => {
    const t = traceRef.current;
    dragRef.current = null;
    setCursor(null);
    update(null);
    window.clearTimeout(timer.current);
    if (t && (t.path.length > 1 || t.t > 0)) {
      setFading(t);
      setStatus('cancelled');
      timer.current = window.setTimeout(() => {
        setFading(null);
        setStatus('idle');
      }, cancelFadeMs);
    } else {
      setFading(null);
      setStatus('idle');
    }
  };

  /** Rilascio/conferma: convalida se il serpente è sull'uscita. */
  const finish = () => {
    const t = traceRef.current;
    dragRef.current = null;
    setCursor(null);
    if (!t) return;
    if (!isTraceComplete(idx, t)) {
      cancel();
      return;
    }
    const paths = tracePaths(idx, t);
    const result = validate(puzzle, paths);
    update(null);
    setFinalPaths(paths);
    if (result.valid) {
      setStatus('success');
      setEliminated(result.eliminated);
      onSolve?.(result, paths);
    } else {
      setStatus('failure');
      if (revealErrors) setErrors(result.errors);
      onFail?.(result, paths);
      timer.current = window.setTimeout(() => {
        setStatus('idle');
        setErrors([]);
        setFinalPaths(null);
      }, failureDisplayMs);
    }
  };

  // --- puntatore

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (locked || !svgRef.current) return;
    if (e.button === 2) {
      cancel();
      return;
    }
    if (e.button !== 0) return;
    const g = clientToGrid(svgRef.current, e.clientX, e.clientY);
    if (traceRef.current) {
      // Secondo clic in modalità "segui il puntatore": conferma.
      finish();
      return;
    }
    const start = puzzle.points
      .filter((p) => p.type === 'start')
      .map((p) => ({ p, d: Math.hypot(p.x - g.x, p.y - g.y) }))
      .sort((a, b) => a.d - b.d)[0];
    if (!start || start.d > START_PICK) return;
    e.preventDefault();
    svgRef.current.setPointerCapture(e.pointerId);
    dragRef.current = { pointerId: e.pointerId, moved: false, mode: e.pointerType === 'mouse' ? 'follow' : 'drag' };
    begin(startTrace(start.p));
    setCursor(g);
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const t = traceRef.current;
    if (!t || !svgRef.current) return;
    const g = clientToGrid(svgRef.current, e.clientX, e.clientY);
    setCursor(g);
    const next = moveTrace(idx, t, g, captureRadius);
    if (dragRef.current && next.path.length + next.t > 1.3) dragRef.current.moved = true;
    update(next);
  };

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    // Con il mouse: se si è trascinato, il rilascio conferma; se era un
    // semplice clic, si continua a seguire il puntatore fino al clic successivo.
    if (d.mode === 'drag' || d.moved) finish();
  };

  // --- tastiera

  const KEY_DIR: Record<string, Direction> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    w: 'up',
    s: 'down',
    a: 'left',
    d: 'right',
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (locked) return;
    const t = traceRef.current;
    if (e.key === 'Escape') {
      cancel();
      e.preventDefault();
      return;
    }
    if (shifted) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (t) finish();
      else {
        const s = puzzle.points.find((p) => p.type === 'start');
        if (s) begin(startTrace(s));
      }
      return;
    }
    const dir = KEY_DIR[e.key];
    if (dir && t) {
      e.preventDefault();
      setCursor(null);
      update(stepTrace(idx, t, dir));
    }
  };

  return (
    <div className={`ep-player${className ? ` ${className}` : ''}`} style={style}>
      <PuzzleBoard
        ref={svgRef}
        puzzle={puzzle}
        trace={trace ?? fading}
        paths={finalPaths}
        status={status}
        errors={errors}
        eliminated={eliminated}
        animateRainbow={animateRainbow}
        applyShift={applyShift}
        pointer={trace ? cursor : null}
        pointerIdle={!!cursor && distanceToGrid(puzzle, cursor) > captureRadius}
        tabIndex={disabled || shifted ? -1 : 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={cancel}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={onKeyDown}
        style={{ touchAction: 'none', cursor: locked ? 'default' : trace ? 'none' : 'pointer' }}
      />
    </div>
  );
}
