import {
  sanitizeModelFacts,
  sanitizeModelIssues,
  type ModelReviewPayload,
  type RawModelIssue,
} from "@/lib/review/evidence";
import type { EngineResult, Issue, Order } from "@/lib/types";

const HOLD = new Set(["accepted_risk", "needs_human_review", "not_applicable"]);

function fail(order: Order, error: string): EngineResult {
  return { ok: false, order, error };
}

function done(order: Order, notice?: string): EngineResult {
  return notice ? { ok: true, order, notice } : { ok: true, order };
}

function toIssue(raw: RawModelIssue, at: string, previous?: Issue): Issue {
  const status =
    previous && HOLD.has(previous.status) && previous.status !== "confirmed"
      ? previous.status
      : raw.status;

  const history = previous?.history ? [...previous.history] : [];
  if (!previous) {
    history.push({
      at,
      from: null,
      to: status,
      actor: "system",
      reason: "模型初次核对。证据已通过原文子串校验；缺少的信息保持未知。",
    });
  } else if (status !== previous.status) {
    history.push({
      at,
      from: previous.status,
      to: status,
      actor: "system",
      reason: "模型重新核对后更新状态。",
    });
  }

  return {
    issue_id: raw.issue_id,
    kind: raw.kind,
    priority: raw.priority,
    title: raw.title,
    evidence: raw.evidence,
    impact: raw.impact,
    question: raw.question,
    status,
    waiting_for: HOLD.has(status) ? "none" : raw.waiting_for,
    resolution_evidence: raw.resolution_evidence,
    history,
    updated_at: !previous || status !== previous.status ? at : previous.updated_at,
    value: raw.value,
    decision_reason: HOLD.has(status) ? previous?.decision_reason : undefined,
    decision_actor: HOLD.has(status) ? previous?.decision_actor : undefined,
  };
}

/**
 * Merge a validated model review into the order as the initial issue set.
 * Reply / decision / outbound continue to use the deterministic state machine.
 */
export function applyModelReview(order: Order, modelResult: ModelReviewPayload): EngineResult {
  const analyzable = order.messages.filter((message) => message.source !== "demo_outbound");
  if (analyzable.length === 0) return fail(order, "还没有可核对的邮件或报价。");

  const issuesSanitized = sanitizeModelIssues(modelResult.issues, order.messages);
  const factsSanitized = sanitizeModelFacts(modelResult.facts, order.messages);

  if (issuesSanitized.kept.length === 0) {
    return fail(
      order,
      issuesSanitized.dropped > 0
        ? "模型返回的事项全部因引用校验失败被丢弃，没有可展示的结果。"
        : "模型没有返回任何事项。",
    );
  }

  const at = analyzable.at(-1)?.sent_at ?? new Date().toISOString();
  const previous = new Map(order.issues.map((issue) => [issue.issue_id, issue]));

  // Cap high-priority display intent: keep all issues, but if more than 3 high, leave as-is
  // (prompt already asks for at most 3 high). Do not silently drop lows.
  const issues = issuesSanitized.kept.map((raw) => toIssue(raw, at, previous.get(raw.issue_id)));

  const noticeParts = [
    "已用模型完成初次核对。",
    issuesSanitized.dropped > 0 ? `丢弃了 ${issuesSanitized.dropped} 条引用无效的事项。` : null,
    factsSanitized.dropped > 0 ? `丢弃了 ${factsSanitized.dropped} 条引用无效的事实。` : null,
  ].filter(Boolean);

  return done(
    {
      ...order,
      reviewed: true,
      reviewed_at: order.reviewed_at ?? at,
      issues,
      facts: factsSanitized.kept,
    },
    noticeParts.join(" "),
  );
}
