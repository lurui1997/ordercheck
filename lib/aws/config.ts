import type { ObjectStoreKind, PersistenceKind, ReviewEngine, RuntimeConfig } from "@/lib/types";

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

export function deepseekConfigured(env: EnvLike): boolean {
  return Boolean(env.DEEPSEEK_API_KEY?.trim());
}

export function ollamaConfigured(env: EnvLike): boolean {
  return Boolean(env.OLLAMA_MODEL?.trim());
}

export function smtpConfigured(env: EnvLike): boolean {
  return Boolean(env.SMTP_HOST?.trim() && env.SMTP_FROM?.trim());
}

/**
 * Preference when REVIEW_ENGINE is empty or auto.
 * Bedrock is never chosen here — only REVIEW_ENGINE=bedrock.
 */
export function selectAutoReviewEngine(env: EnvLike): ReviewEngine {
  if (deepseekConfigured(env)) return "deepseek";
  if (ollamaConfigured(env)) return "ollama";
  if (env.AI_GATEWAY_API_KEY?.trim()) return "ai_gateway";
  return "deterministic";
}

export function resolveReviewEngine(
  env: EnvLike,
): { reviewEngine: ReviewEngine; reviewEngineError?: string } {
  const explicit = (env.REVIEW_ENGINE || "").trim().toLowerCase();

  if (!KNOWN_ENGINES.has(explicit)) {
    return {
      reviewEngine: "deterministic",
      reviewEngineError: `未知 REVIEW_ENGINE=${explicit}。可选 auto、deepseek、ollama、gateway、deterministic、bedrock。没有调用模型。`,
    };
  }

  if (explicit === "bedrock") return { reviewEngine: "bedrock" };
  if (explicit === "gateway" || explicit === "ai_gateway") return { reviewEngine: "ai_gateway" };
  if (explicit === "deterministic") return { reviewEngine: "deterministic" };
  if (explicit === "deepseek") return { reviewEngine: "deepseek" };
  if (explicit === "ollama") return { reviewEngine: "ollama" };

  return { reviewEngine: selectAutoReviewEngine(env) };
}

export function resolvePersistence(
  env: EnvLike,
  mode: "demo" | "aws",
): { persistence: PersistenceKind; persistenceError?: string } {
  const explicit = (env.PERSISTENCE || "").trim().toLowerCase();
  const databaseUrl = env.DATABASE_URL?.trim();
  const table = env.ORDERS_TABLE_NAME?.trim();

  if (databaseUrl) return { persistence: "postgres" };
  if (explicit === "postgres") {
    return {
      persistence: "postgres",
      persistenceError: "PERSISTENCE=postgres 需要 DATABASE_URL。没有回退到内存。",
    };
  }
  if (explicit === "sqlite") return { persistence: "sqlite" };
  if (explicit === "memory") return { persistence: "memory" };
  if (explicit === "dynamo") {
    if (!table) {
      return {
        persistence: "dynamo",
        persistenceError: "PERSISTENCE=dynamo 需要 ORDERS_TABLE_NAME。没有回退到内存。",
      };
    }
    return { persistence: "dynamo" };
  }
  if (mode === "aws" && table) return { persistence: "dynamo" };
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
  const bedrockReady = Boolean(env.AWS_REGION && env.BEDROCK_MODEL_ID);
  const gatewayReady = Boolean(env.AI_GATEWAY_API_KEY?.trim());
  const sesReady = Boolean(env.SES_FROM_ADDRESS && env.AWS_REGION);
  const { reviewEngine, reviewEngineError } = resolveReviewEngine(env);
  const sesLive = mode === "aws" && sesReady;
  const inboundReady = Boolean(env.INBOUND_WEBHOOK_SECRET?.trim());
  const { persistence, persistenceError } = resolvePersistence(env, mode);
  const objectStore = resolveObjectStore(env);

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
    dynamoConfigured: Boolean(env.ORDERS_TABLE_NAME?.trim()),
    s3Configured: objectStore === "minio" || objectStore === "s3" || Boolean(env.RAW_EMAIL_BUCKET?.trim() || env.S3_BUCKET?.trim()),
    inboundConfigured: inboundReady,
    reviewEngine,
    reviewEngineError,
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
