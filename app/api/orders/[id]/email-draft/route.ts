import { createOrderRepository } from "@/lib/aws/repository";
import { DeepSeekError } from "@/lib/deepseek";
import { jsonError, readJson } from "@/lib/http";
import { draftWithModel } from "@/lib/review/draft-model";
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
  if (!order.reviewed) return jsonError(400, "not_reviewed", "请先核对，再生成确认邮件。");

  const issueIds = Array.isArray(body.issue_ids)
    ? body.issue_ids.filter((item): item is string => typeof item === "string")
    : [];
  if (issueIds.length === 0) return jsonError(400, "no_issues", "请选择至少一项要询问的事项。");

  try {
    const result = await draftWithModel(order, issueIds);
    return Response.json({
      draft: result.draft,
      draftEngine: result.draftEngine,
      notice: result.notice,
    });
  } catch (error) {
    if (error instanceof DeepSeekError) {
      const status = error.code.endsWith("_not_configured") ? 501 : 502;
      return jsonError(status, error.code, error.message);
    }
    const message = error instanceof Error ? error.message : "生成草稿失败。";
    return jsonError(500, "draft_failed", message);
  }
}
