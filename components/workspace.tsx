"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessagePane } from "@/components/message-pane";
import { CommandStrip } from "@/components/workspace/command-strip";
import { CompareDialog, type CompareView } from "@/components/workspace/compare-dialog";
import { EmailDialog } from "@/components/workspace/email-dialog";
import { EmptyState, LoadingState } from "@/components/workspace/empty-state";
import { FactsPanel } from "@/components/workspace/facts-panel";
import { IssuesWorkbench } from "@/components/workspace/issues-workbench";
import { ReplyDock } from "@/components/workspace/reply-dock";
import { StatusBanner } from "@/components/workspace/status-banner";
import { SummaryDialog } from "@/components/workspace/summary-dialog";
import { TopBar, type HealthChip } from "@/components/workspace/top-bar";
import { applyDecision, applyReply, buildChecklist, buildDraft, buildSummary, recordOutbound, reviewOrder } from "@/lib/review/engine";
import { ambiguousReply, createOrderFromScenario, reopenReply, scriptedReplies } from "@/lib/scenario";
import type { DecisionKind, EmailDraft, Order, ReviewEngine, Role, RuntimeConfig } from "@/lib/types";
import {
  CLOSED_STATUSES,
  anchorForIssue,
  askIssueIds,
  commandState,
  defaultDraftIssueIds,
  enginePresentation,
  filterIssues,
  highlightQuotes,
  nextStepHint,
  pickInitialIssue,
  readApiError,
  sendAvailability,
  sesPresentation,
  type IssueFilterPriority,
  type IssueFilterStatus,
  type QuoteHighlight,
} from "@/lib/ui/workspace-model";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "ordercheck.demo.v1";

type Banner = { tone: "error" | "info"; message: string; code?: string } | null;
type Pane = "messages" | "issues" | "facts";

interface ReviewResponse {
  order?: Order;
  engine?: string;
  notice?: string;
  bedrockRequestId?: string;
  gatewayUsage?: { totalTokens?: number };
  meta?: { bedrockRequestId?: string; gatewayUsage?: { totalTokens?: number } };
  error?: { code?: string; message?: string };
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

function isReviewEngine(value: unknown): value is ReviewEngine {
  return value === "deterministic" || value === "bedrock" || value === "ai_gateway";
}

function reviewNotice(engine: ReviewEngine, requestId?: string, tokens?: number, notice?: string): string {
  const engineNote =
    engine === "bedrock"
      ? `核对引擎：Amazon Bedrock（真实模型调用，不是规则引擎）${requestId ? ` · request id ${requestId}` : ""}。`
      : engine === "ai_gateway"
        ? `核对引擎：Vercel AI Gateway（真实模型调用；不是 Bedrock，也不是规则引擎）${tokens != null ? ` · tokens ${tokens}` : ""}。`
        : "核对引擎：确定性规则引擎（deterministic）。不是 Bedrock，也不是 AI Gateway。";
  return notice ? `${notice} ${engineNote}` : engineNote;
}

async function postReview(order: Order): Promise<
  | { ok: true; order: Order; engine: ReviewEngine; notice?: string; requestId?: string; tokens?: number }
  | { ok: false; code?: string; message: string }
> {
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
  return {
    ok: true,
    order: data.order,
    engine: isReviewEngine(data.engine) ? data.engine : "deterministic",
    notice: data.notice,
    requestId: data.bedrockRequestId ?? data.meta?.bedrockRequestId,
    tokens: data.gatewayUsage?.totalTokens ?? data.meta?.gatewayUsage?.totalTokens,
  };
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
  const [compareView, setCompareView] = useState<CompareView | null>(null);
  const [draft, setDraft] = useState<EmailDraft | null>(null);
  const [draftEngine, setDraftEngine] = useState<ReviewEngine | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [compareBusy, setCompareBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [pendingSend, setPendingSend] = useState<"record" | "ses" | null>(null);
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
        const data = (await response.json()) as { ok?: boolean; missing?: string[] };
        if (cancelled) return;
        const missing = Array.isArray(data.missing) ? data.missing.filter((item) => typeof item === "string") : [];
        if (!response.ok || data.ok !== true) {
          setHealth({ state: "unavailable", missing });
          return;
        }
        setHealth({ state: missing.length > 0 ? "degraded" : "ok", missing });
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
    hasRecordable,
  });
  const mailActions = sendAvailability(config);
  const configuredEngine = enginePresentation(config.reviewEngine);

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

  function loadDemo() {
    const next = createOrderFromScenario();
    setOrder(next);
    setAnchor(null);
    setSelectedIssueId(null);
    setDraft(null);
    setDraftEngine(null);
    setEmailOpen(false);
    setSummaryOpen(false);
    setCompareOpen(false);
    setCompareView(null);
    setReplyBody("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setBanner({ tone: "info", message: "已加载 DEMO-001。三封邮件已入账，尚未核对。" });
    setPane("messages");
  }

  async function onReview() {
    if (!order || reviewBusy) return;
    setReviewBusy(true);
    setBanner(null);
    try {
      if (config.reviewEngine === "deterministic") {
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
      setBanner({ tone: "info", message: reviewNotice(result.engine, result.requestId, result.tokens, result.notice) });
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
    setCompareView(null);
    const local = reviewOrder(order);
    const left = local.ok ? local.order : null;
    const leftError = local.ok ? undefined : local.error;
    if (config.reviewEngine === "deterministic") {
      setCompareView({ left, leftError, right: null, rightEngine: null, singleEngine: true });
      setCompareBusy(false);
      return;
    }
    try {
      const result = await postReview(order);
      if (!result.ok) {
        setCompareView({
          left,
          leftError,
          right: null,
          rightEngine: config.reviewEngine,
          rightError: { code: result.code, message: result.message },
          singleEngine: false,
        });
        setBanner({ tone: "error", message: result.message, code: result.code });
        return;
      }
      setCompareView({
        left,
        leftError,
        right: result.order,
        rightEngine: result.engine,
        singleEngine: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "对照请求失败。";
      setCompareView({
        left,
        leftError,
        right: null,
        rightEngine: config.reviewEngine,
        rightError: { code: "review_failed", message },
        singleEngine: false,
      });
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
      if (!response.ok || !data.draft) {
        const error = readApiError(data, "生成草稿失败，已使用确定性模板。");
        setDraft(buildDraft(order, issueIds));
        setDraftEngine("deterministic");
        setBanner({ tone: "error", message: error.message, code: error.code });
        return;
      }
      const engine = isReviewEngine(data.draftEngine) ? data.draftEngine : "deterministic";
      setDraft(data.draft);
      setDraftEngine(engine);
      if (data.notice && engine !== "deterministic") setBanner({ tone: "info", message: data.notice });
    } catch (error) {
      if (requestId !== draftRequest.current) return;
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
    setDraft(buildDraft(order, ids));
    setDraftEngine("deterministic");
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
    setDraft(buildDraft(order, nextIds));
    setDraftEngine("deterministic");
    void requestDraft(nextIds);
  }

  async function sendDraft(mode: "record" | "ses") {
    if (!order || !draft || sendBusy) return;
    const gate = mode === "ses" ? mailActions.ses : mailActions.record;
    if (gate.disabled) {
      setBanner({ tone: "error", message: gate.reason ?? "不能发送。", code: mode === "ses" ? "ses_unavailable" : "record_unavailable" });
      return;
    }
    setPendingSend(mode);
    setSendBusy(true);
    try {
      if (mode === "ses") {
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
          error?: { code?: string; message?: string };
        };
        if (!response.ok || !data.order) {
          const error = readApiError(data, "SES 发信失败。");
          setBanner({ tone: "error", message: error.message, code: error.code });
          return;
        }
        commit(
          data.order,
          data.delivery_status === "submit_succeeded"
            ? `Amazon SES 已接受提交${data.messageId ? `（MessageId: ${data.messageId}）` : ""}。这是提交成功，不是已投递。`
            : "已记录外发，但未走 SES。",
        );
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
      commit(result.order, "已记录外发。投递状态是未发送：没有调用 SES。");
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

  const showRuntimeNote = config.mode === "aws" || config.reviewEngine !== "deterministic" || config.sesLive;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <TopBar config={config} order={order} health={health} />
      <CommandStrip
        loadLabel={order ? "重新加载 DEMO-001" : "加载 DEMO-001"}
        reviewLabel={order?.reviewed ? "再次核对" : "开始核对"}
        commands={commands}
        hint={hint}
        reviewBusy={reviewBusy}
        compareBusy={compareBusy}
        draftBusy={draftBusy}
        sendBusy={sendBusy}
        reviewPrimary={!order?.reviewed}
        draftPrimary={Boolean(order?.reviewed) && !draft}
        recordPrimary={Boolean(draft)}
        onLoad={loadDemo}
        onReview={() => void onReview()}
        onCompare={() => void onCompare()}
        onDraft={() => openEmail()}
        onRecord={() => setEmailOpen(true)}
        onSummary={() => setSummaryOpen(true)}
      />
      {showRuntimeNote ? (
        <p role="status" className="border-b border-amber-200 bg-attention-soft px-4 py-2 text-[13px] leading-5 text-attention">
          {config.modeLabel} · 核对引擎 {configuredEngine.label} ({configuredEngine.code}) · {sesPresentation(config).detail}
          {config.missing.length > 0 ? ` 还缺 ${config.missing.join("、")}。` : ""}
          {config.reviewEngine === "bedrock" && !config.bedrockConfigured
            ? " Bedrock 尚未配置齐全，开始核对会返回明确错误，不会回退到规则引擎。"
            : ""}
          {config.reviewEngine === "ai_gateway" && !config.gatewayConfigured ? " AI Gateway 尚未配置 AI_GATEWAY_API_KEY。" : ""}
        </p>
      ) : null}
      {banner ? <StatusBanner tone={banner.tone} message={banner.message} code={banner.code} onDismiss={() => setBanner(null)} /> : null}

      <main id="workspace-main" className="min-h-0 flex-1" aria-busy={reviewBusy || compareBusy || draftBusy || sendBusy}>
        {!ready ? <LoadingState /> : null}
        {ready && !order ? <EmptyState onLoad={loadDemo} /> : null}
        {ready && order ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex gap-1 border-b border-line bg-surface px-3 py-2 lg:hidden" role="tablist" aria-label="工作区">
              {(
                [
                  ["messages", "往来"],
                  ["issues", "事项"],
                  ["facts", "事实"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={pane === id}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    pane === id ? "bg-accent text-white" : "text-subtle hover:bg-zinc-100",
                  )}
                  onClick={() => setPane(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid min-h-0 flex-1 lg:grid-cols-2 xl:h-[calc(100dvh-8.5rem)] xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.95fr)_300px]">
              <section
                aria-label="往来"
                className={cn("border-line lg:max-h-[calc(100dvh-8.5rem)] lg:overflow-y-auto lg:border-r", pane !== "messages" && "max-lg:hidden")}
              >
                <div className="space-y-3 p-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[13px] font-semibold text-ink">往来</h2>
                    <span className="text-[12px] tabular-nums text-subtle">{order.messages.length} 条</span>
                  </div>
                  <MessagePane
                    messages={order.messages}
                    buyerName={order.buyer.name}
                    sellerName={order.seller.name}
                    activeMessageId={anchor?.messageId}
                    highlights={highlights}
                  />
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
                </div>
              </section>
              <section
                aria-label="事项"
                className={cn("border-line lg:max-h-[calc(100dvh-8.5rem)] lg:overflow-y-auto xl:border-r", pane !== "issues" && "max-lg:hidden")}
              >
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
              </section>
              <section
                aria-label="事实"
                className={cn(
                  "border-line bg-zinc-50 lg:col-span-2 lg:max-h-72 lg:overflow-y-auto lg:border-t xl:col-span-1 xl:max-h-[calc(100dvh-8.5rem)] xl:border-l xl:border-t-0",
                  pane !== "facts" && "max-lg:hidden",
                )}
              >
                <FactsPanel order={order} checklist={checklist} onLocate={locate} />
              </section>
            </div>
          </div>
        ) : null}
      </main>

      <EmailDialog
        open={emailOpen && Boolean(draft)}
        draft={draft}
        issues={order?.issues ?? []}
        draftEngine={draftEngine}
        draftBusy={draftBusy}
        sendBusy={sendBusy}
        pendingSend={pendingSend}
        record={mailActions.record}
        ses={mailActions.ses}
        onOpenChange={setEmailOpen}
        onToggleIssue={toggleIssue}
        onChange={setDraft}
        onRecord={() => void sendDraft("record")}
        onSes={() => void sendDraft("ses")}
      />
      <SummaryDialog open={summaryOpen} summary={summary} onOpenChange={setSummaryOpen} />
      <CompareDialog open={compareOpen} busy={compareBusy} view={compareView} onOpenChange={setCompareOpen} />
    </div>
  );
}
