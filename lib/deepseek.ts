import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { z } from "zod";
import { REVIEW_SYSTEM_PROMPT, buildReviewUserPrompt } from "@/lib/review/prompt";
import type { ModelReviewPayload } from "@/lib/review/evidence";
import type { EmailDraft, Order } from "@/lib/types";

export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";

export class DeepSeekError extends Error {
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

export interface DeepSeekUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

function redact(message: string, apiKey: string): string {
  if (!apiKey) return message;
  return message.split(apiKey).join("[redacted]");
}

function providerFor(apiKey: string, baseURL: string | undefined) {
  return createOpenAI({
    apiKey,
    baseURL: baseURL?.trim() || DEFAULT_DEEPSEEK_BASE_URL,
    name: "deepseek",
  });
}

function modelIdFrom(explicit: string | undefined, envValue: string | undefined): string {
  return explicit?.trim() || envValue?.trim() || DEFAULT_DEEPSEEK_MODEL;
}

function readUsage(usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined): DeepSeekUsage | undefined {
  if (!usage) return undefined;
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  };
}

function parseJsonObject(text: string, code: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new DeepSeekError(code, "DeepSeek 响应里没有 JSON 对象。没有改用规则引擎。");
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new DeepSeekError(code, "DeepSeek 返回的 JSON 无法解析。没有改用规则引擎。");
  }
}

export interface DeepSeekReviewRequest {
  order: Order;
  apiKey: string;
  baseURL?: string;
  model?: string;
}

export interface DeepSeekReviewResult {
  payload: ModelReviewPayload;
  usage?: DeepSeekUsage;
  model: string;
}

/**
 * OpenAI-compatible chat completions against DeepSeek.
 * Callers must label the result `deepseek`, never bedrock or ai_gateway.
 */
export async function reviewWithDeepseek(input: DeepSeekReviewRequest): Promise<DeepSeekReviewResult> {
  if (!input.apiKey) {
    throw new DeepSeekError("deepseek_not_configured", "缺少 DEEPSEEK_API_KEY，没有调用 DeepSeek，也没有用其他引擎冒充。");
  }
  const model = modelIdFrom(input.model, process.env.DEEPSEEK_MODEL);
  const client = providerFor(input.apiKey, input.baseURL ?? process.env.DEEPSEEK_BASE_URL);

  let text: string;
  let usage: DeepSeekUsage | undefined;
  try {
    const result = await generateText({
      model: client.chat(model),
      system: REVIEW_SYSTEM_PROMPT,
      prompt: `${buildReviewUserPrompt(input.order)}

Respond with a single JSON object matching this shape (no markdown fences):
{"issues":[...],"facts":[...]}
Schema reminder: each evidence.quote must be an exact substring of the cited message body.`,
      temperature: 0,
    });
    text = result.text;
    usage = readUsage(result.usage);
  } catch (error) {
    const message = error instanceof Error ? error.message : "DeepSeek 调用失败。";
    throw new DeepSeekError("deepseek_call_failed", redact(message, input.apiKey));
  }

  const parsed = parseJsonObject(text, "deepseek_invalid_output");
  const checked = reviewSchema.safeParse(parsed);
  if (!checked.success) {
    throw new DeepSeekError("deepseek_invalid_output", `DeepSeek JSON 不符合 schema：${checked.error.message}`);
  }
  return { payload: checked.data, usage, model };
}

export interface DeepSeekDraftRequest {
  order: Order;
  issueIds: string[];
  apiKey: string;
  baseURL?: string;
  model?: string;
  prompt: string;
}

export async function draftWithDeepseek(input: DeepSeekDraftRequest): Promise<EmailDraft> {
  if (!input.apiKey) {
    throw new DeepSeekError("deepseek_not_configured", "缺少 DEEPSEEK_API_KEY，没有调用 DeepSeek，也没有用确定性模板冒充。");
  }
  const model = modelIdFrom(input.model, process.env.DEEPSEEK_MODEL);
  const client = providerFor(input.apiKey, input.baseURL ?? process.env.DEEPSEEK_BASE_URL);
  let text: string;
  try {
    const result = await generateText({
      model: client.chat(model),
      system:
        'You draft concise English B2B confirmation emails. Never invent commercial commitments. Respond with a single JSON object: {"subject":"...","body":"..."} and no markdown fences.',
      prompt: input.prompt,
      temperature: 0.2,
    });
    text = result.text;
  } catch (error) {
    const message = error instanceof Error ? error.message : "DeepSeek 草稿调用失败。";
    throw new DeepSeekError("deepseek_call_failed", redact(message, input.apiKey));
  }

  const parsed = parseJsonObject(text, "deepseek_invalid_output");
  if (!parsed || typeof parsed !== "object") {
    throw new DeepSeekError("deepseek_invalid_output", "DeepSeek 草稿不是 JSON 对象。");
  }
  const data = parsed as { subject?: unknown; body?: unknown };
  if (typeof data.subject !== "string" || !data.subject.trim() || typeof data.body !== "string" || !data.body.trim()) {
    throw new DeepSeekError("deepseek_invalid_output", "DeepSeek 草稿缺少 subject 或 body。没有改用确定性模板。");
  }
  return {
    from: input.order.seller.email,
    to: input.order.buyer.email,
    subject: data.subject.trim(),
    body: data.body.trim(),
    issue_ids: input.issueIds,
  };
}
