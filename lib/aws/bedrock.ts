import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type Message as BedrockMessage,
  type ToolConfiguration,
} from "@aws-sdk/client-bedrock-runtime";
import { REVIEW_SYSTEM_PROMPT, buildReviewUserPrompt } from "@/lib/review/prompt";
import { sanitizeModelFacts, sanitizeModelIssues, type ModelReviewPayload } from "@/lib/review/evidence";
import type { Order } from "@/lib/types";

export interface BedrockReviewRequest {
  modelId: string;
  region: string;
  order: Order;
  maxTokens?: number;
  /** Override env BEDROCK_AGENT_RETRY (default on). */
  agentRetry?: boolean;
}

export interface BedrockReviewResult {
  payload: ModelReviewPayload;
  requestId?: string;
  agentRetries: number;
}

export class IntegrationError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const TOOL_NAME = "submit_order_review";

const toolConfig: ToolConfiguration = {
  tools: [
    {
      toolSpec: {
        name: TOOL_NAME,
        description: "Submit the structured order review: issues with verbatim evidence quotes, and known facts.",
        inputSchema: {
          json: {
            type: "object",
            additionalProperties: false,
            required: ["issues", "facts"],
            properties: {
              issues: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: [
                    "issue_id",
                    "kind",
                    "priority",
                    "title",
                    "evidence",
                    "impact",
                    "question",
                    "status",
                    "waiting_for",
                    "resolution_evidence",
                  ],
                  properties: {
                    issue_id: { type: "string" },
                    kind: { type: "string", enum: ["missing", "ambiguous", "conflict"] },
                    priority: { type: "string", enum: ["high", "low"] },
                    title: { type: "string" },
                    evidence: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["message_id", "quote"],
                        properties: {
                          message_id: { type: "string" },
                          quote: { type: "string" },
                        },
                      },
                    },
                    impact: { type: "string" },
                    question: { type: "string" },
                    status: {
                      type: "string",
                      enum: [
                        "unconfirmed",
                        "question_sent",
                        "proposed",
                        "confirmed",
                        "needs_human_review",
                        "accepted_risk",
                        "reopened",
                        "not_applicable",
                      ],
                    },
                    waiting_for: { type: "string", enum: ["buyer", "seller", "both", "none"] },
                    resolution_evidence: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["message_id", "quote"],
                        properties: {
                          message_id: { type: "string" },
                          quote: { type: "string" },
                        },
                      },
                    },
                    value: { type: "string" },
                  },
                },
              },
              facts: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["id", "label", "value", "status", "evidence"],
                  properties: {
                    id: { type: "string" },
                    label: { type: "string" },
                    value: { type: "string" },
                    scope_note: { type: "string" },
                    status: {
                      type: "string",
                      enum: ["confirmed", "stated_by_one_party", "proposed", "historical"],
                    },
                    evidence: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: ["message_id", "quote"],
                        properties: {
                          message_id: { type: "string" },
                          quote: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  ],
};

function parseToolPayload(raw: unknown): ModelReviewPayload {
  if (!raw || typeof raw !== "object") {
    throw new IntegrationError("bedrock_invalid_output", "Bedrock 工具输出不是对象。");
  }
  const data = raw as { issues?: unknown; facts?: unknown };
  if (!Array.isArray(data.issues) || !Array.isArray(data.facts)) {
    throw new IntegrationError("bedrock_invalid_output", "Bedrock 输出缺少 issues 或 facts 数组。");
  }
  return data as ModelReviewPayload;
}

function extractPayloadAndToolUse(blocks: ContentBlock[]): {
  payload: ModelReviewPayload;
  toolUseId?: string;
  assistantContent: ContentBlock[];
} {
  for (const block of blocks) {
    if (block.toolUse?.name === TOOL_NAME && block.toolUse.input !== undefined) {
      return {
        payload: parseToolPayload(block.toolUse.input),
        toolUseId: block.toolUse.toolUseId,
        assistantContent: blocks,
      };
    }
  }

  for (const block of blocks) {
    if (typeof block.text === "string" && block.text.trim()) {
      try {
        const start = block.text.indexOf("{");
        const end = block.text.lastIndexOf("}");
        if (start >= 0 && end > start) {
          return {
            payload: parseToolPayload(JSON.parse(block.text.slice(start, end + 1))),
            assistantContent: blocks,
          };
        }
      } catch {
        // fall through
      }
    }
  }

  throw new IntegrationError("bedrock_invalid_output", "Bedrock 响应里没有可用的结构化核对结果。");
}

/** Too many evidence drops: all kept empty, or dropped >= kept. */
export function shouldRetryAfterSanitize(payload: ModelReviewPayload, order: Order): boolean {
  const issues = sanitizeModelIssues(payload.issues, order.messages);
  const facts = sanitizeModelFacts(payload.facts, order.messages);
  const dropped = issues.dropped + facts.dropped;
  const kept = issues.kept.length + facts.kept.length;
  if (dropped === 0) return false;
  return kept === 0 || dropped >= kept;
}

function agentRetryEnabled(explicit?: boolean, env: NodeJS.ProcessEnv = process.env): boolean {
  if (explicit !== undefined) return explicit;
  const raw = (env.BEDROCK_AGENT_RETRY ?? "1").trim();
  return raw !== "0" && raw.toLowerCase() !== "false";
}

/**
 * Call Amazon Bedrock Converse with a structured tool.
 * Optional one-shot agent retry when evidence validation would discard too much
 * (BEDROCK_AGENT_RETRY=1 default). Never falls back to the rule engine.
 */
export async function reviewWithBedrock(input: BedrockReviewRequest): Promise<BedrockReviewResult> {
  if (!input.modelId || !input.region) {
    throw new IntegrationError("bedrock_not_configured", "缺少 AWS_REGION 或 BEDROCK_MODEL_ID，没有调用 Bedrock。");
  }

  const client = new BedrockRuntimeClient({ region: input.region });
  const maxTokens = input.maxTokens ?? Number(process.env.BEDROCK_MAX_TOKENS ?? 2400);
  const inferenceConfig = {
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 2400,
    temperature: 0,
  };

  const userContent: ContentBlock[] = [{ text: buildReviewUserPrompt(input.order) }];
  let messages: BedrockMessage[] = [{ role: "user", content: userContent }];

  let response;
  try {
    response = await client.send(
      new ConverseCommand({
        modelId: input.modelId,
        system: [{ text: REVIEW_SYSTEM_PROMPT }],
        messages,
        toolConfig,
        inferenceConfig,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bedrock 调用失败。";
    throw new IntegrationError("bedrock_call_failed", message);
  }

  let requestId = response.$metadata?.requestId;
  const blocks = response.output?.message?.content ?? [];
  const extracted = extractPayloadAndToolUse(blocks);
  let payload = extracted.payload;
  const toolUseId = extracted.toolUseId;
  const assistantContent = extracted.assistantContent;
  let agentRetries = 0;

  if (agentRetryEnabled(input.agentRetry) && shouldRetryAfterSanitize(payload, input.order) && toolUseId) {
    const issues = sanitizeModelIssues(payload.issues, input.order.messages);
    const facts = sanitizeModelFacts(payload.facts, input.order.messages);
    const toolResultContent: ContentBlock[] = [
      {
        toolResult: {
          toolUseId,
          content: [
            {
              json: {
                status: "validation_failed",
                message:
                  "Evidence quote validation discarded too many items. Resubmit via submit_order_review using ONLY exact substrings from the cited message bodies.",
                dropped_issues: issues.dropped,
                kept_issues: issues.kept.length,
                dropped_facts: facts.dropped,
                kept_facts: facts.kept.length,
                hint: "Each evidence.quote MUST appear verbatim in the message with evidence.message_id. Do not invent quotes.",
              },
            },
          ],
          status: "error",
        },
      },
    ];

    messages = [
      { role: "user", content: userContent },
      { role: "assistant", content: assistantContent },
      { role: "user", content: toolResultContent },
    ];

    try {
      const retryResponse = await client.send(
        new ConverseCommand({
          modelId: input.modelId,
          system: [{ text: REVIEW_SYSTEM_PROMPT }],
          messages,
          toolConfig,
          inferenceConfig,
        }),
      );
      requestId = retryResponse.$metadata?.requestId ?? requestId;
      const retryBlocks = retryResponse.output?.message?.content ?? [];
      payload = extractPayloadAndToolUse(retryBlocks).payload;
      agentRetries = 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bedrock 重试调用失败。";
      throw new IntegrationError("bedrock_call_failed", message);
    }
  }

  return { payload, requestId, agentRetries };
}
