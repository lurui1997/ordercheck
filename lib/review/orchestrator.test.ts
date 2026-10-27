import { afterEach, describe, expect, it, vi } from "vitest";
import { createOrderFromScenario } from "@/lib/scenario";

vi.mock("@/lib/aws/bedrock", async () => {
  const actual = await vi.importActual<typeof import("@/lib/aws/bedrock")>("@/lib/aws/bedrock");
  return {
    ...actual,
    reviewWithBedrock: vi.fn(),
  };
});

vi.mock("@/lib/aws/gateway", async () => {
  const actual = await vi.importActual<typeof import("@/lib/aws/gateway")>("@/lib/aws/gateway");
  return {
    ...actual,
    reviewWithGateway: vi.fn(),
  };
});

vi.mock("@/lib/deepseek", async () => {
  const actual = await vi.importActual<typeof import("@/lib/deepseek")>("@/lib/deepseek");
  return {
    ...actual,
    reviewWithDeepseek: vi.fn(),
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
import { GatewayError, reviewWithGateway } from "@/lib/aws/gateway";
import { DeepSeekError, reviewWithDeepseek } from "@/lib/deepseek";
import { ChatProviderError, reviewWithOpenAICompatible } from "@/lib/oss/openai-compatible";
import { applyModelReview } from "@/lib/review/model-apply";
import { ReviewOrchestrationError, runReview } from "@/lib/review/orchestrator";

describe("runReview orchestration", () => {
  afterEach(() => {
    vi.mocked(reviewWithBedrock).mockReset();
    vi.mocked(reviewWithGateway).mockReset();
    vi.mocked(reviewWithDeepseek).mockReset();
    vi.mocked(reviewWithOpenAICompatible).mockReset();
  });

  it("uses deterministic engine in demo by default", async () => {
    const result = await runReview(createOrderFromScenario(), { APP_MODE: "demo" });
    expect(result.engine).toBe("deterministic");
    expect(result.order.reviewed).toBe(true);
    expect(result.meta.engine).toBe("deterministic");
    expect(result.order.issues.some((issue) => issue.issue_id === "delivery_milestone")).toBe(true);
  });

  it("fails hard on explicit bedrock errors without falling back to deterministic", async () => {
    vi.mocked(reviewWithBedrock).mockRejectedValue(new IntegrationError("bedrock_call_failed", "boom"));
    const env = {
      APP_MODE: "aws",
      REVIEW_ENGINE: "bedrock",
      AWS_REGION: "us-east-1",
      BEDROCK_MODEL_ID: "amazon.nova-lite-v1:0",
      AWS_ACCESS_KEY_ID: "AKIA_TEST",
      AWS_SECRET_ACCESS_KEY: "secret",
    };
    await expect(runReview(createOrderFromScenario(), env)).rejects.toBeInstanceOf(ReviewOrchestrationError);
    await expect(runReview(createOrderFromScenario(), env)).rejects.toMatchObject({
      code: "bedrock_call_failed",
      engine: "bedrock",
    });
  });

  it("does not call bedrock on auto even when AWS credentials exist", async () => {
    const result = await runReview(createOrderFromScenario(), {
      APP_MODE: "aws",
      REVIEW_ENGINE: "auto",
      AWS_REGION: "us-east-1",
      BEDROCK_MODEL_ID: "amazon.nova-lite-v1:0",
      AWS_ACCESS_KEY_ID: "AKIA_TEST",
      AWS_SECRET_ACCESS_KEY: "secret",
    });
    expect(result.engine).toBe("deterministic");
    expect(reviewWithBedrock).not.toHaveBeenCalled();
  });

  it("labels a successful deepseek review as deepseek and stores token usage", async () => {
    vi.mocked(reviewWithDeepseek).mockResolvedValue({
      payload: {
        issues: [
          {
            issue_id: "sample_version",
            kind: "conflict",
            priority: "high",
            title: "样品版本不一致",
            evidence: [
              { message_id: "m1", quote: "based on sample v2" },
              { message_id: "m3", quote: "based on sample v1" },
            ],
            impact: "版本不同",
            question: "Which sample?",
            status: "unconfirmed",
            waiting_for: "both",
            resolution_evidence: [],
          },
        ],
        facts: [],
      },
      usage: { totalTokens: 9 },
      model: "deepseek-chat",
    });
    const result = await runReview(createOrderFromScenario(), {
      APP_MODE: "demo",
      REVIEW_ENGINE: "deepseek",
      DEEPSEEK_API_KEY: "sk-test",
      AI_GATEWAY_API_KEY: "gateway-key",
    });
    expect(result.engine).toBe("deepseek");
    expect(result.meta.engine).toBe("deepseek");
    expect(result.meta.deepseekUsage?.totalTokens).toBe(9);
    expect(result.meta.gatewayUsage).toBeUndefined();
    expect(result.meta.bedrockRequestId).toBeUndefined();
    expect(result.order.review_meta?.engine).toBe("deepseek");
    expect(reviewWithGateway).not.toHaveBeenCalled();
    expect(reviewWithBedrock).not.toHaveBeenCalled();
    expect(reviewWithOpenAICompatible).not.toHaveBeenCalled();
  });

  it("does not fall back when deepseek fails, even if ollama is also configured", async () => {
    vi.mocked(reviewWithDeepseek).mockRejectedValue(new DeepSeekError("deepseek_call_failed", "deepseek down"));
    await expect(
      runReview(createOrderFromScenario(), {
        REVIEW_ENGINE: "auto",
        DEEPSEEK_API_KEY: "sk-test",
        OLLAMA_MODEL: "qwen2.5",
      }),
    ).rejects.toMatchObject({ code: "deepseek_call_failed", engine: "deepseek" });
    expect(reviewWithGateway).not.toHaveBeenCalled();
    expect(reviewWithBedrock).not.toHaveBeenCalled();
    expect(reviewWithOpenAICompatible).not.toHaveBeenCalled();
  });

  it("auto-selects gateway when it is the first configured engine and fails loud", async () => {
    vi.mocked(reviewWithGateway).mockRejectedValue(new GatewayError("gateway_call_failed", "gateway down"));
    await expect(
      runReview(createOrderFromScenario(), {
        APP_MODE: "demo",
        AI_GATEWAY_API_KEY: "test-key",
      }),
    ).rejects.toMatchObject({ code: "gateway_call_failed", engine: "ai_gateway" });
    expect(reviewWithBedrock).not.toHaveBeenCalled();
    expect(reviewWithDeepseek).not.toHaveBeenCalled();
  });

  it("labels ollama and does not call deepseek or bedrock", async () => {
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
      model: "qwen2.5",
      requestId: "ollama-req-1",
      usage: { totalTokens: 4 },
    });
    const result = await runReview(createOrderFromScenario(), {
      REVIEW_ENGINE: "ollama",
      OLLAMA_MODEL: "qwen2.5",
    });
    expect(result.engine).toBe("ollama");
    expect(result.meta.modelRequestId).toBe("ollama-req-1");
    expect(result.meta.ollamaUsage?.totalTokens).toBe(4);
    expect(result.meta.bedrockRequestId).toBeUndefined();
    expect(result.meta.deepseekUsage).toBeUndefined();
    expect(reviewWithDeepseek).not.toHaveBeenCalled();
    expect(reviewWithBedrock).not.toHaveBeenCalled();
  });

  it("does not fall back to deterministic when Ollama fails", async () => {
    vi.mocked(reviewWithOpenAICompatible).mockRejectedValue(new ChatProviderError("ollama", "ollama_call_failed", "down"));
    await expect(
      runReview(createOrderFromScenario(), {
        REVIEW_ENGINE: "ollama",
        OLLAMA_MODEL: "qwen2.5",
      }),
    ).rejects.toMatchObject({ code: "ollama_call_failed", engine: "ollama" });
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
