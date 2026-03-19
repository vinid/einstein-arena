import Together from "together-ai";
import { getRedis } from "@/lib/redis";

const METRICS_TTL = 8 * 24 * 60 * 60;
const MODERATION_TOKEN_PRICE_PER_MILLION = 0.2;

function getTogether() {
  return new Together({ apiKey: process.env.TOGETHER_API_KEY });
}

function dayKey() {
  return `metrics:moderation:${new Date().toISOString().slice(0, 10)}`;
}

export async function moderate(text: string): Promise<{ safe: boolean; category?: string }> {
  if (process.env.MODERATE_SKIP === "1" || process.env.TOGETHER_API_KEY === "skip") {
    return { safe: true };
  }

  const preview = text.slice(0, 80).replace(/\n/g, " ");
  const t0 = Date.now();

  try {
    const prompt = `Task: Check if there is unsafe content in 'User' messages in conversations according to our safety policy with the below categories.

Note: This is a scientific research platform. Messages may contain mathematical notation, LaTeX, optimization algorithms, pseudocode, and technical terms like "attack", "descent", "aggressive search", "local minima", "basin", "active set", "convex hull". This is normal scientific discourse and must not be flagged as unsafe.

<BEGIN UNSAFE CONTENT CATEGORIES>
S1: Violent Crimes.
AI models should not create content that enables, encourages, or excuses the commission of violent crimes.
S2: Non-Violent Crimes.
AI models should not create content that enables, encourages, or excuses the commission of non-violent crimes.
S3: Sex Crimes.
AI models should not create content that enables, encourages, or excuses the commission of sex crimes.
S4: Child Exploitation.
AI models should not create content that depicts child nudity or that enables, encourages, excuses, or depicts the sexual abuse of children.
S5: Defamation.
AI models should not create content about a real, living person that is verifiably false and likely to injure the person's reputation.
S6: Privacy.
AI models should not create content that contains sensitive, personal information about private individuals.
S7: Hate.
AI models should not create content that is hateful toward people on the basis of their protected characteristics.
S8: Self-Harm.
AI models should not create content that enables, encourages, or excuses acts of intentional self-harm.
S9: Sexual Content.
AI models should not create depictions of nude adults or content that contains erotic descriptions or explicit depictions of sex acts.
<END UNSAFE CONTENT CATEGORIES>

<BEGIN CONVERSATION>

User: ${text}

<END CONVERSATION>

Provide your safety assessment for ONLY THE LAST User message in the above conversation:
- First line must read 'safe' or 'unsafe'.
- If unsafe, a second line must include a comma-separated list of violated categories.`;

    const response = await getTogether().chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "meta-llama/Llama-Guard-4-12B",
    });

    const output = response.choices?.[0]?.message?.content?.trim() ?? "safe";
    const totalTokens = response.usage?.total_tokens ?? 0;
    const ms = Date.now() - t0;

    const redis = getRedis();
    const key = dayKey();
    const pipeline = redis.pipeline();
    pipeline.hincrby(key, "total", 1);
    pipeline.hincrby(key, "total_tokens", totalTokens);
    pipeline.hincrby(key, output === "safe" ? "safe" : "blocked", 1);
    pipeline.hincrby(key, "latency_sum", ms);
    pipeline.expire(key, METRICS_TTL);
    pipeline.exec();

    if (output === "safe") {
      const estimatedCost = (totalTokens / 1_000_000) * MODERATION_TOKEN_PRICE_PER_MILLION;
      console.log(`[moderation] safe (${ms}ms, ${totalTokens} tokens, $${estimatedCost.toFixed(6)}) "${preview}"`);
      return { safe: true };
    }

    const lines = output.split("\n");
    const category = lines.length > 1 ? lines[1].trim() : undefined;
    const estimatedCost = (totalTokens / 1_000_000) * MODERATION_TOKEN_PRICE_PER_MILLION;
    console.log(`[moderation] BLOCKED category=${category} (${ms}ms, ${totalTokens} tokens, $${estimatedCost.toFixed(6)}) "${preview}"`);
    return { safe: false, category };
  } catch (e: unknown) {
    const ms = Date.now() - t0;
    const redis = getRedis();
    const key = dayKey();
    const pipeline = redis.pipeline();
    pipeline.hincrby(key, "total", 1);
    pipeline.hincrby(key, "errors", 1);
    pipeline.expire(key, METRICS_TTL);
    pipeline.exec();
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[moderation] FAILED (${ms}ms) "${preview}": ${msg}`);
    throw e;
  }
}
