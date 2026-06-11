"use client";

import React from "react";

// Full-screen "pint" backdrop: real settling-pour footage looped behind a
// toning scrim that pulls it into the app's stout palette, topped with the
// foam head (noise-roughened edge via feTurbulence).
// The gradient on .pint-bg doubles as the fallback when the video can't
// autoplay (e.g. iOS Low Power Mode) or hasn't loaded yet.
export default function PintBackground() {
  const videoRef = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      v.pause();
      return;
    }
    const tryPlay = () => {
      v.play().catch(() => {
        // Autoplay blocked — gradient fallback stays visible until a retry lands.
      });
    };
    tryPlay();
    // Autoplay can be deferred (hidden tab) or denied (iOS Low Power Mode);
    // muted playback needs no user-activation, so a retry on visibility or
    // first touch succeeds where the mount-time attempt was refused.
    document.addEventListener("visibilitychange", tryPlay);
    window.addEventListener("pointerdown", tryPlay);
    return () => {
      document.removeEventListener("visibilitychange", tryPlay);
      window.removeEventListener("pointerdown", tryPlay);
    };
  }, []);

  return (
    <div className="pint-bg" aria-hidden="true">
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <filter id="foam-rough" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.011 0.05" numOctaves="3" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="26" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <video
        ref={videoRef}
        className="pint-video"
        src="/pint-settle.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      />
      <div className="pint-tone" />
      <div className="foam-wrap">
        <div className="foam-core" />
      </div>
    </div>
  );
}
