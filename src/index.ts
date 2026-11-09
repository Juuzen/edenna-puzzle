/**
 * edenna-puzzle — editor e visualizzatore di puzzle a linea (stile The Witness)
 * in React. Il motore (`./engine`) non dipende da React e si può usare anche
 * da solo, per esempio in Electron/Node per validare soluzioni.
 */
import './components/theme.css';
import './components/editor.css';

export * from './engine';
export { PuzzleBoard, clientToGrid } from './components/PuzzleBoard';
export type { PuzzleBoardProps, BoardStatus } from './components/PuzzleBoard';
export { PuzzlePlayer } from './components/PuzzlePlayer';
export type { PuzzlePlayerProps } from './components/PuzzlePlayer';
export { PuzzleEditor } from './components/PuzzleEditor';
export type { PuzzleEditorProps } from './components/PuzzleEditor';
export {
  type TraceState,
  startTrace,
  moveTrace,
  stepTrace,
  isTraceComplete,
  tracePaths,
} from './components/tracing';
