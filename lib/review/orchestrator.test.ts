import { afterEach, describe, expect, it, vi } from "vitest";
import { createOrderFromScenario } from "@/lib/scenario";

vi.mock("@/lib/aws/bedrock", async () => {
  const actual = await vi.importActual<typeof import("@/lib/aws/bedrock")>("@/lib/aws/bedrock");
  return {
    ...actual,
    reviewWithBedrock: vi.fn(),
  };
});

vi.mock("@/lib/oss/openai-compatible", async () => {
  const actual = await vi.importActual<typeof import("@/lib/oss/openai-compatible")>("@/lib/oss/openai-compatible");
  return {
    ...actual,
    reviewWithOpenAICompatible: vi.fn(),
  };
});

import { reviewWithBedrock, IntegrationError } from "@/lib/aws/bedrock";
import { ChatProviderError, reviewWithOpenAICompatible } from "@/lib/oss/openai-compatible";
import { applyModelReview } from "@/lib/review/model-apply";
import { ReviewOrchestrationError, runReview } from "@/lib/review/orchestrator";

describe("runReview orchestration", () => {
  afterEach(() => {
    vi.mocked(reviewWithBedrock).mockReset();
    vi.mocked(reviewWithOpenAICompatible).mockReset();
  });

  it("uses deterministic engine in demo by default", async () => {
    const result = await runReview(createOrderFromScenario(), { APP_MODE: "demo" });
    expect(result.engine).toBe("deterministic");
    expect(result.order.reviewed).toBe(true);
    expect(result.meta.engine).toBe("deterministic");
    expect(result.order.issues.some((issue) => issue.issue_id === "delivery_milestone")).toBe(true);
  });

  it("fails hard on bedrock errors without falling back to deterministic", async () => {
    vi.mocked(reviewWithBedrock).mockRejectedValue(new IntegrationError("bedrock_call_failed", "boom"));
    await expect(
      runReview(createOrderFromScenario(), {
        APP_MODE: "aws",
        REVIEW_ENGINE: "bedrock",
        AWS_REGION: "us-east-1",
        BEDROCK_MODEL_ID: "amazon.nova-lite-v1:0",
      }),
    ).rejects.toBeInstanceOf(ReviewOrchestrationError);

    await expect(
      runReview(createOrderFromScenario(), {
        APP_MODE: "aws",
        REVIEW_ENGINE: "bedrock",
        AWS_REGION: "us-east-1",
        BEDROCK_MODEL_ID: "amazon.nova-lite-v1:0",
      }),
    ).rejects.toMatchObject({ code: "bedrock_call_failed", engine: "bedrock" });
  });

  it("does not call bedrock when AWS mode has no explicit REVIEW_ENGINE", async () => {
    const result = await runReview(createOrderFromScenario(), {
      APP_MODE: "aws",
      AWS_REGION: "us-east-1",
      BEDROCK_MODEL_ID: "amazon.nova-lite-v1:0",
    });
    expect(result.engine).toBe("deterministic");
    expect(reviewWithBedrock).not.toHaveBeenCalled();
  });

  it("applies bedrock payload and stores review_meta request id", async () => {
    const order = createOrderFromScenario();
    vi.mocked(reviewWithBedrock).mockResolvedValue({
      payload: {
        issues: [
          {
            issue_id: "delivery_milestone",
            kind: "conflict",
            priority: "high",
            title: "到货与提货未对齐",
            evidence: [
              { message_id: "m1", quote: "delivered to our London warehouse by 20 November 2026" },
              { message_id: "m2", quote: "ready for collection in Shanghai on 20 November 2026" },
            ],
            impact: "里程碑不同",
            question: "Confirm London delivery?",
            status: "unconfirmed",
            waiting_for: "seller",
            resolution_evidence: [],
          },
        ],
        facts: [
          {
            id: "quantity",
            label: "数量",
            value: "1,000 套",
            status: "confirmed",
            evidence: [{ message_id: "m1", quote: "1,000 custom" }],
          },
        ],
      },
      requestId: "bedrock-req-9",
      agentRetries: 0,
    });

    const result = await runReview(order, {
      APP_MODE: "demo",
      REVIEW_ENGINE: "bedrock",
      AWS_REGION: "us-east-1",
      BEDROCK_MODEL_ID: "amazon.nova-lite-v1:0",
    });
    expect(result.engine).toBe("bedrock");
    expect(result.order.issues).toHaveLength(1);
    expect(result.order.facts[0]?.id).toBe("quantity");
    expect(result.meta.bedrockRequestId).toBe("bedrock-req-9");
    expect(result.order.review_meta?.bedrockRequestId).toBe("bedrock-req-9");
  });

  it("labels a DeepSeek result as deepseek and keeps the request id off the bedrock field", async () => {
    vi.mocked(reviewWithOpenAICompatible).mockResolvedValue({
      payload: {
        issues: [
          {
            issue_id: "delivery_milestone",
            kind: "conflict",
            priority: "high",
            title: "到货与提货未对齐",
            evidence: [
              { message_id: "m1", quote: "delivered to our London warehouse by 20 November 2026" },
              { message_id: "m2", quote: "ready for collection in Shanghai on 20 November 2026" },
            ],
            impact: "里程碑不同",
            question: "Confirm London delivery?",
            status: "unconfirmed",
            waiting_for: "seller",
            resolution_evidence: [],
          },
        ],
        facts: [],
      },
      model: "deepseek-chat",
      requestId: "ds-req-1",
      usage: { totalTokens: 12 },
    });

    const result = await runReview(createOrderFromScenario(), {
      REVIEW_ENGINE: "deepseek",
      DEEPSEEK_API_KEY: "sk-test",
    });
    expect(result.engine).toBe("deepseek");
    expect(result.meta.modelRequestId).toBe("ds-req-1");
    expect(result.meta.bedrockRequestId).toBeUndefined();
    expect(result.meta.usage?.totalTokens).toBe(12);
    expect(result.order.review_meta?.engine).toBe("deepseek");
  });

  it("does not fall back to deterministic when DeepSeek fails", async () => {
    vi.mocked(reviewWithOpenAICompatible).mockRejectedValue(
      new ChatProviderError("deepseek", "deepseek_call_failed", "down"),
    );
    await expect(
      runReview(createOrderFromScenario(), {
        REVIEW_ENGINE: "auto",
        DEEPSEEK_API_KEY: "sk-test",
        OLLAMA_MODEL: "qwen2.5",
      }),
    ).rejects.toMatchObject({ code: "deepseek_call_failed", engine: "deepseek" });
  });

  it("applyModelReview rejects when all quotes are invalid", () => {
    const order = createOrderFromScenario();
    const applied = applyModelReview(order, {
      issues: [
        {
          issue_id: "x",
          kind: "missing",
          priority: "high",
          title: "x",
          evidence: [{ message_id: "m1", quote: "nope" }],
          impact: "x",
          question: "x",
          status: "unconfirmed",
          waiting_for: "both",
          resolution_evidence: [],
        },
      ],
      facts: [],
    });
    expect(applied.ok).toBe(false);
  });
});
