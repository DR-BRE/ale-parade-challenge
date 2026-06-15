"use client";

import React from "react";
import type { Identity } from "@/lib/identity";

export default function RelinkModal({
  onRelinked,
  onClose,
}: {
  onRelinked: (id: Identity) => void;
  onClose: () => void;
}) {
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const submit = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Couldn't re-link — check the code");
      }
      const { profile, secret } = await res.json();
      onRelinked({ profileId: profile.id, secret });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't re-link — check the code");
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal-card" role="dialog" aria-modal="true" aria-label="Re-link this device">
        <div className="relink-title">This device got signed out of sync</div>
        <div className="relink-sub">Enter your recovery code to link it back up.</div>
        <input
          className="name-input"
          type="text"
          placeholder="Recovery code (PINT-XXXXX)"
          value={code}
          autoCapitalize="characters"
          autoFocus
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
        <div className="modal-actions">
          <button type="button" className="modal-cancel" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="pour-in-btn" disabled={!code.trim() || busy} onClick={submit}>
            {busy ? "Re-linking…" : "Re-link"}
          </button>
        </div>
        {error && <div className="toast" role="status">{error}</div>}
      </div>
    </div>
  );
}
