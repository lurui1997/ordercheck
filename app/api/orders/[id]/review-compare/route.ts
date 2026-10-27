import { getRuntimeConfig } from "@/lib/aws/config";
import { jsonError, readJson } from "@/lib/http";
import { compareReviews } from "@/lib/review/compare";
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

/**
 * Side-by-side deterministic vs live review. Does not replace the stored order.
 * Live failures stay on the live panel and are not relabeled as deterministic.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await readJson(request);
  const fromBody = isOrderShape(body.order) ? body.order : null;
  if (!fromBody || fromBody.id !== id) {
    return jsonError(400, "order_required", "请在 body.order 里提交要对比的订单，且 id 必须与路径一致。对比不会改写已保存的订单。");
  }
  if (fromBody.messages.length === 0) {
    return jsonError(400, "no_messages", "没有可对比的邮件。");
  }

  const config = getRuntimeConfig();
  const result = await compareReviews(fromBody, process.env, config);
  return Response.json(result);
}
