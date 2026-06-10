# Ale Parade Challenge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Ale Parade Challenge webapp — a shared split-the-G tally with device-based identity — by recreating the Claude Design prototype in Next.js backed by Supabase.

**Architecture:** Next.js App Router (TypeScript, plain CSS ported from the prototype). Reads go straight from the browser to Supabase (anon key, RLS read-only); writes go through two Next.js API routes that verify a per-device secret against a hash in a client-inaccessible table. Realtime board updates via Supabase `postgres_changes`.

**Tech Stack:** Next.js 15, React 19, TypeScript, `@supabase/supabase-js` v2, Vitest, Vercel + Supabase free tier.

**References:**
- Spec: `docs/superpowers/specs/2026-06-09-ale-parade-challenge-design.md`
- Visual source of truth: `design/project/Ale Parade Challenge.html` (CSS), `design/project/ale-components.jsx` + `design/project/ale-app.jsx` (markup/behavior). Recreate the visual output; do NOT port the Tweaks panel, mock data, or localStorage count persistence.

**Baked theme values** (from the prototype's tweak defaults warmth=60, goldIntensity=65 run through the formulas in `ale-app.jsx:242-259`): warmChroma=0.022, goldChroma=0.1083. These are hardcoded in `:root` in Task 8 — there is no runtime theming.

## File structure

```
app/
  layout.tsx              — fonts (next/font), metadata, body
  page.tsx                — identity bootstrap: setup vs leaderboard
  globals.css             — full ported prototype CSS + baked :root theme + toast
  api/profiles/route.ts   — POST create profile, returns device secret
  api/splits/route.ts     — POST +1/-1, secret-checked, floor at zero
components/
  Crest.tsx               — "EST. 1759 / Ale Parade Challenge" lockup
  Avatar.tsx              — photo circle with monogram fallback
  Crown.tsx               — leader's crown SVG
  PintBackground.tsx      — animated settling-pour backdrop
  SplitButton.tsx         — +1 button with pour animation
  LeaderRow.tsx           — one leaderboard row + breakdown dropdown
  SetupScreen.tsx         — first-run profile creation
  Leaderboard.tsx         — ranked board, empty state, toast
lib/
  timeText.ts             — relative timestamps           (+ timeText.test.ts)
  identity.ts             — localStorage identity
  photo.ts                — downscale upload to 192px JPEG data URL
  supabaseClient.ts       — browser anon client
  useBoard.ts             — fetch + realtime + optimistic +1/-1
  server/secrets.ts       — generate/hash/compare secrets (+ secrets.test.ts)
  server/store.ts         — service-role DB calls
app/api/profiles/route.test.ts, app/api/splits/route.test.ts
supabase/schema.sql       — tables, RLS, realtime publication
.env.local.example, vitest.config.ts, package.json, tsconfig.json
```

---

### Task 1: Project scaffold (Next.js + Vitest)

The repo already has `docs/`, `design/`, and `.git`, so `create-next-app` would refuse the directory. Scaffold by hand — it's six small files.

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`, `vitest.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "ale-parade-challenge",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.49.0",
    "next": "^15.3.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.8.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Write `.gitignore`**

```
node_modules/
.next/
.env.local
.env*.local
*.tsbuildinfo
next-env.d.ts
```

- [ ] **Step 4: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "design/**"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
});
```

- [ ] **Step 5: Write placeholder app shell**

`app/globals.css` (placeholder; replaced in Task 8):

```css
body { margin: 0; background: #14100b; color: #eee; font-family: sans-serif; }
```

`app/layout.tsx` (placeholder; replaced in Task 8):

```tsx
import "./globals.css";

export const metadata = { title: "Ale Parade Challenge" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`app/page.tsx` (placeholder; replaced in Task 14):

```tsx
export default function Home() {
  return <main>Ale Parade Challenge — coming soon</main>;
}
```

- [ ] **Step 6: Install and smoke-test**

Run: `npm install`
Expected: installs without errors.

Run: `npm run build`
Expected: `✓ Compiled successfully`, one static route `/`.

Run: `npm test`
Expected: exits 0 with "no test files found" (passWithNoTests).

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json .gitignore vitest.config.ts app package-lock.json
git commit -m "feat: scaffold Next.js app with Vitest"
```

---

### Task 2: Supabase schema and environment

**Files:**
- Create: `supabase/schema.sql`
- Create: `.env.local.example`
- Create: `README.md`

- [ ] **Step 1: Write `supabase/schema.sql`**

```sql
-- Ale Parade Challenge schema. Run in the Supabase SQL editor.

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 24),
  photo_url text,
  created_at timestamptz not null default now()
);

-- Secrets live apart from profiles so public reads can never leak them.
create table public.profile_secrets (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  secret_hash text not null
);

create table public.splits (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  delta int not null check (delta in (1, -1)),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.profile_secrets enable row level security;
alter table public.splits enable row level security;

-- Anyone with the anon key may read the board; nobody may write.
-- (profile_secrets gets no policy at all: invisible to clients.)
create policy "public read profiles" on public.profiles for select using (true);
create policy "public read splits" on public.splits for select using (true);

-- Live updates for the leaderboard.
alter publication supabase_realtime add table public.splits;
alter publication supabase_realtime add table public.profiles;
```

- [ ] **Step 2: Write `.env.local.example`**

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR-SERVICE-ROLE-KEY
```

- [ ] **Step 3: Write `README.md`**

```markdown
# Ale Parade Challenge

Split-the-G tally for the crew. One shared leaderboard; your device is your login.

## Setup

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. In the SQL editor, run the contents of `supabase/schema.sql`.
3. Copy `.env.local.example` to `.env.local` and fill in the values from
   Project Settings → API (URL, `anon` key, `service_role` key).
4. `npm install && npm run dev` → http://localhost:3000

## Deploy

Push to GitHub, import the repo on [vercel.com](https://vercel.com), and set the
three environment variables from `.env.local` in the Vercel project settings.

## Design

The UI was designed in Claude Design; the handoff bundle (prototype + chat
transcript) lives in `design/`. Spec and plan live in `docs/superpowers/`.
```

- [ ] **Step 4: Manual setup (requires the user's Supabase account)**

Create the Supabase project, run `supabase/schema.sql` in the SQL editor, create `.env.local` from the example with real values. If executing as a subagent without credentials, flag this step for the user and continue — later tasks only need `.env.local` at manual-verification time (Task 15), not for unit tests.

Verify (once credentials exist): in Supabase Table Editor, `profiles`, `profile_secrets`, and `splits` all exist and show "RLS enabled".

- [ ] **Step 5: Commit**

```bash
git add supabase/schema.sql .env.local.example README.md
git commit -m "feat: add Supabase schema, env template, README"
```

---

### Task 3: Relative time formatting (`timeText`)

**Files:**
- Create: `lib/timeText.ts`
- Test: `lib/timeText.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/timeText.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { timeText } from "./timeText";

const NOW = 1_750_000_000_000;
const min = 60_000;

describe("timeText", () => {
  it("says Just now under a minute", () => {
    expect(timeText(NOW - 30_000, NOW)).toBe("Just now");
  });
  it("uses minutes under an hour", () => {
    expect(timeText(NOW - 5 * min, NOW)).toBe("5m ago");
    expect(timeText(NOW - 59 * min, NOW)).toBe("59m ago");
  });
  it("uses hours under a day", () => {
    expect(timeText(NOW - 60 * min, NOW)).toBe("1h ago");
    expect(timeText(NOW - 23 * 60 * min, NOW)).toBe("23h ago");
  });
  it("uses days from 24h up", () => {
    expect(timeText(NOW - 24 * 60 * min, NOW)).toBe("1d ago");
    expect(timeText(NOW - 6 * 24 * 60 * min, NOW)).toBe("6d ago");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/timeText.test.ts`
Expected: FAIL — cannot resolve `./timeText`.

- [ ] **Step 3: Write the implementation**

`lib/timeText.ts`:

```ts
// Matches the prototype's relative-time wording (apcTimeText in ale-app.jsx).
export function timeText(ts: number, now: number = Date.now()): string {
  const mins = Math.floor((now - ts) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/timeText.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/timeText.ts lib/timeText.test.ts
git commit -m "feat: relative time formatting"
```

---

### Task 4: Device secrets (generate / hash / compare)

**Files:**
- Create: `lib/server/secrets.ts`
- Test: `lib/server/secrets.test.ts`

- [ ] **Step 1: Write the failing test**

`lib/server/secrets.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { generateSecret, hashSecret, safeEqualHex } from "./secrets";

describe("secrets", () => {
  it("generates 64-char hex secrets, unique per call", () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
  it("hashes deterministically", () => {
    expect(hashSecret("pint")).toBe(hashSecret("pint"));
    expect(hashSecret("pint")).not.toBe(hashSecret("half-pint"));
    expect(hashSecret("pint")).toMatch(/^[0-9a-f]{64}$/);
  });
  it("compares hashes safely", () => {
    const h = hashSecret("pint");
    expect(safeEqualHex(h, hashSecret("pint"))).toBe(true);
    expect(safeEqualHex(h, hashSecret("stout"))).toBe(false);
    expect(safeEqualHex(h, "abc1")).toBe(false); // length mismatch must not throw
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/server/secrets.test.ts`
Expected: FAIL — cannot resolve `./secrets`.

- [ ] **Step 3: Write the implementation**

`lib/server/secrets.ts`:

```ts
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function generateSecret(): string {
  return randomBytes(32).toString("hex");
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/server/secrets.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add lib/server/secrets.ts lib/server/secrets.test.ts
git commit -m "feat: device secret generation and verification"
```

---

### Task 5: Service-role data access (`store`)

Thin wrapper around Supabase with the service-role key. No unit tests — it is all I/O; it gets exercised in Task 15's manual verification. Route tests in Tasks 6–7 mock this module.

**Files:**
- Create: `lib/server/store.ts`

- [ ] **Step 1: Write the implementation**

`lib/server/store.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

export type ProfileRow = {
  id: string;
  name: string;
  photo_url: string | null;
  created_at: string;
};

export type SplitRow = {
  id: string;
  profile_id: string;
  delta: number;
  created_at: string;
};

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function createProfile(args: {
  name: string;
  photoUrl: string | null;
  secretHash: string;
}): Promise<ProfileRow> {
  const db = serviceClient();
  const { data: profile, error } = await db
    .from("profiles")
    .insert({ name: args.name, photo_url: args.photoUrl })
    .select()
    .single();
  if (error) throw error;
  const { error: secretError } = await db
    .from("profile_secrets")
    .insert({ profile_id: profile.id, secret_hash: args.secretHash });
  if (secretError) throw secretError;
  return profile;
}

export async function getSecretHash(profileId: string): Promise<string | null> {
  const db = serviceClient();
  const { data, error } = await db
    .from("profile_secrets")
    .select("secret_hash")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (error) throw error;
  return data?.secret_hash ?? null;
}

export async function getCount(profileId: string): Promise<number> {
  const db = serviceClient();
  const { data, error } = await db
    .from("splits")
    .select("delta")
    .eq("profile_id", profileId);
  if (error) throw error;
  return (data ?? []).reduce((n, row) => n + row.delta, 0);
}

export async function insertSplit(
  profileId: string,
  delta: 1 | -1
): Promise<SplitRow> {
  const db = serviceClient();
  const { data, error } = await db
    .from("splits")
    .insert({ profile_id: profileId, delta })
    .select()
    .single();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/server/store.ts
git commit -m "feat: service-role data access layer"
```

---

### Task 6: `POST /api/profiles`

Routes use the standard `Response.json` (not `NextResponse`) so they run in Vitest's node environment without Next imports.

**Files:**
- Create: `app/api/profiles/route.ts`
- Test: `app/api/profiles/route.test.ts`

- [ ] **Step 1: Write the failing test**

`app/api/profiles/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashSecret } from "@/lib/server/secrets";

vi.mock("@/lib/server/store", () => ({
  createProfile: vi.fn(),
}));

import { createProfile } from "@/lib/server/store";
import { POST } from "./route";

const mockCreate = vi.mocked(createProfile);

function request(body: unknown): Request {
  return new Request("http://test/api/profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/profiles", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      id: "p1",
      name: "Brett",
      photo_url: null,
      created_at: "2026-06-09T00:00:00Z",
    });
  });

  it("rejects a missing or empty name", async () => {
    expect((await POST(request({}))).status).toBe(400);
    expect((await POST(request({ name: "   " }))).status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects names over 24 chars", async () => {
    const res = await POST(request({ name: "x".repeat(25) }));
    expect(res.status).toBe(400);
  });

  it("rejects oversized or non-JPEG photos", async () => {
    const big = "data:image/jpeg;base64," + "a".repeat(100_001);
    expect((await POST(request({ name: "Brett", photo: big }))).status).toBe(400);
    const png = "data:image/png;base64,abc";
    expect((await POST(request({ name: "Brett", photo: png }))).status).toBe(400);
  });

  it("creates a profile and returns a secret whose hash was stored", async () => {
    const res = await POST(request({ name: "  Brett ", photo: null }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.profile.id).toBe("p1");
    expect(json.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(mockCreate).toHaveBeenCalledWith({
      name: "Brett",
      photoUrl: null,
      secretHash: hashSecret(json.secret),
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/api/profiles/route.test.ts`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Write the implementation**

`app/api/profiles/route.ts`:

```ts
import { generateSecret, hashSecret } from "@/lib/server/secrets";
import { createProfile } from "@/lib/server/store";

const MAX_PHOTO_CHARS = 100_000; // ~75 KB binary; prototype photos are ~15 KB

export async function POST(req: Request): Promise<Response> {
  let body: { name?: unknown; photo?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 24) {
    return Response.json(
      { error: "Name must be 1-24 characters" },
      { status: 400 }
    );
  }

  let photo: string | null = null;
  if (typeof body.photo === "string" && body.photo.length > 0) {
    const isSmallJpeg =
      body.photo.startsWith("data:image/jpeg;base64,") &&
      body.photo.length <= MAX_PHOTO_CHARS;
    if (!isSmallJpeg) {
      return Response.json(
        { error: "Photo must be a small JPEG data URL" },
        { status: 400 }
      );
    }
    photo = body.photo;
  }

  const secret = generateSecret();
  const profile = await createProfile({
    name,
    photoUrl: photo,
    secretHash: hashSecret(secret),
  });
  return Response.json({ profile, secret }, { status: 201 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/api/profiles/route.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add app/api/profiles/route.ts app/api/profiles/route.test.ts
git commit -m "feat: profile creation endpoint with device secret"
```

---

### Task 7: `POST /api/splits`

**Files:**
- Create: `app/api/splits/route.ts`
- Test: `app/api/splits/route.test.ts`

- [ ] **Step 1: Write the failing test**

`app/api/splits/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashSecret } from "@/lib/server/secrets";

vi.mock("@/lib/server/store", () => ({
  getSecretHash: vi.fn(),
  getCount: vi.fn(),
  insertSplit: vi.fn(),
}));

import { getCount, getSecretHash, insertSplit } from "@/lib/server/store";
import { POST } from "./route";

const mockHash = vi.mocked(getSecretHash);
const mockCount = vi.mocked(getCount);
const mockInsert = vi.mocked(insertSplit);

const SECRET = "a".repeat(64);

function request(delta: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://test/api/splits", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-profile-id": "p1",
      "x-profile-secret": SECRET,
      ...headers,
    },
    body: JSON.stringify({ delta }),
  });
}

describe("POST /api/splits", () => {
  beforeEach(() => {
    mockHash.mockReset().mockResolvedValue(hashSecret(SECRET));
    mockCount.mockReset().mockResolvedValue(3);
    mockInsert.mockReset().mockResolvedValue({
      id: "s1",
      profile_id: "p1",
      delta: 1,
      created_at: "2026-06-09T00:00:00Z",
    });
  });

  it("rejects missing credentials", async () => {
    const bare = new Request("http://test/api/splits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delta: 1 }),
    });
    expect((await POST(bare)).status).toBe(401);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    const res = await POST(request(1, { "x-profile-secret": "b".repeat(64) }));
    expect(res.status).toBe(401);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects an unknown profile", async () => {
    mockHash.mockResolvedValue(null);
    expect((await POST(request(1))).status).toBe(401);
  });

  it("rejects deltas other than +1/-1", async () => {
    expect((await POST(request(2))).status).toBe(400);
    expect((await POST(request(0))).status).toBe(400);
    expect((await POST(request("1"))).status).toBe(400);
  });

  it("rejects an undo when the count is zero", async () => {
    mockCount.mockResolvedValue(0);
    expect((await POST(request(-1))).status).toBe(409);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("inserts a valid split and returns it", async () => {
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
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Write the implementation**

`app/api/splits/route.ts`:

```ts
import { hashSecret, safeEqualHex } from "@/lib/server/secrets";
import { getCount, getSecretHash, insertSplit } from "@/lib/server/store";

export async function POST(req: Request): Promise<Response> {
  const profileId = req.headers.get("x-profile-id");
  const secret = req.headers.get("x-profile-secret");
  if (!profileId || !secret) {
    return Response.json({ error: "Missing credentials" }, { status: 401 });
  }

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

  const storedHash = await getSecretHash(profileId);
  if (!storedHash || !safeEqualHex(storedHash, hashSecret(secret))) {
    return Response.json({ error: "Not your pint" }, { status: 401 });
  }

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

- [ ] **Step 4: Run all tests to verify they pass**

Run: `npm test`
Expected: all test files pass (timeText, secrets, profiles route, splits route).

- [ ] **Step 5: Commit**

```bash
git add app/api/splits/route.ts app/api/splits/route.test.ts
git commit -m "feat: split tally endpoint with secret check and zero floor"
```

---

### Task 8: Theme — fonts and the full ported stylesheet

**Files:**
- Modify: `app/layout.tsx` (replace placeholder)
- Modify: `app/globals.css` (replace placeholder)

- [ ] **Step 1: Write `app/layout.tsx`**

```tsx
import type { Metadata, Viewport } from "next";
import { Playfair_Display, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const serif = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "700", "900"],
  style: ["normal", "italic"],
  variable: "--serif",
});

const sans = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--sans",
});

export const metadata: Metadata = {
  title: "Ale Parade Challenge",
  description: "Split-the-G tally for the crew. First sip decides.",
};

export const viewport: Viewport = {
  themeColor: "#14100b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${serif.variable} ${sans.variable}`}>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Write `app/globals.css`**

This is the prototype's `<style>` block from `design/project/Ale Parade Challenge.html:19-471` with three changes: (1) `:root` carries the baked oklch theme (warmth 60 / gold 65) that the prototype computed at runtime, with font fallbacks that `next/font` overrides on `<body>`; (2) the pint backdrop is always on, so the `.stage.pint` variants are merged into the base selectors; (3) a `.toast` style is added. Everything else is copied verbatim — when in doubt, diff against the prototype file.

```css
:root {
  --serif: Georgia, serif;
  --sans: "Helvetica Neue", Helvetica, sans-serif;

  /* Baked theme: prototype tweak defaults warmth=60, goldIntensity=65
     run through the formulas in design/project/ale-app.jsx:242-259 */
  --bg: oklch(0.185 0.022 62);
  --bg-deep: oklch(0.135 0.0187 62);
  --stout: oklch(0.24 0.022 60);
  --stout-faint: oklch(0.24 0.015 60 / 0.45);
  --stout-card: oklch(0.23 0.022 62);
  --stout-card-deep: oklch(0.185 0.022 62);
  --cream: oklch(0.93 0.022 88);
  --cream-gold: oklch(0.89 0.0487 88);
  --cream-edge: oklch(0.93 0.022 88);
  --cream-dim: oklch(0.93 0.022 88 / 0.55);
  --cream-faint: oklch(0.93 0.022 88 / 0.18);
  --gold: oklch(0.79 0.1083 85);
  --gold-deep: oklch(0.6 0.1083 80);
  --gold-glow: oklch(0.79 0.1083 85 / 0.45);
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { background: #14100b; }

.stage {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  justify-content: center;
  background:
    radial-gradient(120% 90% at 50% 0%, var(--bg) 0%, var(--bg-deep) 100%);
  color: var(--cream);
  font-family: var(--sans);
  -webkit-font-smoothing: antialiased;
}
.app {
  width: 100%;
  max-width: 480px;
  padding: 142px 18px calc(48px + env(safe-area-inset-bottom));
  position: relative;
  z-index: 1;
}
.setup { min-height: calc(100vh - 190px); min-height: calc(100dvh - 190px); }

/* ---------- Pint backdrop: settling pour ---------- */
.pint-bg {
  position: fixed; inset: 0; z-index: 0; overflow: hidden;
  /* foam (covered) → tan settle zone → deep stout body */
  background:
    radial-gradient(140% 70% at 50% 4%, rgba(112, 38, 18, 0.2) 0%, rgba(0,0,0,0) 60%),
    linear-gradient(180deg,
      #b3925f 0px,
      #856340 105px,
      #46301c 160px,
      #1b0f07 230px,
      #0a0504 380px,
      #040302 100%);
}
.pint-bg::after {
  content: ""; position: absolute; inset: 0;
  background: radial-gradient(120% 90% at 50% 75%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.5) 100%);
}

/* Cascade: micro-bubble streaks streaming downward, in vertical bands like a real glass */
.cascade-fade {
  position: absolute; inset: 0; overflow: hidden;
  -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,0) 55px, #000 150px, #000 45%, rgba(0,0,0,0.25) 75%, rgba(0,0,0,0.05) 100%);
  mask-image: linear-gradient(180deg, rgba(0,0,0,0) 55px, #000 150px, #000 45%, rgba(0,0,0,0.25) 75%, rgba(0,0,0,0.05) 100%);
}
.cascade-streaks {
  position: absolute; inset: 0;
  -webkit-mask-image: repeating-linear-gradient(92deg,
    rgba(0,0,0,0.95) 0px, rgba(0,0,0,0.4) 11px, rgba(0,0,0,0.85) 19px,
    rgba(0,0,0,0.15) 32px, rgba(0,0,0,0.7) 44px, rgba(0,0,0,0.3) 61px, rgba(0,0,0,0.95) 73px);
  mask-image: repeating-linear-gradient(92deg,
    rgba(0,0,0,0.95) 0px, rgba(0,0,0,0.4) 11px, rgba(0,0,0,0.85) 19px,
    rgba(0,0,0,0.15) 32px, rgba(0,0,0,0.7) 44px, rgba(0,0,0,0.3) 61px, rgba(0,0,0,0.95) 73px);
}
.cascade-layer {
  position: absolute; left: 0; right: 0;
  filter: blur(0.4px);
  will-change: transform;
}
.cascade-layer.cl-a {
  top: -324px; bottom: -324px;
  background-image:
    radial-gradient(circle at 5px 9px, rgba(226, 205, 168, 0.12) 1px, rgba(0,0,0,0) 1.7px),
    radial-gradient(circle at 16px 27px, rgba(226, 205, 168, 0.09) 0.8px, rgba(0,0,0,0) 1.4px),
    radial-gradient(circle at 11px 19px, rgba(190, 158, 116, 0.08) 1.2px, rgba(0,0,0,0) 2px);
  background-size: 24px 36px;
  animation: cascadeA 7s linear infinite;
}
@keyframes cascadeA {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(0, 324px, 0); }
}
.cascade-layer.cl-b {
  top: -216px; bottom: -216px;
  background-image:
    radial-gradient(circle at 8px 14px, rgba(226, 205, 168, 0.1) 1.3px, rgba(0,0,0,0) 2.1px),
    radial-gradient(circle at 24px 41px, rgba(206, 180, 140, 0.07) 1px, rgba(0,0,0,0) 1.8px);
  background-size: 31px 54px;
  animation: cascadeB 12s linear infinite;
}
@keyframes cascadeB {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(0, 216px, 0); }
}

.bubbles { position: absolute; inset: 0; }
.bubble {
  position: absolute; top: 112px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, rgba(240, 228, 202, 0.9), rgba(206, 172, 126, 0.3));
  opacity: 0;
  filter: blur(0.3px);
  animation-name: bubbleSink;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
@keyframes bubbleSink {
  0% { transform: translate3d(0, 0, 0); opacity: 0; }
  7% { opacity: var(--o, 0.2); }
  88% { opacity: var(--o, 0.2); }
  100% { transform: translate3d(var(--drift, 0px), 92vh, 0); opacity: 0; }
}

/* Foam head: straight layers roughened into an organic edge by feTurbulence displacement */
.foam-wrap {
  position: absolute; top: -30px; left: -30px; right: -30px; height: 128px;
  filter: url(#foam-rough);
  animation: foamBob 9s ease-in-out infinite;
  will-change: transform;
}
.foam-core {
  position: absolute; inset: 0;
  background:
    radial-gradient(circle at 23% 88%, rgba(214, 192, 150, 0.5) 0%, rgba(0,0,0,0) 9%),
    radial-gradient(circle at 67% 92%, rgba(214, 192, 150, 0.45) 0%, rgba(0,0,0,0) 7%),
    radial-gradient(circle at 88% 86%, rgba(214, 192, 150, 0.4) 0%, rgba(0,0,0,0) 8%),
    radial-gradient(circle at 44% 95%, rgba(202, 176, 130, 0.45) 0%, rgba(0,0,0,0) 10%),
    linear-gradient(180deg,
      #faf5ea 0%,
      #f5edde 45%,
      #eee2c8 70%,
      #dfcca6 87%,
      #cbb080 96%,
      #b3925f 100%);
  box-shadow: 0 10px 26px -8px rgba(20, 10, 4, 0.55);
}
.foam-core::before {
  /* fine pore texture in the head */
  content: ""; position: absolute; inset: 0;
  background-image:
    radial-gradient(circle at 7px 11px, rgba(255, 252, 244, 0.5) 1px, rgba(0,0,0,0) 1.8px),
    radial-gradient(circle at 19px 4px, rgba(189, 165, 126, 0.14) 1.2px, rgba(0,0,0,0) 2px),
    radial-gradient(circle at 13px 22px, rgba(255, 252, 244, 0.35) 0.8px, rgba(0,0,0,0) 1.5px);
  background-size: 26px 29px;
  filter: blur(0.5px);
  animation: foamChurn 16s ease-in-out infinite alternate;
}
@keyframes foamChurn {
  from { transform: translateX(0); }
  to { transform: translateX(-22px); }
}
@keyframes foamBob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(4px); }
}

/* ---------- Crest / lockup ---------- */
.crest { text-align: center; user-select: none; }
.crest-rule {
  display: flex; align-items: center; gap: 12px;
  color: var(--gold);
}
.crest-rule::before, .crest-rule::after {
  content: ""; flex: 1; height: 1px;
  background: linear-gradient(to var(--rule-dir, right), transparent, var(--gold-deep));
}
.crest-rule::before { --rule-dir: right; }
.crest-rule::after { --rule-dir: left; }
.crest-diamond { width: 7px; height: 7px; background: var(--gold); transform: rotate(45deg); }
.crest-est {
  font-family: var(--sans); font-size: 11px; font-weight: 700;
  letter-spacing: 0.32em; text-transform: uppercase; color: var(--gold);
  margin: 14px 0 6px;
}
.crest-name {
  font-family: var(--serif); font-weight: 900; color: var(--cream);
  font-size: 44px; line-height: 1.02; margin: 0;
  text-shadow: 0 2px 0 rgba(0,0,0,0.35);
}
.crest-name .amp { font-style: italic; font-weight: 500; color: var(--gold); }
.crest-sub {
  font-family: var(--sans); font-size: 12px; font-weight: 700;
  letter-spacing: 0.3em; text-transform: uppercase;
  color: var(--cream-dim); margin: 10px 0 14px;
}
.crest.small .crest-name { font-size: 28px; }
.crest.small .crest-est { margin-top: 0; font-size: 10px; }
.crest.small .crest-sub { font-size: 10px; margin: 8px 0 10px; }

/* ---------- Avatars ---------- */
.avatar {
  border-radius: 50%; overflow: hidden; flex: none;
  background: var(--stout);
  display: flex; align-items: center; justify-content: center;
}
.avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.avatar .mono {
  font-family: var(--serif); font-weight: 700; color: var(--cream);
  line-height: 1;
}

/* ---------- Leaderboard ---------- */
.board { display: flex; flex-direction: column; gap: 10px; margin-top: 22px; }
.row {
  display: flex; flex-wrap: wrap; align-items: center; gap: 14px;
  background: var(--cream);
  color: var(--stout);
  border-radius: 14px;
  padding: 12px 16px 12px 12px;
  border: 1px solid rgba(0,0,0,0.25);
  box-shadow: 0 2px 0 rgba(0,0,0,0.3);
  position: relative;
}
.row .rank {
  font-family: var(--serif); font-weight: 700; font-style: italic;
  width: 22px; text-align: center; flex: none;
  color: var(--stout-faint); font-size: 17px;
}
.row .who { flex: 1; min-width: 0; }
.row .name {
  font-family: var(--serif); font-weight: 700; font-size: 19px;
  line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.row .count {
  font-family: var(--serif); font-weight: 900; font-size: 36px;
  line-height: 1; min-width: 44px; text-align: right;
  font-variant-numeric: lining-nums;
}
.count-pop { animation: countPop 0.8s cubic-bezier(.2,1.4,.4,1) both; }
@keyframes countPop {
  0% { transform: scale(1); }
  30% { transform: scale(1.35); color: var(--gold-deep); }
  100% { transform: scale(1); }
}

/* #1 gold treatment */
.row.leader {
  border: 1px solid var(--gold-deep);
  box-shadow:
    0 0 0 3px var(--cream-edge),
    0 0 0 4px var(--gold-deep),
    0 4px 18px -4px var(--gold-glow);
  background:
    linear-gradient(115deg, var(--cream) 55%, var(--cream-gold) 100%);
}
.row.leader .rank { color: var(--gold-deep); font-style: normal; }
.row.leader .count { color: var(--gold-deep); }
.crown {
  position: absolute; top: -11px; left: 40px;
  width: 26px; height: 17px; transform: rotate(-12deg);
  color: var(--gold); filter: drop-shadow(0 1px 1px rgba(0,0,0,0.45));
}

/* Your row — inverted */
.row.you {
  flex-wrap: wrap;
  background: linear-gradient(180deg, var(--stout-card) 0%, var(--stout-card-deep) 100%);
  color: var(--cream);
  border: 1px solid var(--gold-deep);
  box-shadow: 0 4px 14px -4px rgba(0,0,0,0.6);
  padding-bottom: 14px;
}
.row.you .rank { color: var(--cream-dim); }
.row.you.leader .rank { color: var(--gold); }
.you-actions {
  flex-basis: 100%; display: flex; align-items: stretch; gap: 10px;
  margin-top: 4px;
}
.undo-btn {
  flex: none; width: 40px; border-radius: 12px;
  background: transparent; border: 1px solid var(--cream-faint);
  color: var(--cream-dim); font-family: var(--sans);
  font-size: 15px; font-weight: 600; cursor: pointer;
  transition: opacity .15s, border-color .15s;
}
.undo-btn:disabled { opacity: 0.3; cursor: default; }
.undo-btn:not(:disabled):active { border-color: var(--cream-dim); }

/* ---------- The pour button ---------- */
.split-btn {
  flex: 1; position: relative; overflow: hidden;
  border-radius: 12px; border: 1px solid var(--gold-deep);
  background: var(--cream);
  min-height: 54px;
  font-family: var(--serif); font-weight: 700; font-size: 20px;
  color: var(--stout); cursor: pointer;
  touch-action: manipulation;
  transition: transform .1s;
}
.split-btn:active { transform: scale(0.985); }
.split-label { position: relative; z-index: 3; }
.split-label .plus { font-family: var(--sans); font-weight: 700; margin-right: 6px; }
.pour { position: absolute; inset: 0; z-index: 1; pointer-events: none; animation: pourFade 1.5s ease forwards; }
@keyframes pourFade { 0%, 78% { opacity: 1; } 100% { opacity: 0; } }
.pour-liquid {
  position: absolute; inset: 0;
  background: linear-gradient(to top, #0e0905 0%, #221308 70%, #3a2410 100%);
  transform-origin: bottom; transform: scaleY(0);
  animation: pourLiquid 1.5s cubic-bezier(.3,.7,.3,1) forwards;
}
@keyframes pourLiquid {
  0% { transform: scaleY(0); }
  38% { transform: scaleY(1); }
  100% { transform: scaleY(1); }
}
.pour-foam {
  position: absolute; left: 0; right: 0; top: 0; height: 30%;
  background: linear-gradient(to bottom, var(--cream) 0%, var(--cream) 62%, #d9c39a 100%);
  transform: translateY(280%);
  animation: pourFoam 1.5s cubic-bezier(.3,.7,.3,1) forwards;
}
@keyframes pourFoam {
  0% { transform: translateY(280%); }
  38% { transform: translateY(0); }
  48% { transform: translateY(14%); }
  60% { transform: translateY(0); }
  100% { transform: translateY(0); }
}
.pour-ring {
  position: absolute; inset: 0; border-radius: 12px; z-index: 2;
  animation: pourRing 0.9s ease-out forwards;
}
@keyframes pourRing {
  0% { box-shadow: 0 0 0 0 var(--gold-glow); }
  100% { box-shadow: 0 0 0 16px rgba(0,0,0,0); }
}
.pour-label { animation: pourLabel 1.5s ease forwards; }
@keyframes pourLabel {
  0%, 20% { color: var(--stout); }
  40%, 80% { color: var(--cream); text-shadow: 0 1px 0 rgba(0,0,0,0.4); }
  100% { color: var(--stout); }
}

/* ---------- Empty state ---------- */
.empty-banner {
  text-align: center; padding: 26px 16px 6px;
}
.empty-banner .big {
  font-family: var(--serif); font-style: italic; font-weight: 500;
  font-size: 21px; color: var(--cream);
}
.empty-banner .small {
  margin-top: 6px; font-size: 13px; color: var(--cream-dim);
}

/* ---------- Per-person breakdown ---------- */
.expand-btn {
  flex: none; width: 34px; height: 34px; margin-left: 2px;
  border: none; border-radius: 50%; background: transparent;
  color: var(--stout-faint); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: color .15s;
}
.expand-btn:active { color: var(--stout); }
.row.you .expand-btn { color: var(--cream-dim); }
.row.you .expand-btn:active { color: var(--cream); }
.chev { width: 16px; height: 16px; transition: transform .2s ease; }
.chev.open { transform: rotate(180deg); }

.breakdown {
  flex-basis: 100%;
  border-top: 1px solid rgba(0,0,0,0.12);
  margin-top: 10px; padding-top: 4px;
}
.row.you .breakdown { border-top-color: var(--cream-faint); }
.bd-item {
  display: flex; justify-content: space-between; align-items: baseline;
  gap: 12px; padding: 6px 2px; font-size: 14px;
}
.bd-item.undo .bd-text { font-style: italic; opacity: 0.6; }
.bd-time { opacity: 0.55; font-size: 12px; flex: none; }
.bd-more, .bd-empty {
  padding: 7px 2px 2px; font-size: 12px; font-style: italic; opacity: 0.55;
}

/* ---------- Setup screen ---------- */
.setup {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; text-align: center; gap: 0;
}
.uploader {
  margin: 34px 0 6px; position: relative; cursor: pointer;
  width: 124px; height: 124px; border-radius: 50%;
  border: none; padding: 0; background: none; color: inherit;
}
.uploader .ring {
  position: absolute; inset: 0; border-radius: 50%;
  border: 2px dashed var(--gold-deep);
  transition: border-color .15s;
}
.uploader:active .ring { border-color: var(--gold); }
.uploader .avatar { position: absolute; inset: 7px; width: auto; height: auto; }
.uploader .hint {
  position: absolute; left: 50%; bottom: -26px; transform: translateX(-50%);
  white-space: nowrap; font-size: 11px; font-weight: 700;
  letter-spacing: 0.2em; text-transform: uppercase; color: var(--cream-dim);
}
.uploader .cam {
  position: absolute; right: 2px; bottom: 2px; z-index: 2;
  width: 32px; height: 32px; border-radius: 50%;
  background: var(--gold); color: #241708;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; border: 2px solid var(--bg-deep);
}
.name-input {
  margin-top: 52px; width: min(280px, 80%);
  background: transparent; border: none;
  border-bottom: 1px solid var(--cream-faint);
  color: var(--cream); font-family: var(--serif);
  font-size: 26px; font-weight: 700; text-align: center;
  padding: 8px 4px; outline: none;
  transition: border-color .15s;
}
.name-input::placeholder { color: var(--cream-dim); font-weight: 500; font-style: italic; }
.name-input:focus { border-bottom-color: var(--gold); }
.pour-in-btn {
  margin-top: 36px; width: min(280px, 80%);
  min-height: 56px; border-radius: 14px;
  background: var(--gold); color: #241708;
  border: none; cursor: pointer;
  font-family: var(--serif); font-weight: 700; font-size: 21px;
  box-shadow: 0 3px 0 var(--gold-deep), 0 8px 22px -8px var(--gold-glow);
  transition: transform .1s, opacity .15s;
}
.pour-in-btn:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--gold-deep); }
.pour-in-btn:disabled { opacity: 0.45; cursor: default; }

.footer-note {
  margin-top: 40px; text-align: center;
  font-size: 11px; letter-spacing: 0.24em; text-transform: uppercase;
  color: var(--cream-dim);
  display: flex; align-items: center; justify-content: center; gap: 10px;
}
.footer-note::before, .footer-note::after {
  content: ""; width: 28px; height: 1px; background: var(--cream-faint);
}

/* ---------- Toast (production addition: optimistic-update failures) ---------- */
.toast {
  position: fixed; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom));
  transform: translateX(-50%); z-index: 10;
  background: var(--cream); color: var(--stout);
  font-family: var(--sans); font-size: 14px; font-weight: 600;
  padding: 10px 16px; border-radius: 10px;
  border: 1px solid var(--gold-deep);
  box-shadow: 0 6px 18px -6px rgba(0,0,0,0.6);
  animation: toastIn .2s ease;
  max-width: min(420px, calc(100vw - 32px));
}
@keyframes toastIn {
  from { opacity: 0; transform: translate(-50%, 8px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

@media (prefers-reduced-motion: reduce) {
  .pour, .pour-liquid, .pour-foam, .pour-ring, .pour-label, .count-pop { animation: none !important; }
  .pour { opacity: 0; }
  .foam-wrap, .foam-core::before, .cascade-layer { animation: none !important; }
  .bubble { display: none; }
}
```

- [ ] **Step 3: Verify it renders**

Run: `npm run dev`, open http://localhost:3000.
Expected: the placeholder text on a near-black warm background; fonts load without console errors (the page itself is still the Task 1 placeholder — only the backdrop styles exist so far).

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx app/globals.css
git commit -m "feat: port prototype stylesheet with baked theme and fonts"
```

---

### Task 9: Static components (Crest, Avatar, Crown, PintBackground)

Direct ports of `design/project/ale-components.jsx`. The inline font-size overrides on Crest are intentional — they are user edits from the design session and are the final design.

**Files:**
- Create: `components/Crest.tsx`, `components/Avatar.tsx`, `components/Crown.tsx`, `components/PintBackground.tsx`

- [ ] **Step 1: Write `components/Crest.tsx`**

```tsx
export default function Crest({ small = false }: { small?: boolean }) {
  return (
    <div className={small ? "crest small" : "crest"}>
      <div className="crest-rule"><span className="crest-diamond" /></div>
      <div className="crest-est" style={{ fontSize: 14 }}>EST. 1759</div>
      <h1 className="crest-name" style={{ fontSize: 34 }}>
        Ale Parade<br />
        <span className="amp" style={{ fontSize: 32 }}>Challenge</span>
      </h1>
      <div className="crest-sub" style={{ fontSize: 12 }}>Split-the-G Tally</div>
      <div className="crest-rule"><span className="crest-diamond" /></div>
    </div>
  );
}
```

- [ ] **Step 2: Write `components/Avatar.tsx`**

```tsx
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
```

- [ ] **Step 3: Write `components/Crown.tsx`**

```tsx
export default function Crown() {
  return (
    <svg className="crown" viewBox="0 0 24 16" aria-hidden="true">
      <path d="M2 14 L2 5 L7 9 L12 1.5 L17 9 L22 5 L22 14 Z" fill="currentColor" />
    </svg>
  );
}
```

- [ ] **Step 4: Write `components/PintBackground.tsx`**

```tsx
"use client";

import React from "react";

// Full-screen "pint" backdrop: settling pour — cream foam head with a
// noise-roughened edge, tan settle zone, and a cascade of micro-bubbles
// streaming downward through the dark body.
// Bubble params come from a deterministic hash so SSR and client agree.
export default function PintBackground() {
  const bubbles = React.useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => {
        const rnd = (n: number) => {
          const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453;
          return x - Math.floor(x);
        };
        return {
          left: (rnd(1) * 100).toFixed(1) + "%",
          size: (1.4 + rnd(2) * 2.6).toFixed(1) + "px",
          dur: (5.5 + rnd(3) * 8).toFixed(1) + "s",
          delay: (-(rnd(4) * 14)).toFixed(1) + "s",
          o: (0.08 + rnd(5) * 0.2).toFixed(2),
          drift: (rnd(6) * 18 - 9).toFixed(1) + "px",
        };
      }),
    []
  );
  return (
    <div className="pint-bg" aria-hidden="true">
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <filter id="foam-rough" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.011 0.05" numOctaves="3" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="26" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <div className="cascade-fade">
        <div className="cascade-streaks">
          <div className="cascade-layer cl-a" />
          <div className="cascade-layer cl-b" />
        </div>
      </div>
      <div className="bubbles">
        {bubbles.map((b, i) => (
          <span
            key={i}
            className="bubble"
            style={
              {
                left: b.left,
                width: b.size,
                height: b.size,
                animationDuration: b.dur,
                animationDelay: b.delay,
                "--o": b.o,
                "--drift": b.drift,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
      <div className="foam-wrap">
        <div className="foam-core" />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add components/Crest.tsx components/Avatar.tsx components/Crown.tsx components/PintBackground.tsx
git commit -m "feat: port crest, avatar, crown, and pint backdrop components"
```

---

### Task 10: Interactive components (SplitButton, LeaderRow)

Ports of `SplitButton` and `LeaderRow` from `design/project/ale-components.jsx`, minus the prototype's `hiddenCount`/`bd-more` footer (removed during the design session).

**Files:**
- Create: `components/SplitButton.tsx`, `components/LeaderRow.tsx`

- [ ] **Step 1: Write `components/SplitButton.tsx`**

```tsx
"use client";

import React from "react";

// The +1 button. Each tap re-keys the .pour layer so the
// fill / foam / ring animations restart from zero.
export default function SplitButton({ onPour }: { onPour: () => void }) {
  const [pourId, setPourId] = React.useState(0);
  const handle = () => {
    setPourId((n) => n + 1);
    onPour();
  };
  return (
    <button type="button" className="split-btn" onClick={handle} aria-label="Add one split">
      {pourId > 0 && (
        <span className="pour" key={pourId}>
          <span className="pour-liquid" />
          <span className="pour-foam" />
          <span className="pour-ring" />
        </span>
      )}
      <span className={pourId > 0 ? "split-label pour-label" : "split-label"} key={"l" + pourId}>
        <span className="plus">+1</span>Split it!
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Write `components/LeaderRow.tsx`**

```tsx
"use client";

import Avatar from "@/components/Avatar";
import Crown from "@/components/Crown";
import SplitButton from "@/components/SplitButton";
import { timeText } from "@/lib/timeText";

export type Member = { id: string; name: string; photo: string | null };
export type Entry = { id: string; type: "split" | "undo"; ts: number };

type LeaderRowProps = {
  member: Member;
  rank: number;
  isLeader: boolean;
  isYou: boolean;
  count: number;
  popKey: number;
  onPour: () => void;
  onUndo: () => void;
  history: Entry[];
  isOpen: boolean;
  onToggle: () => void;
};

// One leaderboard row. `history` is that person's pour breakdown,
// revealed by the chevron to the right of their score.
export default function LeaderRow({
  member, rank, isLeader, isYou, count, popKey,
  onPour, onUndo, history, isOpen, onToggle,
}: LeaderRowProps) {
  const cls = ["row", isLeader ? "leader" : "", isYou ? "you" : ""].join(" ").trim();
  return (
    <div className={cls}>
      {isLeader && <Crown />}
      <div className="rank">{rank}</div>
      <Avatar src={member.photo} name={member.name} size={46} />
      <div className="who">
        <div className="name" style={{ fontSize: isLeader ? 24 : 22 }}>
          {member.name}
        </div>
      </div>
      <div className={popKey > 0 ? "count count-pop" : "count"} key={popKey}>{count}</div>
      <button
        type="button"
        className="expand-btn"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label={"Show " + member.name + "'s pour history"}
      >
        <svg className={isOpen ? "chev open" : "chev"} viewBox="0 0 14 14" aria-hidden="true">
          <path d="M3 5 L7 9.2 L11 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {isYou && (
        <div className="you-actions">
          <button
            type="button"
            className="undo-btn"
            disabled={count === 0}
            onClick={onUndo}
            aria-label="Undo one split"
            title="Take one back"
          >
            &minus;1
          </button>
          <SplitButton onPour={onPour} />
        </div>
      )}
      {isOpen && (
        <div className="breakdown">
          {history.length === 0 ? (
            <div className="bd-empty">No pours yet.</div>
          ) : (
            history.map((e) => (
              <div key={e.id} className={e.type === "undo" ? "bd-item undo" : "bd-item"}>
                <span className="bd-text">{e.type === "undo" ? "Took one back" : "Split the G"}</span>
                <span className="bd-time">{timeText(e.ts)}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add components/SplitButton.tsx components/LeaderRow.tsx
git commit -m "feat: port split button and leaderboard row"
```

---

### Task 11: Client libs (identity, photo, Supabase browser client)

**Files:**
- Create: `lib/identity.ts`, `lib/photo.ts`, `lib/supabaseClient.ts`

- [ ] **Step 1: Write `lib/identity.ts`**

```ts
const KEY = "aleParade.identity";

export type Identity = { profileId: string; secret: string };

export function loadIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && typeof v.profileId === "string" && typeof v.secret === "string") {
      return { profileId: v.profileId, secret: v.secret };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveIdentity(identity: Identity): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(identity));
  } catch {
    // Private-mode storage failure: the app still works for this session.
  }
}
```

- [ ] **Step 2: Write `lib/photo.ts`**

```ts
// Downscale an uploaded photo to a small square JPEG data URL (~10-15 KB)
// so it can live directly in the profiles.photo_url column.
export function readPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const S = 192;
      const canvas = document.createElement("canvas");
      canvas.width = S;
      canvas.height = S;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas unavailable"));
        return;
      }
      const side = Math.min(img.width, img.height);
      ctx.drawImage(
        img,
        (img.width - side) / 2,
        (img.height - side) / 2,
        side,
        side,
        0,
        0,
        S,
        S
      );
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image"));
    };
    img.src = url;
  });
}
```

- [ ] **Step 3: Write `lib/supabaseClient.ts`**

```ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } }
);
```

- [ ] **Step 4: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add lib/identity.ts lib/photo.ts lib/supabaseClient.ts
git commit -m "feat: client identity, photo downscaling, supabase client"
```

---

### Task 12: Setup screen

Port of `SetupScreen` from `design/project/ale-app.jsx`, wired to `POST /api/profiles`.

**Files:**
- Create: `components/SetupScreen.tsx`

- [ ] **Step 1: Write `components/SetupScreen.tsx`**

```tsx
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
```

- [ ] **Step 2: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add components/SetupScreen.tsx
git commit -m "feat: first-run profile setup screen"
```

---

### Task 13: Board data hook (fetch, realtime, optimistic writes)

**Files:**
- Create: `lib/useBoard.ts`

- [ ] **Step 1: Write `lib/useBoard.ts`**

```ts
"use client";

import React from "react";
import type { Entry, Member } from "@/components/LeaderRow";
import type { Identity } from "@/lib/identity";
import { supabase } from "@/lib/supabaseClient";

type ProfileRow = { id: string; name: string; photo_url: string | null; created_at: string };
type SplitRow = { id: string; profile_id: string; delta: number; created_at: string };

export type Board = {
  loading: boolean;
  members: Member[]; // in join order; ranking happens in the component
  countsById: Record<string, number>;
  historyById: Record<string, Entry[]>; // newest first
  pour: () => void;
  undo: () => void;
  popKey: number; // bumps on your own +1/-1 to trigger the count pop
  error: string | null;
  clearError: () => void;
};

export function useBoard(identity: Identity): Board {
  const [profiles, setProfiles] = React.useState<ProfileRow[] | null>(null);
  const [splits, setSplits] = React.useState<SplitRow[]>([]);
  const [popKey, setPopKey] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  const refetch = React.useCallback(async () => {
    const [p, s] = await Promise.all([
      supabase.from("profiles").select("id, name, photo_url, created_at").order("created_at"),
      supabase.from("splits").select("id, profile_id, delta, created_at").order("created_at", { ascending: false }),
    ]);
    if (!p.error && p.data) setProfiles(p.data);
    if (!s.error && s.data) setSplits(s.data);
  }, []);

  React.useEffect(() => {
    refetch();
  }, [refetch]);

  // Live updates: any new split or profile change refreshes the board.
  React.useEffect(() => {
    const channel = supabase
      .channel("board-changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "splits" }, () => refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => refetch())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refetch]);

  const send = React.useCallback(
    async (delta: 1 | -1) => {
      // Optimistic: show the change immediately, roll back on failure.
      const temp: SplitRow = {
        id: "temp-" + Date.now() + Math.random().toString(36).slice(2, 6),
        profile_id: identity.profileId,
        delta,
        created_at: new Date().toISOString(),
      };
      setPopKey((n) => n + 1);
      setSplits((s) => [temp, ...s]);
      try {
        const res = await fetch("/api/splits", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-profile-id": identity.profileId,
            "x-profile-secret": identity.secret,
          },
          body: JSON.stringify({ delta }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error || "That one didn't land — try again");
        }
        const { split } = (await res.json()) as { split: SplitRow };
        setSplits((s) => {
          const replaced = s.map((row) => (row.id === temp.id ? split : row));
          // A realtime refetch may already have delivered the real row.
          return replaced.filter((row, i) => replaced.findIndex((r) => r.id === row.id) === i);
        });
      } catch (e) {
        setSplits((s) => s.filter((row) => row.id !== temp.id));
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    },
    [identity]
  );

  const countsById = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of splits) counts[s.profile_id] = (counts[s.profile_id] || 0) + s.delta;
    return counts;
  }, [splits]);

  const historyById = React.useMemo(() => {
    const hist: Record<string, Entry[]> = {};
    for (const s of splits) {
      (hist[s.profile_id] ||= []).push({
        id: s.id,
        type: s.delta === -1 ? "undo" : "split",
        ts: new Date(s.created_at).getTime(),
      });
    }
    return hist;
  }, [splits]);

  const members = React.useMemo(
    () => (profiles ?? []).map((p) => ({ id: p.id, name: p.name, photo: p.photo_url })),
    [profiles]
  );

  const myCount = countsById[identity.profileId] || 0;

  return {
    loading: profiles === null,
    members,
    countsById,
    historyById,
    pour: () => send(1),
    undo: () => {
      if (myCount > 0) send(-1);
    },
    popKey,
    error,
    clearError: () => setError(null),
  };
}
```

- [ ] **Step 2: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add lib/useBoard.ts
git commit -m "feat: board data hook with realtime and optimistic updates"
```

---

### Task 14: Leaderboard screen and page bootstrap

**Files:**
- Create: `components/Leaderboard.tsx`
- Modify: `app/page.tsx` (replace placeholder)

- [ ] **Step 1: Write `components/Leaderboard.tsx`**

```tsx
"use client";

import React from "react";
import Crest from "@/components/Crest";
import LeaderRow from "@/components/LeaderRow";
import type { Identity } from "@/lib/identity";
import { useBoard } from "@/lib/useBoard";

export default function Leaderboard({ identity }: { identity: Identity }) {
  const board = useBoard(identity);
  const [openId, setOpenId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!board.error) return;
    const t = setTimeout(board.clearError, 3000);
    return () => clearTimeout(t);
  }, [board.error, board.clearError]);

  if (board.loading) {
    return <Crest small />;
  }

  const ranked = board.members
    .map((m, i) => ({ m, i, count: board.countsById[m.id] || 0 }))
    .sort((a, b) => b.count - a.count || a.i - b.i);
  const anySplits = ranked.some((r) => r.count > 0);

  return (
    <div>
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
    </div>
  );
}
```

- [ ] **Step 2: Write `app/page.tsx`**

```tsx
"use client";

import React from "react";
import Leaderboard from "@/components/Leaderboard";
import PintBackground from "@/components/PintBackground";
import SetupScreen from "@/components/SetupScreen";
import { loadIdentity, saveIdentity, type Identity } from "@/lib/identity";

export default function Home() {
  const [identity, setIdentity] = React.useState<Identity | null>(null);
  const [ready, setReady] = React.useState(false);

  // Identity lives in localStorage, so it can only be read client-side.
  React.useEffect(() => {
    setIdentity(loadIdentity());
    setReady(true);
  }, []);

  const finishSetup = (id: Identity) => {
    saveIdentity(id);
    setIdentity(id);
  };

  return (
    <div className="stage">
      <PintBackground />
      <div className="app">
        {!ready ? null : identity ? (
          <Leaderboard identity={identity} />
        ) : (
          <SetupScreen onDone={finishSetup} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build, test, commit**

Run: `npm run build`
Expected: compiles, routes `/`, `/api/profiles`, `/api/splits`.

Run: `npm test`
Expected: all tests pass.

```bash
git add components/Leaderboard.tsx app/page.tsx
git commit -m "feat: leaderboard screen and identity bootstrap"
```

---

### Task 15: End-to-end verification and deploy

Requires the Supabase project from Task 2 and `.env.local`. If credentials are unavailable to the executor, hand this checklist to the user.

- [ ] **Step 1: Run the app against real Supabase**

Run: `npm run dev`, open http://localhost:3000 in a fresh/incognito window.

Checklist:
1. Setup screen shows the crest, dashed-ring uploader, name input, disabled "Pour me in".
2. Pick a photo → circle shows it, hint flips to "Looking sharp". Type a name → button enables.
3. Submit → leaderboard appears with your row (inverted dark card, +1/−1). Empty banner shows if you're alone with no splits.
4. Tap **+1 Split it!** → pour animation (stout fill, foam settle, gold ring), count pops to 1, crown appears on your row.
5. Tap the chevron → breakdown shows "Split the G — Just now". Tap **−1** → count back to 0, breakdown shows italic "Took one back". −1 is now disabled.
6. Reload → still your profile (no setup screen). Counts match.
7. Second browser (different profile name) → both profiles on the board; tap +1 in one window and watch the other update within a second or two (realtime).
8. Tampering check: `curl -s -X POST localhost:3000/api/splits -H 'Content-Type: application/json' -H 'x-profile-id: <other-profile-uuid>' -H 'x-profile-secret: deadbeef' -d '{"delta":1}'` → `{"error":"Not your pint"}`, HTTP 401.
9. In Supabase SQL editor: `select * from profile_secrets;` works for you (dashboard role) — then confirm the anon API cannot: `curl -s '<SUPABASE_URL>/rest/v1/profile_secrets?select=*' -H 'apikey: <ANON_KEY>'` returns an empty array or permission error, never rows.

- [ ] **Step 2: Fix anything the checklist surfaces, then run the full suite once more**

Run: `npm test && npm run build`
Expected: green.

- [ ] **Step 3: Deploy**

Push to GitHub, import into Vercel, set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in project settings, deploy, and repeat checklist items 3–7 against the production URL on a phone.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: post-verification adjustments"
```

---

## Self-review notes

- **Spec coverage:** setup screen (T12), leaderboard + gold/crown/inverted-you (T8–T10, T14), per-person breakdowns (T10, T13), empty state (T14), pint backdrop + reduced motion (T8, T9), crest/footer copy (T9, T14), device identity (T6, T11), only-your-own-score (T7), floor at zero server+client (T7, T13), optimistic UI + toast (T13, T8), realtime (T13), photos as data URLs (T6, T11), RLS posture (T2), tests on API routes (T6, T7), Vercel deploy (T15). The prototype's mock data, Tweaks panel, and localStorage count persistence are intentionally not ported.
- **Known accepted gaps (spec-approved):** no profile recovery (new device = new profile), no rate limiting (friends-only URL), no profile editing after setup.
