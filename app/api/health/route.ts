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
    reviewEngineSelection: config.reviewEngineSelection,
    reviewEngineError: config.reviewEngineError,
    liveEngine: config.liveEngine,
    bedrock: config.bedrockConfigured,
    deepseek: config.deepseekConfigured,
    ollama: config.ollamaConfigured,
    ses: config.sesConfigured,
    sesLive: config.sesLive,
    smtp: config.smtpConfigured,
    dynamo: config.dynamoConfigured,
    persistence: config.persistence,
    persistenceError: config.persistenceError,
    s3: config.s3Configured,
    objectStore: config.objectStore,
    gateway: config.gatewayConfigured,
    inbound: config.inboundConfigured,
    missing: config.missing,
  });
}
