export default function VictoryModal({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="victory show" id="victory-container">
      <div className="close" onClick={onRestart}>
        ✖
      </div>
      <div className="victory-title">
        <h1>Congratulations!</h1>
      </div>
      <div id="victory-subtitle">You matched the target perfectly 🎯</div>
      <button className="key large reset" onClick={onRestart}>
        Play again
      </button>
    </div>
  );
}
