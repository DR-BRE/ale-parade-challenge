"use client";

import SplitButton from "@/components/SplitButton";
import { timeText } from "@/lib/timeText";
import type { Entry } from "@/components/LeaderRow";

// The current user's controls: take one back, or split the G. Shared by the
// champion plaque and the ledger rows.
export function YouActions({
  count,
  onPour,
  onUndo,
}: {
  count: number;
  onPour: () => void;
  onUndo: () => void;
}) {
  return (
    <div className="you-actions">
      <button
        type="button"
        className="undo-btn"
        disabled={count === 0}
        onClick={onUndo}
        aria-label="Undo one split"
        title="Take one back"
      >
        &minus;1
      </button>
      <SplitButton onPour={onPour} />
    </div>
  );
}

// A person's pour history, revealed by the chevron.
export function Breakdown({ history }: { history: Entry[] }) {
  return (
    <div className="breakdown">
      {history.length === 0 ? (
        <div className="bd-empty">No pours yet.</div>
      ) : (
        history.map((e) => (
          <div key={e.id} className={e.type === "undo" ? "bd-item undo" : "bd-item"}>
            <span className="bd-text">{e.type === "undo" ? "Took one back" : "Split the G"}</span>
            <span className="bd-time">{timeText(e.ts)}</span>
          </div>
        ))
      )}
    </div>
  );
}
