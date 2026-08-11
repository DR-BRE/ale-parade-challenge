import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetUser } = vi.hoisted(() => ({ mockGetUser: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
}));

import { getAuthedUser } from "./auth";

function req(headers: Record<string, string> = {}): Request {
  return new Request("http://test/x", { method: "POST", headers });
}

describe("getAuthedUser", () => {
  beforeEach(() => {
    mockGetUser.mockReset();
  });

  it("returns null when the Authorization header is missing", async () => {
    expect(await getAuthedUser(req())).toBeNull();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("returns null when the token is invalid", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: "bad jwt" } });
    expect(await getAuthedUser(req({ Authorization: "Bearer nope" }))).toBeNull();
  });

  it("returns id and Google metadata for a valid token", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "uid-1", user_metadata: { full_name: "Ada L", avatar_url: "https://g/av.png" } } },
      error: null,
    });
    expect(await getAuthedUser(req({ Authorization: "Bearer good" }))).toEqual({
      id: "uid-1",
      fullName: "Ada L",
      avatarUrl: "https://g/av.png",
    });
    expect(mockGetUser).toHaveBeenCalledWith("good");
  });

  it("falls back to name/picture metadata keys and nulls when absent", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "uid-2", user_metadata: {} } },
      error: null,
    });
    expect(await getAuthedUser(req({ Authorization: "Bearer good" }))).toEqual({
      id: "uid-2",
      fullName: null,
      avatarUrl: null,
    });
  });
});
