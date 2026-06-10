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
