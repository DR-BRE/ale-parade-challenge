# Durable Device Sign-In + Recovery Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make device sign-in survive iOS storage wipes — a durable server-set cookie silently restores identity after Safari's 7-day purge, and an always-visible recovery code lets users re-attach to their existing profile instead of creating a duplicate.

**Architecture:** Identity stays `{ profileId, secret }`. Two backup layers wrap localStorage: (1) an HttpOnly server-set cookie holding the identity (exempt from Safari's 7-day script-storage cap), rehydrated via `GET /api/session`; (2) a plaintext recovery code stored on `profile_secrets`, surfaced in the profile screen, redeemed via `POST /api/recover` which rotates the secret and re-attaches the device.

**Tech Stack:** Next.js App Router route handlers, Supabase (service-role), Node crypto, Vitest (node environment). Spec: [docs/superpowers/specs/2026-06-14-durable-device-signin-design.md](../specs/2026-06-14-durable-device-signin-design.md).

---

## File Structure

- **`supabase/schema.sql`** (modify) — add `recovery_code text unique` to `profile_secrets`; include an `alter table` snippet for the live DB.
- **`lib/server/recovery.ts`** (create) — `generateRecoveryCode()`.
- **`lib/server/session.ts`** (create) — cookie serialize/read helpers.
- **`lib/server/rateLimit.ts`** (create) — best-effort in-memory per-key limiter.
- **`lib/server/store.ts`** (modify) — `createProfile` returns `{ profile, recoveryCode }`; add `recoverByCode`, `ensureRecoveryCode`.
- **`lib/identity.ts`** (modify) — add `resolveIdentity()`.
- **`app/api/profiles/route.ts`** (modify) — POST sets cookie + returns `recoveryCode`.
- **`app/api/session/route.ts`** (create) — `GET` rehydrate, `POST` adopt/refresh.
- **`app/api/recover/route.ts`** (create) — `POST` redeem code.
- **`app/page.tsx`** (modify) — await `resolveIdentity()` on load.
- **`components/SetupScreen.tsx`** (modify) — "I already have an account" → recovery flow.
- **`components/EditProfileModal.tsx`** (modify) — display recovery code.
- **`app/globals.css`** (modify) — styling for recovery UI.

Test files: `lib/server/recovery.test.ts`, `lib/server/session.test.ts`, `lib/server/rateLimit.test.ts`, `app/api/session/route.test.ts`, `app/api/recover/route.test.ts`, `lib/identity.test.ts`, plus additions to `app/api/profiles/route.test.ts`.

---

### Task 1: Database migration

**Files:**
- Modify: `supabase/schema.sql`

- [ ] **Step 1: Add the column to the schema file**

In `supabase/schema.sql`, change the `profile_secrets` table definition to include the recovery code, and add a migration snippet for the deployed DB:

```sql
-- Secrets live apart from profiles so public reads can never leak them.
create table public.profile_secrets (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  secret_hash text not null,
  recovery_code text unique
);
```

Add at the bottom of the file:

```sql
-- Migration for already-deployed databases:
-- alter table public.profile_secrets add column recovery_code text unique;
```

- [ ] **Step 2: Apply the migration to the live database**

Run against the project's Supabase using the service-role connection (the SQL editor in the Supabase dashboard, or `psql`):

```sql
alter table public.profile_secrets add column recovery_code text unique;
```

Expected: `ALTER TABLE` success; `recovery_code` is nullable so existing rows are unaffected.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add recovery_code column to profile_secrets"
```

---

### Task 2: Recovery code generator

**Files:**
- Create: `lib/server/recovery.ts`
- Test: `lib/server/recovery.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/server/recovery.test.ts
import { describe, expect, it } from "vitest";
import { generateRecoveryCode } from "./recovery";

describe("generateRecoveryCode", () => {
  it("matches the PINT-XXXXX format with an unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRecoveryCode();
      expect(code).toMatch(/^PINT-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
      expect(code).not.toMatch(/[OIL01]/);
    }
  });

  it("produces varied codes", () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateRecoveryCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/server/recovery.test.ts`
Expected: FAIL — cannot find module `./recovery`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/server/recovery.ts
import { randomInt } from "node:crypto";

// No 0/O/1/I/L — unambiguous when read off a screen or written down.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateRecoveryCode(): string {
  let code = "";
  for (let i = 0; i < 5; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return `PINT-${code}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/server/recovery.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/recovery.ts lib/server/recovery.test.ts
git commit -m "feat: recovery code generator"
```

---

### Task 3: Session cookie helpers

**Files:**
- Create: `lib/server/session.ts`
- Test: `lib/server/session.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/server/session.test.ts
import { describe, expect, it } from "vitest";
import { readSessionCookie, serializeSessionCookie } from "./session";

const identity = { profileId: "p1", secret: "a".repeat(64) };

describe("session cookie", () => {
  it("serializes with the durable, secure flags", () => {
    const c = serializeSessionCookie(identity);
    expect(c).toContain("aleParade.session=");
    expect(c).toContain("Max-Age=31536000");
    expect(c).toContain("Path=/");
    expect(c).toContain("HttpOnly");
    expect(c).toContain("Secure");
    expect(c).toContain("SameSite=Lax");
  });

  it("round-trips through a request Cookie header", () => {
    const cookie = serializeSessionCookie(identity).split(";")[0];
    const req = new Request("http://test/", { headers: { cookie } });
    expect(readSessionCookie(req)).toEqual(identity);
  });

  it("returns null when the cookie is absent or malformed", () => {
    expect(readSessionCookie(new Request("http://test/"))).toBeNull();
    const bad = new Request("http://test/", { headers: { cookie: "aleParade.session=notjson" } });
    expect(readSessionCookie(bad)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/server/session.test.ts`
Expected: FAIL — cannot find module `./session`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/server/session.ts
import type { Identity } from "@/lib/identity";

const COOKIE_NAME = "aleParade.session";
const MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export function serializeSessionCookie(identity: Identity): string {
  const value = encodeURIComponent(JSON.stringify(identity));
  return `${COOKIE_NAME}=${value}; Max-Age=${MAX_AGE}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export function readSessionCookie(req: Request): Identity | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  const part = header.split(/; */).find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!part) return null;
  try {
    const raw = decodeURIComponent(part.slice(COOKIE_NAME.length + 1));
    const v = JSON.parse(raw);
    if (v && typeof v.profileId === "string" && typeof v.secret === "string") {
      return { profileId: v.profileId, secret: v.secret };
    }
  } catch {
    // fall through
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/server/session.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/session.ts lib/server/session.test.ts
git commit -m "feat: session cookie helpers"
```

---

### Task 4: Rate limiter

**Files:**
- Create: `lib/server/rateLimit.ts`
- Test: `lib/server/rateLimit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/server/rateLimit.test.ts
import { describe, expect, it } from "vitest";
import { allow } from "./rateLimit";

describe("allow", () => {
  it("permits up to the limit then blocks within the window", () => {
    const key = "test-" + Math.random();
    for (let i = 0; i < 10; i++) expect(allow(key, 10, 60_000)).toBe(true);
    expect(allow(key, 10, 60_000)).toBe(false);
  });

  it("tracks keys independently", () => {
    expect(allow("a-" + Math.random(), 1, 60_000)).toBe(true);
    expect(allow("b-" + Math.random(), 1, 60_000)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/server/rateLimit.test.ts`
Expected: FAIL — cannot find module `./rateLimit`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/server/rateLimit.ts
// Best-effort, per-instance. In serverless each instance has its own map, so
// this slows brute force without being a hard guarantee — adequate at friends-app scale.
const hits = new Map<string, number[]>();

export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/server/rateLimit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/server/rateLimit.ts lib/server/rateLimit.test.ts
git commit -m "feat: best-effort in-memory rate limiter"
```

---

### Task 5: Store functions (create-with-code, recover, ensure)

**Files:**
- Modify: `lib/server/store.ts`

These hit Supabase directly and mirror the existing untested DB-wrapper functions in this file (no `store.test.ts` exists; the route tests mock this module). No unit test here — coverage comes from the route tests in Tasks 6–8.

- [ ] **Step 1: Add imports at the top of `lib/server/store.ts`**

```ts
import { generateSecret, hashSecret } from "@/lib/server/secrets";
import { generateRecoveryCode } from "@/lib/server/recovery";
```

- [ ] **Step 2: Replace `createProfile` so it mints a recovery code and returns it**

```ts
// Two inserts, no transaction: a failure between them leaves a ghost profile
// (visible, never incrementable). Accepted at friends-app scale; clean up via dashboard.
export async function createProfile(args: {
  name: string;
  photoUrl: string | null;
  secretHash: string;
}): Promise<{ profile: ProfileRow; recoveryCode: string }> {
  const db = serviceClient();
  const { data: profile, error } = await db
    .from("profiles")
    .insert({ name: args.name, photo_url: args.photoUrl })
    .select()
    .single();
  if (error) throw error;

  // Retry on the unique constraint; collisions are astronomically rare.
  for (let attempt = 0; attempt < 5; attempt++) {
    const recoveryCode = generateRecoveryCode();
    const { error: secretError } = await db
      .from("profile_secrets")
      .insert({ profile_id: profile.id, secret_hash: args.secretHash, recovery_code: recoveryCode });
    if (!secretError) return { profile, recoveryCode };
    if (secretError.code !== "23505") throw secretError;
  }
  throw new Error("Could not generate a unique recovery code");
}
```

- [ ] **Step 3: Add `recoverByCode` (rotates the secret) and `ensureRecoveryCode` at the end of the file**

```ts
// Redeem a recovery code: rotate the secret so the recovering device gets a
// fresh credential, and return the profile + new plaintext secret.
export async function recoverByCode(
  code: string
): Promise<{ profile: ProfileRow; secret: string } | null> {
  const db = serviceClient();
  const { data: sec, error } = await db
    .from("profile_secrets")
    .select("profile_id")
    .eq("recovery_code", code)
    .maybeSingle();
  if (error) throw error;
  if (!sec) return null;

  const secret = generateSecret();
  const { error: upErr } = await db
    .from("profile_secrets")
    .update({ secret_hash: hashSecret(secret) })
    .eq("profile_id", sec.profile_id);
  if (upErr) throw upErr;

  const { data: profile, error: pErr } = await db
    .from("profiles")
    .select("id, name, photo_url, created_at")
    .eq("id", sec.profile_id)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!profile) return null;
  return { profile, secret };
}

// Return the profile's recovery code, generating one if it has none (backfill
// for profiles created before this feature existed).
export async function ensureRecoveryCode(profileId: string): Promise<string | null> {
  const db = serviceClient();
  const { data, error } = await db
    .from("profile_secrets")
    .select("recovery_code")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.recovery_code) return data.recovery_code;

  for (let attempt = 0; attempt < 5; attempt++) {
    const recoveryCode = generateRecoveryCode();
    const { error: upErr } = await db
      .from("profile_secrets")
      .update({ recovery_code: recoveryCode })
      .eq("profile_id", profileId);
    if (!upErr) return recoveryCode;
    if (upErr.code !== "23505") throw upErr;
  }
  throw new Error("Could not generate a unique recovery code");
}
```

- [ ] **Step 4: Verify type-check passes**

Run: `npx tsc --noEmit`
Expected: errors only in `app/api/profiles/route.ts` (it still treats `createProfile`'s return as a `ProfileRow`) — fixed in Task 6. If other files error, fix before continuing.

- [ ] **Step 5: Commit**

```bash
git add lib/server/store.ts
git commit -m "feat: store fns for recovery code mint, redeem, and backfill"
```

---

### Task 6: POST /api/profiles sets cookie + returns recovery code

**Files:**
- Modify: `app/api/profiles/route.ts`
- Modify: `app/api/profiles/route.test.ts`

- [ ] **Step 1: Update the test's store mock and POST assertions**

In `app/api/profiles/route.test.ts`, change the `createProfile` mock's resolved value (the `beforeEach` in the POST describe block) to return the new shape, and assert the cookie + recovery code:

```ts
// in the POST describe's beforeEach:
mockCreate.mockReset();
mockCreate.mockResolvedValue({
  profile: { id: "p1", name: "Brett", photo_url: null, created_at: "2026-06-09T00:00:00Z" },
  recoveryCode: "PINT-7K2QF",
});
```

Replace the "creates a profile" test body with:

```ts
it("creates a profile, returns secret + recovery code, and sets the session cookie", async () => {
  const res = await POST(request({ name: "  Brett ", photo: null }));
  expect(res.status).toBe(201);
  const json = await res.json();
  expect(json.profile.id).toBe("p1");
  expect(json.secret).toMatch(/^[0-9a-f]{64}$/);
  expect(json.recoveryCode).toBe("PINT-7K2QF");
  expect(res.headers.get("set-cookie")).toContain("aleParade.session=");
  expect(mockCreate).toHaveBeenCalledWith({
    name: "Brett",
    photoUrl: null,
    secretHash: hashSecret(json.secret),
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/profiles/route.test.ts`
Expected: FAIL — `json.profile` undefined / no set-cookie header.

- [ ] **Step 3: Update the POST handler**

In `app/api/profiles/route.ts`, add the import and update the end of `POST`:

```ts
import { serializeSessionCookie } from "@/lib/server/session";
```

```ts
  const secret = generateSecret();
  const { profile, recoveryCode } = await createProfile({
    name,
    photoUrl: photo.photo,
    secretHash: hashSecret(secret),
  });
  return Response.json(
    { profile, secret, recoveryCode },
    {
      status: 201,
      headers: { "Set-Cookie": serializeSessionCookie({ profileId: profile.id, secret }) },
    }
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/profiles/route.test.ts`
Expected: PASS (PATCH tests unaffected).

- [ ] **Step 5: Commit**

```bash
git add app/api/profiles/route.ts app/api/profiles/route.test.ts
git commit -m "feat: signup sets durable session cookie and returns recovery code"
```

---

### Task 7: GET/POST /api/session

**Files:**
- Create: `app/api/session/route.ts`
- Test: `app/api/session/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/api/session/route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashSecret } from "@/lib/server/secrets";

vi.mock("@/lib/server/store", () => ({
  getSecretHash: vi.fn(),
  ensureRecoveryCode: vi.fn(),
}));

import { ensureRecoveryCode, getSecretHash } from "@/lib/server/store";
import { GET, POST } from "./route";

const mockHash = vi.mocked(getSecretHash);
const mockEnsure = vi.mocked(ensureRecoveryCode);
const SECRET = "a".repeat(64);

function cookieValue() {
  return `aleParade.session=${encodeURIComponent(JSON.stringify({ profileId: "p1", secret: SECRET }))}`;
}

describe("GET /api/session", () => {
  beforeEach(() => {
    mockHash.mockReset().mockResolvedValue(hashSecret(SECRET));
  });

  it("returns the identity for a valid cookie", async () => {
    const req = new Request("http://test/api/session", { headers: { cookie: cookieValue() } });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ profileId: "p1", secret: SECRET });
  });

  it("401s when there is no cookie", async () => {
    expect((await GET(new Request("http://test/api/session"))).status).toBe(401);
  });

  it("401s when the secret no longer matches", async () => {
    mockHash.mockResolvedValue(hashSecret("b".repeat(64)));
    const req = new Request("http://test/api/session", { headers: { cookie: cookieValue() } });
    expect((await GET(req)).status).toBe(401);
  });
});

function postReq(body: unknown) {
  return new Request("http://test/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/session", () => {
  beforeEach(() => {
    mockHash.mockReset().mockResolvedValue(hashSecret(SECRET));
    mockEnsure.mockReset().mockResolvedValue("PINT-7K2QF");
  });

  it("refreshes the cookie and returns the recovery code for valid creds", async () => {
    const res = await POST(postReq({ profileId: "p1", secret: SECRET }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recoveryCode: "PINT-7K2QF" });
    expect(res.headers.get("set-cookie")).toContain("aleParade.session=");
    expect(mockEnsure).toHaveBeenCalledWith("p1");
  });

  it("401s for a wrong secret", async () => {
    mockHash.mockResolvedValue(hashSecret("b".repeat(64)));
    const res = await POST(postReq({ profileId: "p1", secret: SECRET }));
    expect(res.status).toBe(401);
    expect(mockEnsure).not.toHaveBeenCalled();
  });

  it("401s when credentials are missing", async () => {
    expect((await POST(postReq({}))).status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/session/route.test.ts`
Expected: FAIL — cannot find module `./route`.

- [ ] **Step 3: Write the route**

```ts
// app/api/session/route.ts
import { hashSecret, safeEqualHex } from "@/lib/server/secrets";
import { ensureRecoveryCode, getSecretHash } from "@/lib/server/store";
import { readSessionCookie, serializeSessionCookie } from "@/lib/server/session";

export async function GET(req: Request): Promise<Response> {
  const identity = readSessionCookie(req);
  if (!identity) return Response.json({ error: "No session" }, { status: 401 });
  const storedHash = await getSecretHash(identity.profileId);
  if (!storedHash || !safeEqualHex(storedHash, hashSecret(identity.secret))) {
    return Response.json({ error: "No session" }, { status: 401 });
  }
  return Response.json({ profileId: identity.profileId, secret: identity.secret }, { status: 200 });
}

export async function POST(req: Request): Promise<Response> {
  let body: { profileId?: unknown; secret?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const profileId = typeof body.profileId === "string" ? body.profileId : null;
  const secret = typeof body.secret === "string" ? body.secret : null;
  if (!profileId || !secret) {
    return Response.json({ error: "Missing credentials" }, { status: 401 });
  }
  const storedHash = await getSecretHash(profileId);
  if (!storedHash || !safeEqualHex(storedHash, hashSecret(secret))) {
    return Response.json({ error: "Not your pint" }, { status: 401 });
  }
  const recoveryCode = await ensureRecoveryCode(profileId);
  return Response.json(
    { ok: true, recoveryCode },
    { status: 200, headers: { "Set-Cookie": serializeSessionCookie({ profileId, secret }) } }
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/session/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/session/route.ts app/api/session/route.test.ts
git commit -m "feat: /api/session — rehydrate from cookie and refresh/adopt"
```

---

### Task 8: POST /api/recover

**Files:**
- Create: `app/api/recover/route.ts`
- Test: `app/api/recover/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// app/api/recover/route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/store", () => ({
  recoverByCode: vi.fn(),
}));

import { recoverByCode } from "@/lib/server/store";
import { POST } from "./route";

const mockRecover = vi.mocked(recoverByCode);

function req(body: unknown) {
  return new Request("http://test/api/recover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/recover", () => {
  beforeEach(() => {
    mockRecover.mockReset().mockResolvedValue({
      profile: { id: "p1", name: "Brett", photo_url: null, created_at: "2026-06-09T00:00:00Z" },
      secret: "c".repeat(64),
    });
  });

  it("redeems a code, returns the profile + secret, and sets the cookie", async () => {
    const res = await POST(req({ code: "PINT-7K2QF" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.profile.id).toBe("p1");
    expect(json.secret).toBe("c".repeat(64));
    expect(res.headers.get("set-cookie")).toContain("aleParade.session=");
  });

  it("normalizes case and whitespace before lookup", async () => {
    await POST(req({ code: "  pint-7k2qf  " }));
    expect(mockRecover).toHaveBeenCalledWith("PINT-7K2QF");
  });

  it("404s for an unknown code", async () => {
    mockRecover.mockResolvedValue(null);
    const res = await POST(req({ code: "PINT-ZZZZZ" }));
    expect(res.status).toBe(404);
  });

  it("400s when no code is supplied", async () => {
    expect((await POST(req({}))).status).toBe(400);
    expect(mockRecover).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/recover/route.test.ts`
Expected: FAIL — cannot find module `./route`.

- [ ] **Step 3: Write the route**

```ts
// app/api/recover/route.ts
import { allow } from "@/lib/server/rateLimit";
import { recoverByCode } from "@/lib/server/store";
import { serializeSessionCookie } from "@/lib/server/session";

export async function POST(req: Request): Promise<Response> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allow(`recover:${ip}`, 10, 60_000)) {
    return Response.json({ error: "Too many attempts — try again in a minute." }, { status: 429 });
  }

  let body: { code?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code) return Response.json({ error: "Enter your recovery code" }, { status: 400 });

  const result = await recoverByCode(code);
  if (!result) return Response.json({ error: "No account found for that code." }, { status: 404 });

  return Response.json(
    { profile: result.profile, secret: result.secret },
    {
      status: 200,
      headers: { "Set-Cookie": serializeSessionCookie({ profileId: result.profile.id, secret: result.secret }) },
    }
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/recover/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/recover/route.ts app/api/recover/route.test.ts
git commit -m "feat: /api/recover — redeem recovery code, rotate secret, re-attach"
```

---

### Task 9: resolveIdentity() load sequence

**Files:**
- Modify: `lib/identity.ts`
- Test: `lib/identity.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/identity.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveIdentity } from "./identity";

const KEY = "aleParade.identity";

function fakeLocalStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = fakeLocalStorage() as unknown as Storage;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveIdentity", () => {
  it("returns the local identity and refreshes the cookie when localStorage has it", async () => {
    const id = { profileId: "p1", secret: "a".repeat(64) };
    localStorage.setItem(KEY, JSON.stringify(id));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    expect(await resolveIdentity()).toEqual(id);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/session",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("rehydrates from the cookie via GET when localStorage is empty", async () => {
    const id = { profileId: "p2", secret: "b".repeat(64) };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => id });
    vi.stubGlobal("fetch", fetchMock);

    expect(await resolveIdentity()).toEqual(id);
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify(id));
    expect(fetchMock).toHaveBeenCalledWith("/api/session");
  });

  it("returns null when both localStorage and the cookie are empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    expect(await resolveIdentity()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/identity.test.ts`
Expected: FAIL — `resolveIdentity` is not exported.

- [ ] **Step 3: Add `resolveIdentity` to `lib/identity.ts`**

Append:

```ts
// Resolve identity on app load, healing a wiped localStorage from the durable
// server cookie when possible:
//   1. localStorage present  -> use it; refresh the cookie in the background.
//   2. localStorage empty     -> ask the server (GET /api/session); if the cookie
//                                survived Safari's purge, re-seed localStorage.
//   3. neither                -> null (caller shows the setup screen).
export async function resolveIdentity(): Promise<Identity | null> {
  const local = loadIdentity();
  if (local) {
    void fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(local),
    }).catch(() => {});
    return local;
  }
  try {
    const res = await fetch("/api/session");
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.profileId === "string" && typeof data.secret === "string") {
        const id: Identity = { profileId: data.profileId, secret: data.secret };
        saveIdentity(id);
        return id;
      }
    }
  } catch {
    // Offline or server error: fall through to setup.
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/identity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/identity.ts lib/identity.test.ts
git commit -m "feat: resolveIdentity heals wiped localStorage from the session cookie"
```

---

### Task 10: Wire resolveIdentity into the page

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace the load effect**

In `app/page.tsx`, change the import and the effect:

```tsx
import { resolveIdentity, saveIdentity, type Identity } from "@/lib/identity";
```

```tsx
  React.useEffect(() => {
    let active = true;
    resolveIdentity().then((id) => {
      if (!active) return;
      setIdentity(id);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);
```

`loadIdentity` is no longer imported here; `finishSetup`/`saveIdentity` are unchanged.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: page load resolves identity via cookie rehydration"
```

---

### Task 11: "I already have an account" recovery flow in SetupScreen

**Files:**
- Modify: `components/SetupScreen.tsx`

- [ ] **Step 1: Add recovery state and handler**

In `components/SetupScreen.tsx`, after the existing state declarations, add:

```tsx
  const [recovering, setRecovering] = React.useState(false);
  const [code, setCode] = React.useState("");
```

Add a recover handler next to `submit`:

```tsx
  const recover = async () => {
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
        throw new Error(data?.error || "Could not find that account");
      }
      const { profile, secret } = await res.json();
      onDone({ profileId: profile.id, secret });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not find that account");
      setBusy(false);
    }
  };
```

- [ ] **Step 2: Render the recovery UI**

Replace the closing of the create form (after the "Pour me in" button, before the `{error && ...}` toast) so the screen toggles between create and recover modes. Replace this block:

```tsx
      <button type="button" className="pour-in-btn" disabled={!name.trim() || busy} onClick={submit}>
        {busy ? "Pouring…" : "Pour me in"}
      </button>
      {error && <div className="toast" role="status">{error}</div>}
```

with:

```tsx
      <button type="button" className="pour-in-btn" disabled={!name.trim() || busy} onClick={submit}>
        {busy ? "Pouring…" : "Pour me in"}
      </button>

      {!recovering ? (
        <button type="button" className="link-btn" onClick={() => { setRecovering(true); setError(null); }}>
          I already have an account
        </button>
      ) : (
        <div className="recover">
          <input
            className="name-input"
            type="text"
            placeholder="Recovery code (PINT-XXXXX)"
            value={code}
            autoCapitalize="characters"
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") recover(); }}
          />
          <button type="button" className="pour-in-btn" disabled={!code.trim() || busy} onClick={recover}>
            {busy ? "Finding…" : "Get me back in"}
          </button>
          <button type="button" className="link-btn" onClick={() => { setRecovering(false); setError(null); }}>
            Back to sign up
          </button>
        </div>
      )}
      {error && <div className="toast" role="status">{error}</div>}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/SetupScreen.tsx
git commit -m "feat: recovery-code sign-in path on the setup screen"
```

---

### Task 12: Show the recovery code in EditProfileModal

**Files:**
- Modify: `components/EditProfileModal.tsx`

- [ ] **Step 1: Fetch the code on open**

In `components/EditProfileModal.tsx`, add state and an effect that asks the adopt endpoint for the code (it also refreshes the cookie):

```tsx
  const [recoveryCode, setRecoveryCode] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(identity),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active && d?.recoveryCode) setRecoveryCode(d.recoveryCode); })
      .catch(() => {});
    return () => { active = false; };
  }, [identity]);
```

- [ ] **Step 2: Render the code block**

Inside the `modal-card`, after the `modal-actions` div, add:

```tsx
        {recoveryCode && (
          <div className="recovery-block">
            <span className="recovery-label">Your recovery code</span>
            <button
              type="button"
              className="recovery-code"
              onClick={() => {
                navigator.clipboard?.writeText(recoveryCode).then(
                  () => { setCopied(true); setTimeout(() => setCopied(false), 1500); },
                  () => {}
                );
              }}
            >
              {recoveryCode}
              <span className="recovery-copy">{copied ? "Copied!" : "Tap to copy"}</span>
            </button>
            <span className="recovery-hint">
              Save this — it&apos;s how you get back in if you clear your browser or switch devices.
            </span>
          </div>
        )}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/EditProfileModal.tsx
git commit -m "feat: show recovery code in the edit-profile modal"
```

---

### Task 13: Styling

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add styles consistent with the existing glass aesthetic**

Append to `app/globals.css`:

```css
.link-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.85rem;
  text-decoration: underline;
  cursor: pointer;
  padding: 8px;
  margin-top: 4px;
}
.link-btn:hover { color: #fff; }

.recover {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.recovery-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin-top: 16px;
  text-align: center;
}
.recovery-label {
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.6);
}
.recovery-code {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 1.25rem;
  letter-spacing: 0.12em;
  color: #f5d9a0;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 12px;
  padding: 10px 18px;
  cursor: pointer;
}
.recovery-copy {
  font-family: system-ui, sans-serif;
  font-size: 0.65rem;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.55);
}
.recovery-hint {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.55);
  max-width: 260px;
  line-height: 1.4;
}
```

- [ ] **Step 2: Verify in the running app**

Confirm the setup screen shows the "I already have an account" link and the edit-profile modal shows the recovery code. (Dev server / preview.)

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "style: recovery-code and recovery-link styling"
```

---

### Task 14: Full verification + deploy

**Files:** none (operational)

- [ ] **Step 1: Full test + type-check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all suites PASS, no type errors. (Per project memory, do NOT run `next build` while `next dev` is running.)

- [ ] **Step 2: Confirm the migration is live**

Verify the `recovery_code` column exists on `profile_secrets` in the production Supabase (Task 1, Step 2). The new code paths fail without it.

- [ ] **Step 3: Deploy**

Run: `npx vercel --prod`
Expected: deploy succeeds; production URL is `ale-parade-challenge.vercel.app`.

- [ ] **Step 4: Smoke test in production**

- Create a temp profile → confirm a recovery code appears in the edit modal.
- Clear localStorage in the browser, reload → confirm silent re-login from the cookie.
- Clear localStorage AND cookies, reload → "I already have an account" → enter the code → confirm re-attach to the same profile (no duplicate).

---

## Self-Review Notes

- **Spec coverage:** cookie layer (Tasks 3, 6, 7, 9, 10) ✓; recovery code (Tasks 2, 5, 8, 11, 12) ✓; lazy backfill via `ensureRecoveryCode` (Tasks 5, 7) ✓; secret rotation on recover (Task 5) ✓; rate-limiting (Tasks 4, 8) ✓; display in profile (Task 12) ✓; migration (Task 1) ✓; testing (each task) ✓.
- **Type consistency:** `createProfile` returns `{ profile, recoveryCode }` everywhere (Tasks 5, 6); `recoverByCode` returns `{ profile, secret } | null` (Tasks 5, 8); `ensureRecoveryCode` returns `string | null` (Tasks 5, 7); `Identity` imported from `@/lib/identity` in `session.ts` (Task 3).
- **Known trade-off:** recovery rotates the secret, so a still-live original device is logged out on recovery — acceptable per spec.
