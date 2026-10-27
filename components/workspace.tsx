"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { MessagePane } from "@/components/message-pane";
import { CompareDialog } from "@/components/workspace/compare-dialog";
import { EmailDialog } from "@/components/workspace/email-dialog";
import { EmptyState, LoadingState } from "@/components/workspace/empty-state";
import { FactsPanel } from "@/components/workspace/facts-panel";
import { IssuesWorkbench } from "@/components/workspace/issues-workbench";
import { ReplyDock } from "@/components/workspace/reply-dock";
import { StatusBanner } from "@/components/workspace/status-banner";
import { SummaryDialog } from "@/components/workspace/summary-dialog";
import { Button } from "@/components/ui/button";
import { TopBar, type HealthChip } from "@/components/workspace/top-bar";
import { applyDecision, applyReply, buildChecklist, buildDraft, buildSummary, recordOutbound, reviewOrder } from "@/lib/review/engine";
import { ambiguousReply, createOrderFromScenario, reopenReply, scriptedReplies } from "@/lib/scenario";
import type { DecisionKind, EmailDraft, Order, PersistenceKind, ReviewCompareResult, ReviewEngine, Role, RuntimeConfig } from "@/lib/types";
import {
  CLOSED_STATUSES,
  anchorForIssue,
  askIssueIds,
  commandState,
  defaultDraftIssueIds,
  enginePresentation,
  filterIssues,
  liveEnginePresentation,
  highlightQuotes,
  nextStepHint,
  pickInitialIssue,
  mailPresentation,
  readApiError,
  sendAvailability,
  storeLabel,
  type IssueFilterPriority,
  type IssueFilterStatus,
  type QuoteHighlight,
} from "@/lib/ui/workspace-model";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "ordercheck.demo.v1";

type Banner = { tone: "error" | "info"; message: string; code?: string } | null;
type Pane = "messages" | "issues";

interface ReviewResponse {
  order?: Order;
  engine?: string;
  notice?: string;
  meta?: {
    bedrockRequestId?: string;
    gatewayUsage?: { totalTokens?: number };
    deepseekUsage?: { totalTokens?: number };
    ollamaUsage?: { totalTokens?: number };
    modelRequestId?: string;
  };
  persistence?: { store?: PersistenceKind; ok?: boolean; error?: string };
  error?: { code?: string; message?: string };
}

interface ReviewSuccess {
  ok: true;
  order: Order;
  engine: ReviewEngine;
  notice?: string;
  requestId?: string;
  tokens?: number;
  deepseekTokens?: number;
  ollamaTokens?: number;
  modelRequestId?: string;
  persistence?: { store: PersistenceKind; ok: boolean; error?: string };
}

function isOrder(value: unknown): value is Order {
  if (!value || typeof value !== "object") return false;
  const order = value as Partial<Order>;
  return (
    order.id === "DEMO-001" &&
    Array.isArray(order.messages) &&
    Array.isArray(order.issues) &&
    Array.isArray(order.facts) &&
    Array.isArray(order.outbound) &&
    typeof order.reviewed === "boolean"
  );
}

const PERSISTENCE_KINDS = new Set<PersistenceKind>(["memory", "dynamodb", "sqlite", "postgres"]);

function isReviewEngine(value: unknown): value is ReviewEngine {
  return value === "deterministic" || value === "bedrock" || value === "ai_gateway" || value === "deepseek" || value === "ollama";
}

function reviewNotice(
  engine: ReviewEngine,
  requestId?: string,
  tokens?: number,
  deepseekTokens?: number,
  ollamaTokens?: number,
  modelRequestId?: string,
  notice?: string,
): string {
  const presented = enginePresentation(engine);
  const extra =
    engine === "bedrock" && requestId
      ? ` · request id ${requestId}`
      : engine === "ai_gateway" && tokens != null
        ? ` · tokens ${tokens}`
        : engine === "deepseek" && deepseekTokens != null
          ? ` · tokens ${deepseekTokens}`
          : engine === "ollama"
            ? `${modelRequestId ? ` · request id ${modelRequestId}` : ""}${ollamaTokens != null ? ` · tokens ${ollamaTokens}` : ""}`
            : "";
  const engineNote = `核对引擎：${presented.label}（${presented.code}）。${presented.detail}${extra}`;
  return notice ? `${notice} ${engineNote}` : engineNote;
}

function isCompareResult(value: unknown): value is ReviewCompareResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<ReviewCompareResult>;
  return Boolean(result.deterministic && result.live && result.agreement);
}

async function postReview(order: Order): Promise<ReviewSuccess | { ok: false; code?: string; message: string }> {
  const response = await fetch(`/api/orders/${order.id}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order }),
  });
  let data: ReviewResponse = {};
  try {
    data = (await response.json()) as ReviewResponse;
  } catch {
    data = {};
  }
  if (!response.ok || !data.order) return { ok: false, ...readApiError(data, "核对失败。") };
  if (!isReviewEngine(data.engine)) {
    return {
      ok: false,
      code: "engine_mismatch",
      message: `核对返回了 ${String(data.engine)}，没有改标成规则引擎。`,
    };
  }
  const store = data.persistence?.store && PERSISTENCE_KINDS.has(data.persistence.store) ? data.persistence.store : undefined;
  return {
    ok: true,
    order: data.order,
    engine: data.engine,
    notice: data.notice,
    requestId: data.meta?.bedrockRequestId,
    tokens: data.meta?.gatewayUsage?.totalTokens,
    deepseekTokens: data.meta?.deepseekUsage?.totalTokens,
    ollamaTokens: data.meta?.ollamaUsage?.totalTokens,
    modelRequestId: data.meta?.modelRequestId,
    persistence: store && typeof data.persistence?.ok === "boolean" ? { store, ok: data.persistence.ok, error: data.persistence.error } : undefined,
  } satisfies ReviewSuccess;
}

export function Workspace({ config }: { config: RuntimeConfig }) {
  const [ready, setReady] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [anchor, setAnchor] = useState<QuoteHighlight | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [pane, setPane] = useState<Pane>("messages");
  const [statusFilter, setStatusFilter] = useState<IssueFilterStatus>("all");
  const [priorityFilter, setPriorityFilter] = useState<IssueFilterPriority>("all");
  const [emailOpen, setEmailOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareResult, setCompareResult] = useState<ReviewCompareResult | null>(null);
  const [compareError, setCompareError] = useState<{ code?: string; message: string } | null>(null);
  const [draft, setDraft] = useState<EmailDraft | null>(null);
  const [draftEngine, setDraftEngine] = useState<ReviewEngine | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [compareBusy, setCompareBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [pendingSend, setPendingSend] = useState<"record" | "live" | null>(null);
  const [replyRole, setReplyRole] = useState<Role>("buyer");
  const [replyBody, setReplyBody] = useState("");
  const [health, setHealth] = useState<HealthChip>({ state: "loading", missing: [] });
  const draftRequest = useRef(0);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!isOrder(parsed)) return;
      setOrder(parsed);
      const first = pickInitialIssue(parsed);
      if (!first) return;
      setSelectedIssueId(first.issue_id);
      setAnchor(anchorForIssue(first));
    } catch {
      setBanner({ tone: "error", message: "本机保存的样例读不出来，已忽略。可以重新加载 DEMO-001。", code: "local_store" });
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!order) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  }, [order, ready]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then(async (response) => {
        const data = (await response.json()) as {
          ok?: boolean;
          missing?: string[];
          reviewEngine?: unknown;
          reviewEngineSelection?: unknown;
          reviewEngineError?: unknown;
          liveEngine?: unknown;
          persistence?: unknown;
          persistenceError?: unknown;
          objectStore?: unknown;
          deepseek?: unknown;
          ollama?: unknown;
          smtp?: unknown;
          sesLive?: unknown;
        };
        if (cancelled) return;
        const missing = Array.isArray(data.missing) ? data.missing.filter((item) => typeof item === "string") : [];
        const persistence = PERSISTENCE_KINDS.has(data.persistence as PersistenceKind) ? (data.persistence as PersistenceKind) : undefined;
        const objectStore =
          data.objectStore === "minio" || data.objectStore === "s3" || data.objectStore === "disk" || data.objectStore === "none"
            ? data.objectStore
            : undefined;
        const reported = {
          reviewEngine: typeof data.reviewEngine === "string" ? data.reviewEngine : undefined,
          reviewEngineSelection: typeof data.reviewEngineSelection === "string" ? data.reviewEngineSelection : undefined,
          reviewEngineError: typeof data.reviewEngineError === "string" ? data.reviewEngineError : undefined,
          liveEngine: data.liveEngine === null ? null : typeof data.liveEngine === "string" ? data.liveEngine : undefined,
          persistence,
          persistenceError: typeof data.persistenceError === "string" ? data.persistenceError : undefined,
          objectStore,
          deepseek: typeof data.deepseek === "boolean" ? data.deepseek : undefined,
          ollama: typeof data.ollama === "boolean" ? data.ollama : undefined,
          smtp: typeof data.smtp === "boolean" ? data.smtp : undefined,
          sesLive: typeof data.sesLive === "boolean" ? data.sesLive : undefined,
        };
        if (!response.ok || data.ok !== true) {
          setHealth({ state: "unavailable", missing, ...reported });
          return;
        }
        const degraded = missing.length > 0 || Boolean(reported.reviewEngineError || reported.persistenceError);
        setHealth({ state: degraded ? "degraded" : "ok", missing, ...reported });
      })
      .catch(() => {
        if (!cancelled) setHealth({ state: "unavailable", missing: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!anchor) return;
    const node = document.getElementById(`message-${anchor.messageId}`);
    if (!node) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  }, [anchor]);

  const summary = useMemo(() => (order?.reviewed ? buildSummary(order) : null), [order]);
  const checklist = useMemo(() => (order?.reviewed ? buildChecklist(order) : []), [order]);
  const filteredIssues = useMemo(
    () => (order ? filterIssues(order.issues, statusFilter, priorityFilter) : []),
    [order, statusFilter, priorityFilter],
  );
  const highlights = useMemo(() => (order ? highlightQuotes(order, selectedIssueId, anchor) : []), [order, selectedIssueId, anchor]);
  const scripted = scriptedReplies();
  const nextReply = order ? scripted.find((message) => !order.messages.some((item) => item.id === message.id)) : undefined;
  const played = scripted.filter((message) => order?.messages.some((item) => item.id === message.id)).length;
  const openCount = order?.issues.filter((issue) => !CLOSED_STATUSES.has(issue.status)).length ?? 0;
  const highOpen = order?.issues.filter((issue) => issue.priority === "high" && !CLOSED_STATUSES.has(issue.status)).length ?? 0;
  const hiddenSelection = Boolean(
    selectedIssueId &&
      order?.issues.some((issue) => issue.issue_id === selectedIssueId) &&
      !filteredIssues.some((issue) => issue.issue_id === selectedIssueId),
  );
  const commands = commandState({
    hasOrder: Boolean(order),
    reviewed: Boolean(order?.reviewed),
    reviewBusy,
    compareBusy,
    draftBusy,
    sendBusy,
    hasDraft: Boolean(draft),
    ready,
  });
  const hasRecordable = order?.issues.some((issue) => issue.status === "unconfirmed" || issue.status === "reopened") ?? false;
  const hint = nextStepHint({
    hasOrder: Boolean(order),
    reviewed: Boolean(order?.reviewed),
    hasDraft: Boolean(draft),
    sesLive: config.sesLive,
    smtp: config.smtpConfigured,
    hasRecordable,
  });
  const mailActions = sendAvailability(config);
  const configuredEngine = enginePresentation(config.reviewEngine);
  const liveEngine = liveEnginePresentation(config.liveEngine);
  const mail = mailPresentation(config);

  function focusIssue(next: Order, issueId?: string | null) {
    const issue = next.issues.find((item) => item.issue_id === issueId) ?? pickInitialIssue(next);
    if (!issue) return;
    setSelectedIssueId(issue.issue_id);
    const nextAnchor = anchorForIssue(issue);
    if (nextAnchor) setAnchor(nextAnchor);
  }

  function commit(next: Order, message?: string, code?: string) {
    setOrder(next);
    setBanner(message ? { tone: "info", message, code } : null);
  }

  async function loadDemo() {
    const next = createOrderFromScenario();
    setOrder(next);
    setAnchor(null);
    setSelectedIssueId(null);
    setDraft(null);
    setDraftEngine(null);
    setEmailOpen(false);
    setSummaryOpen(false);
    setCompareOpen(false);
    setCompareResult(null);
    setCompareError(null);
    setReplyBody("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setPane("messages");
    const durable = config.persistence === "postgres" || config.persistence === "sqlite" || config.persistence === "dynamodb";
    if (!durable) {
      setBanner({ tone: "info", message: "已加载 DEMO-001。三封邮件已入账，尚未核对。订单接口使用进程内存。" });
      return;
    }
    const persisted = storeLabel(config.persistence);
    setBanner({ tone: "info", message: `已在浏览器加载 DEMO-001，正在写入 ${persisted}。` });
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixture: "DEMO-001" }),
      });
      let data: { error?: { code?: string; message?: string } } = {};
      try {
        data = (await response.json()) as { error?: { code?: string; message?: string } };
      } catch {
        data = {};
      }
      if (!response.ok) {
        const error = readApiError(data, `写入 ${persisted} 失败。`);
        setBanner({
          tone: "error",
          message: `${error.message} 浏览器里的 DEMO-001 仍可使用，没有把这份样例标成已写入 ${persisted}。`,
          code: error.code ?? "persist_failed",
        });
        return;
      }
      setBanner({ tone: "info", message: `已加载 DEMO-001，并写入 ${persisted}。工作台副本仍在本机浏览器。三封邮件已入账，尚未核对。` });
    } catch (error) {
      const message = error instanceof Error ? error.message : `写入 ${persisted} 失败。`;
      setBanner({
        tone: "error",
        message: `${message} 浏览器里的 DEMO-001 仍可使用，没有把这份样例标成已写入 ${persisted}。`,
        code: "persist_failed",
      });
    }
  }

  async function onReview() {
    if (!order || reviewBusy) return;
    setReviewBusy(true);
    setBanner(null);
    try {
      if (!config.reviewEngineError && config.reviewEngine === "deterministic") {
        const result = reviewOrder(order);
        if (!result.ok) {
          setBanner({ tone: "error", message: result.error, code: "review_rejected" });
          return;
        }
        setOrder(result.order);
        setBanner({ tone: "info", message: reviewNotice("deterministic") });
        focusIssue(result.order);
        setPane("issues");
        return;
      }
      const result = await postReview(order);
      if (!result.ok) {
        setBanner({ tone: "error", message: result.message, code: result.code });
        return;
      }
      setOrder(result.order);
      const notice = reviewNotice(
        result.engine,
        result.requestId,
        result.tokens,
        result.deepseekTokens,
        result.ollamaTokens,
        result.modelRequestId,
        result.notice,
      );
      if (result.persistence && result.persistence.ok === false) {
        setBanner({
          tone: "error",
          message: `${notice} 核对引擎已返回结果，但写入 ${result.persistence.store} 失败${result.persistence.error ? `：${result.persistence.error}` : ""}。工作台显示的是这次核对结果，没有把存储标成成功。`,
          code: "persistence_failed",
        });
      } else {
        setBanner({ tone: "info", message: notice });
      }
      focusIssue(result.order);
      setPane("issues");
    } catch (error) {
      setBanner({ tone: "error", message: error instanceof Error ? error.message : "核对请求失败。", code: "review_failed" });
    } finally {
      setReviewBusy(false);
    }
  }

  async function onCompare() {
    if (!order || compareBusy || reviewBusy) return;
    setCompareOpen(true);
    setCompareBusy(true);
    setCompareResult(null);
    setCompareError(null);
    try {
      const response = await fetch(`/api/orders/${order.id}/review-compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
      let data: unknown = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }
      if (!response.ok || !isCompareResult(data)) {
        const error = readApiError(data as { error?: { code?: string; message?: string } } | null, "对照失败。");
        setCompareError(error);
        setBanner({ tone: "error", message: error.message, code: error.code });
        return;
      }
      setCompareResult(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "对照请求失败。";
      setCompareError({ code: "review_failed", message });
      setBanner({ tone: "error", message, code: "review_failed" });
    } finally {
      setCompareBusy(false);
    }
  }

  function locate(messageId: string, quote: string) {
    setAnchor({ messageId, quote });
    const owner = order?.issues.find(
      (issue) =>
        issue.evidence.some((item) => item.message_id === messageId && item.quote === quote) ||
        issue.resolution_evidence.some((item) => item.message_id === messageId && item.quote === quote),
    );
    if (owner) setSelectedIssueId(owner.issue_id);
    setPane("messages");
  }

  function onDecide(issueId: string, decision: DecisionKind, reason: string): string | null {
    if (!order) return "还没有订单。";
    const result = applyDecision(order, issueId, decision, reason, { actor: order.seller.name });
    if (!result.ok) return result.error;
    commit(result.order, "已记录人工决定，并写明了操作者和理由。");
    return null;
  }

  async function requestDraft(issueIds: string[]) {
    if (!order || issueIds.length === 0) return;
    const requestId = draftRequest.current + 1;
    draftRequest.current = requestId;
    setDraftBusy(true);
    try {
      const response = await fetch(`/api/orders/${order.id}/email-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order, issue_ids: issueIds }),
      });
      const data = (await response.json()) as {
        draft?: EmailDraft;
        draftEngine?: ReviewEngine;
        notice?: string;
        error?: { code?: string; message?: string };
      };
      if (requestId !== draftRequest.current) return;
      if (!response.ok || !data.draft || !isReviewEngine(data.draftEngine)) {
        const error = readApiError(data, "生成草稿失败。");
        if (config.reviewEngine === "deepseek") {
          setDraft(null);
          setDraftEngine(null);
          setEmailOpen(false);
          setBanner({ tone: "error", message: `${error.message} 没有使用确定性模板。`, code: error.code ?? "draft_failed" });
          return;
        }
        setDraft(buildDraft(order, issueIds));
        setDraftEngine("deterministic");
        setBanner({ tone: "error", message: `${error.message} 已改用确定性模板，并标成规则引擎。`, code: error.code });
        return;
      }
      if (config.reviewEngine === "deepseek" && data.draftEngine !== "deepseek") {
        setDraft(null);
        setDraftEngine(null);
        setEmailOpen(false);
        setBanner({
          tone: "error",
          message: `草稿引擎是 ${data.draftEngine}，与配置的 DeepSeek 不一致。没有使用确定性模板。`,
          code: "engine_mismatch",
        });
        return;
      }
      setDraft(data.draft);
      setDraftEngine(data.draftEngine);
      if (data.notice && data.draftEngine !== "deterministic") setBanner({ tone: "info", message: data.notice });
    } catch (error) {
      if (requestId !== draftRequest.current) return;
      if (config.reviewEngine === "deepseek") {
        setDraft(null);
        setDraftEngine(null);
        setEmailOpen(false);
        setBanner({
          tone: "error",
          message: `${error instanceof Error ? error.message : "生成草稿失败。"} 没有使用确定性模板。`,
          code: "draft_failed",
        });
        return;
      }
      setDraft(buildDraft(order, issueIds));
      setDraftEngine("deterministic");
      setBanner({
        tone: "error",
        message: error instanceof Error ? error.message : "生成草稿失败，已使用确定性模板。",
        code: "draft_failed",
      });
    } finally {
      if (requestId === draftRequest.current) setDraftBusy(false);
    }
  }

  function openEmail(issueIds?: string[]) {
    if (!order) return;
    const ids = issueIds && issueIds.length > 0 ? issueIds : defaultDraftIssueIds(order);
    if (ids.length === 0) {
      setBanner({ tone: "error", message: "没有还能写入确认邮件的事项。", code: "draft_empty" });
      return;
    }
    if (config.reviewEngine === "deepseek") {
      setDraft(null);
      setDraftEngine(null);
    } else {
      setDraft(buildDraft(order, ids));
      setDraftEngine("deterministic");
    }
    setEmailOpen(true);
    void requestDraft(ids);
  }

  function onAsk(issueId: string): string | null {
    if (!order) return "还没有订单。";
    const result = askIssueIds(order, issueId);
    if (!result.ok) return result.reason;
    openEmail(result.ids);
    return null;
  }

  function toggleIssue(issueId: string) {
    if (!order || !draft) return;
    const nextIds = draft.issue_ids.includes(issueId) ? draft.issue_ids.filter((id) => id !== issueId) : [...draft.issue_ids, issueId];
    if (nextIds.length === 0) return;
    if (config.reviewEngine === "deepseek") {
      setDraft(null);
      setDraftEngine(null);
    } else {
      setDraft(buildDraft(order, nextIds));
      setDraftEngine("deterministic");
    }
    void requestDraft(nextIds);
  }

  async function sendDraft(mode: "record" | "live") {
    if (!order || !draft || sendBusy) return;
    const gate = mode === "live" ? mailActions.live : mailActions.record;
    if (gate.disabled) {
      setBanner({ tone: "error", message: gate.reason ?? "不能发送。", code: mode === "live" ? "mail_unavailable" : "record_unavailable" });
      return;
    }
    setPendingSend(mode);
    setSendBusy(true);
    try {
      if (mode === "live") {
        const response = await fetch(`/api/orders/${order.id}/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order,
            to: draft.to,
            subject: draft.subject,
            body: draft.body,
            issue_ids: draft.issue_ids,
          }),
        });
        const data = (await response.json()) as {
          order?: Order;
          delivery_status?: string;
          messageId?: string;
          transport?: string;
          error?: { code?: string; message?: string };
        };
        if (!response.ok || !data.order) {
          const error = readApiError(data, mailActions.transport === "smtp" ? "SMTP 发信失败。" : "SES 发信失败。");
          setBanner({ tone: "error", message: error.message, code: error.code });
          return;
        }
        const accepted =
          data.transport === "smtp"
            ? `SMTP 已接受提交${data.messageId ? `（MessageId: ${data.messageId}）` : ""}。这是提交成功，不是已投递。`
            : data.transport === "ses"
              ? `Amazon SES 已接受提交${data.messageId ? `（MessageId: ${data.messageId}）` : ""}。这是提交成功，不是已投递。`
              : "已记录外发，但没有真实提交。";
        commit(data.order, data.delivery_status === "submit_succeeded" ? accepted : "已记录外发，但没有真实提交。");
        setDraft(null);
        setDraftEngine(null);
        setEmailOpen(false);
        setPane("messages");
        return;
      }

      const result = recordOutbound(order, {
        to: draft.to,
        subject: draft.subject,
        body: draft.body,
        issueIds: draft.issue_ids,
      });
      if (!result.ok) {
        setBanner({ tone: "error", message: result.error, code: "send_rejected" });
        return;
      }
      commit(result.order, "已记录外发。投递状态是未发送：没有调用 SMTP，也没有调用 SES。");
      setDraft(null);
      setDraftEngine(null);
      setEmailOpen(false);
      setPane("messages");
    } catch (error) {
      setBanner({ tone: "error", message: error instanceof Error ? error.message : "发信请求失败。", code: "send_failed" });
    } finally {
      setSendBusy(false);
      setPendingSend(null);
    }
  }

  function play(message: ReturnType<typeof scriptedReplies>[number]) {
    if (!order) return;
    const result = applyReply(order, message);
    if (!result.ok) {
      setBanner({ tone: "error", message: result.error, code: "reply_rejected" });
      return;
    }
    commit(result.order, result.notice);
    focusIssue(result.order, selectedIssueId);
    setPane("issues");
  }

  function playCustom() {
    if (!order) return;
    const result = applyReply(order, {
      id: `manual-${order.messages.length + 1}`,
      source: "manual",
      from_role: replyRole,
      sent_at: new Date().toISOString(),
      subject: "Re: Gift packaging order - requirements",
      body: replyBody,
    });
    if (!result.ok) {
      setBanner({ tone: "error", message: result.error, code: "reply_rejected" });
      return;
    }
    setReplyBody("");
    commit(result.order, result.notice);
    focusIssue(result.order, selectedIssueId);
    setPane("issues");
  }

  const showRuntimeNote =
    config.mode === "aws" ||
    config.reviewEngine !== "deterministic" ||
    Boolean(config.reviewEngineError) ||
    config.sesLive ||
    config.smtpConfigured ||
    config.liveEngine !== null;

  const guide = !order?.reviewed
    ? {
        kicker: "下一步 · 订单确认前",
        title: "确认订单前，把没说清的地方找出来",
        detail: `已收集 ${order?.messages.length ?? 0} 份材料。核对只提出建议，不会自动修改条件或发送邮件。`,
        label: reviewBusy ? "正在核对…" : "开始核对",
        command: commands.review,
        run: () => void onReview(),
      }
    : !draft
      ? {
          kicker: "下一步 · 由你决定",
          title: openCount ? `还有 ${openCount} 项，需要双方说清楚` : "本轮核对已处理",
          detail: openCount ? "展开差异后，再起草一封确认邮件。助手不会代替双方承诺。" : "可以查看约定摘要，或在邮件下方回放后续回复。",
          label: draftBusy ? "正在起草…" : openCount ? "起草确认邮件" : "查看约定摘要",
          command: openCount ? commands.draft : commands.summary,
          run: () => (openCount ? openEmail() : setSummaryOpen(true)),
        }
      : {
          kicker: "下一步 · 发出前再看一遍",
          title: "确认邮件已起草",
          detail: mail.transport === "recorded" ? "没有 SMTP 时只记录外发。投递状态是未发送，不会调用 SES。" : mail.detail,
          label: sendBusy ? "正在记录…" : "检查草稿并记录",
          command: commands.record,
          run: () => setEmailOpen(true),
        };

  return (
    <div className="min-h-dvh bg-canvas text-ink lg:pl-[216px]">
      <aside className="flex flex-col bg-navy px-[18px] pb-6 pt-7 text-[#d2deed] lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:h-dvh lg:w-[216px] lg:overflow-y-auto">
        <Link href="/" className="flex items-center gap-2 rounded-md px-2 text-white">
          <BrandMark />
          <span className="text-[22px] font-bold tracking-[-1px]">OrderCheck</span>
        </Link>
        <p className="px-2 pb-8 pt-2.5 text-[10px] tracking-[2px] text-[#8298b3]">订单核对</p>
        <p className="px-3.5 pb-3 text-[10px] tracking-[1.3px] text-[#8298b3]">当前订单</p>
        {order ? (
          <div className="rounded-r-[5px] border-l-2 border-[#7396ff] bg-[#1c3552] px-3.5 py-3.5 text-[12px] leading-relaxed">
            <span className="block text-[10px] text-[#86a0bd]">{order.id}</span>
            <span className="mt-1 block text-white">{order.name}</span>
            <span className="mt-1 block text-[10px] text-[#86a0bd]">{order.buyer.name}</span>
            <span className="mt-1 block text-[10px] text-[#f0d7a2]">
              {order.reviewed ? (openCount ? `${openCount} 项尚待对齐` : "本轮已处理") : "等待首次核对"}
            </span>
          </div>
        ) : (
          <p className="rounded-r-[5px] border-l-2 border-[#3d5674] bg-[#1c3552] px-3.5 py-3.5 text-[12px] text-[#86a0bd]">未加载订单</p>
        )}
        <p className="px-2.5 py-4 text-[11px] leading-relaxed text-[#8298b3]">每张订单保留一条沟通。这里只有样例 DEMO-001。</p>
        <div className="mt-auto px-1 pt-6">
          <button
            type="button"
            className="w-full rounded-md border border-[#3d5674] px-3 py-2 text-left text-[12px] text-[#d2deed] hover:bg-[#233c59] disabled:opacity-45"
            disabled={commands.load.disabled}
            onClick={() => void loadDemo()}
          >
            {order ? "重新加载 DEMO-001" : "加载 DEMO-001"}
          </button>
          {order ? (
            <a href="#demo-replay" className="mt-3 block px-1 text-[11px] text-[#adc0d9] hover:text-white">
              演示与测试
            </a>
          ) : null}
          <p className="mt-4 flex items-center gap-2 text-[11px] leading-relaxed text-[#8298b3]">
            <span className="inline-flex size-7 items-center justify-center rounded-full bg-[#38536e] text-[10px] text-white">
              {(order?.seller.name ?? "卖").slice(0, 1)}
            </span>
            <span>
              <strong className="font-medium text-[#becde0]">{order?.seller.name ?? "卖方"}</strong>
              <span className="mt-0.5 block">样例订单。没有 SMTP 时只记录，不发送。</span>
            </span>
          </p>
        </div>
      </aside>

      <div className="min-w-0">
        <TopBar config={config} order={order} health={health} />
        {showRuntimeNote ? (
          <p role="status" className="border-b border-[#eee0c7] bg-attention-soft px-5 py-2 text-[12px] leading-5 text-attention sm:px-8">
            {config.modeLabel} · 核对引擎 {config.reviewEngineError ? "无效" : `${configuredEngine.label} (${configuredEngine.code} · ${config.reviewEngineSelection})`} ·
            自动链 DeepSeek → Ollama → AI Gateway → 规则引擎 · 对照 {config.liveEngine ? `${liveEngine.label} (${liveEngine.code})` : "无，不会调用模型"} · {mail.detail}
            {config.missing.length > 0 ? ` 还缺 ${config.missing.join("、")}。` : ""}
            {config.reviewEngineError ? ` ${config.reviewEngineError}` : ""}
            {config.persistenceError ? ` ${config.persistenceError}` : ""}
            {config.reviewEngine === "bedrock" && !config.bedrockConfigured
              ? " Bedrock 尚未配置齐全，开始核对会返回明确错误，不会回退到规则引擎。"
              : ""}
            {config.reviewEngine === "ai_gateway" && !config.gatewayConfigured ? " AI Gateway 尚未配置 AI_GATEWAY_API_KEY。" : ""}
            {config.reviewEngine === "deepseek" && !config.deepseekConfigured
              ? " DeepSeek 尚未配置 DEEPSEEK_API_KEY。开始核对会返回明确错误，不会回退到规则引擎，也不会标成 Bedrock 或 AI Gateway。"
              : ""}
            {config.reviewEngine === "ollama" && !config.ollamaConfigured
              ? " Ollama 尚未配置 OLLAMA_MODEL。开始核对会返回明确错误，不会回退到规则引擎。"
              : ""}
          </p>
        ) : null}
        {banner ? <StatusBanner tone={banner.tone} message={banner.message} code={banner.code} onDismiss={() => setBanner(null)} /> : null}

        <main id="workspace-main" className="mx-auto max-w-[1600px] px-4 py-6 sm:px-8 sm:py-8" aria-busy={reviewBusy || compareBusy || draftBusy || sendBusy}>
          {!ready ? <LoadingState /> : null}
          {ready && !order ? <EmptyState onLoad={() => void loadDemo()} /> : null}
          {ready && order ? (
            <div>
              <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[11px] tracking-[0.04em] text-[#607da5]">
                    <span className="size-1.5 rounded-full bg-[#516b8f]" aria-hidden />
                    {order.id}
                    <span>/</span>
                    订单确认前
                  </p>
                  <h1 className="mt-2 text-[26px] font-semibold leading-snug tracking-[-0.04em] text-[#222d3d]">{order.name}</h1>
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[#5b79a3]">
                    <span className="grid size-[22px] place-items-center rounded-full bg-[#e4e8ef] text-[10px] text-[#56647a]">{order.buyer.name.slice(0, 1)}</span>
                    <strong className="font-medium text-[#3f536f]">{order.buyer.name}</strong>
                    <span>{order.buyer.email}</span>
                    <span>·</span>
                    <span>{order.seller.name}</span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-[#f3ebd9] px-2 py-1 text-[11px] text-[#947242]">{order.reviewed && openCount === 0 ? "本轮已处理" : "确认前核对"}</span>
                  <Button size="sm" variant="outline" aria-disabled={commands.summary.disabled || undefined} onClick={() => (commands.summary.disabled ? setBanner({ tone: "info", message: commands.summary.reason ?? "先完成核对。" }) : setSummaryOpen(true))}>
                    约定摘要
                  </Button>
                  <Button size="sm" variant="ghost" aria-disabled={commands.compare.disabled || undefined} onClick={() => (commands.compare.disabled ? setBanner({ tone: "info", message: commands.compare.reason ?? "现在不能对照。" }) : void onCompare())}>
                    {compareBusy ? "正在对照…" : "双引擎对比"}
                  </Button>
                </div>
              </div>

              <div className="mb-4 flex gap-2 lg:hidden" role="tablist" aria-label="工作区">
                {(
                  [
                    ["messages", "邮件"],
                    ["issues", "助手"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={pane === id}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-[12px] font-medium",
                      pane === id ? "bg-accent text-white" : "bg-white text-muted",
                    )}
                    onClick={() => setPane(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.92fr)]">
                <section aria-label="订单邮件" className={cn("overflow-hidden rounded-xl border border-line bg-white shadow-[0_2px_7px_#29374a08]", pane !== "messages" && "max-lg:hidden")}>
                  <header className="border-b border-line px-5 py-4">
                    <h2 className="text-[14px] font-semibold text-[#2e3d52]">订单邮件</h2>
                    <p className="mt-1 text-[11px] text-[#748db1]">
                      {order.seller.name} ↔ {order.buyer.name}
                      <span className="mx-1">·</span>
                      {order.messages.length} 份材料 · 按时间排列
                    </p>
                  </header>
                  <div className="px-5">
                    <MessagePane
                      messages={order.messages}
                      buyerName={order.buyer.name}
                      sellerName={order.seller.name}
                      activeMessageId={anchor?.messageId}
                      highlights={highlights}
                    />
                  </div>
                  <ReplyDock
                    reviewed={order.reviewed}
                    played={played}
                    total={scripted.length}
                    nextBody={nextReply?.body}
                    nextRole={nextReply?.from_role}
                    replyRole={replyRole}
                    replyBody={replyBody}
                    onReplyRole={setReplyRole}
                    onReplyBody={setReplyBody}
                    onNext={() => nextReply && play(nextReply)}
                    onAmbiguous={() => play(ambiguousReply())}
                    onReopen={() => play(reopenReply())}
                    onCustom={playCustom}
                  />
                  <p className="flex gap-2 px-5 py-3 text-[11px] leading-relaxed text-[#7b93b5]">已录入的往来在这里。样例发送不会连接真实邮箱。</p>
                </section>

                <aside aria-label="核对助手" className={cn(pane !== "issues" && "max-lg:hidden")}>
                  <div className="mb-4 flex items-start gap-2">
                    <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-[#dce4ef] text-[12px] font-semibold text-[#4b6384]">核</span>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[14px] font-semibold tracking-tight text-[#33445c]">确认前，帮你多看一步</h2>
                      <p className="mt-1 text-[11px] leading-relaxed text-[#718baf]">从往来里找差异，把下一封邮件准备好。</p>
                    </div>
                    <span className="text-[11px] text-[#6c87ad]">{order.reviewed ? `${openCount} 项待处理` : "待核对"}</span>
                  </div>
                  <section className="mb-4 rounded-[11px] border border-[#d1def3] bg-[#eaf1fb] px-5 py-5">
                    <p className="text-[10px] tracking-[0.04em] text-[#6480a8]">{guide.kicker}</p>
                    <h3 className="mt-2 text-[19px] font-medium leading-snug tracking-[-0.03em] text-[#294c76]">{guide.title}</h3>
                    <p className="mt-2 text-[12px] leading-relaxed text-[#5e7ba4]">{guide.detail}</p>
                    <Button className="mt-4 w-full" aria-disabled={guide.command.disabled || undefined} onClick={() => (guide.command.disabled ? setBanner({ tone: "info", message: guide.command.reason ?? hint }) : guide.run())}>
                      {guide.label}
                    </Button>
                    <p className="mt-2 text-center text-[11px] leading-5 text-[#5e7ba4]">{hint}</p>
                  </section>
                  <section className="overflow-hidden rounded-xl border border-line bg-white shadow-[0_2px_7px_#29374a08]">
                    <IssuesWorkbench
                      order={order}
                      issues={filteredIssues}
                      total={order.issues.length}
                      openCount={openCount}
                      highOpen={highOpen}
                      selectedIssueId={selectedIssueId}
                      statusFilter={statusFilter}
                      priorityFilter={priorityFilter}
                      hiddenSelection={hiddenSelection}
                      onStatusFilter={setStatusFilter}
                      onPriorityFilter={setPriorityFilter}
                      onClearFilters={() => {
                        setStatusFilter("all");
                        setPriorityFilter("all");
                      }}
                      onSelect={(issueId) => focusIssue(order, issueId)}
                      onLocate={locate}
                      onAsk={onAsk}
                      onDecide={onDecide}
                    />
                    <div className="border-t border-line bg-[#f9fbfd] px-4 py-3">
                      <p className="mb-2 text-center text-[11px] text-[#7c94b5]">起草后仍要你确认，不会自动发出。</p>
                      <Button className="w-full" size="sm" aria-disabled={commands.draft.disabled || undefined} onClick={() => (commands.draft.disabled ? setBanner({ tone: "info", message: commands.draft.reason ?? "先完成核对。" }) : openEmail())}>
                        {draftBusy ? "正在起草…" : "起草确认邮件"}
                      </Button>
                    </div>
                  </section>
                  <details className="mt-4 rounded-xl border border-line bg-white px-4 py-3">
                    <summary className="cursor-pointer text-[12px] text-[#50647d]">订单事实与外发记录</summary>
                    <FactsPanel order={order} checklist={checklist} onLocate={locate} />
                  </details>
                </aside>
              </div>
            </div>
          ) : null}
        </main>
      </div>

      <EmailDialog
        open={emailOpen}
        draft={draft}
        issues={order?.issues ?? []}
        draftEngine={draftEngine}
        draftBusy={draftBusy}
        sendBusy={sendBusy}
        pendingSend={pendingSend}
        pendingNote={config.reviewEngine === "deepseek" ? "正在向 DeepSeek 请求草稿…" : undefined}
        record={mailActions.record}
        live={mailActions.live}
        transport={mailActions.transport}
        onOpenChange={setEmailOpen}
        onToggleIssue={toggleIssue}
        onChange={setDraft}
        onRecord={() => void sendDraft("record")}
        onLive={() => void sendDraft("live")}
      />
      <SummaryDialog open={summaryOpen} summary={summary} onOpenChange={setSummaryOpen} />
      <CompareDialog open={compareOpen} busy={compareBusy} result={compareResult} error={compareError} onOpenChange={setCompareOpen} />
    </div>
  );
}
