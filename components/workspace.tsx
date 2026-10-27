"use client";

import { useEffect, useMemo, useState } from "react";
import { IssueCard } from "@/components/issue-card";
import { MessagePane } from "@/components/message-pane";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { PRIORITY_LABEL, STAGE_LABEL, STATUS_LABEL, WAITING_LABEL, roleLabel } from "@/lib/labels";
import {
  applyDecision,
  applyReply,
  buildChecklist,
  buildDraft,
  buildSummary,
  recordOutbound,
  reviewOrder,
} from "@/lib/review/engine";
import { ambiguousReply, createOrderFromScenario, reopenReply, scriptedReplies } from "@/lib/scenario";
import type { AgreementSummary, DecisionKind, EmailDraft, IssueStatus, Order, ReviewCompareResult, ReviewEngine, Role, RuntimeConfig } from "@/lib/types";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "ordercheck.demo.v1";

const FACT_STATUS: Record<string, string> = {
  confirmed: "双方确认",
  stated_by_one_party: "单方陈述",
  proposed: "提议，未确认",
  historical: "已被后续约定取代",
};

const DRAFT_ENGINE_NOTE: Record<ReviewEngine, string> = {
  bedrock: "Amazon Bedrock 生成（可编辑）",
  ai_gateway: "Vercel AI Gateway 生成（可编辑；不是 Bedrock）",
  deepseek: "DeepSeek 生成（可编辑；不是 Bedrock）",
  ollama: "Ollama 生成（可编辑；不是 Bedrock）",
  deterministic: "确定性模板（不是 Bedrock / DeepSeek / Ollama）",
};

function mailBadge(config: RuntimeConfig): string {
  if (config.smtpConfigured) return "smtp: live";
  if (config.sesLive) return "ses: live";
  return "mail: recorded";
}

function mailBanner(config: RuntimeConfig): string {
  if (config.smtpConfigured) return "SMTP 真提交（submit_succeeded ≠ 已投递）";
  if (config.sesLive) return "SES 真发信（submit_succeeded ≠ 已投递）";
  return "仅记录未发送";
}

const OPEN_FOR_MAIL: IssueStatus[] = ["unconfirmed", "question_sent", "proposed", "reopened", "needs_human_review"];
const CLOSED = new Set<IssueStatus>(["confirmed", "accepted_risk", "not_applicable"]);

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

export function Workspace({ config }: { config: RuntimeConfig }) {
  const [ready, setReady] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ messageId: string; quote: string } | null>(null);
  const [pane, setPane] = useState<"materials" | "issues">("materials");
  const [emailOpen, setEmailOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [draft, setDraft] = useState<EmailDraft | null>(null);
  const [draftEngine, setDraftEngine] = useState<ReviewEngine | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [replyRole, setReplyRole] = useState<Role>("buyer");
  const [replyBody, setReplyBody] = useState("");
  const [compare, setCompare] = useState<ReviewCompareResult | null>(null);
  const [compareBusy, setCompareBusy] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (isOrder(parsed)) setOrder(parsed);
    } catch {
      setError("本机保存的样例读不出来，已忽略。可以重新加载 DEMO-001。");
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
    if (!anchor) return;
    document.getElementById(`message-${anchor.messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [anchor]);

  const summary: AgreementSummary | null = useMemo(() => (order?.reviewed ? buildSummary(order) : null), [order]);
  const checklist = useMemo(() => (order?.reviewed ? buildChecklist(order) : []), [order]);
  const scripted = scriptedReplies();
  const nextReply = order ? scripted.find((message) => !order.messages.some((item) => item.id === message.id)) : undefined;
  const played = scripted.filter((message) => order?.messages.some((item) => item.id === message.id)).length;

  function commit(next: Order, message?: string) {
    setOrder(next);
    setError(null);
    setNotice(message ?? null);
  }

  async function loadDemo() {
    setOrder(createOrderFromScenario());
    setAnchor(null);
    setDraft(null);
    setDraftEngine(null);
    setEmailOpen(false);
    setSummaryOpen(false);
    setReplyBody("");
    setCompare(null);
    setError(null);
    setPane("materials");
    const durable = config.persistence === "postgres" || config.persistence === "sqlite" || config.persistence === "dynamodb";
    if (!durable) {
      setNotice("已加载 DEMO-001。三封邮件看起来像是谈过了，但还没有核对。");
      return;
    }
    const storeLabel = config.persistence === "postgres" ? "Postgres" : config.persistence === "sqlite" ? "SQLite" : "DynamoDB";
    setNotice(`已在浏览器打开 DEMO-001，正在写入 ${storeLabel}…`);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixture: "DEMO-001" }),
      });
      const data = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        setError(data.error?.message ?? `${storeLabel} 写入失败。浏览器里的样例仍可核对，没有改标成已持久化。`);
        return;
      }
      setNotice(`已加载 DEMO-001，并写入 ${storeLabel}（整单 JSON，含邮件与事项）。`);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : `${storeLabel} 写入失败。浏览器里的样例仍可核对。`);
    }
  }

  async function onReview() {
    if (!order) return;
    const needsRemote = Boolean(config.reviewEngineError) || config.reviewEngine !== "deterministic";
    if (needsRemote) {
      setError(null);
      setNotice("正在调用核对引擎…");
      try {
        const response = await fetch(`/api/orders/${order.id}/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order }),
        });
        const data = (await response.json()) as {
          order?: Order;
          engine?: string;
          notice?: string;
          bedrockRequestId?: string;
          gatewayUsage?: { totalTokens?: number };
          meta?: {
            bedrockRequestId?: string;
            gatewayUsage?: { totalTokens?: number };
            deepseekUsage?: { totalTokens?: number };
            ollamaUsage?: { totalTokens?: number };
            modelRequestId?: string;
            agentRetries?: number;
          };
          error?: { code?: string; message?: string };
        };
        if (!response.ok || !data.order) {
          setNotice(null);
          setError(
            `${data.error?.message ?? "核对失败。"} 没有回退到规则引擎。可用「双引擎对比」查看确定性结果；live 失败会单独标明。`,
          );
          return;
        }
        if (data.engine !== config.reviewEngine) {
          setNotice(null);
          setError(
            `服务端返回引擎 ${data.engine ?? "unknown"}，与当前配置 ${config.reviewEngine} 不一致。没有采用该结果，避免把别的引擎标成当前引擎。`,
          );
          return;
        }
        const requestId = data.bedrockRequestId ?? data.meta?.bedrockRequestId ?? data.meta?.modelRequestId;
        const gatewayTokens = data.gatewayUsage?.totalTokens ?? data.meta?.gatewayUsage?.totalTokens;
        const deepseekTokens = data.meta?.deepseekUsage?.totalTokens;
        const ollamaTokens = data.meta?.ollamaUsage?.totalTokens;
        const engineNote =
          data.engine === "bedrock"
            ? `核对引擎：Amazon Bedrock（真实模型调用，不是规则引擎）${requestId ? ` · request id ${requestId}` : ""}。`
            : data.engine === "ai_gateway"
              ? `核对引擎：Vercel AI Gateway（真实模型调用；不是 Bedrock，也不是规则引擎）${gatewayTokens != null ? ` · tokens ${gatewayTokens}` : ""}。`
              : data.engine === "deepseek"
                ? `核对引擎：DeepSeek（OpenAI 兼容接口；不是 Bedrock，也不是 AI Gateway）${deepseekTokens != null ? ` · tokens ${deepseekTokens}` : ""}。`
                : data.engine === "ollama"
                  ? `核对引擎：Ollama（本地 OpenAI 兼容接口；不是 Bedrock，也不是 DeepSeek）${requestId ? ` · request id ${requestId}` : ""}${ollamaTokens != null ? ` · tokens ${ollamaTokens}` : ""}。`
                  : data.engine === "deterministic"
                    ? "核对引擎：确定性规则引擎。"
                    : `核对引擎：${data.engine ?? "unknown"}。`;
        commit(data.order, data.notice ? `${data.notice} ${engineNote}` : engineNote);
        const persistence = (data as { persistence?: { ok?: boolean; store?: string; error?: string } }).persistence;
        if (persistence && persistence.ok === false) {
          setError(
            `核对已完成（引擎 ${data.engine}），但写入 ${persistence.store ?? "store"} 失败：${persistence.error ?? "未知错误"}。没有改用内存库冒充成功。`,
          );
        }
        setPane("issues");
      } catch (error) {
        setNotice(null);
        setError(error instanceof Error ? error.message : "核对请求失败。没有改用规则引擎结果。");
      }
      return;
    }

    const result = reviewOrder(order);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    commit(
      { ...result.order, review_meta: { engine: "deterministic", reviewedAt: new Date().toISOString() } },
      "核对完成。每条引用都能在左侧原文定位。核对引擎：确定性规则引擎（不是 Bedrock / DeepSeek / Ollama）。",
    );
    setPane("issues");
  }

  async function onCompare() {
    if (!order) return;
    setCompareBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/orders/${order.id}/review-compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
      const data = (await response.json()) as ReviewCompareResult & { error?: { message?: string } };
      if (!response.ok || !data.deterministic) {
        setError(data.error?.message ?? "对比失败。");
        return;
      }
      setCompare(data);
      setNotice("对比完成。当前订单的事项没有被 live 结果覆盖。live 失败或未配置会单独显示，不会标成规则引擎。");
      setPane("issues");
    } catch (compareError) {
      setError(compareError instanceof Error ? compareError.message : "对比请求失败。");
    } finally {
      setCompareBusy(false);
    }
  }

  function locate(messageId: string, quote: string) {
    setAnchor({ messageId, quote });
    setPane("materials");
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
    setDraftBusy(true);
    setError(null);
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
      if (config.reviewEngine === "deepseek" && (!response.ok || !data.draft || data.draftEngine !== "deepseek")) {
        setDraft(null);
        setDraftEngine(null);
        setEmailOpen(false);
        setError(data.error?.message ?? "DeepSeek 草稿失败。没有改用确定性模板，也没有标成 Bedrock 或 AI Gateway。");
        return;
      }
      if (!response.ok || !data.draft) {
        // Client deterministic fallback — always labeled deterministic, never bedrock or deepseek.
        setDraft(buildDraft(order, issueIds));
        setDraftEngine("deterministic");
        setError(data.error?.message ?? "生成草稿失败，已使用确定性模板。");
        return;
      }
      setDraft(data.draft);
      setDraftEngine(data.draftEngine ?? "deterministic");
      if (data.notice && data.draftEngine && data.draftEngine !== "deterministic") {
        setNotice(data.notice);
      }
    } catch (error) {
      if (config.reviewEngine === "deepseek") {
        setDraft(null);
        setDraftEngine(null);
        setEmailOpen(false);
        setError(error instanceof Error ? error.message : "DeepSeek 草稿失败。没有改用确定性模板。");
      } else {
        setDraft(buildDraft(order, issueIds));
        setDraftEngine("deterministic");
        setError(error instanceof Error ? error.message : "生成草稿失败，已使用确定性模板。");
      }
    } finally {
      setDraftBusy(false);
    }
  }

  function openEmail() {
    if (!order) return;
    const ids = order.issues.filter((issue) => issue.priority === "high" && OPEN_FOR_MAIL.includes(issue.status)).map((issue) => issue.issue_id);
    const fallback = order.issues.filter((issue) => OPEN_FOR_MAIL.includes(issue.status)).map((issue) => issue.issue_id);
    const issueIds = ids.length ? ids : fallback;
    // Immediate deterministic placeholder so the modal opens; API may upgrade to model draft.
    setDraft(buildDraft(order, issueIds));
    setDraftEngine("deterministic");
    setEmailOpen(true);
    void requestDraft(issueIds);
  }

  function toggleIssue(issueId: string) {
    if (!order || !draft) return;
    const nextIds = draft.issue_ids.includes(issueId)
      ? draft.issue_ids.filter((id) => id !== issueId)
      : [...draft.issue_ids, issueId];
    if (nextIds.length === 0) return;
    setDraft(buildDraft(order, nextIds));
    setDraftEngine("deterministic");
    void requestDraft(nextIds);
  }

  async function sendDraft() {
    if (!order || !draft) return;
    const liveMail = config.smtpConfigured ? "smtp" : config.sesLive ? "ses" : null;
    if (liveMail) {
      setError(null);
      setNotice(liveMail === "smtp" ? "正在通过 SMTP 提交发送…" : "正在通过 Amazon SES 提交发送…");
      try {
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
          setNotice(null);
          setError(data.error?.message ?? (liveMail === "smtp" ? "SMTP 发信失败。" : "SES 发信失败。"));
          return;
        }
        const accepted =
          data.transport === "smtp"
            ? `SMTP 已接受提交${data.messageId ? `（MessageId: ${data.messageId}）` : ""}。这是提交成功，不是已投递。`
            : `Amazon SES 已接受提交${data.messageId ? `（MessageId: ${data.messageId}）` : ""}。这是提交成功，不是已投递。`;
        commit(
          data.order,
          data.delivery_status === "submit_succeeded" ? accepted : "已记录外发，但没有真实提交。",
        );
        setEmailOpen(false);
        setPane("materials");
      } catch (error) {
        setNotice(null);
        setError(error instanceof Error ? error.message : "发信请求失败。");
      }
      return;
    }

    if (config.mode === "aws" && !config.sesConfigured && !config.smtpConfigured) {
      setError("AWS_MODE 缺少 SMTP 或 SES 配置，没有发信，也没有记成已投递。");
      setEmailOpen(false);
      return;
    }

    const result = recordOutbound(order, {
      to: draft.to,
      subject: draft.subject,
      body: draft.body,
      issueIds: draft.issue_ids,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    commit(result.order, "已记录外发。投递状态是「未发送」：没有调用 SMTP，也没有调用 SES。");
    setEmailOpen(false);
    setPane("materials");
  }

  function play(message: ReturnType<typeof scriptedReplies>[number]) {
    if (!order) return;
    const result = applyReply(order, message);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    commit(result.order, result.notice);
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
      setError(result.error);
      return;
    }
    setReplyBody("");
    commit(result.order, result.notice);
    setPane("issues");
  }

  const openIssues = order?.issues.filter((issue) => !CLOSED.has(issue.status)) ?? [];
  const highOpen = openIssues.filter((issue) => issue.priority === "high");
  const lowOpen = openIssues.filter((issue) => issue.priority === "low");
  const closedIssues = order?.issues.filter((issue) => CLOSED.has(issue.status)) ?? [];

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 text-[#f6f1e6]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-serif text-3xl leading-none">OrderCheck</p>
            <p className="mt-1 text-sm text-[#d9d0c2]">跨境订单漏项核对助手</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold tracking-wide ${
                config.mode === "demo" ? "bg-[#f6d98a] text-[#1c2430]" : "bg-[#c4452d] text-white"
              }`}
            >
              {config.modeLabel}
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-[#f6f1e6]">
              review: {config.reviewEngineError ? "invalid" : config.reviewEngine}
              {config.reviewEngineSelection === "auto" ? " · auto" : " · explicit"}
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-[#f6f1e6]">
              ran: {order?.review_meta?.engine ?? "—"}
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-[#f6f1e6]">
              store: {config.persistence}
            </span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide text-[#f6f1e6]">
              {mailBadge(config)}
            </span>
            {order ? (
              <span className="text-sm text-[#d9d0c2]">
                {order.id} · {STAGE_LABEL[order.stage] ?? order.stage}
              </span>
            ) : (
              <span className="text-sm text-[#d9d0c2]">还没有打开订单</span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-6">
        <section className="rounded-2xl bg-[#f6f1e6] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.28)] sm:p-6">
          {config.mode === "aws" || config.reviewEngine !== "deterministic" || config.sesLive || config.smtpConfigured || config.reviewEngineError ? (
            <p role="status" className="mb-4 rounded-md border border-[#c4452d]/40 bg-[#fde8e4] px-3 py-2 text-sm leading-6 text-[#7d2b1d]">
              {config.modeLabel} · 核对引擎 <strong>{config.reviewEngineError ? "invalid" : config.reviewEngine}</strong>
              （{config.reviewEngineSelection === "auto" ? "auto：DeepSeek，其次 Ollama，再次 Gateway，否则规则引擎" : "显式 REVIEW_ENGINE"}）
              {" · "}
              {mailBanner(config)}
              {" · "}存储 <strong>{config.persistence}</strong>。
              {config.missing.length ? ` 还缺 ${config.missing.join("、")}。` : ""}
              {config.reviewEngineError ? ` ${config.reviewEngineError}` : ""}
              {config.reviewEngine === "bedrock" && !config.bedrockConfigured
                ? " Bedrock 尚未配置齐全，开始核对会返回明确错误，不会回退到规则引擎。"
                : ""}
              {config.reviewEngine === "deepseek" && !config.deepseekConfigured
                ? " DeepSeek 尚未配置 DEEPSEEK_API_KEY。开始核对会返回明确错误，不会回退到规则引擎，也不会标成 Bedrock 或 AI Gateway。"
                : ""}
              {config.reviewEngine === "ollama" && !config.ollamaConfigured
                ? " Ollama 尚未配置 OLLAMA_MODEL，开始核对会返回明确错误，不会回退到规则引擎。"
                : ""}
              {config.reviewEngine === "ai_gateway" && !config.gatewayConfigured
                ? " AI Gateway 尚未配置 AI_GATEWAY_API_KEY。"
                : ""}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="mb-4 rounded-md border border-[#c4452d]/40 bg-[#fde8e4] px-3 py-2 text-sm leading-6 text-[#7d2b1d]">
              {error}
            </p>
          ) : null}
          {notice ? <p className="mb-4 rounded-md border border-[#eadfcd] bg-[#fffdf8] px-3 py-2 text-sm leading-6 text-[#1c2430]">{notice}</p> : null}

          {!ready ? <p className="text-sm text-[#5c6775]">正在打开工作台…</p> : null}

          {ready && !order ? (
            <div className="mx-auto max-w-2xl py-10">
              <p className="text-sm font-semibold text-[#c4452d]">确认订单之前</p>
              <h1 className="mt-2 font-serif text-4xl leading-tight text-[#1c2430]">双方聊过，不等于已经说定同一件事</h1>
              <p className="mt-4 text-base leading-7 text-[#3e4a5a]">
                DEMO-001 是 1,000 套发往英国的定制礼品包装。买方要 11 月 20 日前送到伦敦，卖方写的是同日在上海提货。样品版本和内托也还没对齐。数量已经双方写明，不该再问一遍。
              </p>
              <Button className="mt-6" variant="vermilion" size="lg" onClick={loadDemo}>
                加载 DEMO-001
              </Button>
            </div>
          ) : null}

          {order ? (
            <>
              <div className="flex flex-col gap-3 border-b border-[#eadfcd] pb-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#8a5a12]">卖方工作台 · {order.seller.name} → {order.buyer.name}</p>
                  <h1 className="mt-1 text-2xl font-semibold text-[#1c2430]">{order.name}</h1>
                  <p className="mt-1 text-sm text-[#5c6775]">
                    {order.buyer.country} 采购 {order.buyer.email} · {order.seller.country} 供应 {order.seller.email}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={loadDemo}>
                    重新加载样例
                  </Button>
                  <Button onClick={() => void onReview()}>{order.reviewed ? "再核对一次" : "开始核对"}</Button>
                  <Button variant="outline" onClick={() => void onCompare()} disabled={compareBusy}>
                    {compareBusy ? "对比中…" : "双引擎对比"}
                  </Button>
                  <Button variant="vermilion" onClick={openEmail} disabled={!order.reviewed}>
                    生成确认邮件
                  </Button>
                  <Button variant="outline" onClick={() => setSummaryOpen(true)} disabled={!order.reviewed}>
                    查看约定摘要
                  </Button>
                </div>
              </div>

              <div className="mt-4 flex gap-2 lg:hidden">
                <Button variant={pane === "materials" ? "default" : "outline"} size="sm" onClick={() => setPane("materials")}>
                  往来与回放
                </Button>
                <Button variant={pane === "issues" ? "default" : "outline"} size="sm" onClick={() => setPane("issues")}>
                  待确认事项
                </Button>
              </div>

              {compare ? <ComparePanel result={compare} /> : null}

              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.9fr)]">
                <div className={cn(pane !== "materials" && "hidden", "space-y-4 lg:block")}>
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-[#1c2430]">往来邮件和报价</h2>
                    <span className="text-xs text-[#5c6775]">{order.messages.length} 条</span>
                  </div>
                  <MessagePane
                    messages={order.messages}
                    buyerName={order.buyer.name}
                    sellerName={order.seller.name}
                    activeMessageId={anchor?.messageId}
                    activeQuote={anchor?.quote}
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

                <div className={cn(pane !== "issues" && "hidden", "lg:block")}>
                  <div className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-[#1c2430]">待确认事项</h2>
                      <span className="text-xs text-[#5c6775]">{order.reviewed ? `${highOpen.length} 项重要未关闭` : "尚未核对"}</span>
                    </div>
                    {order.review_meta ? (
                      <p className="mb-3 text-[11px] leading-4 text-[#8a7f6f]">
                        引擎 {order.review_meta.engine}
                        {order.review_meta.bedrockRequestId ? ` · request id ${order.review_meta.bedrockRequestId}` : ""}
                        {order.review_meta.modelRequestId ? ` · request id ${order.review_meta.modelRequestId}` : ""}
                        {order.review_meta.gatewayUsage?.totalTokens != null
                          ? ` · gateway tokens ${order.review_meta.gatewayUsage.totalTokens}`
                          : ""}
                        {order.review_meta.deepseekUsage?.totalTokens != null
                          ? ` · deepseek tokens ${order.review_meta.deepseekUsage.totalTokens}`
                          : ""}
                        {order.review_meta.ollamaUsage?.totalTokens != null
                          ? ` · ollama tokens ${order.review_meta.ollamaUsage.totalTokens}`
                          : ""}
                        {order.review_meta.agentRetries ? ` · agent retry ${order.review_meta.agentRetries}` : ""}
                      </p>
                    ) : null}
                    {!order.reviewed ? (
                      <div className="rounded-lg border border-dashed border-[#ddcfb8] bg-[#fffdf8] p-4 text-sm leading-6 text-[#5c6775]">
                        材料已经在左侧。点击「开始核对」后，这里只显示能在原文里定位的缺口。不会把同一个日期的提货和到货当成已经一致。
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <ChecklistRow items={checklist} />
                        <FactStrip order={order} />
                        {highOpen.length === 0 && lowOpen.length === 0 ? (
                          <p className="rounded-lg bg-[#e5f2eb] px-3 py-2 text-sm leading-6 text-[#1f6b4a]">当前没有未关闭事项。打开约定摘要，分开看已确认、未确认和已接受风险。</p>
                        ) : null}
                        {highOpen.map((issue) => (
                          <IssueCard key={issue.issue_id} issue={issue} onLocate={locate} onDecide={(decision, reason) => onDecide(issue.issue_id, decision, reason)} />
                        ))}
                        {lowOpen.length > 0 ? <p className="pt-2 text-xs font-semibold text-[#5c6775]">次要待确认 · 不隐藏</p> : null}
                        {lowOpen.map((issue) => (
                          <IssueCard key={issue.issue_id} issue={issue} onLocate={locate} onDecide={(decision, reason) => onDecide(issue.issue_id, decision, reason)} />
                        ))}
                        {closedIssues.length > 0 ? <p className="pt-2 text-xs font-semibold text-[#5c6775]">已有结果</p> : null}
                        {closedIssues.map((issue) => (
                          <IssueCard key={issue.issue_id} issue={issue} onLocate={locate} onDecide={(decision, reason) => onDecide(issue.issue_id, decision, reason)} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </section>
      </main>

      {draft ? (
        <Modal
          open={emailOpen}
          onOpenChange={setEmailOpen}
          title="确认邮件"
          description={
            config.smtpConfigured
              ? "先改内容，再确认。将通过 SMTP 提交；成功仅表示服务器接受，不是已投递。"
              : config.sesLive
                ? "先改内容，再确认。将调用 Amazon SES；成功仅表示提交成功，不是已投递。"
                : "先改内容，再记录发送。没有配置 SMTP 或 SES 时不会发信，也不会显示已投递。"
          }
        >
          <div className="space-y-3">
            {draftEngine && draftEngine !== "deterministic" ? (
              <p className="text-xs leading-5 text-[#5c6775]">
                draftEngine: {draftEngine}
                {" · "}
                {DRAFT_ENGINE_NOTE[draftEngine]}
                {draftBusy ? " · 更新中…" : ""}
              </p>
            ) : draftBusy ? (
              <p className="text-xs leading-5 text-[#5c6775]">正在生成草稿…</p>
            ) : draftEngine === "deterministic" ? (
              <p className="text-xs leading-5 text-[#5c6775]">draftEngine: deterministic · {DRAFT_ENGINE_NOTE.deterministic}</p>
            ) : null}
            <fieldset>
              <legend className="text-sm font-semibold">纳入这封邮件的事项</legend>
              <div className="mt-2 space-y-2">
                {order?.issues.map((issue) => (
                  <label key={issue.issue_id} className="flex items-start gap-2 text-sm leading-5">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={draft.issue_ids.includes(issue.issue_id)}
                      onChange={() => toggleIssue(issue.issue_id)}
                    />
                    <span>
                      <span className="font-semibold">{issue.title}</span>
                      <span className="ml-2 text-[#5c6775]">
                        {PRIORITY_LABEL[issue.priority]} · {STATUS_LABEL[issue.status]}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="mail-to">收件人</Label>
                <Input id="mail-to" className="mt-1" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
              </div>
              <div>
                <Label htmlFor="mail-subject">主题</Label>
                <Input id="mail-subject" className="mt-1" value={draft.subject} onChange={(event) => setDraft({ ...draft, subject: event.target.value })} />
              </div>
            </div>
            <div>
              <Label htmlFor="mail-body">正文</Label>
              <Textarea id="mail-body" className="mt-1 min-h-64" value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
            </div>
            <p className="rounded-md bg-[#f8efd8] px-3 py-2 text-sm leading-6 text-[#6d4a10]">
              {config.smtpConfigured
                ? "将使用 SMTP_FROM 真实提交。成功状态是 submit_succeeded，不是 delivered。"
                : config.sesLive
                  ? "将使用 SES_FROM_ADDRESS 真实提交。成功状态是 submit_succeeded，不是 delivered。"
                  : "buyer@example.com 不能用于真实发信。确认后只把邮件记到这条订单里，投递状态保持「未发送」。"}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEmailOpen(false)}>
                返回修改
              </Button>
              <Button variant="vermilion" onClick={() => void sendDraft()}>
                {config.smtpConfigured ? "确认 SMTP 发送" : config.sesLive ? "确认 SES 发送" : "确认记录发送"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      <Modal open={summaryOpen} onOpenChange={setSummaryOpen} title="约定摘要" description="只写双方明确同意的内容。已确认不等于已经生产、付款或交货。">
        {summary ? <SummaryView summary={summary} /> : <p className="text-sm text-[#5c6775]">还没有摘要。</p>}
      </Modal>
    </div>
  );
}

function ChecklistRow({ items }: { items: ReturnType<typeof buildChecklist> }) {
  const toneClass = {
    confirmed: "border-[#c9e4d6] bg-[#f3faf6]",
    proposed: "border-[#f0e0bf] bg-[#fbf6ea]",
    open: "border-[#f3c7bf] bg-[#fff6f4]",
    risk: "border-[#f0e0bf] bg-[#fbf6ea]",
    na: "border-[#eadfcd] bg-[#f7f3eb]",
  };
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <li key={item.id} className={`rounded-md border px-2.5 py-2 ${toneClass[item.tone]}`}>
          <p className="text-xs font-semibold text-[#1c2430]">{item.label}</p>
          <p className="text-xs leading-5 text-[#5c6775]">{item.detail}</p>
        </li>
      ))}
    </ul>
  );
}

function FactStrip({ order }: { order: Order }) {
  return (
    <ul className="space-y-2 rounded-lg border border-[#eadfcd] bg-[#fffdf8] p-3">
      {order.facts.map((fact) => (
        <li key={fact.id} className="text-sm leading-6">
          <span className="font-semibold">{fact.label}：</span>
          {fact.value}
          <span className="ml-2 text-xs text-[#8a5a12]">{FACT_STATUS[fact.status]}</span>
          <span className="mt-0.5 block text-xs leading-5 text-[#5c6775]">{fact.scope_note}</span>
        </li>
      ))}
    </ul>
  );
}

function ComparePanel({ result }: { result: ReviewCompareResult }) {
  const liveTitle = result.live.engine ?? "live unavailable";
  return (
    <div className="mt-4 rounded-lg border border-[#eadfcd] bg-[#fffdf8] p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-[#1c2430]">双引擎对比</h2>
        <p className="text-xs leading-5 text-[#5c6775]">
          {result.agreement.comparable
            ? `事项一致率 Jaccard ${result.agreement.jaccard?.toFixed(2)} · 共有 ${result.agreement.shared.length} · 仅规则 ${result.agreement.onlyDeterministic.length} · 仅 live ${result.agreement.onlyLive.length} · 状态不同 ${result.agreement.statusMismatches.length}`
            : "live 没有成功跑完，不算成分歧。规则引擎结果仍列在左侧。"}
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <CompareColumn title="确定性规则引擎" side={result.deterministic} />
        <CompareColumn title={liveTitle} side={result.live} />
      </div>
    </div>
  );
}

function CompareColumn({ title, side }: { title: string; side: ReviewCompareResult["deterministic"] }) {
  return (
    <div className="rounded-md border border-[#eadfcd] bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#8a5a12]">{title}</p>
      <p className="mt-1 text-xs leading-5 text-[#5c6775]">
        {side.available ? (side.ran ? `engine ${side.engine ?? "—"} · ${side.ok ? "ok" : "failed"}` : "未调用") : "live unavailable"}
      </p>
      {side.error ? <p className="mt-2 text-sm leading-6 text-[#7d2b1d]">{side.error}</p> : null}
      {side.missing && side.missing.length > 0 ? (
        <p className="mt-2 text-xs leading-5 text-[#5c6775]">缺少配置：{side.missing.join("、")}。没有填写值，也没有发起调用。</p>
      ) : null}
      {side.issues.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {side.issues.map((issue) => (
            <li key={issue.issue_id} className="text-sm leading-5 text-[#1c2430]">
              <span className="font-semibold">{issue.issue_id}</span>
              <span className="text-[#5c6775]"> · {issue.status} · {issue.kind}</span>
              <span className="block text-xs text-[#5c6775]">{issue.title}</span>
            </li>
          ))}
        </ul>
      ) : side.ok ? (
        <p className="mt-2 text-sm text-[#5c6775]">没有事项。</p>
      ) : null}
    </div>
  );
}

function ReplyDock({
  reviewed,
  played,
  total,
  nextBody,
  nextRole,
  replyRole,
  replyBody,
  onReplyRole,
  onReplyBody,
  onNext,
  onAmbiguous,
  onReopen,
  onCustom,
}: {
  reviewed: boolean;
  played: number;
  total: number;
  nextBody?: string;
  nextRole?: Role;
  replyRole: Role;
  replyBody: string;
  onReplyRole: (role: Role) => void;
  onReplyBody: (body: string) => void;
  onNext: () => void;
  onAmbiguous: () => void;
  onReopen: () => void;
  onCustom: () => void;
}) {
  return (
    <section className="rounded-lg border border-[#eadfcd] bg-[#fffdf8] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">样例回放</h2>
        <span className="text-xs text-[#5c6775]">
          {played}/{total} · 不是 SES 收件
        </span>
      </div>
      <p className="mt-1 text-xs leading-5 text-[#5c6775]">回放会按原文更新相关事项。含糊说法不会关闭问题，单方新条件会停在「待对方接受」。</p>
      {!reviewed ? <p className="mt-3 text-sm text-[#5c6775]">先开始核对，再回放回复。</p> : null}
      {reviewed && nextBody && nextRole ? (
        <div className="mt-3">
          <p className="text-xs font-semibold text-[#1e4d6b]">下一条 · {roleLabel(nextRole)}</p>
          <p className="mt-1 line-clamp-3 text-sm leading-6 text-[#3e4a5a]">{nextBody}</p>
          <Button className="mt-2" size="sm" onClick={onNext}>
            回放这一条
          </Button>
        </div>
      ) : null}
      {reviewed && !nextBody ? <p className="mt-3 text-sm text-[#1f6b4a]">三条样例回复都已入账。可以打开约定摘要。</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!reviewed} onClick={onAmbiguous}>
          回放含糊回复
        </Button>
        <Button size="sm" variant="outline" disabled={!reviewed} onClick={onReopen}>
          回放确认后改口
        </Button>
      </div>
      <Separator className="my-4" />
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          onCustom();
        }}
      >
        <Label htmlFor="reply-body">手工粘贴回复</Label>
        <div className="flex gap-2">
          <select
            aria-label="回复方"
            className="h-10 rounded-md border border-[#ddcfb8] bg-white px-2 text-sm"
            value={replyRole}
            onChange={(event) => onReplyRole(event.target.value as Role)}
          >
            <option value="buyer">买方</option>
            <option value="seller">卖方</option>
          </select>
          <p className="self-center text-xs text-[#5c6775]">来源会标成手工录入</p>
        </div>
        <Textarea id="reply-body" value={replyBody} onChange={(event) => onReplyBody(event.target.value)} placeholder="粘贴买方或卖方的新回复" />
        <Button type="submit" size="sm" variant="outline" disabled={!reviewed}>
          用这条回复更新
        </Button>
      </form>
    </section>
  );
}

function SummaryView({ summary }: { summary: AgreementSummary }) {
  const ready = summary.agreement_status === "key_terms_confirmed";
  return (
    <div className="space-y-4 text-sm leading-6">
      <div className={`rounded-md px-3 py-2 ${ready ? "bg-[#e5f2eb] text-[#1f6b4a]" : "bg-[#fde8e4] text-[#7d2b1d]"}`}>
        <p className="font-semibold">{ready ? "关键约定已确认" : "关键约定还没齐"}</p>
        <p>{summary.next_action}</p>
        <p className="text-xs">履约状态：尚未开始或未知。付款、生产和交货都还没有记录。</p>
      </div>
      <SummaryGroup title="已确认" empty="还没有双方都明确接受的事项。" lines={summary.confirmed} />
      <SummaryGroup title="未确认" empty="没有未关闭事项。" lines={summary.open} />
      <SummaryGroup title="已接受风险" empty="没有人手标成接受风险的事项。" lines={summary.accepted_risk} />
      <SummaryGroup title="本次不适用" empty="没有标成不适用的事项。" lines={summary.not_applicable} />
      {summary.single_party.length > 0 ? <SummaryGroup title="单方陈述，不是约定" empty="" lines={summary.single_party} /> : null}
      {Object.keys(summary.snapshot).length > 0 ? (
        <div>
          <h3 className="font-semibold">已确认的商业条件</h3>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            {Object.entries(summary.snapshot).map(([key, value]) => (
              <div key={key} className="rounded-md border border-[#eadfcd] px-3 py-2">
                <dt className="text-xs text-[#5c6775]">{key}</dt>
                <dd className="font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      <ul className="list-disc space-y-1 pl-5 text-[#5c6775]">
        {summary.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}

function SummaryGroup({
  title,
  empty,
  lines,
}: {
  title: string;
  empty: string;
  lines: AgreementSummary["confirmed"];
}) {
  return (
    <section>
      <h3 className="font-semibold">{title}</h3>
      {lines.length === 0 ? <p className="text-[#5c6775]">{empty}</p> : null}
      <ul className="mt-2 space-y-2">
        {lines.map((line) => (
          <li key={line.issue_id} className="rounded-md border border-[#eadfcd] px-3 py-2">
            <p className="font-semibold">
              {line.title}
              <span className="ml-2 text-xs font-normal text-[#5c6775]">
                {STATUS_LABEL[line.status]} · {WAITING_LABEL[line.waiting_for]}
              </span>
            </p>
            {line.value ? <p>{line.value}</p> : null}
            <p className="text-[#3e4a5a]">{line.detail}</p>
            {line.reason ? <p className="text-[#8a5a12]">理由：{line.reason}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
