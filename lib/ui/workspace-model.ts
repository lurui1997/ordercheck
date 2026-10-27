import { buildSummary } from "@/lib/review/summary";
import type {
  AgreementSummary,
  DecisionKind,
  Issue,
  IssueStatus,
  Order,
  Priority,
  ReviewEngine,
  RuntimeConfig,
} from "@/lib/types";

export const CLOSED_STATUSES = new Set<IssueStatus>(["confirmed", "accepted_risk", "not_applicable"]);

export const OPEN_FOR_MAIL: IssueStatus[] = ["unconfirmed", "question_sent", "proposed", "reopened", "needs_human_review"];

export type IssueFilterStatus = "all" | "open" | "closed" | IssueStatus;
export type IssueFilterPriority = "all" | Priority;
export type BadgeTone = "neutral" | "accent" | "attention" | "ok" | "danger";
export type CommandId = "load" | "review" | "compare" | "draft" | "record" | "summary";

export interface QuoteHighlight {
  messageId: string;
  quote: string;
}

export interface CompareRow {
  issue_id: string;
  title: string;
  leftStatus?: IssueStatus;
  rightStatus?: IssueStatus;
  agree: boolean;
}

export interface EngineComparison {
  rows: CompareRow[];
  agreed: number;
  disagreed: number;
  leftAgreement?: AgreementSummary["agreement_status"];
  rightAgreement?: AgreementSummary["agreement_status"];
  summariesAgree: boolean;
}

export interface EnginePresentation {
  code: ReviewEngine;
  label: string;
  detail: string;
}

export interface CommandAvailability {
  disabled: boolean;
  reason: string | null;
}

export interface BannerError {
  message: string;
  code?: string;
}

const STATUS_TONE: Record<IssueStatus, BadgeTone> = {
  unconfirmed: "danger",
  question_sent: "accent",
  proposed: "attention",
  confirmed: "ok",
  needs_human_review: "attention",
  accepted_risk: "attention",
  reopened: "danger",
  not_applicable: "neutral",
};

export function statusTone(status: IssueStatus): BadgeTone {
  return STATUS_TONE[status];
}

export function filterIssues(issues: Issue[], status: IssueFilterStatus, priority: IssueFilterPriority): Issue[] {
  return issues.filter((issue) => {
    if (priority !== "all" && issue.priority !== priority) return false;
    if (status === "all") return true;
    if (status === "open") return !CLOSED_STATUSES.has(issue.status);
    if (status === "closed") return CLOSED_STATUSES.has(issue.status);
    return issue.status === status;
  });
}

export function pickInitialIssue(order: Order): Issue | null {
  return (
    order.issues.find((issue) => issue.priority === "high" && !CLOSED_STATUSES.has(issue.status)) ??
    order.issues.find((issue) => !CLOSED_STATUSES.has(issue.status)) ??
    order.issues[0] ??
    null
  );
}

const RECORDABLE: IssueStatus[] = ["unconfirmed", "reopened"];

export function defaultDraftIssueIds(order: Order): string[] {
  const recordable = (priority?: Priority) =>
    order.issues
      .filter((issue) => RECORDABLE.includes(issue.status) && (!priority || issue.priority === priority))
      .map((issue) => issue.issue_id);
  const high = recordable("high");
  if (high.length > 0) return high;
  const anyRecordable = recordable();
  if (anyRecordable.length > 0) return anyRecordable;
  const openHigh = order.issues
    .filter((issue) => issue.priority === "high" && OPEN_FOR_MAIL.includes(issue.status))
    .map((issue) => issue.issue_id);
  if (openHigh.length > 0) return openHigh;
  return order.issues.filter((issue) => OPEN_FOR_MAIL.includes(issue.status)).map((issue) => issue.issue_id);
}

export function askIssueIds(order: Order, issueId: string): { ok: true; ids: string[] } | { ok: false; reason: string } {
  const issue = order.issues.find((item) => item.issue_id === issueId);
  if (!issue) return { ok: false, reason: "没有这个事项。" };
  if (!order.reviewed) return { ok: false, reason: "先完成核对，再起草提问。" };
  if (!OPEN_FOR_MAIL.includes(issue.status)) return { ok: false, reason: "该事项已关闭，不必再问。" };
  return { ok: true, ids: [issueId] };
}

export function highlightQuotes(order: Order, issueId: string | null, anchor: QuoteHighlight | null): QuoteHighlight[] {
  const quotes: QuoteHighlight[] = [];
  if (issueId) {
    const issue = order.issues.find((item) => item.issue_id === issueId);
    if (issue) {
      for (const evidence of issue.evidence) quotes.push({ messageId: evidence.message_id, quote: evidence.quote });
      for (const evidence of issue.resolution_evidence) quotes.push({ messageId: evidence.message_id, quote: evidence.quote });
    }
  }
  if (anchor) quotes.push(anchor);
  return quotes;
}

export function splitByQuotes(body: string, quotes: string[]): Array<{ text: string; mark: boolean }> {
  const unique = [...new Set(quotes.filter((quote) => quote.length > 0))];
  if (unique.length === 0 || !unique.some((quote) => body.includes(quote))) return [{ text: body, mark: false }];

  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  while (cursor < body.length) {
    let best: { start: number; end: number } | null = null;
    for (const quote of unique) {
      const start = body.indexOf(quote, cursor);
      if (start === -1) continue;
      const candidate = { start, end: start + quote.length };
      if (!best || candidate.start < best.start || (candidate.start === best.start && candidate.end > best.end)) {
        best = candidate;
      }
    }
    if (!best) break;
    ranges.push(best);
    cursor = best.end;
  }

  if (ranges.length === 0) return [{ text: body, mark: false }];

  const parts: Array<{ text: string; mark: boolean }> = [];
  let index = 0;
  for (const range of ranges) {
    if (range.start > index) parts.push({ text: body.slice(index, range.start), mark: false });
    parts.push({ text: body.slice(range.start, range.end), mark: true });
    index = range.end;
  }
  if (index < body.length) parts.push({ text: body.slice(index), mark: false });
  return parts;
}

export function compareOrders(left: Order, right: Order): EngineComparison {
  const leftById = new Map(left.issues.map((issue) => [issue.issue_id, issue]));
  const rightById = new Map(right.issues.map((issue) => [issue.issue_id, issue]));
  const ids = [...new Set([...leftById.keys(), ...rightById.keys()])].sort((a, b) => a.localeCompare(b));
  const rows = ids.map((id) => {
    const leftIssue = leftById.get(id);
    const rightIssue = rightById.get(id);
    return {
      issue_id: id,
      title: leftIssue?.title ?? rightIssue?.title ?? id,
      leftStatus: leftIssue?.status,
      rightStatus: rightIssue?.status,
      agree: Boolean(leftIssue && rightIssue && leftIssue.status === rightIssue.status),
    };
  });
  const agreed = rows.filter((row) => row.agree).length;
  const leftSummary = left.reviewed ? buildSummary(left) : null;
  const rightSummary = right.reviewed ? buildSummary(right) : null;
  const leftAgreement = leftSummary?.agreement_status;
  const rightAgreement = rightSummary?.agreement_status;
  return {
    rows,
    agreed,
    disagreed: rows.length - agreed,
    leftAgreement,
    rightAgreement,
    summariesAgree: leftAgreement !== undefined && leftAgreement === rightAgreement,
  };
}

export function enginePresentation(engine: ReviewEngine): EnginePresentation {
  switch (engine) {
    case "bedrock":
      return {
        code: "bedrock",
        label: "Bedrock",
        detail: "核对走 Amazon Bedrock。失败会返回错误，不会改标成规则引擎。",
      };
    case "ai_gateway":
      return {
        code: "ai_gateway",
        label: "AI Gateway",
        detail: "核对走 Vercel AI Gateway。不是 Amazon Bedrock，也不是规则引擎。",
      };
    default:
      return {
        code: "deterministic",
        label: "规则引擎",
        detail: "确定性规则引擎。这次核对没有调用 Amazon Bedrock 或 AI Gateway。",
      };
  }
}

export function persistencePresentation(config: Pick<RuntimeConfig, "dynamoConfigured">): { label: string; detail: string } {
  if (config.dynamoConfigured) {
    return {
      label: "DynamoDB",
      detail: "订单接口写入 DynamoDB。当前工作台副本仍保存在本机浏览器。",
    };
  }
  return {
    label: "浏览器",
    detail: "工作台保存在本机浏览器。订单接口使用进程内存，新实例为空。",
  };
}

export function sesPresentation(config: Pick<RuntimeConfig, "sesLive">): { label: string; detail: string } {
  if (config.sesLive) {
    return {
      label: "SES 真发信",
      detail: "将调用 Amazon SES。成功只表示已提交，不是已投递。",
    };
  }
  return {
    label: "SES 未发信",
    detail: "外发只记在订单里。投递状态是未发送，没有调用 SES。",
  };
}

export function commandState(input: {
  hasOrder: boolean;
  reviewed: boolean;
  reviewBusy: boolean;
  compareBusy: boolean;
  draftBusy: boolean;
  sendBusy: boolean;
  hasDraft: boolean;
  ready?: boolean;
}): Record<CommandId, CommandAvailability> {
  if (input.ready === false) {
    const blocked = { disabled: true, reason: "正在打开工作台。" };
    return { load: blocked, review: blocked, compare: blocked, draft: blocked, record: blocked, summary: blocked };
  }
  let reviewReason: string | null = null;
  if (!input.hasOrder) reviewReason = "先加载订单。";
  else if (input.reviewBusy) reviewReason = "正在核对。";

  let compareReason: string | null = null;
  if (!input.hasOrder) compareReason = "先加载订单。";
  else if (input.reviewBusy) compareReason = "请等待核对结束。";
  else if (input.compareBusy) compareReason = "正在对照。";

  let draftReason: string | null = null;
  if (!input.hasOrder) draftReason = "先加载订单。";
  else if (!input.reviewed) draftReason = "先完成核对。";
  else if (input.reviewBusy) draftReason = "请等待核对结束。";
  else if (input.draftBusy) draftReason = "正在生成草稿。";

  let recordReason: string | null = null;
  if (!input.hasDraft) recordReason = "先生成确认邮件。";
  else if (input.sendBusy) recordReason = "正在记录发送。";

  let summaryReason: string | null = null;
  if (!input.hasOrder) summaryReason = "先加载订单。";
  else if (!input.reviewed) summaryReason = "先完成核对。";

  let loadReason: string | null = null;
  if (input.reviewBusy) loadReason = "请等待核对结束。";
  else if (input.compareBusy) loadReason = "请等待对照结束。";
  else if (input.sendBusy) loadReason = "请等待发送结束。";

  return {
    load: { disabled: loadReason !== null, reason: loadReason },
    review: { disabled: reviewReason !== null, reason: reviewReason },
    compare: { disabled: compareReason !== null, reason: compareReason },
    draft: { disabled: draftReason !== null, reason: draftReason },
    record: { disabled: recordReason !== null, reason: recordReason },
    summary: { disabled: summaryReason !== null, reason: summaryReason },
  };
}

export function nextStepHint(input: {
  hasOrder: boolean;
  reviewed: boolean;
  hasDraft: boolean;
  sesLive: boolean;
  hasRecordable?: boolean;
}): string {
  if (!input.hasOrder) return "下一步：加载 DEMO-001。";
  if (!input.reviewed) return "下一步：开始核对。只展示能在原文定位的缺口。";
  if (!input.hasDraft && input.hasRecordable === false) {
    return "下一步：回放回复，或打开约定摘要。已提问的事项在新回复前不会再次记录发送。";
  }
  if (!input.hasDraft) return "下一步：生成确认邮件。";
  if (input.sesLive) return "下一步：在草稿中选择 SES 提交，或仅记录不发送。";
  return "下一步：在草稿中确认记录发送。当前不会调用 SES。";
}

export function sendAvailability(config: Pick<RuntimeConfig, "mode" | "sesConfigured" | "sesLive">): {
  record: CommandAvailability;
  ses: CommandAvailability;
} {
  if (config.mode === "aws" && !config.sesConfigured) {
    return {
      record: { disabled: true, reason: "AWS_MODE 缺少 SES 配置。没有发信，也没有记成已投递。" },
      ses: { disabled: true, reason: "SES 未配置，不能提交发送。" },
    };
  }
  if (config.sesLive) {
    return {
      record: { disabled: false, reason: null },
      ses: { disabled: false, reason: null },
    };
  }
  return {
    record: { disabled: false, reason: null },
    ses: { disabled: true, reason: "当前不会调用 SES。投递状态只能记为未发送。" },
  };
}

export function readApiError(data: { error?: { code?: string; message?: string } } | null | undefined, fallback: string): BannerError {
  return {
    code: data?.error?.code,
    message: data?.error?.message || fallback,
  };
}

export function anchorForIssue(issue: Issue | null | undefined): QuoteHighlight | null {
  const evidence = issue?.evidence[0] ?? issue?.resolution_evidence[0];
  if (!evidence) return null;
  return { messageId: evidence.message_id, quote: evidence.quote };
}

export function decisionNeedsReason(decision: DecisionKind): boolean {
  return decision === "accepted_risk" || decision === "needs_human_review" || decision === "not_applicable";
}
