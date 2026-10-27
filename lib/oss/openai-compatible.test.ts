import { describe, expect, it, vi } from "vitest";
import { createOrderFromScenario } from "@/lib/scenario";
import {
  ChatProviderError,
  DEFAULT_OLLAMA_BASE_URL,
  parseReviewPayload,
  resolveChatSettings,
  reviewWithOpenAICompatible,
} from "@/lib/oss/openai-compatible";

const reviewJson = JSON.stringify({
  issues: [
    {
      issue_id: "delivery_milestone",
      kind: "conflict",
      priority: "high",
      title: "到货与提货未对齐",
      evidence: [{ message_id: "m1", quote: "delivered to our London warehouse by 20 November 2026" }],
      impact: "里程碑不同",
      question: "Confirm London delivery?",
      status: "unconfirmed",
      waiting_for: "seller",
      resolution_evidence: [],
    },
  ],
  facts: [],
});

function jsonResponse(body: unknown, status = 200, requestId = "req-ds-1"): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "x-request-id": requestId },
  });
}

describe("OpenAI-compatible review", () => {
  it("defaults Ollama base URL and requires a model", () => {
    expect(resolveChatSettings({ OLLAMA_MODEL: "qwen2.5" }, "ollama")).toMatchObject({
      baseUrl: DEFAULT_OLLAMA_BASE_URL,
      model: "qwen2.5",
    });
    expect(resolveChatSettings({}, "ollama")).toBeNull();
    expect(resolveChatSettings({}, "deepseek")).toBeNull();
  });

  it("calls DeepSeek chat completions and labels the payload source as deepseek", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://api.deepseek.com/v1/chat/completions");
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("deepseek-chat");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
      return jsonResponse({
        choices: [{ message: { content: reviewJson } }],
        usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
      });
    });

    const result = await reviewWithOpenAICompatible({
      engine: "deepseek",
      order: createOrderFromScenario(),
      env: { DEEPSEEK_API_KEY: "sk-test" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.model).toBe("deepseek-chat");
    expect(result.requestId).toBe("req-ds-1");
    expect(result.usage?.totalTokens).toBe(14);
    expect(result.payload.issues[0]?.issue_id).toBe("delivery_milestone");
    expect(JSON.stringify(result)).not.toMatch(/bedrock/i);
  });

  it("posts to the Ollama /v1 endpoint and does not require an API key", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("http://127.0.0.1:11434/v1/chat/completions");
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
      return jsonResponse(
        { choices: [{ message: { content: reviewJson } }] },
        200,
        "ollama-req",
      );
    });

    const result = await reviewWithOpenAICompatible({
      engine: "ollama",
      order: createOrderFromScenario(),
      env: { OLLAMA_MODEL: "qwen2.5" },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.model).toBe("qwen2.5");
    expect(result.requestId).toBe("ollama-req");
  });

  it("fails closed when the provider returns a non-JSON body", () => {
    expect(() => parseReviewPayload("deepseek", "not json")).toThrow(ChatProviderError);
    try {
      parseReviewPayload("ollama", "hello");
    } catch (error) {
      expect(error).toMatchObject({ code: "ollama_invalid_output", engine: "ollama" });
    }
  });

  it("fails closed on HTTP errors without inventing a review", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 }));
    await expect(
      reviewWithOpenAICompatible({
        engine: "deepseek",
        order: createOrderFromScenario(),
        env: { DEEPSEEK_API_KEY: "sk-test" },
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "deepseek_call_failed", engine: "deepseek" });
  });
});
