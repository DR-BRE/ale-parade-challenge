import Anthropic from "@anthropic-ai/sdk";
import { getAuthedUser } from "@/lib/server/auth";
import { allow } from "@/lib/server/rateLimit";

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
   crosses the letter G. Be generous — this is a celebratory pub game, and any
   real attempt at a split deserves a good score:
   - 100: the line passes dead through the horizontal middle of the G.
   - 90-99: the line is anywhere within the G, OR touching its top or bottom
     edge. A clean, close split lives here — treat this as the reward band.
   - 78-89: the line is within about half a letter-height above or below the G.
   - 60-77: the line is within about one letter-height of the G.
   - 35-59: the line is within about two letter-heights of the G.
   - 10-34: a recognizable attempt but well off.
   - 0: not a Guinness glass, or the glass is untouched/empty/no attempt made.
   Judge only the vertical position of the line relative to the G. Photos are
   usually taken at a slight downward angle, which makes the line look higher
   than it really is — give the benefit of the doubt and use the lettering
   itself as your reference. When in doubt between two bands, pick the higher.
3. The verdict is one short, witty sentence a pub referee would say —
   celebratory for great scores, gently ribbing for low ones.

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
  const user = await getAuthedUser(req);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  const profileId = user.id;

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
