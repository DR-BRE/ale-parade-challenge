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
