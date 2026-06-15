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
