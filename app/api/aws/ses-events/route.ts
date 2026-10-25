import { applySesEventPayload } from "@/lib/aws/ses-events";
import { requireInboundSecret } from "@/lib/aws/webhook-auth";
import { readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Protected SES event sink (SNS→HTTPS or Lambda forwarder).
 * Updates outbound delivery_status to delivered/bounce/complaint from events only.
 * Never invents delivered from a Send API response.
 */
export async function POST(request: Request) {
  const denied = requireInboundSecret(request);
  if (denied) return denied;

  const body = await readJson(request);
  const orderIdHint = typeof body.orderId === "string" ? body.orderId : undefined;

  // SNS subscription confirmation is not a delivery event.
  if (body.Type === "SubscriptionConfirmation") {
    return Response.json({ status: "ignored", reason: "SNS SubscriptionConfirmation — confirm via SubscribeURL out of band." });
  }

  const result = await applySesEventPayload(body, { orderIdHint });
  const status =
    result.status === "updated"
      ? 200
      : result.status === "ignored"
        ? 200
        : result.status === "not_found"
          ? 404
          : 400;

  return Response.json(result, { status });
}
