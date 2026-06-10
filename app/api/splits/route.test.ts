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
