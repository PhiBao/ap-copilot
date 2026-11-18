"use client";

const STEPS = ["Register payees", "Paste invoices", "Review & verify", "Approve & settle", "Reconcile"];

export function Steps({ current }: { current: number }) {
  return (
    <div className="steps" aria-label="Progress">
      {STEPS.map((label, i) => {
        const n = i + 1;
        return (
          <div key={label} className={`step ${n === current ? "current" : ""} ${n < current ? "done" : ""}`}>
            <div className="step-num">{String(n).padStart(2, "0")}</div>
            <div className="step-label">{label}</div>
          </div>
        );
      })}
    </div>
  );
}
