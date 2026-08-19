import React from "react";

// Full-screen Guinness liquid backdrop: a settling pint rendered in CSS —
// stout body, creamy head glow up top, fine bubbles rising through it — plus
// the SVG displacement filter the liquid-glass panels refract through.
const BUBBLES: React.CSSProperties[] = [
  { ["--x" as string]: "14%", ["--s" as string]: "6px", ["--d" as string]: "10s", ["--delay" as string]: "0s", ["--drift" as string]: "14px" },
  { ["--x" as string]: "26%", ["--s" as string]: "4px", ["--d" as string]: "12s", ["--delay" as string]: "2s", ["--drift" as string]: "-10px" },
  { ["--x" as string]: "40%", ["--s" as string]: "7px", ["--d" as string]: "8.5s", ["--delay" as string]: "1s", ["--drift" as string]: "8px" },
  { ["--x" as string]: "52%", ["--s" as string]: "3px", ["--d" as string]: "13s", ["--delay" as string]: "3.5s", ["--drift" as string]: "-16px" },
  { ["--x" as string]: "63%", ["--s" as string]: "5px", ["--d" as string]: "10.5s", ["--delay" as string]: "0.5s", ["--drift" as string]: "12px" },
  { ["--x" as string]: "72%", ["--s" as string]: "8px", ["--d" as string]: "8s", ["--delay" as string]: "2.5s", ["--drift" as string]: "-6px" },
  { ["--x" as string]: "82%", ["--s" as string]: "4px", ["--d" as string]: "12.5s", ["--delay" as string]: "4s", ["--drift" as string]: "10px" },
  { ["--x" as string]: "90%", ["--s" as string]: "3px", ["--d" as string]: "14s", ["--delay" as string]: "3s", ["--drift" as string]: "6px" },
  { ["--x" as string]: "34%", ["--s" as string]: "5px", ["--d" as string]: "11s", ["--delay" as string]: "5.5s", ["--drift" as string]: "-8px" },
  { ["--x" as string]: "58%", ["--s" as string]: "4px", ["--d" as string]: "13.5s", ["--delay" as string]: "6.5s", ["--drift" as string]: "14px" },
];

export default function PintBackground() {
  return (
    <>
      <div className="pint-bg" aria-hidden="true" />
      <div className="bubbles" aria-hidden="true">
        {BUBBLES.map((s, i) => (
          <i key={i} style={s} />
        ))}
      </div>
      <svg style={{ position: "absolute", width: 0, height: 0 }} aria-hidden="true">
        <filter id="glass-distortion" x="0%" y="0%" width="100%" height="100%" filterUnits="objectBoundingBox">
          <feTurbulence type="fractalNoise" baseFrequency="0.001 0.006" numOctaves="1" seed="17" result="turb" />
          <feComponentTransfer in="turb" result="mapped">
            <feFuncR type="gamma" amplitude="1" exponent="10" offset="0.5" />
            <feFuncG type="gamma" amplitude="0" exponent="1" offset="0" />
            <feFuncB type="gamma" amplitude="0" exponent="1" offset="0.5" />
          </feComponentTransfer>
          <feGaussianBlur in="turb" stdDeviation="3" result="softMap" />
          <feDisplacementMap in="SourceGraphic" in2="softMap" scale="90" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
    </>
  );
}
