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

export function clearIdentity(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

// Resolve identity on app load, validating it server-side so a stale or deleted
// profile heals to the setup screen instead of stranding the user on a board
// where no row is theirs:
//   1. localStorage present  -> validate via POST /api/session (also refreshes
//                               the cookie). 401 means the server no longer
//                               recognizes it: drop it and fall through. Any
//                               other outcome (incl. offline) keeps the user in.
//   2. localStorage empty     -> ask the server (GET /api/session); if the cookie
//                                survived Safari's purge, re-seed localStorage.
//   3. neither                -> null (caller shows the setup screen).
export async function resolveIdentity(): Promise<Identity | null> {
  const local = loadIdentity();
  if (local) {
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(local),
      });
      // 401 = profile deleted or secret rotated. Drop the dead identity and let
      // the cookie/setup path below take over.
      if (res.status === 401) {
        clearIdentity();
      } else {
        return local;
      }
    } catch {
      // Offline or server hiccup: we can't prove it's invalid, so don't strand
      // the user — trust what's on the device.
      return local;
    }
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
