import { afterEach, describe, expect, it, vi } from "vitest";
import { createOrderFromScenario } from "@/lib/scenario";
import { getRuntimeConfig } from "@/lib/aws/config";

vi.mock("@/lib/aws/bedrock", async () => {
  const actual = await vi.importActual<typeof import("@/lib/aws/bedrock")>("@/lib/aws/bedrock");
  return { ...actual, reviewWithBedrock: vi.fn() };
});

vi.mock("@/lib/aws/gateway", async () => {
  const actual = await vi.importActual<typeof import("@/lib/aws/gateway")>("@/lib/aws/gateway");
  return { ...actual, reviewWithGateway: vi.fn() };
});

import { reviewWithBedrock } from "@/lib/aws/bedrock";
import { GatewayError, reviewWithGateway } from "@/lib/aws/gateway";
import { compareReviews } from "@/lib/review/compare";

const liveIssue = {
  issue_id: "sample_version",
  kind: "conflict" as const,
  priority: "high" as const,
  title: "样品版本不一致",
  evidence: [
    { message_id: "m1", quote: "based on sample v2" },
    { message_id: "m3", quote: "based on sample v1" },
  ],
  impact: "版本不同",
  question: "Which sample?",
  status: "unconfirmed" as const,
  waiting_for: "both" as const,
  resolution_evidence: [],
};

describe("compareReviews", () => {
  afterEach(() => {
    vi.mocked(reviewWithBedrock).mockReset();
    vi.mocked(reviewWithGateway).mockReset();
  });

  it("shows deterministic issues and a live-unavailable panel when no live engine is configured", async () => {
    const env = { APP_MODE: "demo" };
    const result = await compareReviews(createOrderFromScenario(), env, getRuntimeConfig(env));
    expect(result.deterministic.ok).toBe(true);
    expect(result.deterministic.engine).toBe("deterministic");
    expect(result.deterministic.issues.map((issue) => issue.issue_id)).toContain("delivery_milestone");
    expect(result.live.available).toBe(false);
    expect(result.live.ran).toBe(false);
    expect(result.live.issues).toEqual([]);
    expect(result.live.missing).toEqual(
      expect.arrayContaining(["AI_GATEWAY_API_KEY", "AWS_REGION", "BEDROCK_MODEL_ID"]),
    );
    expect(result.agreement.comparable).toBe(false);
    expect(result.agreement.jaccard).toBeNull();
    expect(reviewWithGateway).not.toHaveBeenCalled();
    expect(reviewWithBedrock).not.toHaveBeenCalled();
  });

  it("compares gateway issues without copying them onto a failed live call", async () => {
    vi.mocked(reviewWithGateway).mockRejectedValue(new GatewayError("gateway_call_failed", "gateway down"));
    const env = { APP_MODE: "demo", AI_GATEWAY_API_KEY: "test-key" };
    const result = await compareReviews(createOrderFromScenario(), env, getRuntimeConfig(env));
    expect(result.deterministic.issues.length).toBeGreaterThan(0);
    expect(result.live.ran).toBe(true);
    expect(result.live.ok).toBe(false);
    expect(result.live.engine).toBe("ai_gateway");
    expect(result.live.issues).toEqual([]);
    expect(result.live.code).toBe("gateway_call_failed");
    expect(result.agreement.comparable).toBe(false);
    expect(reviewWithBedrock).not.toHaveBeenCalled();
  });

  it("reports shared and engine-only issue ids when both sides succeed", async () => {
    vi.mocked(reviewWithGateway).mockResolvedValue({
      payload: { issues: [liveIssue], facts: [] },
      usage: { totalTokens: 11 },
    });
    const env = {
      APP_MODE: "demo",
      REVIEW_ENGINE: "deterministic",
      AI_GATEWAY_API_KEY: "test-key",
    };
    const result = await compareReviews(createOrderFromScenario(), env, getRuntimeConfig(env));
    expect(result.live.engine).toBe("ai_gateway");
    expect(result.live.ok).toBe(true);
    expect(result.agreement.comparable).toBe(true);
    expect(result.agreement.shared).toContain("sample_version");
    expect(result.agreement.onlyDeterministic).toContain("delivery_milestone");
    expect(result.agreement.onlyLive).toEqual([]);
    expect(result.agreement.jaccard).toBeLessThan(1);
    expect(reviewWithBedrock).not.toHaveBeenCalled();
  });
});
