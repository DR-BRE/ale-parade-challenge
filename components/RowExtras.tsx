"use client";

import SplitButton from "@/components/SplitButton";

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

// A person's average Rate-my-G accuracy, or a quiet dash if they've yet to be
// judged. Shared by the champion plaque and the ledger rows.
export function GAccuracy({ avg }: { avg?: number }) {
  if (avg === undefined) {
    return <div className="g-acc empty" title="No Rate my G attempts yet">&mdash;</div>;
  }
  return (
    <div className="g-acc" title="Average Rate my G accuracy">
      <span className="g-acc-val">{avg}</span>
      <span className="g-acc-unit">% G</span>
    </div>
  );
}
