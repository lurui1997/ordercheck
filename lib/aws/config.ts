import type { ObjectStoreKind, PersistenceKind, ReviewEngine, ReviewEngineSelection, RuntimeConfig } from "@/lib/types";

const AWS_KEYS = [
  "AWS_REGION",
  "BEDROCK_MODEL_ID",
  "ORDERS_TABLE_NAME",
  "RAW_EMAIL_BUCKET",
  "SES_FROM_ADDRESS",
  "INBOUND_DOMAIN",
] as const;

const KNOWN_ENGINES = new Set([
  "",
  "auto",
  "bedrock",
  "gateway",
  "ai_gateway",
  "deterministic",
  "deepseek",
  "ollama",
]);

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

/** Explicit Bedrock calls still need model settings and visible credentials to count as live. */
export function isBedrockAutoReady(env: EnvLike): boolean {
  return bedrockModelConfigured(env) && hasAwsCredentials(env);
}

export function deepseekConfigured(env: EnvLike): boolean {
  return nonEmpty(env.DEEPSEEK_API_KEY);
}

export function ollamaConfigured(env: EnvLike): boolean {
  return nonEmpty(env.OLLAMA_MODEL);
}

export function smtpConfigured(env: EnvLike): boolean {
  return nonEmpty(env.SMTP_HOST) && nonEmpty(env.SMTP_FROM);
}

export interface ResolvedReviewEngine {
  engine: ReviewEngine;
  selection: ReviewEngineSelection;
  reviewEngineError?: string;
}

/**
 * Explicit REVIEW_ENGINE always wins.
 * Unset or `auto`: DeepSeek, else Ollama, else AI Gateway, else deterministic.
 * Bedrock is not on this list — only REVIEW_ENGINE=bedrock selects it.
 * A failed live call is not handled here — callers must not relabel it.
 */
export function resolveReviewEngine(env: EnvLike): ResolvedReviewEngine {
  const explicit = (env.REVIEW_ENGINE || "").trim().toLowerCase();

  if (!KNOWN_ENGINES.has(explicit)) {
    return {
      engine: "deterministic",
      selection: "explicit",
      reviewEngineError: `未知 REVIEW_ENGINE=${explicit}。可选 auto、deepseek、ollama、gateway、deterministic、bedrock。没有调用模型。`,
    };
  }

  if (explicit === "bedrock") return { engine: "bedrock", selection: "explicit" };
  if (explicit === "gateway" || explicit === "ai_gateway") return { engine: "ai_gateway", selection: "explicit" };
  if (explicit === "deterministic") return { engine: "deterministic", selection: "explicit" };
  if (explicit === "deepseek") return { engine: "deepseek", selection: "explicit" };
  if (explicit === "ollama") return { engine: "ollama", selection: "explicit" };

  if (deepseekConfigured(env)) return { engine: "deepseek", selection: "auto" };
  if (ollamaConfigured(env)) return { engine: "ollama", selection: "auto" };
  if (nonEmpty(env.AI_GATEWAY_API_KEY)) return { engine: "ai_gateway", selection: "auto" };
  return { engine: "deterministic", selection: "auto" };
}

/**
 * Live engine for compare. An explicit choice is used only when that engine is
 * configured — never swapped for another provider. Auto (or an explicit
 * deterministic review) prefers DeepSeek, then Ollama, then AI Gateway.
 * Bedrock is included only when REVIEW_ENGINE=bedrock and credentials exist.
 */
export function availableLiveEngine(env: EnvLike): ReviewEngine | null {
  const resolved = resolveReviewEngine(env);
  if (resolved.reviewEngineError) return null;
  if (resolved.selection === "explicit" && resolved.engine !== "deterministic") {
    if (resolved.engine === "deepseek") return deepseekConfigured(env) ? "deepseek" : null;
    if (resolved.engine === "ollama") return ollamaConfigured(env) ? "ollama" : null;
    if (resolved.engine === "ai_gateway") return nonEmpty(env.AI_GATEWAY_API_KEY) ? "ai_gateway" : null;
    if (resolved.engine === "bedrock") return isBedrockAutoReady(env) ? "bedrock" : null;
    return null;
  }
  if (deepseekConfigured(env)) return "deepseek";
  if (ollamaConfigured(env)) return "ollama";
  if (nonEmpty(env.AI_GATEWAY_API_KEY)) return "ai_gateway";
  return null;
}

/** Env names still required to attempt a live review. Values are never returned. */
export function missingLiveReviewEnv(env: EnvLike): string[] {
  const resolved = resolveReviewEngine(env);
  if (resolved.selection === "explicit" && resolved.engine === "deepseek" && !deepseekConfigured(env)) {
    return ["DEEPSEEK_API_KEY"];
  }
  if (resolved.selection === "explicit" && resolved.engine === "ollama" && !ollamaConfigured(env)) {
    return ["OLLAMA_MODEL"];
  }
  if (resolved.selection === "explicit" && resolved.engine === "ai_gateway" && !nonEmpty(env.AI_GATEWAY_API_KEY)) {
    return ["AI_GATEWAY_API_KEY"];
  }
  const missing: string[] = [];
  if (!deepseekConfigured(env)) missing.push("DEEPSEEK_API_KEY");
  if (!ollamaConfigured(env)) missing.push("OLLAMA_MODEL");
  if (!nonEmpty(env.AI_GATEWAY_API_KEY)) missing.push("AI_GATEWAY_API_KEY");
  if (!nonEmpty(env.AWS_REGION)) missing.push("AWS_REGION");
  if (!nonEmpty(env.BEDROCK_MODEL_ID)) missing.push("BEDROCK_MODEL_ID");
  if (!hasAwsCredentials(env)) missing.push("AWS_ACCESS_KEY_ID+AWS_SECRET_ACCESS_KEY");
  return missing;
}

export function resolvePersistence(env: EnvLike): { persistence: PersistenceKind; persistenceError?: string } {
  const explicit = (env.PERSISTENCE || "").trim().toLowerCase();
  const databaseUrl = env.DATABASE_URL?.trim();

  if (databaseUrl || explicit === "postgres") {
    if (!databaseUrl) {
      return {
        persistence: "postgres",
        persistenceError: "PERSISTENCE=postgres 需要 DATABASE_URL。没有回退到内存。",
      };
    }
    return { persistence: "postgres" };
  }
  if (explicit === "sqlite") return { persistence: "sqlite" };
  if (explicit === "memory") return { persistence: "memory" };
  if (explicit === "dynamo" || explicit === "dynamodb") {
    if (!isDynamoLive(env)) {
      return {
        persistence: "dynamodb",
        persistenceError: "PERSISTENCE=dynamodb 需要 ORDERS_TABLE_NAME、AWS_REGION 和 AWS 凭证。没有回退到内存。",
      };
    }
    return { persistence: "dynamodb" };
  }
  if (isDynamoLive(env)) return { persistence: "dynamodb" };
  return { persistence: "memory" };
}

export function resolveObjectStore(env: EnvLike): ObjectStoreKind {
  const endpoint = env.S3_ENDPOINT?.trim();
  const bucket = env.S3_BUCKET?.trim() || env.RAW_EMAIL_BUCKET?.trim();
  const access = env.S3_ACCESS_KEY?.trim() || env.AWS_ACCESS_KEY_ID?.trim();
  const secret = env.S3_SECRET_KEY?.trim() || env.AWS_SECRET_ACCESS_KEY?.trim();
  if (endpoint && bucket && access && secret) return "minio";
  if (!endpoint && env.RAW_EMAIL_BUCKET?.trim() && env.AWS_REGION?.trim()) return "s3";
  if ((env.MAIL_STORE || "").trim().toLowerCase() === "disk" || env.MAIL_DIR?.trim()) return "disk";
  return "none";
}

export function getRuntimeConfig(env: EnvLike = process.env): RuntimeConfig {
  const awsRequested = env.APP_MODE === "aws" || env.AWS_MODE === "true";
  const mode = awsRequested ? "aws" : "demo";
  const missing = mode === "aws" ? AWS_KEYS.filter((key) => !env[key]) : [];
  const bedrockReady = bedrockModelConfigured(env);
  const gatewayReady = nonEmpty(env.AI_GATEWAY_API_KEY);
  const sesReady = Boolean(env.SES_FROM_ADDRESS && env.AWS_REGION);
  const resolved = resolveReviewEngine(env);
  const sesLive = mode === "aws" && sesReady;
  const inboundReady = Boolean(env.INBOUND_WEBHOOK_SECRET?.trim());
  const { persistence, persistenceError } = resolvePersistence(env);
  const objectStore = resolveObjectStore(env);
  const dynamoConfigured = isDynamoLive(env);

  return {
    mode,
    modeLabel: mode === "aws" ? "AWS_MODE" : "DEMO_MODE",
    missing: [...missing],
    bedrockConfigured: bedrockReady,
    gatewayConfigured: gatewayReady,
    deepseekConfigured: deepseekConfigured(env),
    ollamaConfigured: ollamaConfigured(env),
    sesConfigured: sesReady,
    sesLive,
    smtpConfigured: smtpConfigured(env),
    dynamoConfigured,
    s3Configured: objectStore === "minio" || objectStore === "s3" || Boolean(env.RAW_EMAIL_BUCKET?.trim() || env.S3_BUCKET?.trim()),
    inboundConfigured: inboundReady,
    reviewEngine: resolved.engine,
    reviewEngineSelection: resolved.selection,
    reviewEngineError: resolved.reviewEngineError,
    liveEngine: availableLiveEngine(env),
    persistence,
    persistenceError,
    objectStore,
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
    case "ollama":
      return "Ollama";
    default:
      return "确定性规则引擎";
  }
}
