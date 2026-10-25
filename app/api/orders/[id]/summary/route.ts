import { createOrderRepository } from "@/lib/aws/repository";
import { jsonError } from "@/lib/http";
import { buildSummary } from "@/lib/review/engine";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const order = await createOrderRepository().get(id);
  if (!order) return jsonError(404, "not_found", "没有这张订单。");
  if (!order.reviewed) return jsonError(400, "not_reviewed", "还没有核对结果。");
  return Response.json({ summary: buildSummary(order) });
}
