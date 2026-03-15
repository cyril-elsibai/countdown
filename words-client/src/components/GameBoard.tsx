import type { GuessResult, LetterStatus } from '../api';
import './GameBoard.css';

interface Props {
  wordLength: 6 | 7;
  guesses: GuessResult[];
  currentInput: string;
  maxGuesses: number;
  shake: boolean;
  revealingRow: number | null;
  revealedCount: number; // how many cells in revealingRow have had their color applied
  settledRows: Set<number>;
}

export default function GameBoard({ wordLength, guesses, currentInput, maxGuesses, shake, revealingRow, revealedCount, settledRows }: Props) {
  const rows: (GuessResult | null)[] = [];

  for (let i = 0; i < maxGuesses; i++) {
    rows.push(guesses[i] ?? null);
  }

  return (
    <div className="game-board">
      {rows.map((guess, rowIdx) => {
        const isCurrentRow = rowIdx === guesses.length;
        const isRevealing = rowIdx === revealingRow;
        const letters = guess
          ? guess.guess.split('')
          : isCurrentRow
          ? currentInput.padEnd(wordLength, ' ').split('')
          : new Array(wordLength).fill(' ');

        const isRowFull = isCurrentRow && currentInput.length === wordLength;
        const activeColIdx = isCurrentRow && !isRowFull ? currentInput.length : -1;
        const isActiveRow = isCurrentRow && !guess && revealingRow === null;

        return (
          <div key={rowIdx} className={`board-row${wordLength === 7 ? ' seven' : ''}${isCurrentRow && shake ? ' shake' : ''}${isActiveRow ? ' active-row' : ''}${isRowFull ? ' row-ready' : ''}${settledRows.has(rowIdx) ? ' row-settled' : ''}`}>
            {letters.map((letter, colIdx) => {
              const status: LetterStatus | null = guess?.feedback[colIdx] ?? null;
              // Only apply color class after the cell has passed its flip midpoint
              const showColor = status && (!isRevealing || colIdx < revealedCount);
              const isActiveCell = colIdx === activeColIdx;
              return (
                <div
                  key={colIdx}
                  className={`board-cell${showColor ? ` ${status}` : ''}${letter.trim() && !showColor ? ' filled' : ''}${isRevealing ? ' flipping' : ''}${isActiveCell ? ' active-cell' : ''}`}
                  style={isRevealing ? { '--reveal-delay': `${colIdx * 0.3}s` } as React.CSSProperties : undefined}
                >
                  {letter.trim()}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
