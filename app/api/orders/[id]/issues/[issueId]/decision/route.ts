import { createOrderRepository } from "@/lib/aws/repository";
import { jsonError, readJson } from "@/lib/http";
import { applyDecision } from "@/lib/review/engine";
import type { DecisionKind } from "@/lib/types";

export const dynamic = "force-dynamic";

function isDecision(value: unknown): value is DecisionKind {
  return value === "accepted_risk" || value === "needs_human_review" || value === "not_applicable";
}

export async function POST(request: Request, context: { params: Promise<{ id: string; issueId: string }> }) {
  const { id, issueId } = await context.params;
  const repository = createOrderRepository();
  const order = await repository.get(id);
  if (!order) return jsonError(404, "not_found", "没有这张订单。");
  const body = await readJson(request);
  if (!isDecision(body.decision)) return jsonError(400, "invalid_decision", "决策只能是接受风险、人工核实或本次不适用。");
  const reason = typeof body.reason === "string" ? body.reason : "";
  const actor = typeof body.actor === "string" ? body.actor : undefined;
  const result = applyDecision(order, issueId, body.decision, reason, { actor });
  if (!result.ok) return jsonError(400, "decision_rejected", result.error);
  await repository.save(result.order);
  return Response.json({ order: result.order });
}
