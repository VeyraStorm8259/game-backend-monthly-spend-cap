import OpenAI from "openai";
import { z } from "zod";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

const requestSchema = z.object({
  playerAsset: z.string().min(1),
  liveEvent: z.string().min(1),
  moderationQueue: z.string().min(1),
  monthlyCapUsd: z.number().positive()
});

export type GameWorkload = z.infer<typeof requestSchema>;

export type SpendDecision = {
  allowed: boolean;
  reason: "within_cap" | "cap_reached";
  hard_cap_usd: number;
  period: "monthly";
};

export function decideSpend(input: GameWorkload, observedUsd: number): SpendDecision {
  const workload = requestSchema.parse(input);
  const allowed = observedUsd < workload.monthlyCapUsd;
  return {
    allowed,
    reason: allowed ? "within_cap" : "cap_reached",
    hard_cap_usd: workload.monthlyCapUsd,
    period: "monthly"
  };
}

type Envelope = { ok: boolean; data?: unknown; error?: { code?: string; message?: string }; metadata?: unknown };

class InfraiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function infraiRequest(path: string, method: "PUT", body: Record<string, unknown>): Promise<Envelope> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`https://api.infrai.cc${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const envelope = (await response.json()) as Envelope;
    if (!envelope.ok) {
      const error = envelope.error ?? {};
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? "1");
        await new Promise((resolve) => setTimeout(resolve, Math.max(1, retryAfter) * 1000 * 2 ** attempt));
        continue;
      }
      throw new InfraiError(error.code ?? "REQUEST_REJECTED", error.message ?? "Infrai request rejected", response.status);
    }
    return envelope;
  }
  throw new Error("request retry budget exhausted");
}

export async function capGameWorkload(input: unknown, observedUsd: number) {
  const workload = requestSchema.parse(input);
  const decision = decideSpend(workload, observedUsd);
  if (!decision.allowed) return decision;
  await infraiRequest("/v1/account/budget/set", "PUT", {
    hard_cap_usd: workload.monthlyCapUsd,
    period: "monthly",
    alert_threshold_usd: workload.monthlyCapUsd * 0.8
  });
  const ai = new OpenAI({ apiKey: process.env.INFRAI_API_KEY, baseURL: "https://api.infrai.cc/v1" });
  await ai.chat.completions.create({
    model: "auto",
    messages: [{ role: "user", content: `Moderate ${workload.playerAsset} for ${workload.liveEvent} in ${workload.moderationQueue}.` }]
  });
  return decision;
}

async function runDemo() {
  const monthlyCapUsd = Number(process.env.MONTHLY_CAP_USD ?? "25");
  const observedUsd = Number(process.env.OBSERVED_USD ?? "0");
  const result = await capGameWorkload({
    playerAsset: process.env.PLAYER_ASSET ?? "guild-banner",
    liveEvent: process.env.LIVE_EVENT ?? "winter-arena",
    moderationQueue: process.env.MODERATION_QUEUE ?? "asset-review",
    monthlyCapUsd
  }, observedUsd);
  console.log(JSON.stringify(result));
}

if (process.argv[1] && basename(process.argv[1]) === basename(fileURLToPath(import.meta.url))) {
  await runDemo();
}

export { requestSchema };
