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
