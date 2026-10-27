import { getRuntimeConfig } from "@/lib/aws/config";

export const dynamic = "force-dynamic";

/**
 * Public diagnostics for judges/demo. Booleans only — never secrets.
 */
export function GET() {
  const config = getRuntimeConfig();
  return Response.json({
    ok: true,
    mode: config.mode,
    modeLabel: config.modeLabel,
    reviewEngine: config.reviewEngine,
    bedrock: config.bedrockConfigured,
    deepseek: config.deepseekConfigured,
    ollama: config.ollamaConfigured,
    ses: config.sesConfigured,
    sesLive: config.sesLive,
    smtp: config.smtpConfigured,
    dynamo: config.dynamoConfigured,
    s3: config.s3Configured,
    objectStore: config.objectStore,
    gateway: config.gatewayConfigured,
    inbound: config.inboundConfigured,
    persistence: config.persistence,
    persistenceError: config.persistenceError,
    reviewEngineError: config.reviewEngineError,
    missing: config.missing,
  });
}
