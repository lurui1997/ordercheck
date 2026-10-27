import { afterEach, describe, expect, it, vi } from "vitest";
import { createOrderFromScenario } from "@/lib/scenario";
import { reviewOrder } from "@/lib/review/engine";

const send = vi.fn();

vi.mock("@/lib/deepseek", async () => {
  const actual = await vi.importActual<typeof import("@/lib/deepseek")>("@/lib/deepseek");
  return { ...actual, draftWithDeepseek: vi.fn() };
});

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

import { DeepSeekError, draftWithDeepseek } from "@/lib/deepseek";
import { draftWithModel } from "@/lib/review/draft-model";

function reviewedOrder() {
  const base = createOrderFromScenario();
  const result = reviewOrder(base);
  if (!result.ok) throw new Error(result.error);
  return result.order;
}

describe("draftWithModel", () => {
  afterEach(() => {
    send.mockReset();
    vi.mocked(draftWithDeepseek).mockReset();
  });

  it("uses deterministic engine by default and labels honestly", async () => {
    const order = reviewedOrder();
    const ids = order.issues.filter((i) => i.priority === "high").map((i) => i.issue_id);
    const result = await draftWithModel(order, ids, { APP_MODE: "demo" });
    expect(result.draftEngine).toBe("deterministic");
    expect(result.draft.subject.length).toBeGreaterThan(0);
    expect(result.draft.body.length).toBeGreaterThan(0);
    expect(result.draft.issue_ids.length).toBeGreaterThan(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("falls back to deterministic and never labels bedrock when Converse fails", async () => {
    send.mockRejectedValue(new Error("no credentials"));
    const order = reviewedOrder();
    const ids = ["delivery_milestone", "sample_version", "inserts_scope"];
    const result = await draftWithModel(order, ids, {
      APP_MODE: "demo",
      REVIEW_ENGINE: "bedrock",
      AWS_REGION: "us-east-1",
      BEDROCK_MODEL_ID: "amazon.nova-lite-v1:0",
    });

    expect(result.draftEngine).toBe("deterministic");
    expect(result.notice).toMatch(/fell back to deterministic/i);
    expect(result.draftEngine).not.toBe("bedrock");
    expect(result.draft.body.length).toBeGreaterThan(0);
    expect(send).toHaveBeenCalled();
  });

  it("labels bedrock when Converse returns a tool draft", async () => {
    send.mockResolvedValue({
      output: {
        message: {
          content: [
            {
              toolUse: {
                name: "submit_confirmation_email_draft",
                input: {
                  subject: "Please confirm open points - DEMO-001",
                  body: "Hi Buyer, please confirm London delivery and sample v2.",
                },
              },
            },
          ],
        },
      },
      $metadata: { requestId: "draft-req-1" },
    });

    const order = reviewedOrder();
    const result = await draftWithModel(order, ["delivery_milestone"], {
      REVIEW_ENGINE: "bedrock",
      AWS_REGION: "us-east-1",
      BEDROCK_MODEL_ID: "amazon.nova-lite-v1:0",
    });

    expect(result.draftEngine).toBe("bedrock");
    expect(result.draft.subject).toContain("DEMO-001");
    expect(result.draft.body).toMatch(/London delivery/i);
    expect(send).toHaveBeenCalled();
  });

  it("labels deepseek drafts as deepseek", async () => {
    vi.mocked(draftWithDeepseek).mockResolvedValue({
      from: "seller@example.com",
      to: "buyer@example.com",
      subject: "Please confirm",
      body: "Please confirm sample v2.",
      issue_ids: ["sample_version"],
    });
    const order = reviewedOrder();
    const result = await draftWithModel(order, ["sample_version"], {
      REVIEW_ENGINE: "deepseek",
      DEEPSEEK_API_KEY: "sk-test",
    });
    expect(result.draftEngine).toBe("deepseek");
    expect(result.notice).toMatch(/DeepSeek/);
    expect(result.notice).toMatch(/not Bedrock/i);
  });

  it("throws on deepseek draft failure instead of returning a deterministic draft", async () => {
    vi.mocked(draftWithDeepseek).mockRejectedValue(new DeepSeekError("deepseek_call_failed", "nope"));
    const order = reviewedOrder();
    await expect(
      draftWithModel(order, ["sample_version"], {
        REVIEW_ENGINE: "deepseek",
        DEEPSEEK_API_KEY: "sk-test",
      }),
    ).rejects.toMatchObject({ code: "deepseek_call_failed" });
  });
});
