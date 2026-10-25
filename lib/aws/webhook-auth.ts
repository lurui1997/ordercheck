import { jsonError } from "@/lib/http";

/**
 * Protect Lambda/EventBridge forwarders. Without INBOUND_WEBHOOK_SECRET → 501.
 * Accept Authorization: Bearer … or x-ordercheck-secret.
 */
export function requireInboundSecret(request: Request, env: NodeJS.ProcessEnv = process.env): Response | null {
  const secret = env.INBOUND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return jsonError(
      501,
      "inbound_not_configured",
      "未配置 INBOUND_WEBHOOK_SECRET。生产请用 SES→S3→Lambda 直接调 handleInboundRecord，或配置密钥后转发到此接口。",
    );
  }
  const auth = request.headers.get("authorization");
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  const header = request.headers.get("x-ordercheck-secret")?.trim() ?? null;
  if (bearer === secret || header === secret) return null;
  return jsonError(401, "unauthorized", "缺少或错误的入站密钥。");
}
