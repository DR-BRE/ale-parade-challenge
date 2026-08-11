# Google Sign-In (Supabase Auth) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the device-secret sign-in with Google via Supabase Auth so ~4-5 iPhone users tap "Continue with Google" once and stay signed in, and delete the recovery-code machinery built to work around storage eviction.

**Architecture:** Supabase Auth owns the session (JWT + refresh). A `profiles` row's primary key becomes the Supabase Auth user id. Write API routes verify the access token server-side (`getAuthedUser`) instead of a hashed secret; board reads stay public/anon. First Google login auto-creates a profile from Google's name/avatar. A PWA manifest enables durable Add-to-Home-Screen storage.

**Tech Stack:** Next.js 15 (App Router), React 19, `@supabase/supabase-js`, Vitest, TypeScript.

## Global Constraints

- **Fresh start:** existing `profiles`/`splits` rows are wiped; no migration/claim flow.
- **No new environment variables:** existing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` cover everything.
- **`Identity` type is `{ profileId: string }`** — no secret anywhere on the client.
- **Write routes authenticate via `Authorization: Bearer <supabase access token>`**; board reads stay anon.
- **Name limit unchanged:** profile name is 1–24 chars (truncate Google names to 24).
- **Verify with `npx vitest run` and `npx tsc --noEmit`.** Do NOT run `next build` while `next dev` is running (corrupts `.next`).
- **Commit or push only when a task says to; branch is `google-signin` (already created).**

---

### Task 1: Database migration + schema

Wipe existing data, drop the secrets table, and tie `profiles.id` to `auth.users`.

**Files:**
- Modify: `supabase/schema.sql`
- (Manual: run the same SQL in the Supabase SQL editor against the live project)

**Interfaces:**
- Produces: a `profiles` table whose `id` equals `auth.users.id`; no `profile_secrets` table.

- [ ] **Step 1: Rewrite `supabase/schema.sql`**

```sql
-- Ale Parade Challenge schema. Run in the Supabase SQL editor.

-- Identity is Supabase Auth (Google). A profile's id IS the auth user id.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  photo_url text,
  created_at timestamptz not null default now()
);

create table public.splits (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  delta int not null check (delta in (1, -1)),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.splits enable row level security;

-- Anyone with the anon key may read the board; writes go through service-role API routes.
create policy "public read profiles" on public.profiles for select using (true);
create policy "public read splits" on public.splits for select using (true);

-- Live updates for the leaderboard.
alter publication supabase_realtime add table public.splits;
alter publication supabase_realtime add table public.profiles;
```

- [ ] **Step 2: Write the live-project migration (run manually in Supabase SQL editor)**

Add this block to the top of `supabase/schema.sql` as a comment titled `-- Migration for the already-deployed database:` so it's recorded, and run it once in the dashboard:

```sql
-- Migration for the already-deployed database (run once, in order):
-- delete from public.splits;
-- delete from public.profiles;
-- drop table if exists public.profile_secrets;
-- alter table public.profiles alter column id drop default;
-- alter table public.profiles
--   add constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: schema for Google-auth identity (drop profile_secrets, id=auth.users)"
```

---

### Task 2: Server auth helper

A single place that turns a request's Bearer token into the authenticated user.

**Files:**
- Create: `lib/server/auth.ts`
- Test: `lib/server/auth.test.ts`

**Interfaces:**
- Produces: `getAuthedUser(req: Request): Promise<AuthedUser | null>` where `AuthedUser = { id: string; fullName: string | null; avatarUrl: string | null }`. Returns `null` for a missing/invalid token.

- [ ] **Step 1: Write the failing test**

```ts
// lib/server/auth.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

import { getAuthedUser } from "./auth";

function req(headers: Record<string, string> = {}): Request {
  return new Request("http://test/x", { method: "POST", headers });
}

describe("getAuthedUser", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
  });

  it("returns null when the Authorization header is missing", async () => {
    expect(await getAuthedUser(req())).toBeNull();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("returns null when the token is invalid", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "bad jwt" } });
    expect(await getAuthedUser(req({ Authorization: "Bearer nope" }))).toBeNull();
  });

  it("returns id and Google metadata for a valid token", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "uid-1", user_metadata: { full_name: "Ada L", avatar_url: "https://g/av.png" } } },
      error: null,
    });
    expect(await getAuthedUser(req({ Authorization: "Bearer good" }))).toEqual({
      id: "uid-1",
      fullName: "Ada L",
      avatarUrl: "https://g/av.png",
    });
    expect(mockGetUser).toHaveBeenCalledWith("good");
  });

  it("falls back to name/picture metadata keys and nulls when absent", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "uid-2", user_metadata: {} } },
      error: null,
    });
    expect(await getAuthedUser(req({ Authorization: "Bearer good" }))).toEqual({
      id: "uid-2",
      fullName: null,
      avatarUrl: null,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/server/auth.test.ts`
Expected: FAIL (cannot find `./auth`).

- [ ] **Step 3: Write the implementation**

```ts
// lib/server/auth.ts
import { createClient } from "@supabase/supabase-js";

export type AuthedUser = { id: string; fullName: string | null; avatarUrl: string | null };

// Verify the Supabase access token on the request and return the user, or null.
export async function getAuthedUser(req: Request): Promise<AuthedUser | null> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;

  const m = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = (m.full_name ?? m.name ?? null) as string | null;
  const avatarUrl = (m.avatar_url ?? m.picture ?? null) as string | null;
  return { id: data.user.id, fullName, avatarUrl };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/server/auth.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/server/auth.ts lib/server/auth.test.ts
git commit -m "feat: getAuthedUser — verify Supabase Bearer token server-side"
```

---

### Task 3: Splits route → token auth

**Files:**
- Modify: `app/api/splits/route.ts`
- Test: `app/api/splits/route.test.ts`

**Interfaces:**
- Consumes: `getAuthedUser` from Task 2; `getCount`, `insertSplit` from `lib/server/store` (unchanged).

- [ ] **Step 1: Replace the test's auth setup and cases**

Rewrite `app/api/splits/route.test.ts` so it mocks the auth helper instead of the secret store:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/auth", () => ({ getAuthedUser: vi.fn() }));
vi.mock("@/lib/server/store", () => ({
  getCount: vi.fn(),
  insertSplit: vi.fn(),
}));

import { getAuthedUser } from "@/lib/server/auth";
import { getCount, insertSplit } from "@/lib/server/store";
import { POST } from "./route";

const mockAuth = vi.mocked(getAuthedUser);
const mockCount = vi.mocked(getCount);
const mockInsert = vi.mocked(insertSplit);

function request(delta: unknown, auth = true): Request {
  return new Request("http://test/api/splits", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: "Bearer good" } : {}),
    },
    body: JSON.stringify({ delta }),
  });
}

describe("POST /api/splits", () => {
  beforeEach(() => {
    mockAuth.mockReset().mockResolvedValue({ id: "p1", fullName: "P", avatarUrl: null });
    mockCount.mockReset().mockResolvedValue(3);
    mockInsert.mockReset().mockResolvedValue({
      id: "s1", profile_id: "p1", delta: 1, created_at: "2026-08-10T00:00:00Z",
    });
  });

  it("rejects an unauthenticated request", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await POST(request(1, false))).status).toBe(401);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects deltas other than +1/-1", async () => {
    expect((await POST(request(2))).status).toBe(400);
    expect((await POST(request(0))).status).toBe(400);
    expect((await POST(request("1"))).status).toBe(400);
  });

  it("rejects malformed JSON", async () => {
    const bad = new Request("http://test/api/splits", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer good" },
      body: "{not json",
    });
    expect((await POST(bad)).status).toBe(400);
  });

  it("rejects an undo when the count is zero", async () => {
    mockCount.mockResolvedValue(0);
    expect((await POST(request(-1))).status).toBe(409);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("inserts a valid split for the authed user", async () => {
    const res = await POST(request(1));
    expect(res.status).toBe(201);
    expect((await res.json()).split.id).toBe("s1");
    expect(mockInsert).toHaveBeenCalledWith("p1", 1);
  });

  it("allows an undo when the count is positive", async () => {
    const res = await POST(request(-1));
    expect(res.status).toBe(201);
    expect(mockInsert).toHaveBeenCalledWith("p1", -1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/splits/route.test.ts`
Expected: FAIL (route still reads `x-profile-*`, `getAuthedUser` unused).

- [ ] **Step 3: Rewrite the route**

```ts
// app/api/splits/route.ts
import { getAuthedUser } from "@/lib/server/auth";
import { getCount, insertSplit } from "@/lib/server/store";

export async function POST(req: Request): Promise<Response> {
  const user = await getAuthedUser(req);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  const profileId = user.id;

  let body: { delta?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const delta = body.delta;
  if (delta !== 1 && delta !== -1) {
    return Response.json({ error: "delta must be 1 or -1" }, { status: 400 });
  }

  // Check-then-act: two concurrent -1s can drive the sum to -1. Accepted —
  // owner-only, cosmetic (UI floors at 0), self-healing on the next +1.
  if (delta === -1) {
    const count = await getCount(profileId);
    if (count <= 0) {
      return Response.json({ error: "Nothing to take back" }, { status: 409 });
    }
  }

  const split = await insertSplit(profileId, delta);
  return Response.json({ split }, { status: 201 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/splits/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/splits/route.ts app/api/splits/route.test.ts
git commit -m "feat: splits route authenticates via Supabase token"
```

---

### Task 4: Rate route → token auth

**Files:**
- Modify: `app/api/rate/route.ts`
- Test: `app/api/rate/route.test.ts`

**Interfaces:**
- Consumes: `getAuthedUser` from Task 2; `allow` from `lib/server/rateLimit`; the Anthropic SDK (unchanged).

- [ ] **Step 1: Update the test's auth**

In `app/api/rate/route.test.ts`, replace the `@/lib/server/store` mock and secret setup with the auth-helper mock. Replace the mock block and helpers:

```ts
// remove: vi.mock("@/lib/server/store", ...) and the hashSecret import + SECRET usage
vi.mock("@/lib/server/auth", () => ({ getAuthedUser: vi.fn() }));

import { getAuthedUser } from "@/lib/server/auth";
const mockAuth = vi.mocked(getAuthedUser);
```

In `beforeEach`, add:

```ts
mockAuth.mockReset().mockResolvedValue({ id: "p1", fullName: "P", avatarUrl: null });
```

Change the `request()` helper to send `Authorization: "Bearer good"` instead of the `x-profile-*` headers, and update the two auth tests:

```ts
function request(body: unknown, auth = true): Request {
  return new Request("http://test/api/rate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: "Bearer good" } : {}),
    },
    body: JSON.stringify(body),
  });
}

it("rejects an unauthenticated request", async () => {
  mockAuth.mockResolvedValue(null);
  expect((await POST(request({ image: IMAGE }, false))).status).toBe(401);
  expect(mockCreate).not.toHaveBeenCalled();
});
```

Delete the old "rejects missing credentials" and "rejects a wrong secret" tests (replaced by the one above). Keep all other tests (bad JSON, non-JPEG, oversized, rate limit, score/verdict, clamp, not-a-glass, refusal, API failure, unparsable) unchanged.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/rate/route.test.ts`
Expected: FAIL (route still checks secret).

- [ ] **Step 3: Rewrite the route's auth block**

In `app/api/rate/route.ts`, replace the imports and the credential/auth section. Change the imports at the top:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { getAuthedUser } from "@/lib/server/auth";
import { allow } from "@/lib/server/rateLimit";
```

Replace the opening of `POST` (the `x-profile-*` read, the JSON parse for image, and the `getSecretHash` check) so auth happens first via the helper:

```ts
export async function POST(req: Request): Promise<Response> {
  const user = await getAuthedUser(req);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  const profileId = user.id;

  let body: { image?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const image = body.image;
  if (typeof image !== "string" || !image.startsWith(JPEG_PREFIX)) {
    return Response.json({ error: "image must be a JPEG data URL" }, { status: 400 });
  }
  if (image.length > MAX_IMAGE_CHARS) {
    return Response.json({ error: "Photo too large" }, { status: 413 });
  }

  if (!allow(`rate:${profileId}`, SCANS_PER_MINUTE, 60_000)) {
    return Response.json({ error: "Easy there — give the judge a minute" }, { status: 429 });
  }

  // ...everything below (Anthropic client, messages.create, refusal + parse handling) stays as-is.
```

Delete the now-unused `import { hashSecret, safeEqualHex } from "@/lib/server/secrets";` and `import { getSecretHash } from "@/lib/server/store";` lines, and remove the old `getSecretHash`/`safeEqualHex` check block.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/rate/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/rate/route.ts app/api/rate/route.test.ts
git commit -m "feat: rate route authenticates via Supabase token"
```

---

### Task 5: Profiles route → ensure-profile (POST) + token auth (PATCH)

**Files:**
- Modify: `app/api/profiles/route.ts`
- Modify: `lib/server/store.ts` (add `ensureProfile`; keep other exports for now)
- Test: `app/api/profiles/route.test.ts`

**Interfaces:**
- Consumes: `getAuthedUser` (Task 2), `ensureProfile` + `updateProfile` from `lib/server/store`.
- Produces: `ensureProfile(args: { id: string; name: string; photoUrl: string | null }): Promise<ProfileRow>` — returns the existing row if present, else inserts one with `id = args.id`.

- [ ] **Step 1: Add `ensureProfile` to `lib/server/store.ts`**

Add this export (leave the existing `createProfile`, `getSecretHash`, `recoverByCode`, `ensureRecoveryCode` in place — Task 8 removes them):

```ts
// Create-if-absent by auth user id; never overwrites an edited name/photo.
export async function ensureProfile(args: {
  id: string;
  name: string;
  photoUrl: string | null;
}): Promise<ProfileRow> {
  const db = serviceClient();
  const { data: existing, error: selErr } = await db
    .from("profiles")
    .select("id, name, photo_url, created_at")
    .eq("id", args.id)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing;

  const { data, error } = await db
    .from("profiles")
    .insert({ id: args.id, name: args.name, photo_url: args.photoUrl })
    .select()
    .single();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Rewrite `app/api/profiles/route.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/auth", () => ({ getAuthedUser: vi.fn() }));
vi.mock("@/lib/server/store", () => ({
  ensureProfile: vi.fn(),
  updateProfile: vi.fn(),
}));

import { getAuthedUser } from "@/lib/server/auth";
import { ensureProfile, updateProfile } from "@/lib/server/store";
import { PATCH, POST } from "./route";

const mockAuth = vi.mocked(getAuthedUser);
const mockEnsure = vi.mocked(ensureProfile);
const mockUpdate = vi.mocked(updateProfile);

const ROW = { id: "p1", name: "Ada", photo_url: null, created_at: "2026-08-10T00:00:00Z" };

function req(method: "POST" | "PATCH", body: unknown, auth = true): Request {
  return new Request("http://test/api/profiles", {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: "Bearer good" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/profiles (ensure)", () => {
  beforeEach(() => {
    mockAuth.mockReset().mockResolvedValue({ id: "p1", fullName: "Ada Lovelace", avatarUrl: "https://g/a.png" });
    mockEnsure.mockReset().mockResolvedValue(ROW);
    mockUpdate.mockReset();
  });

  it("rejects an unauthenticated request", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await POST(req("POST", undefined, false))).status).toBe(401);
    expect(mockEnsure).not.toHaveBeenCalled();
  });

  it("creates the profile from Google metadata (name truncated to 24)", async () => {
    mockAuth.mockResolvedValue({ id: "p1", fullName: "A".repeat(40), avatarUrl: "https://g/a.png" });
    const res = await POST(req("POST", undefined));
    expect(res.status).toBe(200);
    expect(mockEnsure).toHaveBeenCalledWith({ id: "p1", name: "A".repeat(24), photoUrl: "https://g/a.png" });
  });

  it("falls back to Anonymous when Google gives no name", async () => {
    mockAuth.mockResolvedValue({ id: "p1", fullName: null, avatarUrl: null });
    await POST(req("POST", undefined));
    expect(mockEnsure).toHaveBeenCalledWith({ id: "p1", name: "Anonymous", photoUrl: null });
  });
});

describe("PATCH /api/profiles (edit)", () => {
  beforeEach(() => {
    mockAuth.mockReset().mockResolvedValue({ id: "p1", fullName: "Ada", avatarUrl: null });
    mockEnsure.mockReset();
    mockUpdate.mockReset().mockResolvedValue(ROW);
  });

  it("rejects an unauthenticated request", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await PATCH(req("PATCH", { name: "New" }, false))).status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a bad name", async () => {
    expect((await PATCH(req("PATCH", { name: "" }))).status).toBe(400);
    expect((await PATCH(req("PATCH", { name: "x".repeat(25) }))).status).toBe(400);
  });

  it("rejects a non-JPEG photo", async () => {
    expect((await PATCH(req("PATCH", { name: "Ada", photo: "data:image/png;base64,x" }))).status).toBe(400);
  });

  it("updates the authed user's own profile", async () => {
    const res = await PATCH(req("PATCH", { name: "Ada", photo: null }));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ profileId: "p1", name: "Ada", photoUrl: null });
  });

  it("returns 404 when the row is missing", async () => {
    mockUpdate.mockResolvedValue(null);
    expect((await PATCH(req("PATCH", { name: "Ada" }))).status).toBe(404);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run app/api/profiles/route.test.ts`
Expected: FAIL (route still creates from body + secret).

- [ ] **Step 4: Rewrite `app/api/profiles/route.ts`**

Keep the `parseName`/`parsePhoto` helpers and `MAX_PHOTO_CHARS`. Replace the imports and both handlers:

```ts
import { getAuthedUser } from "@/lib/server/auth";
import { ensureProfile, updateProfile } from "@/lib/server/store";

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

// First Google sign-in: create the profile from Google's name/avatar. Idempotent.
export async function POST(req: Request): Promise<Response> {
  const user = await getAuthedUser(req);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  const name = (user.fullName?.trim() || "Anonymous").slice(0, 24);
  const profile = await ensureProfile({ id: user.id, name, photoUrl: user.avatarUrl });
  return Response.json({ profile }, { status: 200 });
}

// Full replace: the client sends the complete desired state; an omitted photo clears it.
export async function PATCH(req: Request): Promise<Response> {
  const user = await getAuthedUser(req);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  let body: { name?: unknown; photo?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = parseName(body.name);
  if (!name) {
    return Response.json({ error: "Name must be 1-24 characters" }, { status: 400 });
  }
  const photo = parsePhoto(body.photo);
  if (!photo.ok) {
    return Response.json({ error: "Photo must be a small JPEG data URL" }, { status: 400 });
  }

  const profile = await updateProfile({ profileId: user.id, name, photoUrl: photo.photo });
  if (!profile) {
    return Response.json({ error: "Profile not found" }, { status: 404 });
  }
  return Response.json({ profile }, { status: 200 });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run app/api/profiles/route.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/profiles/route.ts app/api/profiles/route.test.ts lib/server/store.ts
git commit -m "feat: profiles route — ensure-profile from Google metadata + token auth"
```

---

### Task 6: Client session cutover

Swap the whole client from device-secret to Supabase session in one coherent change so `tsc` stays green. This is the task that flips the app to Google sign-in.

**Files:**
- Modify: `lib/supabaseClient.ts`, `lib/identity.ts`, `app/page.tsx`, `lib/useBoard.ts`, `components/Leaderboard.tsx`, `components/EditProfileModal.tsx`
- Create: `components/SignInScreen.tsx`
- Delete: `components/SetupScreen.tsx`, `components/RelinkModal.tsx`, `lib/identity.test.ts`

**Interfaces:**
- Consumes: `supabase` from `lib/supabaseClient`; `Identity = { profileId: string }`.
- Produces: `<Leaderboard identity={Identity} />` (no `onRelink` prop); `<SignInScreen />` (no props).

- [ ] **Step 1: Enable session persistence in `lib/supabaseClient.ts`**

Change the `createClient` options:

```ts
_client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);
```

- [ ] **Step 2: Shrink `lib/identity.ts` to the type only**

Replace the entire file with:

```ts
export type Identity = { profileId: string };
```

- [ ] **Step 3: Delete the dead client files**

```bash
git rm lib/identity.test.ts components/SetupScreen.tsx components/RelinkModal.tsx
```

- [ ] **Step 4: Create `components/SignInScreen.tsx`**

```tsx
"use client";

import React from "react";
import Crest from "@/components/Crest";
import { supabase } from "@/lib/supabaseClient";

export default function SignInScreen() {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      setError("Couldn't reach Google — try again");
      setBusy(false);
    }
    // On success the browser navigates to Google; no state reset needed.
  };

  return (
    <div className="setup">
      <Crest />
      <button type="button" className="pour-in-btn" disabled={busy} onClick={signIn}>
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && <div className="toast" role="status">{error}</div>}
    </div>
  );
}
```

- [ ] **Step 5: Rewrite `app/page.tsx`**

```tsx
"use client";

import React from "react";
import Leaderboard from "@/components/Leaderboard";
import PintBackground from "@/components/PintBackground";
import SignInScreen from "@/components/SignInScreen";
import type { Identity } from "@/lib/identity";
import { supabase } from "@/lib/supabaseClient";

export default function Home() {
  const [identity, setIdentity] = React.useState<Identity | null>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let active = true;

    const apply = async (
      session: { access_token: string; user: { id: string } } | null
    ) => {
      if (!session) {
        if (active) { setIdentity(null); setReady(true); }
        return;
      }
      // First login creates the profile row from Google metadata; idempotent after.
      try {
        await fetch("/api/profiles", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      } catch {
        // Network hiccup: still let them in; writes will re-auth as needed.
      }
      if (active) { setIdentity({ profileId: session.user.id }); setReady(true); }
    };

    // Fires immediately with the current session (INITIAL_SESSION) and on every
    // sign-in / sign-out / token refresh thereafter.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      apply(session);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <div className="stage">
      <PintBackground />
      <div className="app">
        {!ready ? null : identity ? (
          <Leaderboard identity={identity} />
        ) : (
          <SignInScreen />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Update `lib/useBoard.ts`** — token auth + drop relink

Add the supabase import (already present). Remove `needsRelink`/`clearRelink` from the `Board` type and the state, and rewrite `send()`'s auth:

- Delete from the `Board` type: the `needsRelink: boolean;` and `clearRelink: () => void;` lines and their doc comment.
- Delete the `const [needsRelink, setNeedsRelink] = React.useState(false);` line.
- In `send()`, fetch a token and use the Bearer header; on 401, sign out instead of setting relink:

```ts
const send = React.useCallback(
  async (delta: 1 | -1) => {
    const temp: SplitRow = {
      id: "temp-" + Date.now() + Math.random().toString(36).slice(2, 6),
      profile_id: identity.profileId,
      delta,
      created_at: new Date().toISOString(),
    };
    setPopKey((n) => n + 1);
    setSplits((s) => [temp, ...s]);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        setSplits((s) => s.filter((row) => row.id !== temp.id));
        await supabase.auth.signOut();
        return;
      }
      const res = await fetch("/api/splits", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ delta }),
      });
      if (!res.ok) {
        if (res.status === 401) {
          setSplits((s) => s.filter((row) => row.id !== temp.id));
          await supabase.auth.signOut();
          return;
        }
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "That one didn't land — try again");
      }
      const { split } = (await res.json()) as { split: SplitRow };
      setSplits((s) => {
        const replaced = s.map((row) => (row.id === temp.id ? split : row));
        return replaced.filter((row, i) => replaced.findIndex((r) => r.id === row.id) === i);
      });
    } catch (e) {
      setSplits((s) => s.filter((row) => row.id !== temp.id));
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  },
  [identity]
);
```

Remove `needsRelink` and `clearRelink` from the returned object at the bottom.

- [ ] **Step 7: Update `components/Leaderboard.tsx`** — drop relink wiring

- Remove `import RelinkModal from "@/components/RelinkModal";`.
- Change the signature to `export default function Leaderboard({ identity }: { identity: Identity }) {` (drop `onRelink`).
- Delete the entire `{board.needsRelink && ( <RelinkModal ... /> )}` block.
- `EditProfileModal` usage stays (it takes `member` + `identity`).

- [ ] **Step 8: Update `components/EditProfileModal.tsx`** — token auth, remove recovery UI, add sign-out

- Add `import { supabase } from "@/lib/supabaseClient";`.
- Delete the `recoveryCode`/`copied` state, the `useEffect` that POSTs `/api/session`, and the entire `{recoveryCode && ( <div className="recovery-block"> ... )}` JSX block.
- In `save()`, replace the `x-profile-*` headers with a Bearer token:

```ts
const { data: sess } = await supabase.auth.getSession();
const token = sess.session?.access_token;
if (!token) { await supabase.auth.signOut(); return; }
const res = await fetch("/api/profiles", {
  method: "PATCH",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ name: name.trim(), photo }),
});
```

- Add a sign-out control below the Save/Cancel row (before the closing `</div>` of `.modal-card`):

```tsx
<button
  type="button"
  className="link-btn"
  onClick={() => supabase.auth.signOut()}
>
  Sign out
</button>
```

- [ ] **Step 9: Typecheck and test the whole cutover**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npx vitest run`
Expected: PASS (route + auth suites; deleted `identity.test.ts` no longer collected). `session`/`recover`/`secrets`/`recovery` tests still pass until Task 8.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: client uses Supabase Google session instead of device secret"
```

---

### Task 7: PWA manifest + standalone metadata

Durable Add-to-Home-Screen storage (the piece that actually makes eviction rare).

**Files:**
- Create: `app/manifest.ts`
- Modify: `app/layout.tsx`

**Interfaces:** none consumed by other tasks.

- [ ] **Step 1: Create `app/manifest.ts`**

Icons are already served by Next at `/icon.png` (512×512) and `/apple-icon.png` (180×180).

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ale Parade Challenge",
    short_name: "Ale Parade",
    description: "Split-the-G tally for the crew. First sip decides.",
    start_url: "/",
    display: "standalone",
    background_color: "#14100b",
    theme_color: "#14100b",
    icons: [
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
```

- [ ] **Step 2: Add `appleWebApp` metadata in `app/layout.tsx`**

Extend the existing `metadata` export:

```ts
export const metadata: Metadata = {
  title: "Ale Parade Challenge",
  description: "Split-the-G tally for the crew. First sip decides.",
  appleWebApp: {
    capable: true,
    title: "Ale Parade",
    statusBarStyle: "black-translucent",
  },
};
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npm run dev` then `curl -s http://localhost:3000/manifest.webmanifest` and confirm it returns the JSON above; stop the dev server afterward.

- [ ] **Step 4: Commit**

```bash
git add app/manifest.ts app/layout.tsx
git commit -m "feat: PWA manifest + apple-web-app metadata for durable home-screen install"
```

---

### Task 8: Remove dead server code

Now that nothing imports the secret/recovery/session machinery, delete it.

**Files:**
- Delete: `app/api/session/route.ts`, `app/api/session/route.test.ts`, `app/api/recover/route.ts`, `app/api/recover/route.test.ts`, `lib/server/secrets.ts`, `lib/server/secrets.test.ts`, `lib/server/recovery.ts`, `lib/server/recovery.test.ts`, `scripts/mint-recovery-code.mjs`
- Modify: `lib/server/store.ts` (remove secret/recovery helpers)

**Interfaces:** none produced.

- [ ] **Step 1: Delete the dead files**

```bash
git rm app/api/session/route.ts app/api/session/route.test.ts \
       app/api/recover/route.ts app/api/recover/route.test.ts \
       lib/server/secrets.ts lib/server/secrets.test.ts \
       lib/server/recovery.ts lib/server/recovery.test.ts \
       scripts/mint-recovery-code.mjs
```

- [ ] **Step 2: Trim `lib/server/store.ts`**

- Remove the imports `import { generateSecret, hashSecret } from "@/lib/server/secrets";` and `import { generateRecoveryCode } from "@/lib/server/recovery";`.
- Delete the functions `createProfile`, `getSecretHash`, `recoverByCode`, and `ensureRecoveryCode`.
- Keep `ProfileRow`, `SplitRow`, `serviceClient`, `ensureProfile`, `updateProfile`, `getCount`, `insertSplit`.

- [ ] **Step 3: Verify nothing references the removed code**

Run: `grep -rn "recoverByCode\|ensureRecoveryCode\|getSecretHash\|createProfile\|generateSecret\|hashSecret\|safeEqualHex\|/api/session\|/api/recover\|mint-recovery" app components lib scripts`
Expected: no matches.
Run: `npx tsc --noEmit` → no errors.
Run: `npx vitest run` → PASS (secrets/recovery/session/recover suites are gone).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove device-secret, recovery-code, and session machinery"
```

---

### Task 9: Owner setup docs (README)

**Files:**
- Modify: `README.md`

**Interfaces:** none.

- [ ] **Step 1: Replace the Setup/Deploy sections' auth notes**

Add a "Sign-in (Google via Supabase)" section documenting the one-time config, and note the new env key already covered by `.env.local.example`:

```markdown
## Sign-in (Google via Supabase Auth)

Sign-in is Google, handled by Supabase Auth. One-time setup:

1. **Google Cloud Console** → APIs & Services → Credentials → Create OAuth client ID
   → Web application. Add authorized redirect URI:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`.
2. **Supabase dashboard** → Authentication → Providers → Google → enable and paste
   the Client ID and Client Secret.
3. **Supabase dashboard** → Authentication → URL Configuration → set Site URL to
   `https://ale-parade-challenge.vercel.app` and add both that URL and
   `http://localhost:3000` to Redirect URLs.
4. Run `supabase/schema.sql` (or the migration block at its top for an existing DB).

No app code or environment variables change for this — the existing
`NEXT_PUBLIC_SUPABASE_*` values are all the client needs.

For maximum "stay signed in" on iPhone, add the site to the Home Screen
(Share → Add to Home Screen): an installed PWA keeps its login through Safari's
7-day storage eviction.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: Google sign-in setup + Add to Home Screen note"
```

---

## Final verification (after all tasks)

- [ ] `npx vitest run` — all green.
- [ ] `npx tsc --noEmit` — clean.
- [ ] Complete the owner setup (Task 9 steps 1–3) and run the schema migration.
- [ ] `npm run dev`, open `http://localhost:3000`: "Continue with Google" → returns signed in → profile auto-created with your Google name/photo → pour a split → edit your name → **Sign out** → sign back in and confirm the same profile/score returns.
- [ ] Deploy: `npx vercel --prod`; on an iPhone, sign in, Add to Home Screen, confirm it opens standalone and stays signed in.
