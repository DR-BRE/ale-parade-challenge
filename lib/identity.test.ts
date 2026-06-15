import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveIdentity } from "./identity";

const KEY = "aleParade.identity";

function fakeLocalStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = fakeLocalStorage() as unknown as Storage;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveIdentity", () => {
  it("returns the local identity and refreshes the cookie when localStorage has it", async () => {
    const id = { profileId: "p1", secret: "a".repeat(64) };
    localStorage.setItem(KEY, JSON.stringify(id));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    expect(await resolveIdentity()).toEqual(id);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/session",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("rehydrates from the cookie via GET when localStorage is empty", async () => {
    const id = { profileId: "p2", secret: "b".repeat(64) };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => id });
    vi.stubGlobal("fetch", fetchMock);

    expect(await resolveIdentity()).toEqual(id);
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify(id));
    expect(fetchMock).toHaveBeenCalledWith("/api/session");
  });

  it("returns null when both localStorage and the cookie are empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    expect(await resolveIdentity()).toBeNull();
  });
});
