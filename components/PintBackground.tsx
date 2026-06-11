"use client";

import React from "react";

// Full-screen "pint" backdrop: real footage of a settling pint on the bar —
// full glass in frame, foam head and all — looped behind legibility scrims.
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
      <video
        ref={videoRef}
        className="pint-video"
        src="/pint-settle.mp4?v=2"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      />
      <div className="pint-tone" />
    </div>
  );
}
