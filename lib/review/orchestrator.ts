import { IntegrationError, reviewWithBedrock } from "@/lib/aws/bedrock";
import { getRuntimeConfig, reviewEngineLabel } from "@/lib/aws/config";
import { GatewayError, reviewWithGateway } from "@/lib/aws/gateway";
import { DeepSeekError, reviewWithDeepseek } from "@/lib/deepseek";
import { ChatProviderError, reviewWithOpenAICompatible } from "@/lib/oss/openai-compatible";
import { applyModelReview } from "@/lib/review/model-apply";
import { reviewOrder } from "@/lib/review/engine";
import type { Order, ReviewEngine, ReviewMeta, RuntimeConfig } from "@/lib/types";

export class ReviewOrchestrationError extends Error {
  code: string;
  engine: ReviewEngine;

  constructor(code: string, message: string, engine: ReviewEngine) {
    super(message);
    this.code = code;
    this.engine = engine;
  }
}

export interface ReviewRunResult {
  order: Order;
  engine: ReviewEngine;
  notice?: string;
  meta: ReviewMeta;
}

type EnvLike = Record<string, string | undefined>;

/**
 * Select and run the review engine.
 * auto order is resolved in getRuntimeConfig: deepseek → ollama → gateway → deterministic.
 * Bedrock runs only when REVIEW_ENGINE=bedrock.
 * A selected model that fails does not fall through to another engine.
 */
export async function runReview(
  order: Order,
  env: EnvLike = process.env,
  config: RuntimeConfig = getRuntimeConfig(env),
): Promise<ReviewRunResult> {
  const engine = config.reviewEngine;
  const reviewedAt = new Date().toISOString();

  if (config.reviewEngineError) {
    throw new ReviewOrchestrationError("review_engine_invalid", config.reviewEngineError, "deterministic");
  }

  if (engine === "ollama") {
    if (!config.ollamaConfigured) {
      throw new ReviewOrchestrationError(
        "ollama_not_configured",
        "需要 Ollama，但缺少 OLLAMA_MODEL。没有调用模型，也没有用规则引擎、DeepSeek 或 Bedrock 冒充。",
        "ollama",
      );
    }
    try {
      const chat = await reviewWithOpenAICompatible({ engine: "ollama", order, env });
      const applied = applyModelReview(order, chat.payload);
      if (!applied.ok) {
        throw new ReviewOrchestrationError("ollama_review_rejected", applied.error, "ollama");
      }
      const meta: ReviewMeta = {
        engine: "ollama",
        modelRequestId: chat.requestId,
        ollamaUsage: chat.usage,
        reviewedAt,
      };
      return {
        order: { ...applied.order, review_meta: meta },
        engine: "ollama",
        notice: applied.notice ?? `核对引擎：${reviewEngineLabel("ollama")}`,
        meta,
      };
    } catch (error) {
      if (error instanceof ReviewOrchestrationError) throw error;
      if (error instanceof ChatProviderError) {
        throw new ReviewOrchestrationError(error.code, error.message, "ollama");
      }
      const message = error instanceof Error ? error.message : "Ollama 调用失败。";
      throw new ReviewOrchestrationError("ollama_call_failed", message, "ollama");
    }
  }

  if (engine === "bedrock") {
    if (!config.bedrockConfigured) {
      throw new ReviewOrchestrationError(
        "bedrock_not_configured",
        "需要 Bedrock，但缺少 AWS_REGION 或 BEDROCK_MODEL_ID。没有调用模型，也没有用规则引擎冒充。",
        "bedrock",
      );
    }
    try {
      const bedrock = await reviewWithBedrock({
        modelId: env.BEDROCK_MODEL_ID ?? "",
        region: env.AWS_REGION ?? "",
        order,
        maxTokens: Number(env.BEDROCK_MAX_TOKENS ?? 2400),
      });
      const applied = applyModelReview(order, bedrock.payload);
      if (!applied.ok) {
        throw new ReviewOrchestrationError("bedrock_review_rejected", applied.error, "bedrock");
      }
      const meta: ReviewMeta = {
        engine: "bedrock",
        bedrockRequestId: bedrock.requestId,
        agentRetries: bedrock.agentRetries,
        reviewedAt,
      };
      return {
        order: { ...applied.order, review_meta: meta },
        engine: "bedrock",
        notice: applied.notice ?? `核对引擎：${reviewEngineLabel("bedrock")}`,
        meta,
      };
    } catch (error) {
      if (error instanceof ReviewOrchestrationError) throw error;
      if (error instanceof IntegrationError) {
        throw new ReviewOrchestrationError(error.code, error.message, "bedrock");
      }
      const message = error instanceof Error ? error.message : "Bedrock 调用失败。";
      throw new ReviewOrchestrationError("bedrock_call_failed", message, "bedrock");
    }
  }

  if (engine === "ai_gateway") {
    if (!config.gatewayConfigured) {
      throw new ReviewOrchestrationError(
        "gateway_not_configured",
        "需要 AI Gateway，但缺少 AI_GATEWAY_API_KEY。没有调用模型，也没有用规则引擎冒充。",
        "ai_gateway",
      );
    }
    try {
      const gateway = await reviewWithGateway({
        order,
        apiKey: env.AI_GATEWAY_API_KEY ?? "",
        model: env.AI_GATEWAY_MODEL,
      });
      const applied = applyModelReview(order, gateway.payload);
      if (!applied.ok) {
        throw new ReviewOrchestrationError("gateway_review_rejected", applied.error, "ai_gateway");
      }
      const meta: ReviewMeta = {
        engine: "ai_gateway",
        gatewayUsage: gateway.usage,
        reviewedAt,
      };
      return {
        order: { ...applied.order, review_meta: meta },
        engine: "ai_gateway",
        notice: applied.notice ?? `核对引擎：${reviewEngineLabel("ai_gateway")}`,
        meta,
      };
    } catch (error) {
      if (error instanceof ReviewOrchestrationError) throw error;
      if (error instanceof GatewayError) {
        throw new ReviewOrchestrationError(error.code, error.message, "ai_gateway");
      }
      const message = error instanceof Error ? error.message : "AI Gateway 调用失败。";
      throw new ReviewOrchestrationError("gateway_call_failed", message, "ai_gateway");
    }
  }

  if (engine === "deepseek") {
    if (!config.deepseekConfigured) {
      throw new ReviewOrchestrationError(
        "deepseek_not_configured",
        "需要 DeepSeek，但缺少 DEEPSEEK_API_KEY。没有调用模型，也没有用规则引擎、Bedrock 或 AI Gateway 冒充。",
        "deepseek",
      );
    }
    try {
      const deepseek = await reviewWithDeepseek({
        order,
        apiKey: env.DEEPSEEK_API_KEY ?? "",
        baseURL: env.DEEPSEEK_BASE_URL,
        model: env.DEEPSEEK_MODEL,
      });
      const applied = applyModelReview(order, deepseek.payload);
      if (!applied.ok) {
        throw new ReviewOrchestrationError("deepseek_review_rejected", applied.error, "deepseek");
      }
      const meta: ReviewMeta = {
        engine: "deepseek",
        deepseekUsage: deepseek.usage,
        reviewedAt,
      };
      return {
        order: { ...applied.order, review_meta: meta },
        engine: "deepseek",
        notice: applied.notice ?? `核对引擎：${reviewEngineLabel("deepseek")}`,
        meta,
      };
    } catch (error) {
      if (error instanceof ReviewOrchestrationError) throw error;
      if (error instanceof DeepSeekError) {
        throw new ReviewOrchestrationError(error.code, error.message, "deepseek");
      }
      const message = error instanceof Error ? error.message : "DeepSeek 调用失败。";
      throw new ReviewOrchestrationError("deepseek_call_failed", message, "deepseek");
    }
  }

  const result = reviewOrder(order);
  if (!result.ok) {
    throw new ReviewOrchestrationError("review_failed", result.error, "deterministic");
  }
  const meta: ReviewMeta = { engine: "deterministic", reviewedAt };
  return {
    order: { ...result.order, review_meta: meta },
    engine: "deterministic",
    notice: result.notice ?? `核对引擎：${reviewEngineLabel("deterministic")}`,
    meta,
  };
}
