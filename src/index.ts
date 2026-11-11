/**
 * edenna-puzzle — editor e visualizzatore di puzzle a linea (stile The Witness)
 * in React. Il motore (`./engine`) non dipende da React e si può usare anche
 * da solo, per esempio in Electron/Node per validare soluzioni.
 */
import './components/theme.css';
import './components/editor.css';
import './components/library.css';

export * from './engine';
export { PuzzleBoard, clientToGrid } from './components/PuzzleBoard';
export type { PuzzleBoardProps, BoardStatus } from './components/PuzzleBoard';
export { PuzzlePlayer } from './components/PuzzlePlayer';
export type { PuzzlePlayerProps } from './components/PuzzlePlayer';
export { PuzzleEditor } from './components/PuzzleEditor';
export type { PuzzleEditorProps } from './components/PuzzleEditor';
export { PuzzleLibrary } from './components/PuzzleLibrary';
export type { PuzzleLibraryProps, LibraryPosition } from './components/PuzzleLibrary';
export { ImportDialog, importSummary } from './components/ImportDialog';
export type { ImportDialogProps, ImportSource } from './components/ImportDialog';
export * from './components/collectionOps';
export { gradientLine, backgroundCss, type GradientLine } from './components/background';
export {
  type TraceState,
  startTrace,
  moveTrace,
  stepTrace,
  isTraceComplete,
  tracePaths,
} from './components/tracing';
