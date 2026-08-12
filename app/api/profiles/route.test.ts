import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/auth", () => ({ getAuthedUser: vi.fn() }));
vi.mock("@/lib/server/store", () => ({
  ensureProfile: vi.fn(),
  updateProfile: vi.fn(),
}));

import { getAuthedUser } from "@/lib/server/auth";
import { ensureProfile, updateProfile } from "@/lib/server/store";
import { PATCH, POST } from "./route";

const mockAuth = vi.mocked(getAuthedUser);
const mockEnsure = vi.mocked(ensureProfile);
const mockUpdate = vi.mocked(updateProfile);

const ROW = { id: "p1", name: "Ada", photo_url: null, created_at: "2026-08-10T00:00:00Z" };

function req(method: "POST" | "PATCH", body: unknown, auth = true): Request {
  return new Request("http://test/api/profiles", {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: "Bearer good" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/profiles (ensure)", () => {
  beforeEach(() => {
    mockAuth.mockReset().mockResolvedValue({ id: "p1", fullName: "Ada Lovelace", avatarUrl: "https://g/a.png" });
    mockEnsure.mockReset().mockResolvedValue(ROW);
    mockUpdate.mockReset();
  });

  it("rejects an unauthenticated request", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await POST(req("POST", undefined, false))).status).toBe(401);
    expect(mockEnsure).not.toHaveBeenCalled();
  });

  it("creates the profile from Google metadata (name truncated to 24)", async () => {
    mockAuth.mockResolvedValue({ id: "p1", fullName: "A".repeat(40), avatarUrl: "https://g/a.png" });
    const res = await POST(req("POST", undefined));
    expect(res.status).toBe(200);
    expect(mockEnsure).toHaveBeenCalledWith({ id: "p1", name: "A".repeat(24), photoUrl: "https://g/a.png" });
  });

  it("falls back to Anonymous when Google gives no name", async () => {
    mockAuth.mockResolvedValue({ id: "p1", fullName: null, avatarUrl: null });
    await POST(req("POST", undefined));
    expect(mockEnsure).toHaveBeenCalledWith({ id: "p1", name: "Anonymous", photoUrl: null });
  });
});

describe("PATCH /api/profiles (edit)", () => {
  beforeEach(() => {
    mockAuth.mockReset().mockResolvedValue({ id: "p1", fullName: "Ada", avatarUrl: null });
    mockEnsure.mockReset();
    mockUpdate.mockReset().mockResolvedValue(ROW);
  });

  it("rejects an unauthenticated request", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await PATCH(req("PATCH", { name: "New" }, false))).status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a bad name", async () => {
    expect((await PATCH(req("PATCH", { name: "" }))).status).toBe(400);
    expect((await PATCH(req("PATCH", { name: "x".repeat(25) }))).status).toBe(400);
  });

  it("rejects a non-JPEG photo", async () => {
    expect((await PATCH(req("PATCH", { name: "Ada", photo: "data:image/png;base64,x" }))).status).toBe(400);
  });

  it("rejects malformed JSON", async () => {
    const bad = new Request("http://test/api/profiles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer good" },
      body: "{not json",
    });
    expect((await PATCH(bad)).status).toBe(400);
  });

  it("accepts an https avatar URL unchanged (Google photo round-trips)", async () => {
    const url = "https://lh3.googleusercontent.com/a/abc123";
    const res = await PATCH(req("PATCH", { name: "Ada", photo: url }));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ profileId: "p1", name: "Ada", photoUrl: url });
  });

  it("updates the authed user's own profile", async () => {
    const res = await PATCH(req("PATCH", { name: "Ada", photo: null }));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({ profileId: "p1", name: "Ada", photoUrl: null });
  });

  it("returns 404 when the row is missing", async () => {
    mockUpdate.mockResolvedValue(null);
    expect((await PATCH(req("PATCH", { name: "Ada" }))).status).toBe(404);
  });
});
