import type { GuessResult, LetterStatus } from '../api';
import './Keyboard.css';

const ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','⌫'],
];

interface Props {
  guesses: GuessResult[];
  onKey: (key: string) => void;
  disabled?: boolean;
  flippingLetters?: Set<string>;
  revealingRow?: number | null;
}

export default function Keyboard({ guesses, onKey, disabled, flippingLetters, revealingRow }: Props) {
  // Build letter → best status map, excluding the row currently being revealed
  const effectiveGuesses = revealingRow != null ? guesses.slice(0, revealingRow) : guesses;
  const letterStatus: Record<string, LetterStatus> = {};
  for (const guess of effectiveGuesses) {
    guess.feedback.forEach((status, i) => {
      const letter = guess.guess[i];
      const current = letterStatus[letter];
      if (status === 'correct') {
        letterStatus[letter] = 'correct';
      } else if (status === 'present' && current !== 'correct') {
        letterStatus[letter] = 'present';
      } else if (!current) {
        letterStatus[letter] = 'absent';
      }
    });
  }

  return (
    <div className="keyboard">
      {ROWS.map((row, i) => (
        <div key={i} className="keyboard-row">
          {row.map(key => {
            const status = key.length === 1 ? letterStatus[key] : undefined;
            const isFlipping = key.length === 1 && flippingLetters?.has(key);
            return (
              <button
                key={key}
                className={`key${key === 'ENTER' || key === '⌫' ? ' key-wide' : ''}${status && !isFlipping ? ` key-${status}` : ''}`}
                onClick={() => !disabled && onKey(key)}
                disabled={disabled}
              >
                {key}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
