import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashSecret } from "@/lib/server/secrets";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

vi.mock("@/lib/server/store", () => ({
  getSecretHash: vi.fn(),
}));

vi.mock("@/lib/server/rateLimit", () => ({
  allow: vi.fn(),
}));

import { allow } from "@/lib/server/rateLimit";
import { getSecretHash } from "@/lib/server/store";
import { POST } from "./route";

const mockHash = vi.mocked(getSecretHash);
const mockAllow = vi.mocked(allow);

const SECRET = "a".repeat(64);
const IMAGE = "data:image/jpeg;base64," + "abcd".repeat(50);

function judgement(fields: Record<string, unknown>) {
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify(fields) }],
  };
}

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://test/api/rate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-profile-id": "p1",
      "x-profile-secret": SECRET,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/rate", () => {
  beforeEach(() => {
    mockHash.mockReset().mockResolvedValue(hashSecret(SECRET));
    mockAllow.mockReset().mockReturnValue(true);
    mockCreate
      .mockReset()
      .mockResolvedValue(
        judgement({ is_glass: true, score: 97, verdict: "A pour for the ages." })
      );
  });

  it("rejects missing credentials", async () => {
    const bare = new Request("http://test/api/rate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: IMAGE }),
    });
    expect((await POST(bare)).status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    const res = await POST(request({ image: IMAGE }, { "x-profile-secret": "b".repeat(64) }));
    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const bad = new Request("http://test/api/rate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-profile-id": "p1",
        "x-profile-secret": SECRET,
      },
      body: "{not json",
    });
    expect((await POST(bad)).status).toBe(400);
  });

  it("rejects a missing or non-JPEG image", async () => {
    expect((await POST(request({}))).status).toBe(400);
    expect((await POST(request({ image: 42 }))).status).toBe(400);
    expect((await POST(request({ image: "data:image/png;base64,abcd" }))).status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects an oversized image", async () => {
    const huge = "data:image/jpeg;base64," + "a".repeat(6_000_000);
    expect((await POST(request({ image: huge }))).status).toBe(413);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rate limits per profile", async () => {
    mockAllow.mockReturnValue(false);
    expect((await POST(request({ image: IMAGE }))).status).toBe(429);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns the judged score and verdict", async () => {
    const res = await POST(request({ image: IMAGE }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ isGlass: true, score: 97, verdict: "A pour for the ages." });
    const call = mockCreate.mock.calls[0][0];
    expect(call.model).toBe("claude-opus-4-8");
    expect(call.messages[0].content[0].source.data).not.toContain("data:image");
  });

  it("clamps out-of-range scores", async () => {
    mockCreate.mockResolvedValue(judgement({ is_glass: true, score: 150, verdict: "x" }));
    expect((await (await POST(request({ image: IMAGE }))).json()).score).toBe(100);
    mockCreate.mockResolvedValue(judgement({ is_glass: true, score: -5, verdict: "x" }));
    expect((await (await POST(request({ image: IMAGE }))).json()).score).toBe(0);
  });

  it("passes through a not-a-glass judgement", async () => {
    mockCreate.mockResolvedValue(
      judgement({ is_glass: false, score: 0, verdict: "That's a cat." })
    );
    const body = await (await POST(request({ image: IMAGE }))).json();
    expect(body.isGlass).toBe(false);
  });

  it("maps a refusal to a friendly 502", async () => {
    mockCreate.mockResolvedValue({ stop_reason: "refusal", content: [] });
    expect((await POST(request({ image: IMAGE }))).status).toBe(502);
  });

  it("maps an API failure to a friendly 502", async () => {
    mockCreate.mockRejectedValue(new Error("overloaded"));
    expect((await POST(request({ image: IMAGE }))).status).toBe(502);
  });

  it("maps unparsable judge output to a 502", async () => {
    mockCreate.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "not json" }],
    });
    expect((await POST(request({ image: IMAGE }))).status).toBe(502);
  });
});
