import { createOrderRepository } from "@/lib/aws/repository";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const order = await createOrderRepository().get(id);
  if (!order) return jsonError(404, "not_found", "没有这张订单。样例进程内存储在新实例上是空的。");
  return Response.json({ order });
}
