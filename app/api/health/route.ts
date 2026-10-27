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
    liveEngine: config.liveEngine,
    bedrock: config.bedrockConfigured,
    ses: config.sesConfigured,
    sesLive: config.sesLive,
    dynamo: config.dynamoConfigured,
    persistence: config.persistence,
    s3: config.s3Configured,
    gateway: config.gatewayConfigured,
    deepseek: config.deepseekConfigured,
    inbound: config.inboundConfigured,
    missing: config.missing,
  });
}
