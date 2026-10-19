import type { GuessResult, LetterStatus } from '../api';

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
    <div className="keys">
      {ROWS.map((row, i) => (
        <div key={i} className={`krow${i === 1 ? ' mid' : ''}`}>
          {row.map(key => {
            const status = key.length === 1 ? letterStatus[key] : undefined;
            const isFlipping = key.length === 1 && flippingLetters?.has(key);
            const cls = key === 'ENTER' ? ' word ink' : key === '⌫' ? ' word' : status && !isFlipping ? ` ${status}` : '';
            return (
              <button
                key={key}
                className={`key${cls}`}
                onClick={() => !disabled && onKey(key)}
                disabled={disabled}
                aria-label={key === '⌫' ? 'Delete' : key === 'ENTER' ? 'Enter' : key}
              >
                {key === '⌫'
                  ? <svg viewBox="0 0 24 24"><path d="M9 5h11v14H9l-6-7z"/><path d="M12.5 9.5l5 5M17.5 9.5l-5 5"/></svg>
                  : key === 'ENTER' ? 'Enter' : key}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
