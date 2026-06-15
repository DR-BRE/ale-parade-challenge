import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashSecret } from "@/lib/server/secrets";

vi.mock("@/lib/server/store", () => ({
  createProfile: vi.fn(),
  getSecretHash: vi.fn(),
  updateProfile: vi.fn(),
}));

import { createProfile, getSecretHash, updateProfile } from "@/lib/server/store";
import { PATCH, POST } from "./route";

const mockCreate = vi.mocked(createProfile);
const mockHash = vi.mocked(getSecretHash);
const mockUpdate = vi.mocked(updateProfile);

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
      profile: { id: "p1", name: "Brett", photo_url: null, created_at: "2026-06-09T00:00:00Z" },
      recoveryCode: "PINT-7K2QF",
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

  it("creates a profile, returns secret + recovery code, and sets the session cookie", async () => {
    const res = await POST(request({ name: "  Brett ", photo: null }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.profile.id).toBe("p1");
    expect(json.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(json.recoveryCode).toBe("PINT-7K2QF");
    expect(res.headers.get("set-cookie")).toContain("aleParade.session=");
    expect(mockCreate).toHaveBeenCalledWith({
      name: "Brett",
      photoUrl: null,
      secretHash: hashSecret(json.secret),
    });
  });
});

const SECRET = "a".repeat(64);

function patchRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://test/api/profiles", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-profile-id": "p1",
      "x-profile-secret": SECRET,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/profiles", () => {
  beforeEach(() => {
    mockHash.mockReset().mockResolvedValue(hashSecret(SECRET));
    mockUpdate.mockReset().mockResolvedValue({
      id: "p1",
      name: "Brett",
      photo_url: null,
      created_at: "2026-06-09T00:00:00Z",
    });
  });

  it("rejects missing credentials", async () => {
    const bare = new Request("http://test/api/profiles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Brett" }),
    });
    expect((await PATCH(bare)).status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    const res = await PATCH(patchRequest({ name: "Brett" }, { "x-profile-secret": "b".repeat(64) }));
    expect(res.status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects an unknown profile", async () => {
    mockHash.mockResolvedValue(null);
    expect((await PATCH(patchRequest({ name: "Brett" }))).status).toBe(401);
  });

  it("rejects malformed JSON", async () => {
    const bad = new Request("http://test/api/profiles", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-profile-id": "p1",
        "x-profile-secret": SECRET,
      },
      body: "{not json",
    });
    expect((await PATCH(bad)).status).toBe(400);
  });

  it("rejects a missing, empty, or too-long name", async () => {
    expect((await PATCH(patchRequest({}))).status).toBe(400);
    expect((await PATCH(patchRequest({ name: "   " }))).status).toBe(400);
    expect((await PATCH(patchRequest({ name: "x".repeat(25) }))).status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects oversized or non-JPEG photos", async () => {
    const big = "data:image/jpeg;base64," + "a".repeat(100_001);
    expect((await PATCH(patchRequest({ name: "Brett", photo: big }))).status).toBe(400);
    const png = "data:image/png;base64,abc";
    expect((await PATCH(patchRequest({ name: "Brett", photo: png }))).status).toBe(400);
  });

  it("returns 404 when the profile row is missing", async () => {
    mockUpdate.mockResolvedValue(null);
    expect((await PATCH(patchRequest({ name: "Brett" }))).status).toBe(404);
  });

  it("updates the profile with trimmed name and photo", async () => {
    const photo = "data:image/jpeg;base64,abc";
    const res = await PATCH(patchRequest({ name: "  Brett ", photo }));
    expect(res.status).toBe(200);
    expect((await res.json()).profile.id).toBe("p1");
    expect(mockUpdate).toHaveBeenCalledWith({
      profileId: "p1",
      name: "Brett",
      photoUrl: photo,
    });
  });

  it("accepts a null photo", async () => {
    const res = await PATCH(patchRequest({ name: "Brett", photo: null }));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      profileId: "p1",
      name: "Brett",
      photoUrl: null,
    });
  });

  it("clears the photo when the field is omitted", async () => {
    const res = await PATCH(patchRequest({ name: "Brett" }));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      profileId: "p1",
      name: "Brett",
      photoUrl: null,
    });
  });

  it("accepts boundary values: 24-char name and max-size photo", async () => {
    const maxPhoto = "data:image/jpeg;base64," + "a".repeat(100_000 - "data:image/jpeg;base64,".length);
    const res = await PATCH(patchRequest({ name: "x".repeat(24), photo: maxPhoto }));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith({
      profileId: "p1",
      name: "x".repeat(24),
      photoUrl: maxPhoto,
    });
  });

  it("rejects when only one credential header is present", async () => {
    const res = await PATCH(patchRequest({ name: "Brett" }, { "x-profile-secret": "" }));
    expect(res.status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
