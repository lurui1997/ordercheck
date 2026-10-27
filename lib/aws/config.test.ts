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

  it("does not auto-select bedrock even when model settings and AWS credentials exist", () => {
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
    expect(withKeys.reviewEngine).toBe("deterministic");
    expect(withKeys.reviewEngineSelection).toBe("auto");
    expect(withKeys.liveEngine).toBeNull();
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

  it("auto prefers deepseek over gateway and does not select bedrock", () => {
    const config = getRuntimeConfig({
      REVIEW_ENGINE: "auto",
      AI_GATEWAY_API_KEY: "gateway-key",
      DEEPSEEK_API_KEY: "sk-test",
      AWS_REGION: "us-east-1",
      BEDROCK_MODEL_ID: "amazon.nova-lite-v1:0",
      AWS_ACCESS_KEY_ID: "AKIA_TEST",
      AWS_SECRET_ACCESS_KEY: "secret",
    });
    expect(config.reviewEngine).toBe("deepseek");
    expect(config.liveEngine).toBe("deepseek");
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

  it("keeps SES live in AWS mode but does not select bedrock unless asked", () => {
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
    expect(config.reviewEngine).toBe("deterministic");
    expect(config.reviewEngineSelection).toBe("auto");
    expect(config.liveEngine).toBeNull();
    expect(config.dynamoConfigured).toBe(true);
    expect(config.sesLive).toBe(true);
    expect(config.persistence).toBe("dynamodb");
    expect(config.objectStore).toBe("s3");
    expect(config.inboundConfigured).toBe(true);
    expect(config.missing).toEqual([]);
  });

  it("selects bedrock only when REVIEW_ENGINE=bedrock", () => {
    const config = getRuntimeConfig({
      APP_MODE: "aws",
      REVIEW_ENGINE: "bedrock",
      AWS_REGION: "us-east-1",
      BEDROCK_MODEL_ID: "amazon.nova-lite-v1:0",
    });
    expect(config.reviewEngine).toBe("bedrock");
  });

  it("auto order is deepseek, then ollama, then gateway, then deterministic", () => {
    expect(
      getRuntimeConfig({
        REVIEW_ENGINE: "auto",
        DEEPSEEK_API_KEY: "sk-test",
        OLLAMA_MODEL: "qwen2.5",
        AI_GATEWAY_API_KEY: "gw",
      }).reviewEngine,
    ).toBe("deepseek");

    expect(
      getRuntimeConfig({
        REVIEW_ENGINE: "auto",
        OLLAMA_MODEL: "qwen2.5",
        AI_GATEWAY_API_KEY: "gw",
      }).reviewEngine,
    ).toBe("ollama");

    expect(getRuntimeConfig({ REVIEW_ENGINE: "auto", AI_GATEWAY_API_KEY: "gw" }).reviewEngine).toBe("ai_gateway");
    expect(getRuntimeConfig({ REVIEW_ENGINE: "auto" }).reviewEngine).toBe("deterministic");
  });

  it("does not treat an explicit ollama/deepseek label as bedrock", () => {
    const deepseek = getRuntimeConfig({ REVIEW_ENGINE: "deepseek", DEEPSEEK_API_KEY: "sk-test" });
    expect(deepseek.reviewEngine).toBe("deepseek");
    expect(deepseek.deepseekConfigured).toBe(true);
    expect(deepseek.bedrockConfigured).toBe(false);

    const ollama = getRuntimeConfig({
      REVIEW_ENGINE: "ollama",
      OLLAMA_BASE_URL: "http://127.0.0.1:11434/v1",
      OLLAMA_MODEL: "llama3.1",
    });
    expect(ollama.reviewEngine).toBe("ollama");
    expect(ollama.ollamaConfigured).toBe(true);
  });

  it("reports smtp, postgres, and minio when those env vars are set", () => {
    const config = getRuntimeConfig({
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "1025",
      SMTP_FROM: "seller@example.com",
      DATABASE_URL: "postgres://ordercheck:ordercheck@127.0.0.1:5432/ordercheck",
      S3_ENDPOINT: "http://127.0.0.1:9000",
      S3_ACCESS_KEY: "ordercheck",
      S3_SECRET_KEY: "ordercheck-secret",
      S3_BUCKET: "ordercheck-mail",
      S3_FORCE_PATH_STYLE: "true",
    });
    expect(config.smtpConfigured).toBe(true);
    expect(config.sesLive).toBe(false);
    expect(config.persistence).toBe("postgres");
    expect(config.objectStore).toBe("minio");
    expect(config.s3Configured).toBe(true);
  });

  it("uses sqlite only when PERSISTENCE=sqlite and postgres is absent", () => {
    expect(getRuntimeConfig({ PERSISTENCE: "sqlite" }).persistence).toBe("sqlite");
    expect(
      getRuntimeConfig({
        PERSISTENCE: "sqlite",
        DATABASE_URL: "postgres://localhost/ordercheck",
      }).persistence,
    ).toBe("postgres");
    expect(getRuntimeConfig({}).persistence).toBe("memory");
    expect(getRuntimeConfig({ MAIL_STORE: "disk" }).objectStore).toBe("disk");
  });

  it("fails closed on an unknown REVIEW_ENGINE", () => {
    const config = getRuntimeConfig({ REVIEW_ENGINE: "magic" });
    expect(config.reviewEngineError).toMatch(/未知 REVIEW_ENGINE/);
    expect(config.reviewEngine).not.toBe("bedrock");
  });
});
