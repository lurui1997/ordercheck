import { afterEach, describe, expect, it, vi } from "vitest";
import { createOrderFromScenario } from "@/lib/scenario";

const chat = vi.hoisted(() => vi.fn((modelId: string) => ({ modelId })));
const createOpenAI = vi.hoisted(() => vi.fn(() => ({ chat })));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI,
}));

vi.mock("ai", async () => {
  const actual = await vi.importActual<typeof import("ai")>("ai");
  return { ...actual, generateText: vi.fn() };
});

import { generateText } from "ai";
import {
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL,
  DEEPSEEK_SCHEMA_RULES,
  DeepSeekError,
  reviewWithDeepseek,
  sanitizeDeepseekReview,
} from "@/lib/deepseek";

const reviewJson = JSON.stringify({
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
});

describe("reviewWithDeepseek", () => {
  afterEach(() => {
    chat.mockClear();
    createOpenAI.mockClear();
    vi.mocked(generateText).mockReset();
  });

  it("calls the OpenAI-compatible chat model with DeepSeek defaults", async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: reviewJson,
      usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
    } as never);

    const result = await reviewWithDeepseek({
      order: createOrderFromScenario(),
      apiKey: "sk-test",
    });

    expect(createOpenAI).toHaveBeenCalledWith({
      apiKey: "sk-test",
      baseURL: DEFAULT_DEEPSEEK_BASE_URL,
      name: "deepseek",
    });
    expect(chat).toHaveBeenCalledWith(DEFAULT_DEEPSEEK_MODEL);
    expect(vi.mocked(generateText).mock.calls[0]?.[0]).toMatchObject({
      model: { modelId: DEFAULT_DEEPSEEK_MODEL },
      temperature: 0,
    });
    const call = vi.mocked(generateText).mock.calls[0]?.[0] as { system?: string; prompt?: string };
    expect(call.system).toContain('kind: "missing" | "ambiguous" | "conflict"');
    expect(call.prompt).toContain(DEEPSEEK_SCHEMA_RULES);
    expect(call.prompt).toContain("resolution_evidence");
    expect(result.model).toBe("deepseek-chat");
    expect(result.payload.issues[0]?.issue_id).toBe("sample_version");
    expect(result.usage?.totalTokens).toBe(7);
  });

  it("honors DEEPSEEK_BASE_URL and DEEPSEEK_MODEL", async () => {
    vi.mocked(generateText).mockResolvedValue({ text: reviewJson, usage: undefined } as never);
    await reviewWithDeepseek({
      order: createOrderFromScenario(),
      apiKey: "sk-test",
      baseURL: "https://example.test/v1",
      model: "deepseek-reasoner",
    });
    expect(createOpenAI).toHaveBeenCalledWith({
      apiKey: "sk-test",
      baseURL: "https://example.test/v1",
      name: "deepseek",
    });
    expect(chat).toHaveBeenCalledWith("deepseek-reasoner");
  });

  it("fails loud when the key is missing and does not call the SDK", async () => {
    await expect(reviewWithDeepseek({ order: createOrderFromScenario(), apiKey: "" })).rejects.toMatchObject({
      code: "deepseek_not_configured",
    });
    expect(createOpenAI).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
  });

  it("fails loud on SDK errors and redacts the API key", async () => {
    vi.mocked(generateText).mockRejectedValue(new Error("unauthorized sk-test"));
    await expect(reviewWithDeepseek({ order: createOrderFromScenario(), apiKey: "sk-test" })).rejects.toBeInstanceOf(DeepSeekError);
    await expect(reviewWithDeepseek({ order: createOrderFromScenario(), apiKey: "sk-test" })).rejects.toMatchObject({
      code: "deepseek_call_failed",
      message: "unauthorized [redacted]",
    });
  });

  it("normalizes a malformed DeepSeek payload before schema validation", async () => {
    const malformed = {
      issues: [
        {
          issue_id: "sample_version",
          kind: "mismatch",
          priority: "High",
          title: "样品版本不一致",
          evidence: { message_id: "m1", quote: "based on sample v2" },
          impact: "版本不同",
          question: "Which sample?",
          status: "open",
          waiting_for: "both parties",
          resolution_evidence: null,
        },
        {
          issue_id: "not-a-real-row",
          kind: "totally-unknown",
          priority: "high",
          title: "丢掉",
          evidence: [],
          impact: "无法归一",
          question: "?",
          status: "open",
          waiting_for: "buyer",
          resolution_evidence: "none",
        },
      ],
      facts: [
        {
          id: "quantity",
          label: "数量",
          value: "1,000 套",
          status: "agreed",
          evidence: [{ messageId: "m2", quote: "quantity 1,000 is confirmed" }],
        },
      ],
    };
    vi.mocked(generateText).mockResolvedValue({ text: JSON.stringify(malformed), usage: undefined } as never);

    const direct = sanitizeDeepseekReview(malformed);
    expect(direct?.droppedIssues).toBe(1);
    expect(direct?.issues).toEqual([
      expect.objectContaining({
        issue_id: "sample_version",
        kind: "conflict",
        priority: "high",
        status: "unconfirmed",
        waiting_for: "both",
        resolution_evidence: [],
      }),
    ]);

    const result = await reviewWithDeepseek({
      order: createOrderFromScenario(),
      apiKey: "sk-test",
    });
    expect(result.payload.issues).toHaveLength(1);
    expect(result.payload.issues[0]).toMatchObject({
      issue_id: "sample_version",
      kind: "conflict",
      status: "unconfirmed",
      waiting_for: "both",
      resolution_evidence: [],
    });
    expect(result.payload.facts[0]).toMatchObject({ id: "quantity", status: "confirmed" });
  });

  it("keeps deepseek_invalid_output when no issue row can be repaired", async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: JSON.stringify({
        issues: [{ kind: "not-an-enum", status: "???", waiting_for: 3, resolution_evidence: "nope" }],
        facts: [],
      }),
      usage: undefined,
    } as never);
    await expect(reviewWithDeepseek({ order: createOrderFromScenario(), apiKey: "sk-test" })).rejects.toMatchObject({
      code: "deepseek_invalid_output",
    });
  });

  it("fails loud when the model returns non-JSON", async () => {
    vi.mocked(generateText).mockResolvedValue({ text: "not json", usage: undefined } as never);
    await expect(reviewWithDeepseek({ order: createOrderFromScenario(), apiKey: "sk-test" })).rejects.toMatchObject({
      code: "deepseek_invalid_output",
    });
  });
});
