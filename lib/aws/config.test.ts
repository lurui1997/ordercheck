import { describe, expect, it } from "vitest";
import { getRuntimeConfig } from "@/lib/aws/config";

describe("getRuntimeConfig", () => {
  it("defaults demo to deterministic review and recorded SES", () => {
    const config = getRuntimeConfig({ APP_MODE: "demo" });
    expect(config.modeLabel).toBe("DEMO_MODE");
    expect(config.reviewEngine).toBe("deterministic");
    expect(config.sesLive).toBe(false);
    expect(config.inboundConfigured).toBe(false);
  });

  it("selects bedrock when REVIEW_ENGINE=bedrock in demo", () => {
    const config = getRuntimeConfig({
      APP_MODE: "demo",
      REVIEW_ENGINE: "bedrock",
      AWS_REGION: "us-east-1",
      BEDROCK_MODEL_ID: "amazon.nova-lite-v1:0",
    });
    expect(config.reviewEngine).toBe("bedrock");
    expect(config.bedrockConfigured).toBe(true);
  });

  it("selects ai_gateway when REVIEW_ENGINE=gateway", () => {
    const config = getRuntimeConfig({
      APP_MODE: "demo",
      REVIEW_ENGINE: "gateway",
      AI_GATEWAY_API_KEY: "test-key",
    });
    expect(config.reviewEngine).toBe("ai_gateway");
    expect(config.gatewayConfigured).toBe(true);
  });

  it("requires bedrock path in AWS mode and enables sesLive when configured", () => {
    const config = getRuntimeConfig({
      APP_MODE: "aws",
      AWS_REGION: "us-east-1",
      BEDROCK_MODEL_ID: "amazon.nova-lite-v1:0",
      SES_FROM_ADDRESS: "seller@example.com",
      ORDERS_TABLE_NAME: "orders",
      RAW_EMAIL_BUCKET: "bucket",
      INBOUND_DOMAIN: "mail.example.com",
      INBOUND_WEBHOOK_SECRET: "hook",
    });
    expect(config.modeLabel).toBe("AWS_MODE");
    expect(config.reviewEngine).toBe("bedrock");
    expect(config.sesLive).toBe(true);
    expect(config.inboundConfigured).toBe(true);
    expect(config.missing).toEqual([]);
  });
});
