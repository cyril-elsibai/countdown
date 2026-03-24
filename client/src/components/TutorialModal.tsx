import { useState } from 'react';

interface TutorialModalProps {
  onClose: () => void;
}

const STEPS = [
  {
    title: 'Reach the target',
    content: (
      <div className="tutorial-step-body">
        <p className="tutorial-step-label">Your goal</p>
        <div className="tutorial-target-tiles">
          <div className="tutorial-target-tile">4</div>
          <div className="tutorial-target-tile">8</div>
          <div className="tutorial-target-tile">3</div>
        </div>
        <p className="tutorial-step-desc">
          The yellow number at the top is your target. Get as close to it as possible. You have <strong>60 seconds</strong> — after that it's overtime but you can still play.
        </p>
      </div>
    ),
  },
  {
    title: 'Pick your numbers',
    content: (
      <div className="tutorial-step-body">
        <p className="tutorial-step-label">Tap a red tile to start</p>
        <div className="tutorial-tiles-row">
          <div className="tutorial-tile red">3</div>
          <div className="tutorial-tile red">7</div>
          <div className="tutorial-tile red">25</div>
          <div className="tutorial-tile red">6</div>
          <div className="tutorial-tile red">50</div>
          <div className="tutorial-tile red">100</div>
        </div>
        <p className="tutorial-step-desc">
          These are your 6 starting numbers. Tap one — it fills the first slot of a new calculation row.
        </p>
      </div>
    ),
  },
  {
    title: 'Build a calculation',
    content: (
      <div className="tutorial-step-body">
        <div className="tutorial-calc-row">
          <div className="tutorial-tile red">25</div>
          <div className="tutorial-tile blue">×</div>
          <div className="tutorial-tile red">3</div>
          <span className="tutorial-equals">=</span>
          <div className="tutorial-tile yellow">75</div>
        </div>
        <div className="tutorial-tiles-row" style={{ marginTop: '10px' }}>
          <div className="tutorial-tile blue">+</div>
          <div className="tutorial-tile blue">−</div>
          <div className="tutorial-tile blue">×</div>
          <div className="tutorial-tile blue">÷</div>
        </div>
        <p className="tutorial-step-desc">
          Pick a <strong>blue operator</strong>, then a second number. The result appears automatically. Each row is one calculation.
        </p>
      </div>
    ),
  },
  {
    title: 'Chain & submit',
    content: (
      <div className="tutorial-step-body">
        <div className="tutorial-calc-row">
          <div className="tutorial-tile red">25</div>
          <div className="tutorial-tile blue">×</div>
          <div className="tutorial-tile red">3</div>
          <span className="tutorial-equals">=</span>
          <div className="tutorial-tile yellow">75</div>
        </div>
        <div className="tutorial-chain-arrow">↓ reuse</div>
        <div className="tutorial-calc-row">
          <div className="tutorial-tile yellow">75</div>
          <div className="tutorial-tile blue">+</div>
          <div className="tutorial-tile red">7</div>
          <span className="tutorial-equals">=</span>
          <div className="tutorial-tile yellow">82</div>
        </div>
        <p className="tutorial-step-desc">
          Yellow tiles are results you can reuse. Chain as many rows as you need, then hit <strong>Submit</strong> when you're as close as you can get!
        </p>
      </div>
    ),
  },
];

export default function TutorialModal({ onClose }: TutorialModalProps) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;

  const handleClose = () => {
    localStorage.setItem('tutorialSeen', '1');
    onClose();
  };

  return (
    <div className="tutorial-overlay" onClick={handleClose}>
      <div className="tutorial-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tutorial-header">
          <span className="tutorial-title">How to play</span>
          <button className="tutorial-close" onClick={handleClose}>×</button>
        </div>

        <div className="tutorial-dots">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`tutorial-dot${i === step ? ' active' : ''}`}
              onClick={() => setStep(i)}
            />
          ))}
        </div>

        <div className="tutorial-step-title">{STEPS[step].title}</div>

        {STEPS[step].content}

        <div className="tutorial-nav">
          <button
            className="tutorial-btn secondary"
            onClick={step === 0 ? handleClose : () => setStep(step - 1)}
          >
            {step === 0 ? 'Skip' : '← Back'}
          </button>
          <button
            className="tutorial-btn primary"
            onClick={isLast ? handleClose : () => setStep(step + 1)}
          >
            {isLast ? 'Let\'s play!' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}
