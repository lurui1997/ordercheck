import { createGateway } from "@ai-sdk/gateway";
import { generateText } from "ai";
import { z } from "zod";
import { REVIEW_SYSTEM_PROMPT, buildReviewUserPrompt } from "@/lib/review/prompt";
import type { ModelReviewPayload } from "@/lib/review/evidence";
import type { Order } from "@/lib/types";

export class GatewayError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const evidenceSchema = z.object({
  message_id: z.string(),
  quote: z.string(),
});

const reviewSchema = z.object({
  issues: z.array(
    z.object({
      issue_id: z.string(),
      kind: z.enum(["missing", "ambiguous", "conflict"]),
      priority: z.enum(["high", "low"]),
      title: z.string(),
      evidence: z.array(evidenceSchema),
      impact: z.string(),
      question: z.string(),
      status: z.enum([
        "unconfirmed",
        "question_sent",
        "proposed",
        "confirmed",
        "needs_human_review",
        "accepted_risk",
        "reopened",
        "not_applicable",
      ]),
      waiting_for: z.enum(["buyer", "seller", "both", "none"]),
      resolution_evidence: z.array(evidenceSchema),
      value: z.string().optional(),
    }),
  ),
  facts: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      value: z.string(),
      scope_note: z.string().optional(),
      status: z.enum(["confirmed", "stated_by_one_party", "proposed", "historical"]),
      evidence: z.array(evidenceSchema),
    }),
  ),
});

export interface GatewayReviewRequest {
  order: Order;
  apiKey: string;
  model?: string;
}

export interface GatewayReviewResult {
  payload: ModelReviewPayload;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

/**
 * Vercel AI Gateway backup path. Returns engine label "ai_gateway" at the caller —
 * never labeled as Bedrock.
 */
export async function reviewWithGateway(input: GatewayReviewRequest): Promise<GatewayReviewResult> {
  if (!input.apiKey) {
    throw new GatewayError("gateway_not_configured", "缺少 AI_GATEWAY_API_KEY，没有调用 AI Gateway。");
  }

  const modelId = input.model || process.env.AI_GATEWAY_MODEL || "amazon/nova-lite";
  const gateway = createGateway({ apiKey: input.apiKey });

  let text: string;
  let usage: GatewayReviewResult["usage"];
  try {
    const result = await generateText({
      model: gateway(modelId),
      system: REVIEW_SYSTEM_PROMPT,
      prompt: `${buildReviewUserPrompt(input.order)}

Respond with a single JSON object matching this shape (no markdown fences):
{"issues":[...],"facts":[...]}
Schema reminder: each evidence.quote must be an exact substring of the cited message body.`,
      temperature: 0,
    });
    text = result.text;
    if (result.usage) {
      usage = {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI Gateway 调用失败。";
    throw new GatewayError("gateway_call_failed", message);
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new GatewayError("gateway_invalid_output", "AI Gateway 响应里没有 JSON 对象。");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new GatewayError("gateway_invalid_output", "AI Gateway 返回的 JSON 无法解析。");
  }

  const checked = reviewSchema.safeParse(parsed);
  if (!checked.success) {
    throw new GatewayError("gateway_invalid_output", `AI Gateway JSON 不符合 schema：${checked.error.message}`);
  }

  return { payload: checked.data, usage };
}
