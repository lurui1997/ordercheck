import type { ReviewEngine, RuntimeConfig } from "@/lib/types";

const AWS_KEYS = [
  "AWS_REGION",
  "BEDROCK_MODEL_ID",
  "ORDERS_TABLE_NAME",
  "RAW_EMAIL_BUCKET",
  "SES_FROM_ADDRESS",
  "INBOUND_DOMAIN",
] as const;

type EnvLike = Record<string, string | undefined>;

function resolveReviewEngine(env: EnvLike, mode: "demo" | "aws"): ReviewEngine {
  const explicit = (env.REVIEW_ENGINE || "").trim().toLowerCase();

  if (explicit === "bedrock") return "bedrock";
  if (explicit === "gateway" || explicit === "ai_gateway") return "ai_gateway";
  if (explicit === "deterministic") return "deterministic";

  // AWS mode defaults to Bedrock (required path). No silent gateway fallback.
  if (mode === "aws") return "bedrock";

  // Demo defaults to the deterministic fixture engine.
  return "deterministic";
}

export function getRuntimeConfig(env: EnvLike = process.env): RuntimeConfig {
  const awsRequested = env.APP_MODE === "aws" || env.AWS_MODE === "true";
  const mode = awsRequested ? "aws" : "demo";
  const missing = mode === "aws" ? AWS_KEYS.filter((key) => !env[key]) : [];
  const bedrockConfigured = Boolean(env.AWS_REGION && env.BEDROCK_MODEL_ID);
  const gatewayConfigured = Boolean(env.AI_GATEWAY_API_KEY);
  const sesConfigured = Boolean(env.SES_FROM_ADDRESS && env.AWS_REGION);
  const reviewEngine = resolveReviewEngine(env, mode);
  // Live SES only in AWS mode when from-address + region are set.
  const sesLive = mode === "aws" && sesConfigured;
  const inboundConfigured = Boolean(env.INBOUND_WEBHOOK_SECRET);

  return {
    mode,
    modeLabel: mode === "aws" ? "AWS_MODE" : "DEMO_MODE",
    missing: [...missing],
    bedrockConfigured,
    gatewayConfigured,
    sesConfigured,
    sesLive,
    dynamoConfigured: Boolean(env.ORDERS_TABLE_NAME),
    s3Configured: Boolean(env.RAW_EMAIL_BUCKET),
    inboundConfigured,
    reviewEngine,
  };
}

export function reviewEngineLabel(engine: ReviewEngine): string {
  switch (engine) {
    case "bedrock":
      return "Amazon Bedrock";
    case "ai_gateway":
      return "Vercel AI Gateway";
    default:
      return "确定性规则引擎";
  }
}
