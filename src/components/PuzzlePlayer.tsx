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
  traceHead,
  moveTrace,
  startTrace,
  stepTrace,
  tracePaths,
} from './tracing';
import { boardFrame, nearestTo, shiftGeometry, visualToGridCandidates, wrapIntoPanel } from './shift';
import { U } from './Symbols';

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
   * Sposta e ruota la griglia dei puzzle con `shift`. Default: true. Si
   * traccia sulla griglia così come si vede; la tastiera non traccia (resta
   * Esc per annullare).
   */
  applyShift?: boolean;
  /**
   * Nei puzzle sfalsati, col mouse, cattura il puntatore mentre si traccia
   * (Pointer Lock): conta solo il movimento e il puntatore si avvolge come la
   * griglia, così si può proseguire oltre il bordo dello schermo. Esc o la
   * conferma lo rilasciano. Se il browser lo nega si usa la posizione
   * assoluta. Default: true.
   */
  lockPointer?: boolean;
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
 * Puzzle sfalsati (`shift`): conta ciò che si vede. Si clicca la partenza
 * dove è disegnata, anche se è rientrata dal lato opposto del pannello, e
 * il percorso segue il puntatore sulla griglia spostata e ruotata. La
 * tastiera non traccia (solo Esc) e la board esce dall'ordine di tabulazione.
 * Col mouse il puntatore viene catturato mentre si traccia (`lockPointer`):
 * un puntatore virtuale si avvolge ai bordi del pannello insieme alla linea.
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
  lockPointer = true,
  className,
  style,
}: PuzzlePlayerProps) {
  const idx = indexPuzzle(puzzle);
  /** Griglia sfalsata: niente tracciamento da tastiera. */
  const shifted = applyShift && hasShift(puzzle);
  const svgRef = useRef<SVGSVGElement>(null);
  /** Ultima posizione del puntatore sulla griglia: sceglie la copia giusta dell'avvolgimento. */
  const lastPointer = useRef<Coord | null>(null);
  /**
   * Punti di griglia sotto il puntatore. Senza sfalsamento è uno solo; con lo
   * sfalsamento uno per ogni copia disegnata (avvolgimento ai bordi).
   */
  const pointerCandidates = (clientX: number, clientY: number): Coord[] => {
    const raw = clientToGrid(svgRef.current!, clientX, clientY);
    if (!shifted) return [raw];
    const frame = boardFrame(puzzle.width, puzzle.height);
    return visualToGridCandidates(frame, shiftGeometry(frame, puzzle.shift), raw.x * U, raw.y * U);
  };
  /** Puntatore virtuale (unità SVG, spazio disegnato) mentre il mouse è catturato. */
  const virtual = useRef<Coord | null>(null);
  /** Il lock è stato ottenuto per il tracciamento in corso. */
  const lockActive = useRef(false);
  const isLocked = () => !!svgRef.current && document.pointerLockElement === svgRef.current;
  const releaseLock = useCallback(() => {
    virtual.current = null;
    if (svgRef.current && document.pointerLockElement === svgRef.current) document.exitPointerLock();
  }, []);
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
    releaseLock();
    window.clearTimeout(timer.current);
    update(null);
    setCursor(null);
    setFading(null);
    dragRef.current = null;
    setStatus('idle');
    setErrors([]);
    setEliminated([]);
    setFinalPaths(null);
  }, [releaseLock]);

  // Nuovo puzzle → stato pulito.
  useEffect(reset, [puzzle, reset]);
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      releaseLock();
    },
    [releaseLock],
  );

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
    releaseLock();
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
    releaseLock();
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

  // Lock perso mentre si traccia (Esc, cambio di finestra): il browser non
  // inoltra quell'Esc alla pagina, quindi si annulla qui.
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  useEffect(() => {
    const onChange = () => {
      if (isLocked()) {
        lockActive.current = true;
        return;
      }
      if (!lockActive.current) return;
      lockActive.current = false;
      virtual.current = null;
      if (traceRef.current) cancelRef.current();
    };
    document.addEventListener('pointerlockchange', onChange);
    return () => document.removeEventListener('pointerlockchange', onChange);
  }, []);

  // --- puntatore

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (locked || !svgRef.current) return;
    if (e.button === 2) {
      cancel();
      return;
    }
    if (e.button !== 0) return;
    if (traceRef.current) {
      // Secondo clic in modalità "segui il puntatore": conferma.
      finish();
      return;
    }
    const cands = pointerCandidates(e.clientX, e.clientY);
    const start = puzzle.points
      .filter((p) => p.type === 'start')
      .flatMap((p) => cands.map((g) => ({ p, g, d: Math.hypot(p.x - g.x, p.y - g.y) })))
      .sort((a, b) => a.d - b.d)[0];
    if (!start || start.d > START_PICK) return;
    const g = start.g;
    lastPointer.current = g;
    e.preventDefault();
    svgRef.current.setPointerCapture(e.pointerId);
    dragRef.current = { pointerId: e.pointerId, moved: false, mode: e.pointerType === 'mouse' ? 'follow' : 'drag' };
    begin(startTrace(start.p, g));
    setCursor(g);
    if (shifted && lockPointer && e.pointerType === 'mouse') requestLock(e.clientX, e.clientY);
  };

  /** Cattura il mouse partendo dal punto cliccato; se non si può, resta l'input assoluto. */
  const requestLock = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg || typeof svg.requestPointerLock !== 'function') return;
    const raw = clientToGrid(svg, clientX, clientY);
    virtual.current = { x: raw.x * U, y: raw.y * U };
    try {
      const r = svg.requestPointerLock() as unknown;
      if (r && typeof (r as Promise<void>).catch === 'function') {
        (r as Promise<void>).catch(() => {
          virtual.current = null;
        });
      }
    } catch {
      virtual.current = null;
    }
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const t = traceRef.current;
    if (!t || !svgRef.current) return;
    let cands: Coord[];
    if (isLocked() && virtual.current) {
      // Mouse catturato: conta il movimento; il puntatore virtuale si avvolge
      // nel pannello come la griglia, quindi non incontra mai un bordo.
      const frame = boardFrame(puzzle.width, puzzle.height);
      const m = svgRef.current.getScreenCTM();
      const scale = m ? Math.hypot(m.a, m.b) || 1 : 1;
      const v = wrapIntoPanel(frame, {
        x: virtual.current.x + e.movementX / scale,
        y: virtual.current.y + e.movementY / scale,
      });
      virtual.current = v;
      cands = visualToGridCandidates(frame, shiftGeometry(frame, puzzle.shift), v.x, v.y);
    } else {
      cands = pointerCandidates(e.clientX, e.clientY);
    }
    // Fra le copie, quella più vicina al passo precedente: oltre un bordo il
    // percorso prosegue nella copia che rientra dal lato opposto.
    const g = nearestTo(cands, lastPointer.current ?? traceHead(t));
    lastPointer.current = g;
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
        // Il puntatore può essere ovunque: lo si riaggancia vicino alla testa.
        if (s) begin({ ...startTrace(s), detached: true });
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
