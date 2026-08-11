import Anthropic from "@anthropic-ai/sdk";
import { allow } from "@/lib/server/rateLimit";
import { hashSecret, safeEqualHex } from "@/lib/server/secrets";
import { getSecretHash } from "@/lib/server/store";

const JPEG_PREFIX = "data:image/jpeg;base64,";
// ~4 MB of base64 — a readScanPhoto image is a few hundred KB, so anything
// bigger is not from our client.
const MAX_IMAGE_CHARS = 5_500_000;

// Each scan costs real money, so keep the tap slow.
const SCANS_PER_MINUTE = 6;

const JUDGE_PROMPT = `You are the referee for "Split the G", a Guinness drinking game.
The player takes their first sip of a pint in a branded Guinness glass, aiming
to land the beer line exactly in the middle of the letter G in the word
GUINNESS printed on the glass.

Look at the photo and judge the attempt:

1. If the photo does not clearly show a Guinness-branded glass with the
   GUINNESS wordmark, set is_glass to false, score to 0, and make the verdict
   a dry one-liner about what you actually see.
2. Otherwise set is_glass to true and score the attempt from 0 to 100 based on
   where the boundary between the dark stout and the pale foam/empty glass
   crosses the letter G:
   - 100: the line passes dead through the horizontal middle of the G.
   - 90-99: within the G but slightly off center.
   - 70-89: touching the very top or bottom edge of the G.
   - 40-69: within one letter-height above or below the G.
   - 1-39: further away; scale down with distance.
   - 0: nowhere close, or the glass is untouched/empty.
   Judge only the vertical position of the line relative to the G. The glass
   may be photographed at an angle; use the lettering itself as the reference.
3. The verdict is one short, witty sentence a pub referee would say —
   celebratory for great scores, gently brutal for bad ones.

Answer with is_glass, score, and verdict.`;

const JUDGEMENT_SCHEMA = {
  type: "object",
  properties: {
    is_glass: { type: "boolean" },
    score: { type: "integer" },
    verdict: { type: "string" },
  },
  required: ["is_glass", "score", "verdict"],
  additionalProperties: false,
} as const;

const JUDGE_DOWN = { error: "The judge is off duty — try again in a minute" };

export async function POST(req: Request): Promise<Response> {
  const profileId = req.headers.get("x-profile-id");
  const secret = req.headers.get("x-profile-secret");
  if (!profileId || !secret) {
    return Response.json({ error: "Missing credentials" }, { status: 401 });
  }

  let body: { image?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const image = body.image;
  if (typeof image !== "string" || !image.startsWith(JPEG_PREFIX)) {
    return Response.json({ error: "image must be a JPEG data URL" }, { status: 400 });
  }
  if (image.length > MAX_IMAGE_CHARS) {
    return Response.json({ error: "Photo too large" }, { status: 413 });
  }

  const storedHash = await getSecretHash(profileId);
  if (!storedHash || !safeEqualHex(storedHash, hashSecret(secret))) {
    return Response.json({ error: "Not your pint" }, { status: 401 });
  }

  if (!allow(`rate:${profileId}`, SCANS_PER_MINUTE, 60_000)) {
    return Response.json({ error: "Easy there — give the judge a minute" }, { status: 429 });
  }

  let message: Anthropic.Message;
  try {
    // Constructed inside the try: throws when ANTHROPIC_API_KEY is missing.
    const client = new Anthropic();
    message = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      output_config: {
        format: { type: "json_schema", schema: JUDGEMENT_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: image.slice(JPEG_PREFIX.length),
              },
            },
            { type: "text", text: JUDGE_PROMPT },
          ],
        },
      ],
    });
  } catch {
    return Response.json(JUDGE_DOWN, { status: 502 });
  }

  if (message.stop_reason === "refusal") {
    return Response.json(JUDGE_DOWN, { status: 502 });
  }

  const text = message.content.find((b) => b.type === "text")?.text;
  let judgement: { is_glass?: unknown; score?: unknown; verdict?: unknown };
  try {
    judgement = JSON.parse(text ?? "");
  } catch {
    return Response.json(JUDGE_DOWN, { status: 502 });
  }

  const score = Math.min(100, Math.max(0, Math.round(Number(judgement.score) || 0)));
  return Response.json({
    isGlass: judgement.is_glass === true,
    score,
    verdict: typeof judgement.verdict === "string" ? judgement.verdict : "",
  });
}
