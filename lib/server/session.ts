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
