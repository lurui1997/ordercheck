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

const ISSUE_KINDS = ["missing", "ambiguous", "conflict"] as const;
const ISSUE_PRIORITIES = ["high", "low"] as const;
const ISSUE_STATUSES = [
  "unconfirmed",
  "question_sent",
  "proposed",
  "confirmed",
  "needs_human_review",
  "accepted_risk",
  "reopened",
  "not_applicable",
] as const;
const WAITING_FOR = ["buyer", "seller", "both", "none"] as const;
const FACT_STATUSES = ["confirmed", "stated_by_one_party", "proposed", "historical"] as const;

type IssueKind = (typeof ISSUE_KINDS)[number];
type IssuePriority = (typeof ISSUE_PRIORITIES)[number];
type IssueStatus = (typeof ISSUE_STATUSES)[number];
type WaitingFor = (typeof WAITING_FOR)[number];
type FactStatus = (typeof FACT_STATUSES)[number];

/** Exact tokens the model must emit. Appended only on the DeepSeek path. */
export const DEEPSEEK_SCHEMA_RULES = `Output one JSON object and nothing else. Copy enum tokens exactly. Do not invent synonyms.

kind: "missing" | "ambiguous" | "conflict"
priority: "high" | "low"
status: "unconfirmed" | "question_sent" | "proposed" | "confirmed" | "needs_human_review" | "accepted_risk" | "reopened" | "not_applicable"
waiting_for: "buyer" | "seller" | "both" | "none"
resolution_evidence: a JSON array of {"message_id":"...","quote":"..."}. Use [] when there is none. Never null, never a string, never a bare object.
evidence: the same array shape. At least one quote that is an exact substring of that message body.
facts[].status: "confirmed" | "stated_by_one_party" | "proposed" | "historical"
facts[].evidence: an array. Use [] only if you have no quote; prefer omitting the fact.`;

const KIND_ALIASES: Record<string, IssueKind> = {
  missing: "missing",
  gap: "missing",
  absent: "missing",
  omission: "missing",
  unspecified: "missing",
  not_specified: "missing",
  unknown: "missing",
  incomplete: "missing",
  缺失: "missing",
  ambiguous: "ambiguous",
  ambiguity: "ambiguous",
  unclear: "ambiguous",
  vague: "ambiguous",
  歧义: "ambiguous",
  含糊: "ambiguous",
  conflict: "conflict",
  conflicting: "conflict",
  contradiction: "conflict",
  mismatch: "conflict",
  inconsistent: "conflict",
  disagreement: "conflict",
  difference: "conflict",
  冲突: "conflict",
  不一致: "conflict",
};

const PRIORITY_ALIASES: Record<string, IssuePriority> = {
  high: "high",
  critical: "high",
  important: "high",
  urgent: "high",
  高: "high",
  low: "low",
  medium: "low",
  minor: "low",
  normal: "low",
  低: "low",
};

const STATUS_ALIASES: Record<string, IssueStatus> = {
  unconfirmed: "unconfirmed",
  open: "unconfirmed",
  pending: "unconfirmed",
  unresolved: "unconfirmed",
  not_confirmed: "unconfirmed",
  未确认: "unconfirmed",
  question_sent: "question_sent",
  asked: "question_sent",
  awaiting_reply: "question_sent",
  已询问: "question_sent",
  proposed: "proposed",
  proposal: "proposed",
  offered: "proposed",
  suggested: "proposed",
  提议: "proposed",
  confirmed: "confirmed",
  agreed: "confirmed",
  aligned: "confirmed",
  accepted: "confirmed",
  resolved: "confirmed",
  closed: "confirmed",
  已确认: "confirmed",
  needs_human_review: "needs_human_review",
  human_review: "needs_human_review",
  needs_review: "needs_human_review",
  review: "needs_human_review",
  accepted_risk: "accepted_risk",
  risk_accepted: "accepted_risk",
  waived: "accepted_risk",
  reopened: "reopened",
  reopen: "reopened",
  re_opened: "reopened",
  not_applicable: "not_applicable",
  na: "not_applicable",
  n_a: "not_applicable",
  不适用: "not_applicable",
};

const WAITING_ALIASES: Record<string, WaitingFor> = {
  buyer: "buyer",
  the_buyer: "buyer",
  customer: "buyer",
  client: "buyer",
  买方: "buyer",
  seller: "seller",
  the_seller: "seller",
  vendor: "seller",
  supplier: "seller",
  卖方: "seller",
  both: "both",
  both_parties: "both",
  buyer_and_seller: "both",
  everyone: "both",
  either: "both",
  双方: "both",
  none: "none",
  nobody: "none",
  no_one: "none",
  noone: "none",
  na: "none",
  n_a: "none",
  无: "none",
};

const FACT_STATUS_ALIASES: Record<string, FactStatus> = {
  confirmed: "confirmed",
  agreed: "confirmed",
  已确认: "confirmed",
  stated_by_one_party: "stated_by_one_party",
  one_party: "stated_by_one_party",
  single_party: "stated_by_one_party",
  stated: "stated_by_one_party",
  单方: "stated_by_one_party",
  proposed: "proposed",
  proposal: "proposed",
  historical: "historical",
  superseded: "historical",
  old: "historical",
};

function token(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function lookup<T extends string>(value: unknown, table: Record<string, T>): T | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const key = token(value);
  return table[key] ?? table[String(value).trim()] ?? null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function coerceEvidenceList(value: unknown): Array<{ message_id: string; quote: string }> {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return [];
  const items = Array.isArray(value) ? value : [value];
  const result: Array<{ message_id: string; quote: string }> = [];
  for (const item of items) {
    const record = asRecord(item);
    if (!record) continue;
    const messageId = record.message_id ?? record.messageId;
    const quote = record.quote;
    if (typeof messageId !== "string" || !messageId.trim()) continue;
    if (typeof quote !== "string" || !quote.trim()) continue;
    result.push({ message_id: messageId.trim(), quote });
  }
  return result;
}

function stringField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export interface SanitizedDeepseekReview {
  issues: Array<{
    issue_id: string;
    kind: IssueKind;
    priority: IssuePriority;
    title: string;
    evidence: Array<{ message_id: string; quote: string }>;
    impact: string;
    question: string;
    status: IssueStatus;
    waiting_for: WaitingFor;
    resolution_evidence: Array<{ message_id: string; quote: string }>;
    value?: string;
  }>;
  facts: Array<{
    id: string;
    label: string;
    value: string;
    scope_note?: string;
    status: FactStatus;
    evidence: Array<{ message_id: string; quote: string }>;
  }>;
  droppedIssues: number;
  droppedFacts: number;
}

/**
 * Map near-miss enums and coerce evidence arrays before Zod.
 * Drops rows that still cannot match the schema. Does not invent issues.
 */
export function sanitizeDeepseekReview(raw: unknown): SanitizedDeepseekReview | null {
  const root = asRecord(raw);
  if (!root || !Array.isArray(root.issues)) return null;

  const issues: SanitizedDeepseekReview["issues"] = [];
  let droppedIssues = 0;
  for (const item of root.issues) {
    const record = asRecord(item);
    if (!record) {
      droppedIssues += 1;
      continue;
    }
    const issueId = stringField(record.issue_id ?? record.issueId);
    const kind = lookup<IssueKind>(record.kind, KIND_ALIASES);
    const status = lookup<IssueStatus>(record.status, STATUS_ALIASES);
    const waiting = lookup<WaitingFor>(record.waiting_for ?? record.waitingFor, WAITING_ALIASES);
    const title = stringField(record.title);
    const impact = stringField(record.impact);
    const question = stringField(record.question);
    const evidence = coerceEvidenceList(record.evidence);
    if (!issueId || !kind || !status || !waiting || !title || !impact || !question || evidence.length === 0) {
      droppedIssues += 1;
      continue;
    }
    const priority = lookup<IssuePriority>(record.priority, PRIORITY_ALIASES) ?? "low";
    const value = stringField(record.value);
    issues.push({
      issue_id: issueId,
      kind,
      priority,
      title,
      evidence,
      impact,
      question,
      status,
      waiting_for: waiting,
      resolution_evidence: coerceEvidenceList(record.resolution_evidence ?? record.resolutionEvidence),
      ...(value ? { value } : {}),
    });
  }

  const facts: SanitizedDeepseekReview["facts"] = [];
  let droppedFacts = 0;
  const factItems = Array.isArray(root.facts) ? root.facts : [];
  if (root.facts != null && !Array.isArray(root.facts)) droppedFacts += 1;
  for (const item of factItems) {
    const record = asRecord(item);
    if (!record) {
      droppedFacts += 1;
      continue;
    }
    const id = stringField(record.id);
    const label = stringField(record.label);
    const value = stringField(record.value);
    const status = lookup<FactStatus>(record.status, FACT_STATUS_ALIASES);
    const evidence = coerceEvidenceList(record.evidence);
    if (!id || !label || !value || !status || evidence.length === 0) {
      droppedFacts += 1;
      continue;
    }
    const scope = stringField(record.scope_note ?? record.scopeNote);
    facts.push({
      id,
      label,
      value,
      status,
      evidence,
      ...(scope ? { scope_note: scope } : {}),
    });
  }

  return { issues, facts, droppedIssues, droppedFacts };
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
      system: `${REVIEW_SYSTEM_PROMPT}\n\n${DEEPSEEK_SCHEMA_RULES}`,
      prompt: `${buildReviewUserPrompt(input.order)}

${DEEPSEEK_SCHEMA_RULES}`,
      temperature: 0,
    });
    text = result.text;
    usage = readUsage(result.usage);
  } catch (error) {
    const message = error instanceof Error ? error.message : "DeepSeek 调用失败。";
    throw new DeepSeekError("deepseek_call_failed", redact(message, input.apiKey));
  }

  const parsed = parseJsonObject(text, "deepseek_invalid_output");
  const normalized = sanitizeDeepseekReview(parsed);
  if (!normalized || normalized.issues.length === 0) {
    throw new DeepSeekError(
      "deepseek_invalid_output",
      "DeepSeek JSON 的事项无法归一到 schema（kind / status / waiting_for / resolution_evidence）。没有改用规则引擎、Bedrock 或 AI Gateway。",
    );
  }
  const checked = reviewSchema.safeParse({ issues: normalized.issues, facts: normalized.facts });
  if (!checked.success) {
    throw new DeepSeekError(
      "deepseek_invalid_output",
      `DeepSeek JSON 归一后仍不符合 schema：${checked.error.message}。没有改用其他引擎。`,
    );
  }
  return { payload: checked.data, usage, model };
}

function draftFieldsFrom(record: Record<string, unknown> | null): { subject: string; body: string } | null {
  if (!record) return null;
  const subject = stringField(record.subject);
  const body = stringField(record.body);
  if (!subject || !body) return null;
  return { subject, body };
}

/** Accept a flat draft or one nested under email / draft / confirmation_email. */
export function unwrapDraftFields(raw: unknown): { subject: string; body: string } | null {
  const record = asRecord(raw);
  const direct = draftFieldsFrom(record);
  if (direct) return direct;
  if (!record) return null;
  for (const key of ["email", "draft", "confirmation_email", "confirmationEmail"]) {
    const nested = draftFieldsFrom(asRecord(record[key]));
    if (nested) return nested;
  }
  return null;
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
        'You draft concise English B2B confirmation emails. Never invent commercial commitments. Respond with one JSON object only: {"subject":"<plain string>","body":"<plain string>"}. subject and body must be strings. No markdown fences, no extra keys required.',
      prompt: input.prompt,
      temperature: 0.2,
    });
    text = result.text;
  } catch (error) {
    const message = error instanceof Error ? error.message : "DeepSeek 草稿调用失败。";
    throw new DeepSeekError("deepseek_call_failed", redact(message, input.apiKey));
  }

  const parsed = parseJsonObject(text, "deepseek_invalid_output");
  const data = unwrapDraftFields(parsed);
  if (!data) {
    throw new DeepSeekError("deepseek_invalid_output", "DeepSeek 草稿缺少字符串 subject 或 body。没有改用确定性模板。");
  }
  return {
    from: input.order.seller.email,
    to: input.order.buyer.email,
    subject: data.subject.trim(),
    body: data.body.trim(),
    issue_ids: input.issueIds,
  };
}
