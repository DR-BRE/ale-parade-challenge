"use client";

import React from "react";
import type { Identity } from "@/lib/identity";
import { readScanPhoto } from "@/lib/photo";
import { supabase } from "@/lib/supabaseClient";

type Judgement = { isGlass: boolean; score: number; verdict: string };

// Ephemeral camera scoring: snap the glass after a split-the-G attempt and
// the AI referee rates how close the line is to the G. Nothing is stored.
export default function RateMyG({ identity }: { identity: Identity }) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [photo, setPhoto] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<Judgement | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const close = React.useCallback(() => {
    if (busy) return;
    setOpen(false);
    setPhoto(null);
    setResult(null);
    setError(null);
  }, [busy]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const pick: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setResult(null);
    setError(null);
    setBusy(true);
    try {
      const image = await readScanPhoto(f);
      setPhoto(image);
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        await supabase.auth.signOut();
        return;
      }
      const res = await fetch("/api/rate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ image }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Couldn't judge that pour — try again");
      }
      setResult(data as Judgement);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't judge that pour — try again");
    } finally {
      setBusy(false);
    }
  };

  const snap = () => fileRef.current?.click();

  return (
    <>
      <div className="rate-g-wrap">
        <button type="button" className="rate-g-btn" onClick={() => setOpen(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 8 h3 l1.5-2 h7 L18 8 h2 a1 1 0 0 1 1 1 v9 a1 1 0 0 1-1 1 H4 a1 1 0 0 1-1-1 V9 a1 1 0 0 1 1-1 Z" />
            <circle cx="12" cy="13" r="3.4" />
          </svg>
          Rate my G
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={pick}
      />
      {open && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="modal-card rate-card" role="dialog" aria-modal="true" aria-label="Rate my G">
            <div className="rate-title">Rate my G</div>
            {photo && <img className="rate-photo" src={photo} alt="Your attempt" />}
            {busy ? (
              <div className="rate-status">The judge is looking&hellip;</div>
            ) : result ? (
              <>
                {result.isGlass ? (
                  <div className="rate-score">
                    {result.score}
                    <span className="rate-outof">/100</span>
                  </div>
                ) : (
                  <div className="rate-noglass">No G in sight</div>
                )}
                <div className="rate-verdict">&ldquo;{result.verdict}&rdquo;</div>
                <div className="modal-actions">
                  <button type="button" className="modal-cancel" onClick={close}>
                    Done
                  </button>
                  <button type="button" className="pour-in-btn" onClick={snap}>
                    Another go
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="rate-tip">
                  {error ?? "Hold the glass level, G centred, good light."}
                </div>
                <div className="modal-actions">
                  <button type="button" className="modal-cancel" onClick={close}>
                    Cancel
                  </button>
                  <button type="button" className="pour-in-btn" onClick={snap}>
                    {error ? "Try again" : "Open camera"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
