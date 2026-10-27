import type { ReviewEngine, ReviewEngineSelection, RuntimeConfig } from "@/lib/types";

const AWS_KEYS = [
  "AWS_REGION",
  "BEDROCK_MODEL_ID",
  "ORDERS_TABLE_NAME",
  "RAW_EMAIL_BUCKET",
  "SES_FROM_ADDRESS",
  "INBOUND_DOMAIN",
] as const;

type EnvLike = Record<string, string | undefined>;

function nonEmpty(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}

/** Static or ambient AWS credentials visible in the environment. Never reads secret values into logs. */
export function hasAwsCredentials(env: EnvLike): boolean {
  if (nonEmpty(env.AWS_ACCESS_KEY_ID) && nonEmpty(env.AWS_SECRET_ACCESS_KEY)) return true;
  if (nonEmpty(env.AWS_WEB_IDENTITY_TOKEN_FILE)) return true;
  if (nonEmpty(env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI)) return true;
  return false;
}

/**
 * DynamoDB is live only when the table, region, and credentials are all present.
 * A table name without credentials is not "dynamo: true".
 */
export function isDynamoLive(env: EnvLike): boolean {
  return nonEmpty(env.ORDERS_TABLE_NAME) && nonEmpty(env.AWS_REGION) && hasAwsCredentials(env);
}

function bedrockModelConfigured(env: EnvLike): boolean {
  return nonEmpty(env.AWS_REGION) && nonEmpty(env.BEDROCK_MODEL_ID);
}

/** Auto path may call Bedrock only when model settings and credentials are both visible. */
export function isBedrockAutoReady(env: EnvLike): boolean {
  return bedrockModelConfigured(env) && hasAwsCredentials(env);
}

export interface ResolvedReviewEngine {
  engine: ReviewEngine;
  selection: ReviewEngineSelection;
}

/**
 * Explicit REVIEW_ENGINE always wins.
 * Unset or `auto`: AI Gateway if configured, else DeepSeek if `DEEPSEEK_API_KEY`
 * is set, else Bedrock if AWS credentials and model settings exist, else deterministic.
 * A failed live call is not handled here — callers must not relabel it.
 */
export function resolveReviewEngine(env: EnvLike): ResolvedReviewEngine {
  const explicit = (env.REVIEW_ENGINE || "").trim().toLowerCase();

  if (explicit === "bedrock") return { engine: "bedrock", selection: "explicit" };
  if (explicit === "gateway" || explicit === "ai_gateway") return { engine: "ai_gateway", selection: "explicit" };
  if (explicit === "deepseek") return { engine: "deepseek", selection: "explicit" };
  if (explicit === "deterministic") return { engine: "deterministic", selection: "explicit" };

  if (nonEmpty(env.AI_GATEWAY_API_KEY)) return { engine: "ai_gateway", selection: "auto" };
  if (nonEmpty(env.DEEPSEEK_API_KEY)) return { engine: "deepseek", selection: "auto" };
  if (isBedrockAutoReady(env)) return { engine: "bedrock", selection: "auto" };
  return { engine: "deterministic", selection: "auto" };
}

/**
 * Live engine for compare. An explicit bedrock / gateway / deepseek choice is
 * used only when that engine is actually configured — never swapped for another
 * provider. Auto (or an explicit deterministic review) prefers Gateway, then
 * DeepSeek, then credentialed Bedrock.
 */
export function availableLiveEngine(env: EnvLike): ReviewEngine | null {
  const resolved = resolveReviewEngine(env);
  if (resolved.selection === "explicit" && resolved.engine !== "deterministic") {
    if (resolved.engine === "deepseek") return nonEmpty(env.DEEPSEEK_API_KEY) ? "deepseek" : null;
    if (resolved.engine === "ai_gateway") return nonEmpty(env.AI_GATEWAY_API_KEY) ? "ai_gateway" : null;
    if (resolved.engine === "bedrock") return isBedrockAutoReady(env) ? "bedrock" : null;
    return null;
  }
  if (nonEmpty(env.AI_GATEWAY_API_KEY)) return "ai_gateway";
  if (nonEmpty(env.DEEPSEEK_API_KEY)) return "deepseek";
  if (isBedrockAutoReady(env)) return "bedrock";
  return null;
}

/** Env names still required to attempt a live review. Values are never returned. */
export function missingLiveReviewEnv(env: EnvLike): string[] {
  const missing: string[] = [];
  const resolved = resolveReviewEngine(env);
  if (resolved.selection === "explicit" && resolved.engine === "deepseek" && !nonEmpty(env.DEEPSEEK_API_KEY)) {
    return ["DEEPSEEK_API_KEY"];
  }
  if (!nonEmpty(env.AI_GATEWAY_API_KEY)) missing.push("AI_GATEWAY_API_KEY");
  if (!nonEmpty(env.DEEPSEEK_API_KEY)) missing.push("DEEPSEEK_API_KEY");
  if (!nonEmpty(env.AWS_REGION)) missing.push("AWS_REGION");
  if (!nonEmpty(env.BEDROCK_MODEL_ID)) missing.push("BEDROCK_MODEL_ID");
  if (!hasAwsCredentials(env)) missing.push("AWS_ACCESS_KEY_ID+AWS_SECRET_ACCESS_KEY");
  return missing;
}

export function getRuntimeConfig(env: EnvLike = process.env): RuntimeConfig {
  const awsRequested = env.APP_MODE === "aws" || env.AWS_MODE === "true";
  const mode = awsRequested ? "aws" : "demo";
  const missing = mode === "aws" ? AWS_KEYS.filter((key) => !env[key]) : [];
  const bedrockConfigured = bedrockModelConfigured(env);
  const gatewayConfigured = nonEmpty(env.AI_GATEWAY_API_KEY);
  const deepseekConfigured = nonEmpty(env.DEEPSEEK_API_KEY);
  const sesConfigured = Boolean(env.SES_FROM_ADDRESS && env.AWS_REGION);
  const resolved = resolveReviewEngine(env);
  // Live SES only in AWS mode when from-address + region are set.
  const sesLive = mode === "aws" && sesConfigured;
  const inboundConfigured = Boolean(env.INBOUND_WEBHOOK_SECRET);
  const dynamoConfigured = isDynamoLive(env);

  return {
    mode,
    modeLabel: mode === "aws" ? "AWS_MODE" : "DEMO_MODE",
    missing: [...missing],
    bedrockConfigured,
    gatewayConfigured,
    deepseekConfigured,
    sesConfigured,
    sesLive,
    dynamoConfigured,
    persistence: dynamoConfigured ? "dynamodb" : "memory",
    s3Configured: Boolean(env.RAW_EMAIL_BUCKET),
    inboundConfigured,
    reviewEngine: resolved.engine,
    reviewEngineSelection: resolved.selection,
    liveEngine: availableLiveEngine(env),
  };
}

export function reviewEngineLabel(engine: ReviewEngine): string {
  switch (engine) {
    case "bedrock":
      return "Amazon Bedrock";
    case "ai_gateway":
      return "Vercel AI Gateway";
    case "deepseek":
      return "DeepSeek";
    default:
      return "确定性规则引擎";
  }
}
