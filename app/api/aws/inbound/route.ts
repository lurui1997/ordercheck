import { handleInboundRecord } from "@/lib/aws/inbound";
import { requireInboundSecret } from "@/lib/aws/webhook-auth";
import { jsonError, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Protected forwarder for SES→S3→Lambda (or EventBridge).
 * Not a public forge entry — requires INBOUND_WEBHOOK_SECRET.
 *
 * Body: { bucket, key, messageId, recipients[] }
 * Production preference: Lambda calls handleInboundRecord directly in-process.
 */
export async function POST(request: Request) {
  const denied = requireInboundSecret(request);
  if (denied) return denied;

  const body = await readJson(request);
  const bucket = typeof body.bucket === "string" ? body.bucket : "";
  const key = typeof body.key === "string" ? body.key : "";
  const messageId = typeof body.messageId === "string" ? body.messageId : "";
  const recipients = Array.isArray(body.recipients)
    ? body.recipients.filter((item): item is string => typeof item === "string")
    : [];

  if (!bucket || !key || !messageId) {
    return jsonError(400, "invalid_record", "需要 bucket、key、messageId。");
  }

  const result = await handleInboundRecord({ bucket, key, messageId, recipients });
  const status =
    result.status === "applied"
      ? 200
      : result.status === "duplicate"
        ? 200
        : result.status === "unmatched"
          ? 404
          : result.status === "s3_error" || result.status === "storage_error"
            ? 502
            : 400;

  return Response.json(result, { status });
}
