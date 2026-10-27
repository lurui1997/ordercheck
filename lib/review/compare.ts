import { missingLiveReviewEnv, availableLiveEngine } from "@/lib/aws/config";
import { ReviewOrchestrationError, runReview } from "@/lib/review/orchestrator";
import { reviewOrder } from "@/lib/review/engine";
import type {
  CompareIssueView,
  CompareSide,
  Issue,
  Order,
  ReviewAgreement,
  ReviewCompareResult,
  ReviewEngine,
  RuntimeConfig,
} from "@/lib/types";

type EnvLike = Record<string, string | undefined>;

function viewIssues(issues: Issue[]): CompareIssueView[] {
  return issues.map((issue) => ({
    issue_id: issue.issue_id,
    title: issue.title,
    status: issue.status,
    kind: issue.kind,
    priority: issue.priority,
  }));
}

function deterministicSide(order: Order): CompareSide {
  const result = reviewOrder(structuredClone(order));
  if (!result.ok) {
    return {
      available: true,
      ran: true,
      engine: "deterministic",
      ok: false,
      issues: [],
      error: result.error,
      code: "review_failed",
    };
  }
  return {
    available: true,
    ran: true,
    engine: "deterministic",
    ok: true,
    issues: viewIssues(result.order.issues),
    notice: "确定性规则引擎。没有调用 Bedrock 或 AI Gateway。",
  };
}

function unavailableLive(env: EnvLike): CompareSide {
  return {
    available: false,
    ran: false,
    engine: null,
    ok: false,
    issues: [],
    code: "live_unavailable",
    error: "live 引擎不可用：没有配置 AI Gateway，也没有同时具备 Bedrock 区域、模型与 AWS 凭证。没有发起模型调用。",
    missing: missingLiveReviewEnv(env),
  };
}

function agreementOf(deterministic: CompareSide, live: CompareSide): ReviewAgreement {
  if (!deterministic.ok || !live.ok || !live.ran) {
    return {
      comparable: false,
      shared: [],
      onlyDeterministic: [],
      onlyLive: [],
      statusMismatches: [],
      jaccard: null,
    };
  }
  const det = new Map(deterministic.issues.map((issue) => [issue.issue_id, issue]));
  const liveMap = new Map(live.issues.map((issue) => [issue.issue_id, issue]));
  const shared = [...det.keys()].filter((id) => liveMap.has(id));
  const onlyDeterministic = [...det.keys()].filter((id) => !liveMap.has(id));
  const onlyLive = [...liveMap.keys()].filter((id) => !det.has(id));
  const statusMismatches = shared.flatMap((id) => {
    const left = det.get(id)!;
    const right = liveMap.get(id)!;
    if (left.status === right.status) return [];
    return [{ issue_id: id, deterministic: left.status, live: right.status }];
  });
  const union = new Set([...det.keys(), ...liveMap.keys()]);
  const jaccard = union.size === 0 ? 1 : shared.length / union.size;
  return { comparable: true, shared, onlyDeterministic, onlyLive, statusMismatches, jaccard };
}

/**
 * Run the deterministic engine and, when configured, one live engine on the
 * same order. Does not write the order. A live failure stays on the live
 * panel — issue ids are not copied from the rule engine.
 */
export async function compareReviews(
  order: Order,
  env: EnvLike = process.env,
  config?: RuntimeConfig,
): Promise<ReviewCompareResult> {
  const deterministic = deterministicSide(order);
  const liveEngine: ReviewEngine | null = config?.liveEngine ?? availableLiveEngine(env);
  if (!liveEngine) {
    const live = unavailableLive(env);
    return { deterministic, live, agreement: agreementOf(deterministic, live) };
  }

  const liveConfig: RuntimeConfig = config
    ? { ...config, reviewEngine: liveEngine, reviewEngineSelection: "explicit" }
    : ({
        mode: "demo",
        modeLabel: "DEMO_MODE",
        missing: [],
        bedrockConfigured: liveEngine === "bedrock",
        gatewayConfigured: liveEngine === "ai_gateway",
        deepseekConfigured: liveEngine === "deepseek",
        ollamaConfigured: liveEngine === "ollama",
        sesConfigured: false,
        sesLive: false,
        smtpConfigured: false,
        dynamoConfigured: false,
        persistence: "memory",
        s3Configured: false,
        objectStore: "none",
        inboundConfigured: false,
        reviewEngine: liveEngine,
        reviewEngineSelection: "explicit",
        liveEngine,
      } satisfies RuntimeConfig);

  try {
    const result = await runReview(structuredClone(order), env, liveConfig);
    const live: CompareSide = {
      available: true,
      ran: true,
      engine: result.engine,
      ok: true,
      issues: viewIssues(result.order.issues),
      notice: result.notice,
    };
    if (result.engine !== liveEngine) {
      return {
        deterministic,
        live: {
          available: true,
          ran: true,
          engine: result.engine,
          ok: false,
          issues: [],
          code: "engine_mismatch",
          error: `live 调用返回了 ${result.engine}，与请求的 ${liveEngine} 不一致。这些事项不会当作 ${liveEngine} 的结果。`,
        },
        agreement: agreementOf(deterministic, {
          available: true,
          ran: true,
          engine: result.engine,
          ok: false,
          issues: [],
        }),
      };
    }
    return { deterministic, live, agreement: agreementOf(deterministic, live) };
  } catch (error) {
    const code = error instanceof ReviewOrchestrationError ? error.code : "live_call_failed";
    const message = error instanceof Error ? error.message : "live 核对失败。";
    const engine = error instanceof ReviewOrchestrationError ? error.engine : liveEngine;
    const live: CompareSide = {
      available: true,
      ran: true,
      engine,
      ok: false,
      issues: [],
      code,
      error: message,
    };
    return { deterministic, live, agreement: agreementOf(deterministic, live) };
  }
}
