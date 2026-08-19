import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

vi.mock("@/lib/server/auth", () => ({ getAuthedUser: vi.fn() }));

vi.mock("@/lib/server/rateLimit", () => ({
  allow: vi.fn(),
}));

vi.mock("@/lib/server/store", () => ({ insertScore: vi.fn() }));

import { getAuthedUser } from "@/lib/server/auth";
import { insertScore } from "@/lib/server/store";
import { allow } from "@/lib/server/rateLimit";
import { POST } from "./route";

const mockAuth = vi.mocked(getAuthedUser);
const mockAllow = vi.mocked(allow);
const mockInsertScore = vi.mocked(insertScore);

const IMAGE = "data:image/jpeg;base64," + "abcd".repeat(50);

function judgement(fields: Record<string, unknown>) {
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify(fields) }],
  };
}

function request(body: unknown, auth = true): Request {
  return new Request("http://test/api/rate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: "Bearer good" } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/rate", () => {
  beforeEach(() => {
    mockAuth.mockReset().mockResolvedValue({ id: "p1", fullName: "P", avatarUrl: null });
    mockAllow.mockReset().mockReturnValue(true);
    mockInsertScore.mockReset().mockResolvedValue(undefined);
    mockCreate
      .mockReset()
      .mockResolvedValue(
        judgement({ is_glass: true, score: 97, verdict: "A pour for the ages." })
      );
  });

  it("rejects an unauthenticated request", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await POST(request({ image: IMAGE }, false))).status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const bad = new Request("http://test/api/rate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer good",
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

  it("records the score toward the average on a real glass", async () => {
    await POST(request({ image: IMAGE }));
    expect(mockInsertScore).toHaveBeenCalledWith("p1", 97);
  });

  it("does not record a score when there is no glass", async () => {
    mockCreate.mockResolvedValue(
      judgement({ is_glass: false, score: 0, verdict: "That's a cat." })
    );
    await POST(request({ image: IMAGE }));
    expect(mockInsertScore).not.toHaveBeenCalled();
  });

  it("still returns the judgement when recording the score fails", async () => {
    mockInsertScore.mockRejectedValue(new Error("db down"));
    const res = await POST(request({ image: IMAGE }));
    expect(res.status).toBe(200);
    expect((await res.json()).score).toBe(97);
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
