import { describe, expect, it } from "vitest";
import { getRuntimeConfig } from "@/lib/aws/config";

describe("getRuntimeConfig", () => {
  it("defaults demo to deterministic review and recorded SES", () => {
    const config = getRuntimeConfig({ APP_MODE: "demo" });
    expect(config.modeLabel).toBe("DEMO_MODE");
    expect(config.reviewEngine).toBe("deterministic");
    expect(config.reviewEngineSelection).toBe("auto");
    expect(config.liveEngine).toBeNull();
    expect(config.persistence).toBe("memory");
    expect(config.dynamoConfigured).toBe(false);
    expect(config.sesLive).toBe(false);
    expect(config.inboundConfigured).toBe(false);
  });

  it("auto prefers gateway when the API key is set", () => {
    const config = getRuntimeConfig({
      APP_MODE: "demo",
      AI_GATEWAY_API_KEY: "test-key",
      AWS_REGION: "us-east-1",
      BEDROCK_MODEL_ID: "amazon.nova-lite-v1:0",
      AWS_ACCESS_KEY_ID: "AKIA_TEST",
      AWS_SECRET_ACCESS_KEY: "secret",
    });
    expect(config.reviewEngine).toBe("ai_gateway");
    expect(config.reviewEngineSelection).toBe("auto");
    expect(config.liveEngine).toBe("ai_gateway");
  });

  it("keeps an explicit deterministic override even when gateway is configured", () => {
    const config = getRuntimeConfig({
      APP_MODE: "demo",
      REVIEW_ENGINE: "deterministic",
      AI_GATEWAY_API_KEY: "test-key",
    });
    expect(config.reviewEngine).toBe("deterministic");
    expect(config.reviewEngineSelection).toBe("explicit");
    expect(config.liveEngine).toBe("ai_gateway");
  });

  it("auto selects bedrock only when model settings and AWS credentials exist", () => {
    const withoutKeys = getRuntimeConfig({
      APP_MODE: "aws",
      AWS_REGION: "us-east-1",
      BEDROCK_MODEL_ID: "amazon.nova-lite-v1:0",
      ORDERS_TABLE_NAME: "orders",
    });
    expect(withoutKeys.reviewEngine).toBe("deterministic");
    expect(withoutKeys.dynamoConfigured).toBe(false);
    expect(withoutKeys.persistence).toBe("memory");

    const withKeys = getRuntimeConfig({
      REVIEW_ENGINE: "auto",
      AWS_REGION: "us-east-1",
      BEDROCK_MODEL_ID: "amazon.nova-lite-v1:0",
      AWS_ACCESS_KEY_ID: "AKIA_TEST",
      AWS_SECRET_ACCESS_KEY: "secret",
      ORDERS_TABLE_NAME: "orders",
    });
    expect(withKeys.reviewEngine).toBe("bedrock");
    expect(withKeys.reviewEngineSelection).toBe("auto");
    expect(withKeys.liveEngine).toBe("bedrock");
    expect(withKeys.dynamoConfigured).toBe(true);
    expect(withKeys.persistence).toBe("dynamodb");
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

  it("selects deepseek when REVIEW_ENGINE=deepseek and does not relabel gateway", () => {
    const config = getRuntimeConfig({
      APP_MODE: "demo",
      REVIEW_ENGINE: "deepseek",
      DEEPSEEK_API_KEY: "sk-test",
      AI_GATEWAY_API_KEY: "gateway-key",
    });
    expect(config.reviewEngine).toBe("deepseek");
    expect(config.reviewEngineSelection).toBe("explicit");
    expect(config.deepseekConfigured).toBe(true);
    expect(config.liveEngine).toBe("deepseek");
    expect(config.gatewayConfigured).toBe(true);
  });

  it("auto uses deepseek when gateway is absent and the DeepSeek key is set", () => {
    const config = getRuntimeConfig({
      APP_MODE: "demo",
      DEEPSEEK_API_KEY: "sk-test",
      AWS_REGION: "us-east-1",
      BEDROCK_MODEL_ID: "amazon.nova-lite-v1:0",
      AWS_ACCESS_KEY_ID: "AKIA_TEST",
      AWS_SECRET_ACCESS_KEY: "secret",
    });
    expect(config.reviewEngine).toBe("deepseek");
    expect(config.liveEngine).toBe("deepseek");
  });

  it("auto still prefers gateway over deepseek", () => {
    const config = getRuntimeConfig({
      REVIEW_ENGINE: "auto",
      AI_GATEWAY_API_KEY: "gateway-key",
      DEEPSEEK_API_KEY: "sk-test",
    });
    expect(config.reviewEngine).toBe("ai_gateway");
    expect(config.liveEngine).toBe("ai_gateway");
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

  it("selects bedrock in AWS mode when credentials exist and enables sesLive when configured", () => {
    const config = getRuntimeConfig({
      APP_MODE: "aws",
      AWS_REGION: "us-east-1",
      BEDROCK_MODEL_ID: "amazon.nova-lite-v1:0",
      AWS_ACCESS_KEY_ID: "AKIA_TEST",
      AWS_SECRET_ACCESS_KEY: "secret",
      SES_FROM_ADDRESS: "seller@example.com",
      ORDERS_TABLE_NAME: "orders",
      RAW_EMAIL_BUCKET: "bucket",
      INBOUND_DOMAIN: "mail.example.com",
      INBOUND_WEBHOOK_SECRET: "hook",
    });
    expect(config.modeLabel).toBe("AWS_MODE");
    expect(config.reviewEngine).toBe("bedrock");
    expect(config.reviewEngineSelection).toBe("auto");
    expect(config.dynamoConfigured).toBe(true);
    expect(config.sesLive).toBe(true);
    expect(config.inboundConfigured).toBe(true);
    expect(config.missing).toEqual([]);
  });
});
