// OSSFactory-Scaler — OpenRouter multi-model routing (4-tier cascade)
// Phase 1.4: failure context injection in cascade
// Phase 3.3: raceChat() — parallel fast+standard, take first valid

import type { ModelTier, ModelConfig, ChatMessage, ChatResponse } from "./types";
import { OPENROUTER_API_KEY, OPENROUTER_APP_TITLE } from "./config";
import { trackUsage } from "./token-tracker";
import type { AgentRole } from "./types";

const MODELS: Record<ModelTier, ModelConfig> = {
  micro: {
    id: "google/gemini-2.5-flash-lite",
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.30,
    maxContext: 1_000_000,
  },
  fast: {
    id: "google/gemini-2.5-flash",
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.60,
    maxContext: 1_000_000,
  },
  standard: {
    id: "moonshotai/kimi-k2.5",
    inputCostPer1M: 0.45,
    outputCostPer1M: 2.20,
    maxContext: 262_000,
  },
  engineering: {
    id: "deepseek/deepseek-r1",
    inputCostPer1M: 0.55,
    outputCostPer1M: 2.19,
    maxContext: 128_000,
  },
};

export function getModel(tier: ModelTier): ModelConfig {
  return MODELS[tier];
}

export async function chat(
  messages: ChatMessage[],
  tier: ModelTier,
  agent: AgentRole,
  task: string,
  maxTokens = 4096,
): Promise<ChatResponse> {
  const model = MODELS[tier];
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "X-Title": OPENROUTER_APP_TITLE,
      "HTTP-Referer": "https://github.com/AdametherzLab/OSSFactory-Scaler",
    },
    body: JSON.stringify({
      model: model.id,
      messages,
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`OpenRouter ${resp.status}: ${body}`);
  }

  const data = await resp.json();
  const choice = data.choices?.[0];
  if (!choice) throw new Error("No choices in OpenRouter response");

  const usage = data.usage ?? {};
  const inputTokens = usage.prompt_tokens ?? 0;
  const outputTokens = usage.completion_tokens ?? 0;
  const costUsd =
    (inputTokens / 1_000_000) * model.inputCostPer1M +
    (outputTokens / 1_000_000) * model.outputCostPer1M;

  trackUsage({
    timestamp: new Date().toISOString(),
    model: model.id,
    tier,
    agent,
    inputTokens,
    outputTokens,
    costUsd,
    task,
  });

  return {
    content: choice.message?.content ?? "",
    model: data.model ?? model.id,
    inputTokens,
    outputTokens,
    costUsd,
  };
}

const CASCADE_ORDER: ModelTier[] = ["fast", "standard", "engineering"];

export async function cascadeChat(
  messages: ChatMessage[],
  agent: AgentRole,
  task: string,
  validate: (content: string) => boolean,
  maxTokens = 4096,
): Promise<ChatResponse | null> {
  let lastFailureReason = "";

  for (const tier of CASCADE_ORDER) {
    try {
      // Inject failure context from previous tier
      const augmentedMessages = lastFailureReason
        ? [
            ...messages.slice(0, -1),
            {
              ...messages[messages.length - 1],
              content: messages[messages.length - 1].content +
                `\n\nPrevious model attempt failed validation: ${lastFailureReason}. Fix the output format.`,
            },
          ]
        : messages;

      const resp = await chat(augmentedMessages, tier, agent, `${task} [${tier}]`, maxTokens);
      if (validate(resp.content)) return resp;

      lastFailureReason = `Output from ${tier} did not pass validation (returned content was not valid JSON array or missing required fields)`;
    } catch (err) {
      lastFailureReason = `${tier} error: ${(err as Error).message}`;
      console.error(`[model-router] ${tier} failed for ${task}:`, (err as Error).message);
    }
  }
  return null;
}

// Phase 3.3: Race fast + standard in parallel, take first valid result
export async function raceChat(
  messages: ChatMessage[],
  agent: AgentRole,
  task: string,
  validate: (content: string) => boolean,
  maxTokens = 4096,
): Promise<ChatResponse | null> {
  const raceTiers: ModelTier[] = ["fast", "standard"];

  const results = await Promise.allSettled(
    raceTiers.map(tier => chat(messages, tier, agent, `${task} [race-${tier}]`, maxTokens))
  );

  // Take first valid result (prefer faster/cheaper)
  for (const result of results) {
    if (result.status === "fulfilled" && validate(result.value.content)) {
      return result.value;
    }
  }

  // Both failed or invalid — fall back to engineering tier
  try {
    const resp = await chat(messages, "engineering", agent, `${task} [race-fallback]`, maxTokens);
    if (validate(resp.content)) return resp;
  } catch (err) {
    console.error(`[model-router] raceChat engineering fallback failed:`, (err as Error).message);
  }

  return null;
}
