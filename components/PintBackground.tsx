"use client";

import React from "react";

// Full-screen "pint" backdrop: settling pour — cream foam head with a
// noise-roughened edge, tan settle zone, and a cascade of micro-bubbles
// streaming downward through the dark body.
// Bubble params come from a deterministic hash so SSR and client agree.
export default function PintBackground() {
  const bubbles = React.useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => {
        const rnd = (n: number) => {
          const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453;
          return x - Math.floor(x);
        };
        return {
          left: (rnd(1) * 100).toFixed(1) + "%",
          size: (1.4 + rnd(2) * 2.6).toFixed(1) + "px",
          dur: (5.5 + rnd(3) * 8).toFixed(1) + "s",
          delay: (-(rnd(4) * 14)).toFixed(1) + "s",
          o: (0.08 + rnd(5) * 0.2).toFixed(2),
          drift: (rnd(6) * 18 - 9).toFixed(1) + "px",
        };
      }),
    []
  );
  return (
    <div className="pint-bg" aria-hidden="true">
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <filter id="foam-rough" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.011 0.05" numOctaves="3" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="26" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <div className="cascade-fade">
        <div className="cascade-streaks">
          <div className="cascade-layer cl-a" />
          <div className="cascade-layer cl-b" />
        </div>
      </div>
      <div className="bubbles">
        {bubbles.map((b, i) => (
          <span
            key={i}
            className="bubble"
            style={
              {
                left: b.left,
                width: b.size,
                height: b.size,
                animationDuration: b.dur,
                animationDelay: b.delay,
                "--o": b.o,
                "--drift": b.drift,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <div className="foam-wrap">
        <div className="foam-core" />
      </div>
    </div>
  );
}
