import { applyParsedInbound, type InboundResult } from "@/lib/aws/inbound";
import { extractOrderIdFromMail, parseSimpleMime } from "@/lib/aws/mime";
import type { OrderRepository } from "@/lib/aws/repository";
import { createObjectStore, type ObjectStore } from "@/lib/oss/object-store";

export interface GenericInboundInput {
  /** Raw RFC822 MIME. Preferred when the MTA can forward the original message. */
  raw?: string;
  text?: string;
  subject?: string;
  from?: string;
  to?: string | string[];
  messageId?: string;
  recipients?: string[];
  orderId?: string;
}

function asList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).map((item) => item.trim()).filter(Boolean);
}

function synthesizeMime(input: {
  from: string;
  to: string[];
  subject: string;
  messageId: string;
  body: string;
}): string {
  return [
    `From: ${input.from}`,
    `To: ${input.to.join(", ")}`,
    `Subject: ${input.subject}`,
    `Message-ID: <${input.messageId}>`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    input.body,
  ].join("\r\n");
}

/**
 * Generic inbound for Postal, Mailu, Haraka, Mailpit, or any forwarder that can POST MIME or text.
 * Source label is email_inbound — never ses_inbound.
 * When object storage is configured, raw MIME is stored first; a store failure does not apply the message.
 */
export async function handleGenericInbound(
  input: GenericInboundInput,
  options: { repository?: OrderRepository; objectStore?: ObjectStore | null; env?: Record<string, string | undefined> } = {},
): Promise<InboundResult> {
  const rawProvided = typeof input.raw === "string" && input.raw.trim().length > 0;
  const parsed = rawProvided ? parseSimpleMime(input.raw ?? "") : null;

  const from = parsed?.from || input.from?.trim() || "";
  const subject = parsed?.subject || input.subject?.trim() || "";
  const body = parsed?.body || input.text?.trim() || "";
  const recipients = [...(input.recipients ?? []), ...asList(input.to), ...(parsed?.to ?? [])];
  const messageId = (parsed?.messageId || input.messageId?.trim() || "").replace(/^<|>$/g, "");
  const orderId =
    input.orderId?.trim() ||
    extractOrderIdFromMail({
      subject,
      recipients,
      to: parsed?.to,
      replyTo: parsed?.replyTo,
    });

  if (!messageId) {
    return { status: "apply_failed", error: "缺少 Message-ID。没有入账，也没有编造编号。" };
  }
  if (!orderId) {
    return { status: "unmatched", error: "无法从 orderId、收件人或主题 [OrderCheck:ID] 关联订单。" };
  }
  if (!body.trim()) {
    return { status: "apply_failed", orderId, error: "邮件正文为空。" };
  }

  const env = options.env ?? process.env;
  const store = options.objectStore === undefined ? createObjectStore(env) : options.objectStore;
  const storageKey = `inbound/${orderId}/${messageId}.eml`;
  if (store) {
    const raw =
      rawProvided && input.raw
        ? input.raw
        : synthesizeMime({ from, to: recipients, subject, messageId, body });
    try {
      await store.put(storageKey, raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存原始邮件失败。";
      return { status: "storage_error", orderId, error: message };
    }
  }

  const applied = await applyParsedInbound({
    repository: options.repository,
    orderId,
    messageId,
    from,
    subject,
    body,
    source: "email_inbound",
  });
  if (store && applied.status === "applied") {
    return { ...applied, storageKey };
  }
  return applied;
}
