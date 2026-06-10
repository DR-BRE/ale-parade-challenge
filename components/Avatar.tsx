"use client";

import React from "react";

export default function Avatar({
  src,
  name,
  size,
}: {
  src: string | null;
  name: string;
  size: number;
}) {
  const [broken, setBroken] = React.useState(false);
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <div className="avatar" style={{ width: size, height: size }} aria-hidden="true">
      {src && !broken ? (
        // Plain <img>: sources are tiny data URLs, next/image adds nothing here.
        <img src={src} alt="" onError={() => setBroken(true)} />
      ) : (
        <span className="mono" style={{ fontSize: size * 0.44 }}>{initial}</span>
      )}
    </div>
  );
}
