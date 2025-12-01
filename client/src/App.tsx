import { useEffect, useRef, useState } from "react";
import Header from "./components/Header";
import TargetGrid from "./components/TargetGrid";
import GuessGrid from "./components/GuessGrid";
import Keyboard from "./components/Keyboard";
import VictoryModal from "./components/VictoryModal";
import AlertContainer from "./components/AlertContainer";
import { cardDeck, getRandomInt, generateTarget, calculateRow } from "./utils/gameLogic";

type KeyObj = {
  id: string;
  value: number | null;     // null for empty calculated slots
  kind: "init" | "calculated";
  used?: boolean;          // for init keys when consumed
  valueIn?: boolean;       // for calculated keys when the result was "used" into the grid
  active?: boolean;
};

type Row = {
  num1: number | null;
  op: string | null;
  num2: number | null;
  result: number | null;
  filled: boolean; // whether the result tile is filled (row complete)
  isLast?: boolean;
};

const ALERT_DURATION = 1500;

export default function App() {
  const [target, setTarget] = useState<number>(0);
  const [keys, setKeys] = useState<KeyObj[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [activeRow, setActiveRow] = useState(0);
  const [activeTile, setActiveTile] = useState<"num1" | "operator" | "num2">("num1");
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [currentBest, setCurrentBest] = useState<number | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [inputMode, setInputMode] = useState<'number' | 'operator'>('number');
  const startTime = useRef<number | null>(null);

  useEffect(() => {
    initGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showAlert(message: string, duration = ALERT_DURATION) {
    setAlertMsg(message);
    setTimeout(() => setAlertMsg(null), duration);
  }

  function initGame() {
    // target
    const t = generateTarget();
    setTarget(t);
    startTime.current = Date.now();
    setCurrentBest(0);

    // keys: 6 init keys + 4 calculated slots (empty)
    // draw 6 unique card indices (not indices but values with duplicates handled by deck)
    const pulledIdx: number[] = [];
    let multiplied = 1;

    // draw until product >= target for solvability as you had originally
    while (multiplied < t) {
      pulledIdx.length = 0;
      multiplied = 1;
      while (pulledIdx.length < 6) {
        const idx = getRandomInt(cardDeck.length);
        if (!pulledIdx.includes(idx)) {
          pulledIdx.push(idx);
          multiplied *= cardDeck[idx];
        }
      }
      // if still < target, loop to draw a new set
    }

    const initKeys: KeyObj[] = pulledIdx.map((idx, i) => ({
      id: `init-${i}-${cardDeck[idx]}`,
      value: cardDeck[idx],
      kind: "init",
      used: false,
    }));

    // add 4 calculated slots
    for (let i = 0; i < 4; i++) {
      initKeys.push({
        id: `calc-${i}`,
        value: null,
        kind: "calculated",
        valueIn: false,
      });
    }

    setKeys(initKeys);

    // rows: 5 rows pre-created
    const r: Row[] = Array.from({ length: 5 }).map((_, i) => ({
      num1: null,
      op: null,
      num2: null,
      result: null,
      filled: false,
      isLast: i === 4,
    }));
    setRows(r);

    setActiveRow(0);
    setActiveTile("num1");
    setGameOver(false);
  }

  // helper to update a key by id
  function updateKey(id: string, patch: Partial<KeyObj>) {
    setKeys((prev) => prev.map(k => k.id === id ? { ...k, ...patch } : k));
  }

  // find first calculated slot that is empty and not valueIn
  function findNextCalculatedSlotIndex() {
    return keys.findIndex(k => k.kind === "calculated" && k.value === null && !k.valueIn);
  }

  function computeResultAndAdvance(a: number, op: string, b: number) {
    const calc = calculateRow(a, b, op);
    if (!calc.ok) {
      showAlert(calc.error || "Invalid operation");
      return false;
    }
    const numResult = calc.result!;
    // set row result and mark as filled
    setRows((prev) => {
      const copy = prev.map(r => ({ ...r }));
      copy[activeRow].result = numResult;
      copy[activeRow].filled = true;
      return copy;
    });

    // update best
    setCurrentBest((prevBest) => {
      const current = prevBest ?? 0;
      const diff = Math.abs(target - current);
      const newDiff = Math.abs(target - numResult);
      if (newDiff <= diff) return numResult;
      return prevBest;
    });

    // create new calculated key: put result into first available calculated slot
    setKeys((prevKeys) => {
      const copy = prevKeys.map(k => ({ ...k }));
      const idx = copy.findIndex(k => k.kind === "calculated" && k.value === null && !k.valueIn);
      if (idx !== -1) {
        copy[idx].value = numResult;
        // ensure it's active (clickable)
        copy[idx].used = false;
      } else {
        // If somehow no calculated slot is free, drop it (shouldn't happen)
        console.warn("No calculated slot free for result", numResult);
      }
      return copy;
    });

    // move to next row or end game
    if (activeRow === rows.length - 1) {
      // last row completed → stop game
      setGameOver(true);
      const endTime = Date.now();
      const duration = startTime.current ? Math.round((endTime - startTime.current)/1000) : 0;
      showAlert(`Game finished in ${duration}s`);
    } else {
      // next row: num1 should become the result (not automatically in your original — you left it for the player to pick the new number? In original, result becomes a new card to be used)
      // We will set next row active and expect player to click the new number (from calculated keys).
      setActiveRow((r) => r + 1);
      setActiveTile("num1");
    }

    return true;
  }

  // press a key (either init or calculated)
  // This mirrors pressKey in your original code
  function handleKeyPress(keyId: string) {
    if (gameOver) return;
    const key = keys.find(k => k.id === keyId);
    if (!key) return;
    if (key.kind === "calculated" && key.value === null) return; // empty calculated slot

    // if key marked inactive (used true) we ignore
    if (key.used) return;

    // depending on activeTile
    const val = key.value!;
    if (activeTile === "num1") {
      // set current row num1
      setRows((prev) => {
        const copy = prev.map(r => ({ ...r }));
        copy[activeRow].num1 = val;
        return copy;
      });

      // mark key used if init (only init keys become used)
      if (key.kind === "init") updateKey(keyId, { used: true });
      // calculated keys are not marked 'used' per se in your original logic, but your original sets data-valuein on calculated when used into tile; we mimic it:
      if (key.kind === "calculated") updateKey(keyId, { valueIn: true });

      // next step: operator
      setActiveTile("operator");
      return;
    }

    if (activeTile === "operator") {
      // operator chosen
      setRows((prev) => {
        const copy = prev.map(r => ({ ...r }));
        copy[activeRow].op = String(val);
        return copy;
      });

      // operator keys in keyboard had data-key of + - x / — those are separate keys in keyboard component, so this branch is for number keys only; but we keep for safety.
      setActiveTile("num2");
      return;
    }

    if (activeTile === "num2") {
      // set num2, calculate
      setRows((prev) => {
        const copy = prev.map(r => ({ ...r }));
        copy[activeRow].num2 = val;
        return copy;
      });

      // mark key used
      if (key.kind === "init") updateKey(keyId, { used: true });
      if (key.kind === "calculated") updateKey(keyId, { valueIn: true });

      // compute result
      const r = rows[activeRow];
      // careful: r may be stale due to setState; compute using latest from state by reading the row after setRows above
      // read values directly from current rows state
      const currentRow = (() => {
        const curr = rows[activeRow];
        // but we already updated via setRows; to be safer, recompute a and op from state updater
        const a = curr?.num1 ?? null;
        const op = curr?.op ?? null;
        const b = val;
        if (a === null || op === null) {
          // fallback: try to read from the DOM-like state via prev rows after setRows — simplest approach: read latest via functional updater
          // We'll use a small trick: read rows from state directly (this closure uses stale rows but should be OK in typical small app)
        }
        return { a, op, b };
      })();

      // Because of potential stale state inside closure, compute row using the most recent state by reading rows variable (React batches, but this works)
      const rowNow = rows[activeRow];
      const a = rowNow?.num1 ?? null;
      const op = rowNow?.op ?? null;
      const b = val;

      if (a === null || op === null) {
        // This shouldn't happen, but protect
        showAlert("Incomplete operation");
        return;
      }

      // calculate and advance
      computeResultAndAdvance(a, op, b);
    }
  }

  // operator click handler (separate operator buttons)
  function handleOperatorClick(op: string) {
    if (gameOver) return;
    if (activeTile !== "operator") return;
    // set the operator on the row
    setRows(prev => {
      const copy = prev.map(r => ({ ...r }));
      copy[activeRow].op = op;
      return copy;
    });
    setActiveTile("num2");
  }

  // Undo: revert last edit
  function handleUndo() {
    if (gameOver) return;
    // find last filled element in rows (search from activeRow backwards)
    // rules mirror your deleteKey: depending on activeTile, we undo previous element
    // We'll implement a best-effort consistent behavior:
    const r = [...rows];

    // if activeTile is num1 (we are at the start of a row), then we need to go back to previous row's result or num2 etc.
    if (activeTile === "num1") {
      // if we're at the first tile of game do nothing
      if (activeRow === 0 && r[0].num1 === null) return;
      // if previous row has result, revert that result and set activeRow to that row and activeTile to num2 (so user can re-enter second operand)
      if (r[activeRow].num1 === null && activeRow > 0) {
        const prevIdx = activeRow - 1;
        // revert prev row's result to null and free the calculated key that holds it if any
        const prevRow = r[prevIdx];
        if (prevRow.filled) {
          // find calculated key with that value and free it
          setKeys((prevKeys) => prevKeys.map(k => (k.kind === 'calculated' && k.value === prevRow.result) ? { ...k, value: null, valueIn: false } : k));
          prevRow.result = null;
          prevRow.filled = false;
          // revert the last used num2 and operator back into their tiles
        }
        setRows(r);
        setActiveRow(prevIdx);
        setActiveTile("num2");
        return;
      }
      // otherwise (there is something in num1 of current row) clear it
      if (r[activeRow].num1 !== null) {
        // reactivate the key that was used (try to find a key with value and used true)
        const val = r[activeRow].num1!;
        setKeys(prev => prev.map(k => (k.value === val && k.kind === 'init' && k.used) ? { ...k, used: false } : k));
        r[activeRow].num1 = null;
        setRows(r);
        return;
      }
    }

    // if activeTile is operator: remove operator and set activeTile to num1
    if (activeTile === "operator") {
      if (r[activeRow].op !== null) {
        r[activeRow].op = null;
        setRows(r);
      }
      setActiveTile("num1");
      return;
    }

    // if activeTile is num2: clear num2 or if already empty, go back to operator
    if (activeTile === "num2") {
      if (r[activeRow].num2 !== null) {
        const val = r[activeRow].num2!;
        // reactivate key if it was init
        setKeys(prev => prev.map(k => (k.value === val && k.kind === 'init' && k.used) ? { ...k, used: false } : k));
        r[activeRow].num2 = null;
        setRows(r);
        setActiveTile("operator");
        return;
      } else {
        setActiveTile("operator");
        return;
      }
    }
  }

  // Reset: clear tiles and keyboard but keep same target and card draw? In original resetTiles/resetKeyboard didn't regenerate target
  function handleReset() {
    // reset tiles:
    setRows(prev => prev.map((r) => ({ ...r, num1: null, op: null, num2: null, result: null, filled: false })));
    // reset keys: init keys become unused, calculated keys cleared
    setKeys(prev => prev.map(k => k.kind === "init" ? { ...k, used: false } : { ...k, value: null, valueIn: false }));
    setActiveRow(0);
    setActiveTile("num1");
    setCurrentBest(0);
  }

  return (
    <div className="container">
      <Header />
      <TargetGrid target={target} />
      <AlertContainer />
      <GuessGrid rows={rows} activeRow={activeRow} activeTile={activeTile} />
      <Keyboard
        keys={keys}
        onKeyPress={handleKeyPress}
        onOperatorPress={handleOperatorClick}
        onReset={handleReset}
        onUndo={handleUndo}
        disabled={gameOver}
        activeTile={activeTile}
      />
      {gameOver && <VictoryModal onRestart={() => initGame()} />}
      {alertMsg && <div className="alert" style={{position:'fixed',left:20,top:80}}>{alertMsg}</div>}
    </div>
  );
}
