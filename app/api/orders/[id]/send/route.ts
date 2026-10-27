import { getRuntimeConfig } from "@/lib/aws/config";
import { createOrderRepository } from "@/lib/aws/repository";
import { MailNotReadyError, submitEmail } from "@/lib/aws/ses";
import { jsonError, readJson } from "@/lib/http";
import { SmtpError, submitSmtp } from "@/lib/oss/smtp";
import { recordOutbound } from "@/lib/review/engine";
import type { Order } from "@/lib/types";

export const dynamic = "force-dynamic";

function isOrderShape(value: unknown): value is Order {
  if (!value || typeof value !== "object") return false;
  const order = value as Partial<Order>;
  return (
    typeof order.id === "string" &&
    Array.isArray(order.messages) &&
    Array.isArray(order.issues) &&
    Array.isArray(order.facts) &&
    Array.isArray(order.outbound)
  );
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const repository = createOrderRepository();
  const body = await readJson(request);
  const fromBody = isOrderShape(body.order) ? body.order : null;
  const order = fromBody && fromBody.id === id ? fromBody : await repository.get(id);
  if (!order) return jsonError(404, "not_found", "没有这张订单。");

  const issueIds = Array.isArray(body.issue_ids) ? body.issue_ids.filter((item): item is string => typeof item === "string") : [];
  const to = typeof body.to === "string" ? body.to : "";
  const subject = typeof body.subject === "string" ? body.subject : "";
  const text = typeof body.body === "string" ? body.body : "";
  const config = getRuntimeConfig();

  let submit: { messageId: string; from?: string; provider?: "ses" | "smtp" } | undefined;
  let transport: "smtp" | "ses" | "recorded" = "recorded";

  if (config.smtpConfigured) {
    try {
      const result = await submitSmtp({
        to,
        subject,
        textBody: text,
        replyTo: process.env.SMTP_REPLY_TO || process.env.SES_REPLY_TO_ADDRESS || undefined,
      });
      submit = { messageId: result.messageId, from: result.from, provider: "smtp" };
      transport = "smtp";
    } catch (error) {
      if (error instanceof SmtpError) {
        const status = error.code === "smtp_not_configured" ? 501 : 502;
        return jsonError(status, error.code, error.message);
      }
      const message = error instanceof Error ? error.message : "SMTP 发送失败。";
      return jsonError(502, "smtp_submit_failed", message);
    }
  } else if (config.sesLive) {
    try {
      const result = await submitEmail({
        from: process.env.SES_FROM_ADDRESS ?? "",
        to,
        replyTo: process.env.SES_REPLY_TO_ADDRESS || undefined,
        subject,
        textBody: text,
        configurationSet: process.env.SES_CONFIGURATION_SET || undefined,
        region: process.env.AWS_REGION,
      });
      submit = { messageId: result.messageId, from: process.env.SES_FROM_ADDRESS, provider: "ses" };
      transport = "ses";
    } catch (error) {
      if (error instanceof MailNotReadyError) {
        const status = error.code === "ses_not_configured" ? 501 : 502;
        return jsonError(status, error.code, error.message);
      }
      const message = error instanceof Error ? error.message : "SES 发送失败。";
      return jsonError(502, "ses_submit_failed", message);
    }
  } else if (config.mode === "aws") {
    return jsonError(
      501,
      "mail_not_configured",
      "AWS_MODE 没有配置 SMTP（SMTP_HOST + SMTP_FROM）或 SES（SES_FROM_ADDRESS + AWS_REGION）。没有发信，也没有把结果记成已投递。",
    );
  }

  const result = recordOutbound(order, { to, subject, body: text, issueIds, submit });
  if (!result.ok) return jsonError(400, "send_rejected", result.error);

  try {
    await repository.save(result.order);
  } catch {
    // Client-supplied order may not need durable save.
  }

  const delivery_status = submit ? "submit_succeeded" : "recorded_not_sent";
  return Response.json({
    order: result.order,
    delivery_status,
    messageId: submit?.messageId,
    transport,
    ses_live: transport === "ses",
    smtp_live: transport === "smtp",
  });
}
