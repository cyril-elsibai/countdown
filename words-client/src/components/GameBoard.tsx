import type { GuessResult, LetterStatus } from '../api';

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

export default function GameBoard({ wordLength, guesses, currentInput, maxGuesses, shake, revealingRow, revealedCount }: Props) {
  const rows: (GuessResult | null)[] = [];

  for (let i = 0; i < maxGuesses; i++) {
    rows.push(guesses[i] ?? null);
  }

  return (
    <div className={`board${wordLength === 6 ? ' six' : ''}`}>
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
        const isActiveRow = isCurrentRow && !guess && revealingRow === null && !guesses[guesses.length - 1]?.solved;

        return (
          <div key={rowIdx} className={`brow${isCurrentRow && shake ? ' shake' : ''}`}>
            {letters.map((letter, colIdx) => {
              const status: LetterStatus | null = guess?.feedback[colIdx] ?? null;
              // Only apply color class after the cell has passed its flip midpoint
              const showColor = status && (!isRevealing || colIdx < revealedCount);
              const isActiveCell = colIdx === activeColIdx;
              return (
                <div
                  key={colIdx}
                  className={`tile${showColor ? ` ${status}` : ''}${letter.trim() && !showColor ? ' filled' : ''}${isRevealing ? ' flipping' : ''}${isActiveCell && isActiveRow ? ' cursor' : ''}`}
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
