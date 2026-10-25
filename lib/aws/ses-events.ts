import { createOrderRepository, type OrderRepository } from "@/lib/aws/repository";
import type { DeliveryStatus, Order } from "@/lib/types";

export type SesEventKind = "Delivery" | "Bounce" | "Complaint" | "Reject" | "Send" | "Open" | "Click";

export interface SesEventApplyResult {
  status: "updated" | "ignored" | "not_found" | "invalid";
  orderId?: string;
  delivery_status?: DeliveryStatus;
  provider_message_id?: string;
  reason?: string;
}

function mapEventToStatus(eventType: string): DeliveryStatus | null {
  switch (eventType) {
    case "Delivery":
      return "delivered";
    case "Bounce":
      return "bounce";
    case "Complaint":
      return "complaint";
    case "Reject":
      return "failed";
    default:
      // Send/Open/Click etc. do not invent delivered.
      return null;
  }
}

function unwrapSnsOrDirect(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;

  // SNS Notification envelope
  if (typeof record.Message === "string") {
    try {
      const inner = JSON.parse(record.Message) as unknown;
      if (inner && typeof inner === "object") return inner as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  // SNS with already-parsed Message
  if (record.Message && typeof record.Message === "object") {
    return record.Message as Record<string, unknown>;
  }

  return record;
}

function extractMailIds(event: Record<string, unknown>): string[] {
  const mail = event.mail as { messageId?: string } | undefined;
  const ids: string[] = [];
  if (mail?.messageId) ids.push(mail.messageId);
  // Some payloads nest under mail.commonHeaders
  return ids;
}

function findOrderWithOutbound(
  orders: Order[],
  providerMessageId: string,
): { order: Order; outboundIndex: number } | null {
  for (const order of orders) {
    const outboundIndex = order.outbound.findIndex(
      (item) =>
        item.provider_message_id === providerMessageId ||
        item.note.includes(providerMessageId) ||
        order.messages.some((m) => m.id === providerMessageId && m.source === "demo_outbound"),
    );
    if (outboundIndex >= 0) return { order, outboundIndex };
  }
  return null;
}

/**
 * Apply an SES event (optionally SNS-wrapped) to outbound delivery_status.
 * Only Delivery/Bounce/Complaint/Reject update status — never invent "delivered" from Send.
 */
export async function applySesEventPayload(
  body: unknown,
  options: {
    repository?: OrderRepository;
    /** When repository cannot list, look up by explicit orderId from payload/tags. */
    orderIdHint?: string;
  } = {},
): Promise<SesEventApplyResult> {
  const event = unwrapSnsOrDirect(body);
  if (!event) return { status: "invalid", reason: "无法解析 SES 事件 JSON。" };

  const eventType = String(event.eventType ?? event.notificationType ?? "");
  const nextStatus = mapEventToStatus(eventType);
  if (!nextStatus) {
    return { status: "ignored", reason: `事件类型 ${eventType || "unknown"} 不更新投递状态。` };
  }

  const ids = extractMailIds(event);
  const providerMessageId = ids[0];
  if (!providerMessageId) {
    return { status: "invalid", reason: "事件缺少 mail.messageId。" };
  }

  const repository = options.repository ?? createOrderRepository();

  // Prefer tags / explicit hint for order association.
  const tags = (event.mail as { tags?: Record<string, string[]> } | undefined)?.tags;
  const tagOrderId = tags?.orderId?.[0] ?? tags?.OrderId?.[0];
  const orderId = options.orderIdHint ?? tagOrderId;

  let order: Order | null = null;
  if (orderId) {
    order = await repository.get(orderId);
  }

  if (!order) {
    // Memory / single-order demos: try hint only. Without list API we cannot scan Dynamo.
    return {
      status: "not_found",
      provider_message_id: providerMessageId,
      reason: orderId
        ? "订单不存在。"
        : "缺少 orderId（mail.tags.orderId 或请求字段）。无法按 MessageId 全表扫描。",
    };
  }

  const match = findOrderWithOutbound([order], providerMessageId);
  if (!match) {
    return {
      status: "not_found",
      orderId: order.id,
      provider_message_id: providerMessageId,
      reason: "订单中没有匹配的外发 MessageId。",
    };
  }

  const outbound = match.order.outbound.map((item, index) => {
    if (index !== match.outboundIndex) return item;
    const noteSuffix =
      nextStatus === "delivered"
        ? "SES 投递事件：已投递。"
        : nextStatus === "bounce"
          ? "SES 事件：退信（bounce）。"
          : nextStatus === "complaint"
            ? "SES 事件：投诉（complaint）。"
            : "SES 事件：发送失败。";
    return {
      ...item,
      delivery_status: nextStatus,
      provider_message_id: item.provider_message_id ?? providerMessageId,
      note: `${item.note} ${noteSuffix}`,
    };
  });

  const updated: Order = { ...match.order, outbound };
  await repository.save(updated);
  return {
    status: "updated",
    orderId: updated.id,
    delivery_status: nextStatus,
    provider_message_id: providerMessageId,
  };
}
