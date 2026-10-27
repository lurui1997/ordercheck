import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type ToolConfiguration,
} from "@aws-sdk/client-bedrock-runtime";
import { createGateway } from "@ai-sdk/gateway";
import { generateText } from "ai";
import { getRuntimeConfig } from "@/lib/aws/config";
import { DeepSeekError, draftWithDeepseek } from "@/lib/deepseek";
import { ChatProviderError, draftWithOpenAICompatible } from "@/lib/oss/openai-compatible";
import { buildDraft } from "@/lib/review/draft";
import type { EmailDraft, Order, ReviewEngine, RuntimeConfig } from "@/lib/types";

export type DraftEngine = ReviewEngine;

export interface DraftWithModelResult {
  draft: EmailDraft;
  /** Honest label. Fallback is always deterministic — never bedrock for a non-Bedrock draft. */
  draftEngine: DraftEngine;
  notice?: string;
}

type EnvLike = Record<string, string | undefined>;

const TOOL_NAME = "submit_confirmation_email_draft";

const draftToolConfig: ToolConfiguration = {
  tools: [
    {
      toolSpec: {
        name: TOOL_NAME,
        description:
          "Submit an English confirmation email draft asking the buyer to align on the selected open issues. No new commercial promises.",
        inputSchema: {
          json: {
            type: "object",
            additionalProperties: false,
            required: ["subject", "body"],
            properties: {
              subject: { type: "string" },
              body: { type: "string" },
            },
          },
        },
      },
    },
  ],
};

function selectedOpenIssues(order: Order, issueIds: string[]) {
  const closed = new Set(["confirmed", "accepted_risk", "not_applicable"]);
  return order.issues.filter((issue) => issueIds.includes(issue.issue_id) && !closed.has(issue.status));
}

function buildDraftPrompt(order: Order, issueIds: string[]): string {
  const selected = selectedOpenIssues(order, issueIds);
  const lines = selected.map((issue, index) => {
    return `${index + 1}. [${issue.issue_id}] ${issue.title}
   Question: ${issue.question}
   Impact: ${issue.impact}
   Evidence quotes: ${issue.evidence.map((e) => `"${e.quote}"`).join(" | ") || "(none)"}`;
  });

  return `Write a short professional English confirmation email from the seller to the buyer.

Seller: ${order.seller.name} <${order.seller.email}>
Buyer: ${order.buyer.name} <${order.buyer.email}>
Order id: ${order.id}

Open points to ask about (do not invent new commercial terms, prices, dates, payment terms, or remedies beyond clarifying these):
${lines.join("\n")}

Rules:
- Subject and body in English.
- Ask for confirmation / alignment only; do not promise a deal is closed.
- Include a brief note that nothing changes until both sides confirm.
- Do not invent facts not listed above.
- Keep the body under ~250 words.`;
}

function parseDraftFields(raw: unknown): { subject: string; body: string } {
  if (!raw || typeof raw !== "object") {
    throw new Error("draft_invalid_output");
  }
  const data = raw as { subject?: unknown; body?: unknown };
  if (typeof data.subject !== "string" || !data.subject.trim()) {
    throw new Error("draft_invalid_subject");
  }
  if (typeof data.body !== "string" || !data.body.trim()) {
    throw new Error("draft_invalid_body");
  }
  return { subject: data.subject.trim(), body: data.body.trim() };
}

function extractToolDraft(blocks: ContentBlock[]): { subject: string; body: string } {
  for (const block of blocks) {
    if (block.toolUse?.name === TOOL_NAME && block.toolUse.input !== undefined) {
      return parseDraftFields(block.toolUse.input);
    }
  }
  for (const block of blocks) {
    if (typeof block.text === "string" && block.text.trim()) {
      const start = block.text.indexOf("{");
      const end = block.text.lastIndexOf("}");
      if (start >= 0 && end > start) {
        return parseDraftFields(JSON.parse(block.text.slice(start, end + 1)));
      }
    }
  }
  throw new Error("draft_no_tool_output");
}

function toEmailDraft(order: Order, issueIds: string[], subject: string, body: string): EmailDraft {
  const openIds = selectedOpenIssues(order, issueIds).map((issue) => issue.issue_id);
  return {
    from: order.seller.email,
    to: order.buyer.email,
    subject,
    body,
    issue_ids: openIds.length ? openIds : issueIds,
  };
}

async function draftWithBedrock(order: Order, issueIds: string[], env: EnvLike): Promise<EmailDraft> {
  const modelId = env.BEDROCK_MODEL_ID ?? "";
  const region = env.AWS_REGION ?? "";
  if (!modelId || !region) {
    throw new Error("bedrock_not_configured");
  }

  const client = new BedrockRuntimeClient({ region });
  const maxTokens = Number(env.BEDROCK_MAX_TOKENS ?? 1200);
  const response = await client.send(
    new ConverseCommand({
      modelId,
      system: [
        {
          text: "You draft concise English B2B confirmation emails for cross-border sellers. Never invent commercial commitments. Always call submit_confirmation_email_draft.",
        },
      ],
      messages: [{ role: "user", content: [{ text: buildDraftPrompt(order, issueIds) }] }],
      toolConfig: draftToolConfig,
      inferenceConfig: {
        maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 1200,
        temperature: 0.2,
      },
    }),
  );

  const blocks = response.output?.message?.content ?? [];
  const fields = extractToolDraft(blocks);
  return toEmailDraft(order, issueIds, fields.subject, fields.body);
}

async function draftWithGateway(order: Order, issueIds: string[], env: EnvLike): Promise<EmailDraft> {
  const apiKey = env.AI_GATEWAY_API_KEY ?? "";
  if (!apiKey) {
    throw new Error("gateway_not_configured");
  }
  const modelId = env.AI_GATEWAY_MODEL || "amazon/nova-lite";
  const gateway = createGateway({ apiKey });
  const result = await generateText({
    model: gateway(modelId),
    system:
      "You draft concise English B2B confirmation emails. Never invent commercial commitments. Respond with a single JSON object: {\"subject\":\"...\",\"body\":\"...\"} and no markdown fences.",
    prompt: buildDraftPrompt(order, issueIds),
    temperature: 0.2,
  });

  const text = result.text;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("gateway_invalid_output");
  }
  const fields = parseDraftFields(JSON.parse(text.slice(start, end + 1)));
  return toEmailDraft(order, issueIds, fields.subject, fields.body);
}

async function draftWithOllama(order: Order, issueIds: string[], env: EnvLike): Promise<EmailDraft> {
  const fields = await draftWithOpenAICompatible({
    engine: "ollama",
    order,
    prompt: buildDraftPrompt(order, issueIds),
    env,
  });
  return toEmailDraft(order, issueIds, fields.subject, fields.body);
}

/**
 * Optional LLM path for confirmation email drafts.
 * Bedrock, AI Gateway, and Ollama failures fall back to deterministic buildDraft
 * and label draftEngine as "deterministic".
 * DeepSeek failures throw DeepSeekError and do not substitute that template.
 */
export async function draftWithModel(
  order: Order,
  issueIds: string[],
  env: EnvLike = process.env,
  config: RuntimeConfig = getRuntimeConfig(env),
): Promise<DraftWithModelResult> {
  const engine = config.reviewEngine;

  if (engine === "bedrock" && config.bedrockConfigured) {
    try {
      const draft = await draftWithBedrock(order, issueIds, env);
      return { draft, draftEngine: "bedrock", notice: "Confirmation draft generated with Amazon Bedrock." };
    } catch (error) {
      const message = error instanceof Error ? error.message : "bedrock_draft_failed";
      return {
        draft: buildDraft(order, issueIds),
        draftEngine: "deterministic",
        notice: `Bedrock draft failed (${message}); fell back to deterministic buildDraft.`,
      };
    }
  }

  if (engine === "deepseek") {
    if (!config.deepseekConfigured) {
      throw new DeepSeekError(
        "deepseek_not_configured",
        "需要 DeepSeek 草稿，但缺少 DEEPSEEK_API_KEY。没有调用模型，也没有改用确定性模板。",
      );
    }
    const draft = await draftWithDeepseek({
      order,
      issueIds,
      apiKey: env.DEEPSEEK_API_KEY ?? "",
      baseURL: env.DEEPSEEK_BASE_URL,
      model: env.DEEPSEEK_MODEL,
      prompt: buildDraftPrompt(order, issueIds),
    });
    return {
      draft,
      draftEngine: "deepseek" as const,
      notice: "Confirmation draft generated with DeepSeek (not Bedrock, not AI Gateway).",
    };
  }

  if (engine === "ollama" && config.ollamaConfigured) {
    try {
      const draft = await draftWithOllama(order, issueIds, env);
      return {
        draft,
        draftEngine: "ollama",
        notice: "Confirmation draft generated with Ollama (not Bedrock, not DeepSeek).",
      };
    } catch (error) {
      const message = error instanceof ChatProviderError ? error.message : error instanceof Error ? error.message : "ollama_draft_failed";
      return {
        draft: buildDraft(order, issueIds),
        draftEngine: "deterministic",
        notice: `Ollama draft failed (${message}); fell back to deterministic buildDraft.`,
      };
    }
  }

  if (engine === "ai_gateway" && config.gatewayConfigured) {
    try {
      const draft = await draftWithGateway(order, issueIds, env);
      return {
        draft,
        draftEngine: "ai_gateway",
        notice: "Confirmation draft generated with Vercel AI Gateway (not Bedrock).",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "gateway_draft_failed";
      return {
        draft: buildDraft(order, issueIds),
        draftEngine: "deterministic",
        notice: `AI Gateway draft failed (${message}); fell back to deterministic buildDraft.`,
      };
    }
  }

  return {
    draft: buildDraft(order, issueIds),
    draftEngine: "deterministic",
    notice: "Confirmation draft from deterministic buildDraft.",
  };
}
