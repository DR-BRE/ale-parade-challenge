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
