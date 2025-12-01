import React from "react";

export default function GuessGrid({
  rows,
  activeRow,
  activeTile,
}: {
  rows: { num1: number | null; op: string | null; num2: number | null; result: number | null; filled: boolean }[];
  activeRow: number;
  activeTile: "num1" | "operator" | "num2";
}) {
  return (
    <div data-guess-grid className="tile-grid guess-grid">
      {rows.map((row, idx) => (
        <React.Fragment key={idx}>
          <div
            className={`tile inp tile-num tile-num-1 ${idx === activeRow && activeTile === "num1" ? "active" : ""}`}
            data-state={idx === activeRow && activeTile === "num1" ? "active" : undefined}
          >
            {row.num1 ?? ""}
          </div>

          <div
            className={`tile inp tile-operator ${idx === activeRow && activeTile === "operator" ? "active" : ""}`}
            data-state={idx === activeRow && activeTile === "operator" ? "active" : undefined}
          >
            {row.op ?? ""}
          </div>

          <div
            className={`tile inp tile-num tile-num-2 ${idx === activeRow && activeTile === "num2" ? "active" : ""} ${row.isLast ? "last-tile" : ""}`}
            data-state={idx === activeRow && activeTile === "num2" ? "active" : undefined}
          >
            {row.num2 ?? ""}
          </div>

          <div className="tile equal">=</div>
          <div className={`tile result ${row.filled ? "filled" : ""}`} data-filled={row.filled ? "yes" : undefined} data-thebest={row.result && false ? "" : undefined}>
            {row.result ?? ""}
          </div>
        </React.Fragment>
          ))}
    </div>
  );
}
