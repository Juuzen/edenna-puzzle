import { memo } from 'react';
import { type Puzzle, hasShift } from '../engine';
import { PuzzleBoard } from './PuzzleBoard';
import { rainbowLayers } from './rainbow';
import { RainbowMark } from './RainbowMarks';
import { ShiftMark } from './ShiftMark';

/**
 * Miniatura statica di un puzzle (raccolta, importazione). Arcobaleno e
 * sfalsamento non si vedono: li segnala un piccolo segno nell'angolo.
 */
export const PuzzleThumb = memo(function PuzzleThumb({ puzzle }: { puzzle: Puzzle }) {
  const board = <PuzzleBoard puzzle={puzzle} className="ep-library__thumb" aria-hidden label="" />;
  const rainbow = rainbowLayers(puzzle.rainbow).length > 0;
  const shift = hasShift(puzzle);
  if (!rainbow && !shift) return board;
  const title = [rainbow && 'Arcobaleno', shift && 'Griglia sfalsata'].filter(Boolean).join(' · ');
  return (
    <span className="ep-library__thumbwrap" title={title}>
      {board}
      <span className="ep-library__marks">
        {shift && <ShiftMark size={12} />}
        {rainbow && <RainbowMark size={12} />}
      </span>
    </span>
  );
});
