import { getRuntimeConfig } from "@/lib/aws/config";
import { createOrderRepository } from "@/lib/aws/repository";
import { jsonError, readJson } from "@/lib/http";
import { ReviewOrchestrationError, runReview } from "@/lib/review/orchestrator";
import type { Order, PersistenceKind } from "@/lib/types";

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

  const config = getRuntimeConfig();

  try {
    const result = await runReview(order, process.env, config);
    if (result.engine !== config.reviewEngine) {
      return jsonError(
        502,
        "engine_mismatch",
        `核对返回了 ${result.engine}，但当前配置要求 ${config.reviewEngine}。没有把结果标成配置中的引擎。`,
      );
    }
    const persistence: { store: PersistenceKind; ok: boolean; error?: string } = {
      store: config.persistence,
      ok: true,
    };
    try {
      await repository.save(result.order);
    } catch (error) {
      persistence.ok = false;
      persistence.error = error instanceof Error ? error.message : "保存失败。";
    }
    return Response.json({
      order: result.order,
      engine: result.engine,
      notice: result.notice,
      meta: result.meta,
      bedrockRequestId: result.meta.bedrockRequestId,
      gatewayUsage: result.meta.gatewayUsage,
      persistence,
    });
  } catch (error) {
    if (error instanceof ReviewOrchestrationError) {
      const status = error.code.endsWith("_not_configured") || error.code.endsWith("_not_implemented") ? 501 : 502;
      return jsonError(status, error.code, error.message);
    }
    const message = error instanceof Error ? error.message : "核对失败。";
    return jsonError(500, "review_failed", message);
  }
}
