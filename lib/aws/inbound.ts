import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createOrderRepository, type OrderRepository } from "@/lib/aws/repository";
import { extractOrderIdFromMail, parseSimpleMime } from "@/lib/aws/mime";
import { applyReply } from "@/lib/review/engine";
import type { Message, Order, Role } from "@/lib/types";

export interface InboundMailRecord {
  bucket: string;
  key: string;
  messageId: string;
  recipients: string[];
}

export interface InboundResult {
  status: "applied" | "duplicate" | "unmatched" | "s3_error" | "apply_failed";
  orderId?: string;
  error?: string;
}

export interface HandleInboundOptions {
  repository?: OrderRepository;
  s3Client?: S3Client;
  region?: string;
  /** Pre-loaded raw MIME — skips S3 (tests). */
  rawMime?: string;
}

async function streamToString(body: unknown): Promise<string> {
  if (!body) return "";
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  if (typeof (body as { transformToString?: () => Promise<string> }).transformToString === "function") {
    return (body as { transformToString: () => Promise<string> }).transformToString();
  }
  // Node.js Readable
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | string | Buffer>) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function resolveRole(order: Order, fromEmail: string): Role {
  const normalized = fromEmail.toLowerCase();
  if (normalized && normalized === order.seller.email.toLowerCase()) return "seller";
  return "buyer";
}

/**
 * SES receipt → S3 → (Lambda / protected webhook) entry point.
 * Reads MIME via S3 GetObject, associates order, dedupes by message id,
 * writes source: ses_inbound, then applyReply (allowSesInbound).
 *
 * Production: SES → S3 → Lambda should call this directly, or POST /api/aws/inbound
 * with INBOUND_WEBHOOK_SECRET. Not a public forge endpoint.
 */
export async function handleInboundRecord(
  record: InboundMailRecord,
  options: HandleInboundOptions = {},
): Promise<InboundResult> {
  if (!record.bucket || !record.key || !record.messageId) {
    return { status: "unmatched", error: "缺少 bucket、key 或 messageId。" };
  }

  let raw: string;
  if (options.rawMime !== undefined) {
    raw = options.rawMime;
  } else {
    const region = options.region ?? process.env.AWS_REGION;
    if (!region) {
      return { status: "s3_error", error: "缺少 AWS_REGION，无法 GetObject。" };
    }
    const client = options.s3Client ?? new S3Client({ region });
    try {
      const response = await client.send(
        new GetObjectCommand({
          Bucket: record.bucket,
          Key: record.key,
        }),
      );
      raw = await streamToString(response.Body);
    } catch (error) {
      const message = error instanceof Error ? error.message : "S3 GetObject 失败。";
      return { status: "s3_error", error: message };
    }
  }

  const parsed = parseSimpleMime(raw);
  const messageId = parsed.messageId || record.messageId;
  const orderId = extractOrderIdFromMail({
    subject: parsed.subject,
    recipients: record.recipients,
    to: parsed.to,
    replyTo: parsed.replyTo,
  });

  if (!orderId) {
    return { status: "unmatched", error: "无法从收件人 / Reply-To / 主题关联订单。" };
  }

  const repository = options.repository ?? createOrderRepository();
  const order = await repository.get(orderId);
  if (!order) {
    return { status: "unmatched", orderId, error: "订单不存在。" };
  }

  if (order.messages.some((item) => item.id === messageId)) {
    return { status: "duplicate", orderId };
  }

  if (!parsed.body.trim()) {
    return { status: "apply_failed", orderId, error: "邮件正文为空。" };
  }

  const message: Message = {
    id: messageId,
    source: "ses_inbound",
    from_role: resolveRole(order, parsed.from),
    sent_at: new Date().toISOString(),
    subject: parsed.subject || `Re: OrderCheck ${orderId}`,
    body: parsed.body,
  };

  const result = applyReply(order, message, { allowSesInbound: true });
  if (!result.ok) {
    return { status: "apply_failed", orderId, error: result.error };
  }

  await repository.save(result.order);
  return { status: "applied", orderId };
}
