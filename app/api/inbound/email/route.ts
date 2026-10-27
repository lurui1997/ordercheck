import { requireInboundSecret } from "@/lib/aws/webhook-auth";
import { readJson } from "@/lib/http";
import { handleGenericInbound } from "@/lib/oss/inbound-mail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Generic inbound for self-hosted MTAs (Postal, Mailu, Haraka, docker-mailserver, Mailpit webhooks).
 * Accepts raw MIME (`raw`) or parsed fields (`text`, `subject`, `from`, `to`, `messageId`, `orderId`).
 * Same secret as POST /api/aws/inbound. Stored MIME uses MinIO or local disk when that store is configured.
 * Messages are labeled email_inbound, never ses_inbound.
 */
export async function POST(request: Request) {
  const denied = requireInboundSecret(request);
  if (denied) return denied;

  const body = await readJson(request);
  const recipients = Array.isArray(body.recipients)
    ? body.recipients.filter((item): item is string => typeof item === "string")
    : [];
  const to = typeof body.to === "string" || Array.isArray(body.to) ? body.to : undefined;

  const result = await handleGenericInbound({
    raw: typeof body.raw === "string" ? body.raw : undefined,
    text: typeof body.text === "string" ? body.text : typeof body.body === "string" ? body.body : undefined,
    subject: typeof body.subject === "string" ? body.subject : undefined,
    from: typeof body.from === "string" ? body.from : undefined,
    to: Array.isArray(to) ? to.filter((item): item is string => typeof item === "string") : to,
    messageId: typeof body.messageId === "string" ? body.messageId : undefined,
    recipients,
    orderId: typeof body.orderId === "string" ? body.orderId : undefined,
  });

  const status =
    result.status === "applied" || result.status === "duplicate"
      ? 200
      : result.status === "unmatched"
        ? 404
        : result.status === "s3_error" || result.status === "storage_error"
          ? 502
          : 400;

  return Response.json(result, { status });
}
