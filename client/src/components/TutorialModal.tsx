/**
 * How-to-play sheet. Auto-opens once for new guests (localStorage 'tutorialSeen'),
 * and from the help icon in the header. One screen, Wordle-style: the rules,
 * one worked example row, and the three distance colors used everywhere in the app.
 */

interface TutorialModalProps {
  onClose: () => void;
  // Present only during an active game: clearing all rows lives here instead of on the keyboard
  onClearAll?: () => void;
}

export default function TutorialModal({ onClose, onClearAll }: TutorialModalProps) {
  const handleClose = () => {
    localStorage.setItem('tutorialSeen', '1');
    onClose();
  };

  return (
    <>
      <div className="scrim" onClick={handleClose} />
      <div className="sheet" role="dialog" aria-label="How to play">
        <div className="grab" />
        <div className="sheet-top">
          <h2 className="sheet-title">How to play</h2>
          <button className="icon-btn close-x" onClick={handleClose} aria-label="Close">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>

        <p>
          Reach the target using the six numbers and + − × ÷. Each number can be used once.
          Every result becomes a new number you can use in the next row.
        </p>

        <div className="eqrow example">
          <div className="cell filled">25</div>
          <div className="cell op filled">×</div>
          <div className="cell filled">3</div>
          <div className="eq">=</div>
          <div className="cell res filled far">75</div>
        </div>

        <div className="legend">
          <div><i className="exact-bg" />Exact: you hit the target</div>
          <div><i className="close-bg" />Within 10 of the target</div>
          <div><i className="far-bg" />More than 10 away</div>
        </div>

        <p className="sub">
          The line under the header is your 60 seconds. After that it's overtime and you can keep playing.
          Not exact? Submit your closest result any time.
        </p>

        {onClearAll ? (
          <div className="actions">
            <button className="btn ink wide" onClick={handleClose}>Back to the game</button>
            <button className="btn line wide" onClick={onClearAll}>Clear all rows</button>
          </div>
        ) : (
          <button className="btn ink wide" onClick={handleClose}>Let's play</button>
        )}
      </div>
    </>
  );
}
