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
import { DEFAULT_DEEPSEEK_BASE_URL, DEFAULT_DEEPSEEK_MODEL, DeepSeekError, reviewWithDeepseek } from "@/lib/deepseek";

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

  it("fails loud when the model returns non-JSON", async () => {
    vi.mocked(generateText).mockResolvedValue({ text: "not json", usage: undefined } as never);
    await expect(reviewWithDeepseek({ order: createOrderFromScenario(), apiKey: "sk-test" })).rejects.toMatchObject({
      code: "deepseek_invalid_output",
    });
  });
});
