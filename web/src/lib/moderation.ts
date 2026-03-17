import Together from "together-ai";
import { getRedis } from "@/lib/redis";

const METRICS_TTL = 48 * 60 * 60;

function getTogether() {
  return new Together({ apiKey: process.env.TOGETHER_API_KEY });
}

function hourKey() {
  const d = new Date();
  return `metrics:moderation:${d.toISOString().slice(0, 13)}`;
}

export async function moderate(text: string): Promise<{ safe: boolean; category?: string }> {
  if (process.env.MODERATE_SKIP === "1") return { safe: true };

  const preview = text.slice(0, 80).replace(/\n/g, " ");
  const t0 = Date.now();

  try {
    const response = await getTogether().chat.completions.create({
      messages: [{ role: "user", content: text }],
      model: "meta-llama/Llama-Guard-4-12B",
    });

    const output = response.choices?.[0]?.message?.content?.trim() ?? "safe";
    const ms = Date.now() - t0;

    const redis = getRedis();
    const key = hourKey();
    const pipeline = redis.pipeline();
    pipeline.hincrby(key, "total", 1);
    pipeline.hincrby(key, output === "safe" ? "safe" : "blocked", 1);
    pipeline.hincrby(key, "latency_sum", ms);
    pipeline.expire(key, METRICS_TTL);
    pipeline.exec();

    if (output === "safe") {
      console.log(`[moderation] safe (${ms}ms) "${preview}"`);
      return { safe: true };
    }

    const lines = output.split("\n");
    const category = lines.length > 1 ? lines[1].trim() : undefined;
    console.log(`[moderation] BLOCKED category=${category} (${ms}ms) "${preview}"`);
    return { safe: false, category };
  } catch (e: unknown) {
    const ms = Date.now() - t0;
    const redis = getRedis();
    const key = hourKey();
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
