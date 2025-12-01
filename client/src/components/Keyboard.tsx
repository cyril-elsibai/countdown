import React from "react";

type KeyObj = {
  id: string;
  value: number | null;
  kind: "init" | "calculated";
  used?: boolean;
  valueIn?: boolean;
};

export default function Keyboard({
  keys,
  onKeyPress,
  onOperatorPress,
  onReset,
  onUndo,
  disabled,
  activeTile,
}: {
  keys: KeyObj[];
  onKeyPress: (keyId: string) => void;
  onOperatorPress: (op: string) => void;
  onReset: () => void;
  onUndo: () => void;
  disabled: boolean;
  activeTile: "num1" | "operator" | "num2" | null;
}) {
  // separate init from calculated
  const initKeys = keys.filter(k => k.kind === "init");
  const calcKeys = keys.filter(k => k.kind === "calculated");
  const isNumberPhase = activeTile === "num1" || activeTile === "num2";
  const isOperatorPhase = activeTile === "operator";


  return (
    <div className="keyboard">
      {/* init keys (6) */}
      {initKeys.map(k => (
        <button
          key={k.id}
          className={`key init ${k.used || !isNumberPhase ? "inactive" : ""}`}
          onClick={() => isNumberPhase && onKeyPress(k.id)}
          disabled={disabled || !isNumberPhase || !!k.used}
          data-key={k.value ?? ""}
        >
          {k.value}
        </button>
      ))}

      <div className="space"></div>

      {/* calculated keys slots (4) */}
      {calcKeys.map(k => (
        <button
          key={k.id}
          className={`key large calculated ${k.value === null || !isNumberPhase ? "inactive" : ""}`}
          onClick={() => k.value !== null && isNumberPhase && onKeyPress(k.id)}
          disabled={disabled || !isNumberPhase || k.value === null}
          data-key={k.value ?? ""}
        >
          {k.value ?? ""}
        </button>
      ))}

      <div className="space"></div>

      <button className="key large reset" onClick={onReset}>Reset</button>
      <button className="key operator" onClick={() => onOperatorPress("+")} disabled={!isOperatorPhase}>+</button>
      <button className="key operator" onClick={() => onOperatorPress("-")} disabled={!isOperatorPhase}>-</button>
      <button className="key operator" onClick={() => onOperatorPress("x")} disabled={!isOperatorPhase}>x</button>
      <button className="key operator" onClick={() => onOperatorPress("/")} disabled={!isOperatorPhase}>/</button>

      <button className="key large delete" onClick={onUndo}>Undo</button>
    </div>
  );
}
