import { createOrderRepository } from "@/lib/aws/repository";
import { jsonError, readJson } from "@/lib/http";
import { applyReply } from "@/lib/review/engine";
import type { Message, MessageSource, Role } from "@/lib/types";

export const dynamic = "force-dynamic";

function isRole(value: unknown): value is Role {
  return value === "buyer" || value === "seller";
}

function isSource(value: unknown): value is MessageSource {
  return value === "fixture" || value === "manual" || value === "ses_inbound" || value === "demo_outbound";
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const repository = createOrderRepository();
  const order = await repository.get(id);
  if (!order) return jsonError(404, "not_found", "没有这张订单。");

  const body = await readJson(request);
  const raw = body.message;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return jsonError(400, "invalid_message", "需要 message 对象。");
  }
  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.id !== "string" || typeof candidate.body !== "string" || !isRole(candidate.from_role) || !isSource(candidate.source)) {
    return jsonError(400, "invalid_message", "消息需要 id、body、from_role 和 source。");
  }
  if (candidate.source === "ses_inbound" || candidate.source === "demo_outbound") {
    return jsonError(400, "source_not_allowed", "这个接口不接受 SES 收件或样例外发。入站邮件只能由 AWS 事件写入。");
  }

  const message: Message = {
    id: candidate.id,
    source: candidate.source,
    from_role: candidate.from_role,
    sent_at: typeof candidate.sent_at === "string" ? candidate.sent_at : new Date().toISOString(),
    subject: typeof candidate.subject === "string" ? candidate.subject : "Re: Gift packaging order - requirements",
    body: candidate.body,
  };

  if (!order.reviewed) {
    if (order.messages.some((item) => item.id === message.id)) {
      return jsonError(409, "duplicate_message", "这条消息已经入账，不会重复创建问题或再次发信。");
    }
    const next = { ...order, messages: [...order.messages, message] };
    await repository.save(next);
    return Response.json({ order: next });
  }

  const result = applyReply(order, message);
  if (!result.ok) return jsonError(409, "reply_rejected", result.error);
  await repository.save(result.order);
  return Response.json({ order: result.order, notice: result.notice });
}
