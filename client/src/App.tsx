import { useState, useEffect, useRef } from 'react';

// Types
type TileState = {
  value: string;
  filled: boolean;
  active: boolean;
};

type Row = {
  num1: TileState;
  operator: TileState;
  num2: TileState;
  result: TileState;
};

type KeyState = {
  value: string;
  used: boolean;
  inactive: boolean;
};

const CARD_DECK = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 25, 50, 75, 100];
const COUNTDOWN_SECONDS = 60;

export default function App() {
  const [target, setTarget] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [initCards, setInitCards] = useState<KeyState[]>([]);
  const [calculatedKeys, setCalculatedKeys] = useState<KeyState[]>([
    { value: '', used: false, inactive: true },
    { value: '', used: false, inactive: true },
    { value: '', used: false, inactive: true },
    { value: '', used: false, inactive: true },
  ]);
  const [currentBest, setCurrentBest] = useState(0);
  const [activePosition, setActivePosition] = useState({ row: 0, type: 'num1' as 'num1' | 'operator' | 'num2' });
  const [gameWon, setGameWon] = useState(false);
  const [winTime, setWinTime] = useState(0);
  const [winSteps, setWinSteps] = useState(0);
  const [timer, setTimer] = useState(0);
  const [timerStopped, setTimerStopped] = useState(false);
  const [alert, setAlert] = useState('');
  
  const startTimeRef = useRef(Date.now());
  const gameStartTimeRef = useRef(Date.now()); // Never reset - for tracking real solve time
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize game
  useEffect(() => {
    initializeGame();
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  // Timer effect
  useEffect(() => {
    startTimeRef.current = Date.now();
    timerIntervalRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      setTimer(elapsed);
      
      if (elapsed >= COUNTDOWN_SECONDS && !timerStopped) {
        setTimerStopped(true);
      }
    }, 100);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [timerStopped]);

  const initializeGame = () => {
    // Reset the game start time
    gameStartTimeRef.current = Date.now();

    // Generate target
    const newTarget = Math.floor(Math.random() * 900) + 100;
    setTarget(newTarget);

    // Draw cards (max 2 big numbers, i.e. value >= 10)
    let pulledCards: number[] = [];
    let multiplied = 1;

    while (multiplied < newTarget) {
      pulledCards = [];
      multiplied = 1;
      let bigCount = 0;
      let i = 0;
      while (i < 6) {
        const nb = Math.floor(Math.random() * 24);
        const cardValue = CARD_DECK[nb];
        const isBig = cardValue >= 10;

        // Skip if this would exceed 2 big numbers
        if (isBig && bigCount >= 2) continue;

        if (!pulledCards.includes(nb)) {
          pulledCards.push(nb);
          multiplied *= cardValue;
          if (isBig) bigCount++;
          i++;
        }
      }
    }

    const cards = pulledCards.map(index => ({
      value: String(CARD_DECK[index]),
      used: false,
      inactive: false,
    }));
    setInitCards(cards);

    // Initialize 5 rows
    const initialRows: Row[] = Array(5).fill(null).map(() => ({
      num1: { value: '', filled: false, active: false },
      operator: { value: '', filled: false, active: false },
      num2: { value: '', filled: false, active: false },
      result: { value: '', filled: false, active: false },
    }));
    
    initialRows[0].num1.active = true;
    setRows(initialRows);
    setActivePosition({ row: 0, type: 'num1' });
    setGameWon(false);
  };

  const showAlert = (message: string) => {
    setAlert(message);
    setTimeout(() => setAlert(''), 1500);
  };

  const handleKeyPress = (value: string, isCalculated: boolean, calcKeyIndex?: number) => {
    const { row, type } = activePosition;
    const currentRow = rows[row];

    const isNumber = type === 'num1' || type === 'num2';
    const keyIsNumber = !['+', '-', '×', '/'].includes(value);

    if (isNumber !== keyIsNumber) return;

    const newRows = [...rows];
    newRows[row] = { ...currentRow };
    newRows[row][type] = { value, filled: true, active: false };

    // Track calculated keys updates in a single array to avoid state overwrites
    let newCalcKeys = [...calculatedKeys];

    // Mark the used key as inactive first (before calculating result)
    if (isNumber) {
      if (isCalculated && calcKeyIndex !== undefined) {
        newCalcKeys[calcKeyIndex] = { ...newCalcKeys[calcKeyIndex], used: true, inactive: true };
      } else if (!isCalculated) {
        const newInitCards = [...initCards];
        const cardIndex = newInitCards.findIndex(k => k.value === value && !k.used);
        if (cardIndex !== -1) {
          newInitCards[cardIndex] = { ...newInitCards[cardIndex], used: true, inactive: true };
          setInitCards(newInitCards);
        }
      }
    }

    if (type === 'num2') {
      const result = calculateResult(
        parseInt(currentRow.num1.value),
        currentRow.operator.value,
        parseInt(value)
      );

      if (result.error) {
        showAlert(result.error);
        return;
      }

      newRows[row].result = { value: result.value, filled: true, active: false };

      const newValue = parseInt(result.value);
      const currentDiff = Math.abs(target - currentBest);
      const newDiff = Math.abs(target - newValue);

      if (newDiff <= currentDiff || currentBest === 0) {
        setCurrentBest(newValue);
      }

      if (Math.abs(target - newValue) === 0) {
        const endTime = (Date.now() - gameStartTimeRef.current) / 1000;
        setWinTime(parseFloat(endTime.toFixed(2)));
        setWinSteps(row + 1);
        setGameWon(true);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        setRows(newRows);
        setCalculatedKeys(newCalcKeys);
        return;
      }

      if (row < 4) {
        const emptyIndex = newCalcKeys.findIndex(k => !k.value);
        if (emptyIndex !== -1) {
          newCalcKeys[emptyIndex] = { value: result.value, used: false, inactive: false };
        }

        newRows[row + 1].num1.active = true;
        setActivePosition({ row: row + 1, type: 'num1' });
      } else {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      }
    } else {
      const nextType = type === 'num1' ? 'operator' : 'num2';
      newRows[row][nextType].active = true;
      setActivePosition({ row, type: nextType });
    }

    setRows(newRows);
    setCalculatedKeys(newCalcKeys);
  };

  const calculateResult = (num1: number, operator: string, num2: number) => {
    let result: number;
    
    switch (operator) {
      case '+':
        result = num1 + num2;
        break;
      case '-':
        if (num2 >= num1) return { error: 'Error: result must be positive', value: '' };
        result = num1 - num2;
        break;
      case '×':
        result = num1 * num2;
        break;
      case '/':
        result = num1 / num2;
        if (!Number.isInteger(result)) return { error: 'Error: result must be an integer', value: '' };
        break;
      default:
        return { error: 'Invalid operator', value: '' };
    }
    
    return { error: null, value: String(result) };
  };

  const deleteRow = (rowIndex: number) => {
    const newRows = [...rows];
    const rowToDelete = newRows[rowIndex];

    const valuesToReactivate: string[] = [];
    if (rowToDelete.num1.filled) valuesToReactivate.push(rowToDelete.num1.value);
    if (rowToDelete.num2.filled) valuesToReactivate.push(rowToDelete.num2.value);
    const resultValue = rowToDelete.result.value;

    newRows[rowIndex] = {
      num1: { value: '', filled: false, active: false },
      operator: { value: '', filled: false, active: false },
      num2: { value: '', filled: false, active: false },
      result: { value: '', filled: false, active: false },
    };

    const newInitCards = [...initCards];
    const newCalcKeys = [...calculatedKeys];

    valuesToReactivate.forEach(value => {
      const initIndex = newInitCards.findIndex(k => k.value === value && k.used);
      if (initIndex !== -1) {
        newInitCards[initIndex] = { ...newInitCards[initIndex], used: false, inactive: false };
      } else {
        const calcIndex = newCalcKeys.findIndex(k => k.value === value);
        if (calcIndex !== -1) {
          newCalcKeys[calcIndex] = { ...newCalcKeys[calcIndex], used: false, inactive: false };
        }
      }
    });

    if (resultValue) {
      const calcIndex = newCalcKeys.findIndex(k => k.value === resultValue);
      if (calcIndex !== -1) {
        newCalcKeys[calcIndex] = { value: '', used: false, inactive: true };
      }
    }

    setInitCards(newInitCards);
    setCalculatedKeys(newCalcKeys);

    // Clear all active states first
    newRows.forEach(row => {
      row.num1.active = false;
      row.operator.active = false;
      row.num2.active = false;
    });

    // Set active position on the deleted row
    newRows[rowIndex].num1.active = true;
    setActivePosition({ row: rowIndex, type: 'num1' });

    setRows(newRows);
    recalculateBest(newRows);
  };

  const recalculateBest = (currentRows: Row[]) => {
    let best = 0;
    let bestDiff = Infinity;

    currentRows.forEach(row => {
      if (row.result.filled) {
        const value = parseInt(row.result.value);
        const diff = Math.abs(target - value);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = value;
        }
      }
    });

    setCurrentBest(best);
  };

  const resetGame = () => {
    // Don't reset the timer - keep it running
    
    // Reset game state but keep target and cards
    setRows(Array(5).fill(null).map(() => ({
      num1: { value: '', filled: false, active: false },
      operator: { value: '', filled: false, active: false },
      num2: { value: '', filled: false, active: false },
      result: { value: '', filled: false, active: false },
    })));
    
    // First row, first tile active
    setRows(prev => {
      const newRows = [...prev];
      newRows[0].num1.active = true;
      return newRows;
    });
    
    // Reset all init cards to unused
    setInitCards(prev => prev.map(card => ({
      ...card,
      used: false,
      inactive: false,
    })));
    
    // Clear all calculated keys
    setCalculatedKeys([
      { value: '', used: false, inactive: true },
      { value: '', used: false, inactive: true },
      { value: '', used: false, inactive: true },
      { value: '', used: false, inactive: true },
    ]);
    
    setActivePosition({ row: 0, type: 'num1' });
    setCurrentBest(0);
    setGameWon(false);
  };

  const getAvailableKeys = () => {
    const { type } = activePosition;
    if (type === 'operator') {
      return { numbers: [], operators: ['+', '-', '×', '/'] };
    } else {
      const availableNumbers = [
        ...initCards.filter(k => !k.inactive).map(k => ({ value: k.value, isCalculated: false })),
        ...calculatedKeys.filter(k => k.value && !k.inactive).map(k => ({ value: k.value, isCalculated: true }))
      ];
      return { numbers: availableNumbers, operators: [] };
    }
  };

  const available = getAvailableKeys();
  // Find the current row being worked on (highest row with num1 filled)
  const currentWorkingRowIndex = rows.reduce((lastIndex, row, index) => {
    return row.num1.filled ? index : lastIndex;
  }, -1);

  return (
    <div className="app-container">
      <div className="content-wrapper">
        {/* Header */}
        <div className="header">
          <h1>Number.Le</h1>
        </div>

        {/* Target */}
        <div className="target-grid">
          {String(target).split('').map((digit, i) => (
            <div key={i} className="target-tile">{digit}</div>
          ))}
        </div>

        {/* Timer */}
        <div className="timer-container">
          <div className={`timer ${timerStopped ? 'overtime' : ''}`}>
            {timerStopped ? `${COUNTDOWN_SECONDS}++ seconds` : `${timer.toFixed(1)}s`}
          </div>
        </div>

        {/* Alert */}
        {alert && <div className="alert-inline">{alert}</div>}

        {/* Victory Modal */}
        {gameWon && (
          <>
            <div className="victory-overlay" onClick={(e) => e.stopPropagation()} />
            <div className="victory-modal">
              <h1>Congratulations!</h1>
              <p>
                You finished the puzzle
                {winTime <= 300 ? ` in ${winTime}s` : ''} with {winSteps} step{winSteps > 1 ? 's' : ''}.
              </p>
            </div>
          </>
        )}

        {/* Game Grid */}
        <div className="game-grid">
          {rows.map((row, rowIndex) => {
            const isBest = row.result.filled && parseInt(row.result.value) === currentBest;
            const showDelete = row.num1.filled && rowIndex === currentWorkingRowIndex;

            return (
              <div key={rowIndex} className="grid-row">
                <div className={`tile ${row.num1.active ? 'active' : ''} ${isBest ? 'best' : ''}`}>
                  {row.num1.value}
                </div>
                <div className={`tile operator-tile ${row.operator.active ? 'active' : ''}`}>
                  {row.operator.value}
                </div>
                <div className={`tile ${row.num2.active ? 'active' : ''} ${isBest ? 'best' : ''}`}>
                  {row.num2.value}
                </div>
                <div className="equals">=</div>
                <div className={`tile result-tile ${isBest ? 'best' : ''}`}>
                  {row.result.value}
                </div>
                <button
                  onClick={() => deleteRow(rowIndex)}
                  className="delete-row-btn"
                  style={{ visibility: showDelete ? 'visible' : 'hidden' }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        {/* Keyboard */}
        <div className="keyboard">
          {initCards.map((card, i) => (
            <button
              key={i}
              onClick={() => handleKeyPress(card.value, false)}
              disabled={gameWon || card.inactive || available.operators.length > 0}
              className={`key init-key ${card.inactive || available.operators.length > 0 ? 'inactive' : ''}`}
            >
              {card.value}
            </button>
          ))}
          
          <div className="spacer" />
          
          {calculatedKeys.map((key, i) => (
            <button
              key={`calc-${i}`}
              onClick={() => handleKeyPress(key.value, true, i)}
              disabled={gameWon || key.inactive || !key.value || available.operators.length > 0}
              className={`key calc-key ${key.inactive || !key.value || available.operators.length > 0 ? 'inactive' : ''}`}
            >
              {key.value}
            </button>
          ))}
          
          <div className="spacer" />
          
          <button className="key reset-key" onClick={resetGame} disabled={gameWon}>Reset</button>
          
          {['+', '-', '×', '/'].map(op => (
            <button
              key={op}
              onClick={() => handleKeyPress(op, false)}
              disabled={gameWon || available.numbers.length > 0}
              className={`key operator-key ${available.numbers.length > 0 ? 'inactive' : ''}`}
            >
              {op}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}