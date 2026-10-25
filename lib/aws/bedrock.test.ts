import { afterEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();

vi.mock("@aws-sdk/client-bedrock-runtime", () => {
  class BedrockRuntimeClient {
    send = send;
  }
  class ConverseCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  return { BedrockRuntimeClient, ConverseCommand };
});

import { IntegrationError, reviewWithBedrock, shouldRetryAfterSanitize } from "@/lib/aws/bedrock";
import { createOrderFromScenario } from "@/lib/scenario";

const goodPayload = {
  issues: [
    {
      issue_id: "delivery_milestone",
      kind: "conflict" as const,
      priority: "high" as const,
      title: "到货与提货",
      evidence: [{ message_id: "m1", quote: "delivered to our London warehouse by 20 November 2026" }],
      impact: "里程碑未对齐",
      question: "Confirm London delivery?",
      status: "unconfirmed" as const,
      waiting_for: "seller" as const,
      resolution_evidence: [],
    },
  ],
  facts: [],
};

const badPayload = {
  issues: [
    {
      issue_id: "x",
      kind: "missing" as const,
      priority: "high" as const,
      title: "x",
      evidence: [{ message_id: "m1", quote: "this quote is invented" }],
      impact: "x",
      question: "x",
      status: "unconfirmed" as const,
      waiting_for: "both" as const,
      resolution_evidence: [],
    },
  ],
  facts: [],
};

describe("reviewWithBedrock", () => {
  afterEach(() => {
    send.mockReset();
    delete process.env.BEDROCK_AGENT_RETRY;
  });

  it("throws bedrock_not_configured when model or region is missing", async () => {
    await expect(
      reviewWithBedrock({ modelId: "", region: "us-east-1", order: createOrderFromScenario() }),
    ).rejects.toMatchObject({ code: "bedrock_not_configured" });
  });

  it("returns structured payload and requestId from tool use on success", async () => {
    send.mockResolvedValue({
      $metadata: { requestId: "req-abc" },
      output: {
        message: {
          content: [{ toolUse: { toolUseId: "tool-1", name: "submit_order_review", input: goodPayload } }],
        },
      },
    });

    const result = await reviewWithBedrock({
      modelId: "amazon.nova-lite-v1:0",
      region: "us-east-1",
      order: createOrderFromScenario(),
    });
    expect(result.payload).toEqual(goodPayload);
    expect(result.requestId).toBe("req-abc");
    expect(result.agentRetries).toBe(0);
    expect(send).toHaveBeenCalledOnce();
  });

  it("retries once when evidence validation would discard too much", async () => {
    process.env.BEDROCK_AGENT_RETRY = "1";
    send
      .mockResolvedValueOnce({
        $metadata: { requestId: "req-1" },
        output: {
          message: {
            content: [{ toolUse: { toolUseId: "tool-1", name: "submit_order_review", input: badPayload } }],
          },
        },
      })
      .mockResolvedValueOnce({
        $metadata: { requestId: "req-2" },
        output: {
          message: {
            content: [{ toolUse: { toolUseId: "tool-2", name: "submit_order_review", input: goodPayload } }],
          },
        },
      });

    const result = await reviewWithBedrock({
      modelId: "amazon.nova-lite-v1:0",
      region: "us-east-1",
      order: createOrderFromScenario(),
    });
    expect(result.payload).toEqual(goodPayload);
    expect(result.agentRetries).toBe(1);
    expect(result.requestId).toBe("req-2");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("maps SDK failures to bedrock_call_failed", async () => {
    send.mockRejectedValue(new Error("AccessDenied"));
    await expect(
      reviewWithBedrock({
        modelId: "amazon.nova-lite-v1:0",
        region: "us-east-1",
        order: createOrderFromScenario(),
      }),
    ).rejects.toBeInstanceOf(IntegrationError);
    await expect(
      reviewWithBedrock({
        modelId: "amazon.nova-lite-v1:0",
        region: "us-east-1",
        order: createOrderFromScenario(),
      }),
    ).rejects.toMatchObject({ code: "bedrock_call_failed" });
  });

  it("shouldRetryAfterSanitize detects majority drops", () => {
    const order = createOrderFromScenario();
    expect(shouldRetryAfterSanitize(badPayload, order)).toBe(true);
    expect(shouldRetryAfterSanitize(goodPayload, order)).toBe(false);
  });
});
