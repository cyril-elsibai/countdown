/**
 * How-to-play sheet, opened from the help icon in the header.
 * One screen: the rule, one example word, and the three letter colors
 * used everywhere in the app.
 */

interface Props {
  onClose: () => void;
}

const EXAMPLE: { letter: string; status: '' | 'correct' | 'present' | 'absent' }[] = [
  { letter: 'P', status: 'correct' },
  { letter: 'L', status: 'absent' },
  { letter: 'A', status: 'present' },
  { letter: 'N', status: 'absent' },
  { letter: 'E', status: 'absent' },
  { letter: 'T', status: 'correct' },
];

export default function HelpSheet({ onClose }: Props) {
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="How to play">
        <div className="grab" />
        <div className="sheet-top">
          <h2 className="sheet-title">How to play</h2>
          <button className="icon-btn close-x" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>

        <p>
          Find the hidden word in six guesses. It has 6 or 7 letters, shown by the
          number of boxes. Each guess must be a real word.
        </p>

        <div className="example">
          {EXAMPLE.map((t, i) => (
            <div key={i} className={`tile ${t.status}`}>{t.letter}</div>
          ))}
        </div>

        <div className="legend">
          <div><i className="correct-bg" />Right letter, right spot</div>
          <div><i className="present-bg" />In the word, wrong spot</div>
          <div><i className="absent-bg" />Not in the word</div>
        </div>

        <p className="sub">A new daily word every day at midnight UTC. Log in to keep your streak and play past words.</p>

        <button className="btn ink wide" onClick={onClose}>Let's play</button>
      </div>
    </>
  );
}
