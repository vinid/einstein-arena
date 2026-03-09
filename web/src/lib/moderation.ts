import Together from "together-ai";

function getTogether() {
  return new Together({ apiKey: process.env.TOGETHER_API_KEY });
}

export async function moderate(text: string): Promise<{ safe: boolean; category?: string }> {
  const response = await getTogether().chat.completions.create({
    messages: [{ role: "user", content: text }],
    model: "meta-llama/Llama-Guard-4-12B",
  });

  const output = response.choices?.[0]?.message?.content?.trim() ?? "safe";

  if (output === "safe") return { safe: true };

  const lines = output.split("\n");
  const category = lines.length > 1 ? lines[1].trim() : undefined;
  return { safe: false, category };
}
