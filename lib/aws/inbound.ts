import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createOrderRepository, type OrderRepository } from "@/lib/aws/repository";
import { extractOrderIdFromMail, parseSimpleMime } from "@/lib/aws/mime";
import { createObjectStore, createS3Client } from "@/lib/oss/object-store";
import { applyReply } from "@/lib/review/engine";
import type { Message, MessageSource, Order, Role } from "@/lib/types";

export interface InboundMailRecord {
  bucket: string;
  key: string;
  messageId: string;
  recipients: string[];
}

export interface InboundResult {
  status: "applied" | "duplicate" | "unmatched" | "s3_error" | "storage_error" | "apply_failed";
  orderId?: string;
  error?: string;
  storageKey?: string;
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

export async function applyParsedInbound(input: {
  repository?: OrderRepository;
  orderId: string;
  messageId: string;
  from: string;
  subject: string;
  body: string;
  source: Extract<MessageSource, "ses_inbound" | "email_inbound">;
}): Promise<InboundResult> {
  const repository = input.repository ?? createOrderRepository();
  const order = await repository.get(input.orderId);
  if (!order) {
    return { status: "unmatched", orderId: input.orderId, error: "订单不存在。" };
  }

  if (order.messages.some((item) => item.id === input.messageId)) {
    return { status: "duplicate", orderId: input.orderId };
  }

  if (!input.body.trim()) {
    return { status: "apply_failed", orderId: input.orderId, error: "邮件正文为空。" };
  }

  const message: Message = {
    id: input.messageId,
    source: input.source,
    from_role: resolveRole(order, input.from),
    sent_at: new Date().toISOString(),
    subject: input.subject || `Re: OrderCheck ${input.orderId}`,
    body: input.body,
  };

  const result = applyReply(order, message, {
    allowSesInbound: input.source === "ses_inbound",
    allowEmailInbound: input.source === "email_inbound",
  });
  if (!result.ok) {
    return { status: "apply_failed", orderId: input.orderId, error: result.error };
  }

  await repository.save(result.order);
  return { status: "applied", orderId: input.orderId };
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
    const store = createObjectStore(process.env);
    if (store?.kind === "disk") {
      try {
        raw = await store.get(record.key);
      } catch (error) {
        const message = error instanceof Error ? error.message : "读取本地邮件失败。";
        return { status: "storage_error", error: message };
      }
    } else {
      let client: S3Client;
      try {
        client = options.s3Client ?? createS3Client(process.env, options.region);
      } catch (error) {
        const message = error instanceof Error ? error.message : "缺少对象存储配置，无法读取原始邮件。";
        return { status: "s3_error", error: message };
      }
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

  return applyParsedInbound({
    repository: options.repository,
    orderId,
    messageId,
    from: parsed.from,
    subject: parsed.subject,
    body: parsed.body,
    source: "ses_inbound",
  });
}
