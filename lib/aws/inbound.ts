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

export function canonicalMessageId(id: string): string {
  return id.trim().replace(/^<|>$/g, "").toLowerCase();
}

function sentAtFromMime(dateHeader: string): string {
  if (!dateHeader.trim()) return new Date().toISOString();
  const parsed = Date.parse(dateHeader);
  if (Number.isNaN(parsed)) return new Date().toISOString();
  return new Date(parsed).toISOString();
}

/** Buyer or seller on the order only. Unknown senders are not assumed to be the buyer. */
function resolveRole(order: Order, fromEmail: string): Role | null {
  const normalized = fromEmail.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === order.buyer.email.toLowerCase()) return "buyer";
  if (normalized === order.seller.email.toLowerCase()) return "seller";
  return null;
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
  const messageId = canonicalMessageId(parsed.messageId || record.messageId);
  if (!messageId) {
    return { status: "apply_failed", error: "缺少 Message-ID，拒绝写入以免无法去重。" };
  }
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

  if (order.messages.some((item) => canonicalMessageId(item.id) === messageId)) {
    return { status: "duplicate", orderId };
  }

  if (!parsed.body.trim()) {
    return { status: "apply_failed", orderId, error: "邮件正文为空。" };
  }

  const fromRole = resolveRole(order, parsed.from);
  if (!fromRole) {
    return {
      status: "apply_failed",
      orderId,
      error: "发件人不是这张订单的买方或卖方，未写入，也没有改事项状态。",
    };
  }

  const message: Message = {
    id: messageId,
    source: "ses_inbound",
    from_role: fromRole,
    sent_at: sentAtFromMime(parsed.date),
    subject: parsed.subject || `Re: OrderCheck ${orderId}`,
    body: parsed.body,
  };

  const result = applyReply(order, message, { allowSesInbound: true });
  if (!result.ok) {
    return { status: "apply_failed", orderId, error: result.error };
  }

  const ungrounded = ungroundedEvidence(result.order);
  if (ungrounded) {
    return { status: "apply_failed", orderId, error: ungrounded };
  }

  await repository.save(result.order);
  return { status: "applied", orderId };
}

/** Refuse to persist a reply whose quotes are not substrings of the cited message. */
function ungroundedEvidence(order: Order): string | null {
  for (const issue of order.issues) {
    for (const item of [...issue.evidence, ...issue.resolution_evidence]) {
      const message = order.messages.find((entry) => entry.id === item.message_id);
      if (!message || !message.body.includes(item.quote)) {
        return `事项 ${issue.issue_id} 的引用不在消息 ${item.message_id} 中，已拒绝保存。`;
      }
    }
  }
  return null;
}
