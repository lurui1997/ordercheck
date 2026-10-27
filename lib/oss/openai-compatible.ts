import { z } from "zod";
import { REVIEW_SYSTEM_PROMPT, buildReviewUserPrompt } from "@/lib/review/prompt";
import type { ModelReviewPayload } from "@/lib/review/evidence";
import type { Order } from "@/lib/types";

export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";
export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434/v1";

export type ChatEngine = "deepseek" | "ollama";

export class ChatProviderError extends Error {
  code: string;
  engine: ChatEngine;

  constructor(engine: ChatEngine, code: string, message: string) {
    super(message);
    this.engine = engine;
    this.code = code;
  }
}

type EnvLike = Record<string, string | undefined>;

export interface ChatSettings {
  engine: ChatEngine;
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface ChatUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
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

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function resolveChatSettings(env: EnvLike, engine: ChatEngine): ChatSettings | null {
  if (engine === "deepseek") {
    const apiKey = env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) return null;
    return {
      engine,
      baseUrl: trimSlash(env.DEEPSEEK_BASE_URL?.trim() || DEFAULT_DEEPSEEK_BASE_URL),
      model: env.DEEPSEEK_MODEL?.trim() || DEFAULT_DEEPSEEK_MODEL,
      apiKey,
    };
  }

  const model = env.OLLAMA_MODEL?.trim();
  if (!model) return null;
  return {
    engine,
    baseUrl: trimSlash(env.OLLAMA_BASE_URL?.trim() || DEFAULT_OLLAMA_BASE_URL),
    model,
    apiKey: env.OLLAMA_API_KEY?.trim() || undefined,
  };
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export async function chatCompletion(input: {
  settings: ChatSettings;
  messages: Array<{ role: "system" | "user"; content: string }>;
  temperature?: number;
  fetchImpl?: typeof fetch;
}): Promise<{ text: string; usage?: ChatUsage; requestId?: string }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (input.settings.apiKey) headers.Authorization = `Bearer ${input.settings.apiKey}`;

  let response: Response;
  try {
    response = await fetchImpl(`${input.settings.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: input.settings.model,
        temperature: input.temperature ?? 0,
        messages: input.messages,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "网络请求失败。";
    throw new ChatProviderError(
      input.settings.engine,
      `${input.settings.engine}_call_failed`,
      `${input.settings.engine} 请求失败：${message}`,
    );
  }

  const requestId = response.headers.get("x-request-id") ?? response.headers.get("x-requestid") ?? undefined;

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const detail = body.trim().slice(0, 300);
    throw new ChatProviderError(
      input.settings.engine,
      `${input.settings.engine}_call_failed`,
      `${input.settings.engine} HTTP ${response.status}${detail ? `：${detail}` : ""}`,
    );
  }

  let payload: ChatCompletionResponse;
  try {
    payload = (await response.json()) as ChatCompletionResponse;
  } catch {
    throw new ChatProviderError(
      input.settings.engine,
      `${input.settings.engine}_invalid_output`,
      `${input.settings.engine} 响应不是 JSON。`,
    );
  }

  const text = payload.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) {
    throw new ChatProviderError(
      input.settings.engine,
      `${input.settings.engine}_invalid_output`,
      `${input.settings.engine} 响应没有文本内容。`,
    );
  }

  const usage = payload.usage
    ? {
        inputTokens: payload.usage.prompt_tokens,
        outputTokens: payload.usage.completion_tokens,
        totalTokens: payload.usage.total_tokens,
      }
    : undefined;

  return { text, usage, requestId };
}

export function parseReviewPayload(engine: ChatEngine, text: string): ModelReviewPayload {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new ChatProviderError(engine, `${engine}_invalid_output`, `${engine} 响应里没有 JSON 对象。`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new ChatProviderError(engine, `${engine}_invalid_output`, `${engine} 返回的 JSON 无法解析。`);
  }

  const checked = reviewSchema.safeParse(parsed);
  if (!checked.success) {
    throw new ChatProviderError(
      engine,
      `${engine}_invalid_output`,
      `${engine} JSON 不符合 schema：${checked.error.message}`,
    );
  }
  return checked.data;
}

export interface OpenAIReviewResult {
  payload: ModelReviewPayload;
  usage?: ChatUsage;
  requestId?: string;
  model: string;
}

export async function reviewWithOpenAICompatible(input: {
  engine: ChatEngine;
  order: Order;
  env?: EnvLike;
  fetchImpl?: typeof fetch;
}): Promise<OpenAIReviewResult> {
  const env = input.env ?? process.env;
  const settings = resolveChatSettings(env, input.engine);
  if (!settings) {
    const hint =
      input.engine === "deepseek"
        ? "缺少 DEEPSEEK_API_KEY，没有调用 DeepSeek。"
        : "缺少 OLLAMA_MODEL，没有调用 Ollama。";
    throw new ChatProviderError(input.engine, `${input.engine}_not_configured`, hint);
  }

  const completion = await chatCompletion({
    settings,
    temperature: 0,
    fetchImpl: input.fetchImpl,
    messages: [
      { role: "system", content: REVIEW_SYSTEM_PROMPT },
      {
        role: "user",
        content: `${buildReviewUserPrompt(input.order)}

Respond with a single JSON object matching this shape (no markdown fences):
{"issues":[...],"facts":[...]}
Schema reminder: each evidence.quote must be an exact substring of the cited message body.`,
      },
    ],
  });

  return {
    payload: parseReviewPayload(input.engine, completion.text),
    usage: completion.usage,
    requestId: completion.requestId,
    model: settings.model,
  };
}

export async function draftWithOpenAICompatible(input: {
  engine: ChatEngine;
  order: Order;
  prompt: string;
  env?: EnvLike;
  fetchImpl?: typeof fetch;
}): Promise<{ subject: string; body: string }> {
  const env = input.env ?? process.env;
  const settings = resolveChatSettings(env, input.engine);
  if (!settings) {
    throw new ChatProviderError(
      input.engine,
      `${input.engine}_not_configured`,
      input.engine === "deepseek" ? "缺少 DEEPSEEK_API_KEY。" : "缺少 OLLAMA_MODEL。",
    );
  }

  const completion = await chatCompletion({
    settings,
    temperature: 0.2,
    fetchImpl: input.fetchImpl,
    messages: [
      {
        role: "system",
        content:
          'You draft concise English B2B confirmation emails. Never invent commercial commitments. Respond with a single JSON object: {"subject":"...","body":"..."} and no markdown fences.',
      },
      { role: "user", content: input.prompt },
    ],
  });

  const text = completion.text;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new ChatProviderError(input.engine, `${input.engine}_invalid_output`, `${input.engine} 草稿响应里没有 JSON。`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new ChatProviderError(input.engine, `${input.engine}_invalid_output`, `${input.engine} 草稿 JSON 无法解析。`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new ChatProviderError(input.engine, `${input.engine}_invalid_output`, `${input.engine} 草稿不是对象。`);
  }
  const data = parsed as { subject?: unknown; body?: unknown };
  if (typeof data.subject !== "string" || !data.subject.trim() || typeof data.body !== "string" || !data.body.trim()) {
    throw new ChatProviderError(input.engine, `${input.engine}_invalid_output`, `${input.engine} 草稿缺少 subject 或 body。`);
  }
  return { subject: data.subject.trim(), body: data.body.trim() };
}
