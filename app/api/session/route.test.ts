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
