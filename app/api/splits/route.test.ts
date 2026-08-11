import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/auth", () => ({ getAuthedUser: vi.fn() }));
vi.mock("@/lib/server/store", () => ({
  getCount: vi.fn(),
  insertSplit: vi.fn(),
}));

import { getAuthedUser } from "@/lib/server/auth";
import { getCount, insertSplit } from "@/lib/server/store";
import { POST } from "./route";

const mockAuth = vi.mocked(getAuthedUser);
const mockCount = vi.mocked(getCount);
const mockInsert = vi.mocked(insertSplit);

function request(delta: unknown, auth = true): Request {
  return new Request("http://test/api/splits", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: "Bearer good" } : {}),
    },
    body: JSON.stringify({ delta }),
  });
}

describe("POST /api/splits", () => {
  beforeEach(() => {
    mockAuth.mockReset().mockResolvedValue({ id: "p1", fullName: "P", avatarUrl: null });
    mockCount.mockReset().mockResolvedValue(3);
    mockInsert.mockReset().mockResolvedValue({
      id: "s1", profile_id: "p1", delta: 1, created_at: "2026-08-10T00:00:00Z",
    });
  });

  it("rejects an unauthenticated request", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await POST(request(1, false))).status).toBe(401);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects deltas other than +1/-1", async () => {
    expect((await POST(request(2))).status).toBe(400);
    expect((await POST(request(0))).status).toBe(400);
    expect((await POST(request("1"))).status).toBe(400);
  });

  it("rejects malformed JSON", async () => {
    const bad = new Request("http://test/api/splits", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer good" },
      body: "{not json",
    });
    expect((await POST(bad)).status).toBe(400);
  });

  it("rejects an undo when the count is zero", async () => {
    mockCount.mockResolvedValue(0);
    expect((await POST(request(-1))).status).toBe(409);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("inserts a valid split for the authed user", async () => {
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
