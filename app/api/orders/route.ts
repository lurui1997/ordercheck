import { createOrderRepository } from "@/lib/aws/repository";
import { jsonError, readJson } from "@/lib/http";
import { createOrderFromScenario } from "@/lib/scenario";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readJson(request);
  if (body.fixture !== "DEMO-001") {
    return jsonError(400, "unknown_fixture", "目前只能加载 DEMO-001。");
  }
  const order = createOrderFromScenario();
  const repository = createOrderRepository();
  await repository.save(order);
  return Response.json({ order });
}
