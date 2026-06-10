"use client";

import React from "react";
import Avatar from "@/components/Avatar";
import Crest from "@/components/Crest";
import type { Identity } from "@/lib/identity";
import { readPhoto } from "@/lib/photo";

export default function SetupScreen({ onDone }: { onDone: (identity: Identity) => void }) {
  const [name, setName] = React.useState("");
  const [photo, setPhoto] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(t);
  }, [error]);

  const pick: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const f = e.target.files?.[0];
    if (f) {
      try {
        setPhoto(await readPhoto(f));
      } catch {
        setError("Could not read that image");
      }
    }
    e.target.value = "";
  };

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), photo }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Could not create your profile");
      }
      const { profile, secret } = await res.json();
      onDone({ profileId: profile.id, secret });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create your profile");
      setBusy(false);
    }
  };

  return (
    <div className="setup">
      <Crest />
      <button
        type="button"
        className="uploader"
        onClick={() => fileRef.current?.click()}
        aria-label="Add a profile photo"
      >
        <span className="ring" />
        <Avatar src={photo} name={name || "?"} size={110} />
        <span className="cam">+</span>
        <span className="hint">{photo ? "Looking sharp" : "Add a photo"}</span>
      </button>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={pick} />
      <input
        className="name-input"
        type="text"
        placeholder="Your name"
        value={name}
        maxLength={24}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
      />
      <button type="button" className="pour-in-btn" disabled={!name.trim() || busy} onClick={submit}>
        {busy ? "Pouring…" : "Pour me in"}
      </button>
      {error && <div className="toast" role="status">{error}</div>}
    </div>
  );
}
