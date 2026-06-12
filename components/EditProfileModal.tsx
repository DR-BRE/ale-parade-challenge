"use client";

import React from "react";
import Avatar from "@/components/Avatar";
import type { Member } from "@/components/LeaderRow";
import type { Identity } from "@/lib/identity";
import { readPhoto } from "@/lib/photo";

export default function EditProfileModal({
  member,
  identity,
  onClose,
}: {
  member: Member;
  identity: Identity;
  onClose: () => void;
}) {
  const [name, setName] = React.useState(member.name);
  const [photo, setPhoto] = React.useState<string | null>(member.photo);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(t);
  }, [error]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

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

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profiles", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-profile-id": identity.profileId,
          "x-profile-secret": identity.secret,
        },
        body: JSON.stringify({ name: name.trim(), photo }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Could not save your profile");
      }
      // Realtime subscription on `profiles` refetches the board; just close.
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your profile");
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
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Edit profile"
      >
        <button
          type="button"
          className="uploader"
          onClick={() => fileRef.current?.click()}
          aria-label="Change your profile photo"
        >
          <span className="ring" />
          <Avatar src={photo} name={name || "?"} size={110} />
          <span className="cam">+</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={pick} />
        <input
          className="name-input"
          type="text"
          placeholder="Your name"
          value={name}
          maxLength={24}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); }}
        />
        <div className="modal-actions">
          <button type="button" className="modal-cancel" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="pour-in-btn" disabled={!name.trim() || busy} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      {error && <div className="toast" role="status">{error}</div>}
    </div>
  );
}
