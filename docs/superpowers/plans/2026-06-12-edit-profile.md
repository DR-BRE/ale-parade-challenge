# Edit Profile (Name + Photo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-up user change their profile name and photo from a top-right corner avatar button that opens a glass modal.

**Architecture:** A `PATCH /api/profiles` endpoint (secret-header auth, same as splits) calls a new `updateProfile()` in the store layer. A new `EditProfileModal` client component reuses the setup screen's photo/name controls. `Leaderboard` renders a fixed corner avatar button that opens it. The existing Supabase realtime subscription on `profiles` (`lib/useBoard.ts:49`) refreshes all clients after a save — no new sync code.

**Tech Stack:** Next.js 15 App Router, React 19, Supabase (service-role client server-side), Vitest (node environment — API routes only, no component tests in this repo).

**Spec:** `docs/superpowers/specs/2026-06-12-edit-profile-design.md`

**Constraints:** Never run `next build` while the dev server is running (corrupts `.next`). Verify with `npx tsc --noEmit` and `npm test` instead.

---

### Task 1: `updateProfile()` in the store layer

Thin Supabase wrapper. The store layer has no unit tests in this repo (route tests mock it), so this task is implementation + typecheck only.

**Files:**
- Modify: `lib/server/store.ts` (insert after `createProfile`, around line 44)

- [ ] **Step 1: Add the function**

Insert after the closing brace of `createProfile` in `lib/server/store.ts`:

```ts
export async function updateProfile(args: {
  profileId: string;
  name: string;
  photoUrl: string | null;
}): Promise<ProfileRow> {
  const db = serviceClient();
  const { data, error } = await db
    .from("profiles")
    .update({ name: args.name, photo_url: args.photoUrl })
    .eq("id", args.profileId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (success)

- [ ] **Step 3: Commit**

```bash
git add lib/server/store.ts
git commit -m "feat: updateProfile store function for profile edits"
```

---

### Task 2: `PATCH /api/profiles` endpoint (TDD)

Auth mirrors `app/api/splits/route.ts:4-25`. Validation mirrors the existing POST. Extract the shared name/photo parsing so POST and PATCH stay DRY.

**Files:**
- Modify: `app/api/profiles/route.ts`
- Test: `app/api/profiles/route.test.ts`

- [ ] **Step 1: Write the failing tests**

In `app/api/profiles/route.test.ts`, replace the `vi.mock` block (lines 4–6) with:

```ts
vi.mock("@/lib/server/store", () => ({
  createProfile: vi.fn(),
  getSecretHash: vi.fn(),
  updateProfile: vi.fn(),
}));
```

Replace the import block (lines 8–11) with:

```ts
import { createProfile, getSecretHash, updateProfile } from "@/lib/server/store";
import { PATCH, POST } from "./route";

const mockCreate = vi.mocked(createProfile);
const mockHash = vi.mocked(getSecretHash);
const mockUpdate = vi.mocked(updateProfile);
```

Append at the end of the file:

```ts
const SECRET = "a".repeat(64);

function patchRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://test/api/profiles", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-profile-id": "p1",
      "x-profile-secret": SECRET,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/profiles", () => {
  beforeEach(() => {
    mockHash.mockReset().mockResolvedValue(hashSecret(SECRET));
    mockUpdate.mockReset().mockResolvedValue({
      id: "p1",
      name: "Brett",
      photo_url: null,
      created_at: "2026-06-09T00:00:00Z",
    });
  });

  it("rejects missing credentials", async () => {
    const bare = new Request("http://test/api/profiles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Brett" }),
    });
    expect((await PATCH(bare)).status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    const res = await PATCH(patchRequest({ name: "Brett" }, { "x-profile-secret": "b".repeat(64) }));
    expect(res.status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects an unknown profile", async () => {
    mockHash.mockResolvedValue(null);
    expect((await PATCH(patchRequest({ name: "Brett" }))).status).toBe(401);
  });

  it("rejects malformed JSON", async () => {
    const bad = new Request("http://test/api/profiles", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-profile-id": "p1",
        "x-profile-secret": SECRET,
      },
      body: "{not json",
    });
    expect((await PATCH(bad)).status).toBe(400);
  });

  it("rejects a missing, empty, or too-long name", async () => {
    expect((await PATCH(patchRequest({}))).status).toBe(400);
    expect((await PATCH(patchRequest({ name: "   " }))).status).toBe(400);
    expect((await PATCH(patchRequest({ name: "x".repeat(25) }))).status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects oversized or non-JPEG photos", async () => {
    const big = "data:image/jpeg;base64," + "a".repeat(100_001);
    expect((await PATCH(patchRequest({ name: "Brett", photo: big }))).status).toBe(400);
    const png = "data:image/png;base64,abc";
    expect((await PATCH(patchRequest({ name: "Brett", photo: png }))).status).toBe(400);
  });

  it("updates the profile with trimmed name and photo", async () => {
    const photo = "data:image/jpeg;base64,abc";
    const res = await PATCH(patchRequest({ name: "  Brett ", photo }));
    expect(res.status).toBe(200);
    expect((await res.json()).profile.id).toBe("p1");
    expect(mockUpdate).toHaveBeenCalledWith({
      profileId: "p1",
      name: "Brett",
      photoUrl: photo,
    });
  });

  it("accepts a null photo", async () => {
    const res = await PATCH(patchRequest({ name: "Brett", photo: null }));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      profileId: "p1",
      name: "Brett",
      photoUrl: null,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/api/profiles/route.test.ts`
Expected: FAIL — `PATCH` is not exported from `./route`.

- [ ] **Step 3: Implement PATCH (and extract shared validation)**

Replace the entire contents of `app/api/profiles/route.ts` with:

```ts
import { generateSecret, hashSecret, safeEqualHex } from "@/lib/server/secrets";
import { createProfile, getSecretHash, updateProfile } from "@/lib/server/store";

const MAX_PHOTO_CHARS = 100_000; // ~75 KB binary; prototype photos are ~15 KB

function parseName(value: unknown): string | null {
  const name = typeof value === "string" ? value.trim() : "";
  return name && name.length <= 24 ? name : null;
}

function parsePhoto(value: unknown): { ok: true; photo: string | null } | { ok: false } {
  if (typeof value !== "string" || value.length === 0) return { ok: true, photo: null };
  const isSmallJpeg =
    value.startsWith("data:image/jpeg;base64,") && value.length <= MAX_PHOTO_CHARS;
  return isSmallJpeg ? { ok: true, photo: value } : { ok: false };
}

export async function POST(req: Request): Promise<Response> {
  let body: { name?: unknown; photo?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = parseName(body.name);
  if (!name) {
    return Response.json(
      { error: "Name must be 1-24 characters" },
      { status: 400 }
    );
  }

  const photo = parsePhoto(body.photo);
  if (!photo.ok) {
    return Response.json(
      { error: "Photo must be a small JPEG data URL" },
      { status: 400 }
    );
  }

  const secret = generateSecret();
  const profile = await createProfile({
    name,
    photoUrl: photo.photo,
    secretHash: hashSecret(secret),
  });
  return Response.json({ profile, secret }, { status: 201 });
}

export async function PATCH(req: Request): Promise<Response> {
  const profileId = req.headers.get("x-profile-id");
  const secret = req.headers.get("x-profile-secret");
  if (!profileId || !secret) {
    return Response.json({ error: "Missing credentials" }, { status: 401 });
  }

  let body: { name?: unknown; photo?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = parseName(body.name);
  if (!name) {
    return Response.json(
      { error: "Name must be 1-24 characters" },
      { status: 400 }
    );
  }

  const photo = parsePhoto(body.photo);
  if (!photo.ok) {
    return Response.json(
      { error: "Photo must be a small JPEG data URL" },
      { status: 400 }
    );
  }

  const storedHash = await getSecretHash(profileId);
  if (!storedHash || !safeEqualHex(storedHash, hashSecret(secret))) {
    return Response.json({ error: "Not your pint" }, { status: 401 });
  }

  const profile = await updateProfile({ profileId, name, photoUrl: photo.photo });
  return Response.json({ profile }, { status: 200 });
}
```

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all tests PASS, including the existing POST and splits suites (the POST refactor must not break them).

- [ ] **Step 5: Commit**

```bash
git add app/api/profiles/route.ts app/api/profiles/route.test.ts
git commit -m "feat: PATCH /api/profiles — secret-authenticated profile edits"
```

---

### Task 3: `EditProfileModal` component + modal CSS

No component tests in this repo (vitest runs in node, `*.test.ts` only); browser verification happens in Task 5.

**Files:**
- Create: `components/EditProfileModal.tsx`
- Modify: `app/globals.css` (append before the `@media (prefers-reduced-motion...)` block at the end)

- [ ] **Step 1: Create the component**

Create `components/EditProfileModal.tsx`:

```tsx
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
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Edit profile"
        onClick={(e) => e.stopPropagation()}
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
```

- [ ] **Step 2: Add the CSS**

In `app/globals.css`, insert before the final `@media (prefers-reduced-motion: reduce)` block:

```css
/* ---------- Profile corner button + edit modal ---------- */
.profile-corner {
  position: fixed; top: calc(14px + env(safe-area-inset-top)); right: 14px;
  z-index: 20;
  width: 46px; height: 46px; border-radius: 50%;
  padding: 2px; border: 1px solid var(--gold-deep);
  background: var(--stout-faint);
  -webkit-backdrop-filter: blur(12px) saturate(1.5);
  backdrop-filter: blur(12px) saturate(1.5);
  cursor: pointer; color: inherit;
  box-shadow: 0 4px 14px -6px rgba(0, 0, 0, 0.6);
  transition: transform .1s, border-color .15s;
}
.profile-corner:hover { border-color: var(--gold); }
.profile-corner:active { transform: scale(0.94); }

@keyframes modalIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.modal-backdrop {
  position: fixed; inset: 0; z-index: 30;
  display: flex; align-items: center; justify-content: center;
  background: oklch(0.13 0.02 60 / 0.55);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  animation: modalIn .15s ease;
}
.modal-card {
  display: flex; flex-direction: column; align-items: center;
  width: min(340px, calc(100vw - 40px));
  padding: 26px 22px 28px;
  border-radius: 22px;
  border: 1px solid var(--gold-deep);
  background: linear-gradient(180deg, var(--stout-card), var(--stout-card-deep));
  box-shadow: 0 18px 50px -18px rgba(0, 0, 0, 0.8), inset 0 1px 0 oklch(1 0 0 / 0.08);
}
.modal-card .uploader { margin: 6px 0 0; }
.modal-card .name-input { margin-top: 30px; }
.modal-actions {
  display: flex; gap: 12px; margin-top: 30px; width: 100%;
}
.modal-actions .pour-in-btn {
  margin-top: 0; flex: 1; width: auto; min-height: 50px; font-size: 18px;
}
.modal-cancel {
  flex: 1; min-height: 50px; border-radius: 14px;
  background: transparent; color: var(--cream-dim);
  border: 1px solid var(--cream-faint); cursor: pointer;
  font-family: var(--serif); font-weight: 700; font-size: 18px;
  transition: transform .1s, color .15s;
}
.modal-cancel:active { transform: translateY(1px); }
.modal-cancel:disabled { opacity: 0.45; cursor: default; }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (success)

- [ ] **Step 4: Commit**

```bash
git add components/EditProfileModal.tsx app/globals.css
git commit -m "feat: glass edit-profile modal"
```

---

### Task 4: Corner avatar button in Leaderboard

**Files:**
- Modify: `components/Leaderboard.tsx`

- [ ] **Step 1: Wire the button and modal**

Replace the entire contents of `components/Leaderboard.tsx` with:

```tsx
"use client";

import React from "react";
import Avatar from "@/components/Avatar";
import Crest from "@/components/Crest";
import EditProfileModal from "@/components/EditProfileModal";
import LeaderRow from "@/components/LeaderRow";
import type { Identity } from "@/lib/identity";
import { useBoard } from "@/lib/useBoard";

export default function Leaderboard({ identity }: { identity: Identity }) {
  const board = useBoard(identity);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);

  React.useEffect(() => {
    if (!board.error) return;
    const t = setTimeout(board.clearError, 3000);
    return () => clearTimeout(t);
  }, [board.error, board.clearError]);

  if (board.loading) {
    return <Crest small />;
  }

  const me = board.members.find((m) => m.id === identity.profileId) ?? null;
  const ranked = board.members
    .map((m, i) => ({ m, i, count: board.countsById[m.id] || 0 }))
    .sort((a, b) => b.count - a.count || a.i - b.i);
  const anySplits = ranked.some((r) => r.count > 0);

  return (
    <div>
      {me && (
        <button
          type="button"
          className="profile-corner"
          onClick={() => setEditing(true)}
          aria-label="Edit your profile"
        >
          <Avatar src={me.photo} name={me.name} size={40} />
        </button>
      )}
      <Crest small />
      {!anySplits && (
        <div className="empty-banner">
          <div className="big">No one&rsquo;s split the G yet. Tragic.</div>
          <div className="small">Be the first &mdash; the crown is sitting right there.</div>
        </div>
      )}
      <div className="board">
        {ranked.map((r, idx) => (
          <LeaderRow
            key={r.m.id}
            member={r.m}
            rank={idx + 1}
            isLeader={anySplits && idx === 0}
            isYou={r.m.id === identity.profileId}
            count={r.count}
            popKey={r.m.id === identity.profileId ? board.popKey : 0}
            onPour={board.pour}
            onUndo={board.undo}
            history={board.historyById[r.m.id] || []}
            isOpen={openId === r.m.id}
            onToggle={() => setOpenId(openId === r.m.id ? null : r.m.id)}
          />
        ))}
      </div>
      <div className="footer-note">First sip decides</div>
      {board.error && <div className="toast" role="status">{board.error}</div>}
      {editing && me && (
        <EditProfileModal member={me} identity={identity} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and run tests**

Run: `npx tsc --noEmit && npm test`
Expected: typecheck clean, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add components/Leaderboard.tsx
git commit -m "feat: corner avatar button opens edit-profile modal"
```

---

### Task 5: Browser verification + deploy

**Files:** none (verification only)

- [ ] **Step 1: Verify in the preview browser**

Start the dev server with the preview tools (`preview_start`), then check:

1. Leaderboard shows the corner avatar button top-right with your photo.
2. Clicking it opens the glass modal pre-filled with your name and photo.
3. Changing the name and saving closes the modal; your row and corner avatar update (realtime refetch).
4. Cancel and backdrop-click close without saving; Escape closes.
5. Empty name disables Save.
6. `preview_console_logs` shows no errors.

Take a screenshot of the open modal as proof.

- [ ] **Step 2: Stop the dev server, then final check**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

- [ ] **Step 3: Deploy to production**

Run: `vercel --prod`
Expected: deployment URL printed; open the production app and confirm the corner avatar appears.
