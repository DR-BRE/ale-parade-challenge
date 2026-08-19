"use client";

import React from "react";

// The +1 button. Each tap re-keys the .pour layer so the
// fill / foam / ring animations restart from zero.
export default function SplitButton({ onPour }: { onPour: () => void }) {
  const [pourId, setPourId] = React.useState(0);
  const handle = () => {
    setPourId((n) => n + 1);
    onPour();
  };
  return (
    <button type="button" className="split-btn" onClick={handle} aria-label="Add one split">
      {pourId > 0 && (
        <span className="pour" key={pourId}>
          <span className="pour-liquid" />
          <span className="pour-foam" />
          <span className="pour-ring" />
        </span>
      )}
      <span className={pourId > 0 ? "split-label pour-label" : "split-label"} key={"l" + pourId}>
        Split the G<span className="plus">+1</span>
      </span>
    </button>
  );
}
