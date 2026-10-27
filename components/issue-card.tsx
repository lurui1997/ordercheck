"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { KIND_LABEL, PIPELINE, PRIORITY_LABEL, STATUS_LABEL, WAITING_LABEL } from "@/lib/labels";
import { statusTone } from "@/lib/ui/workspace-model";
import type { DecisionKind, Issue, IssueStatus } from "@/lib/types";
import { cn, formatStamp } from "@/lib/utils";

const DECISIONS: Array<{ value: DecisionKind; label: string }> = [
  { value: "accepted_risk", label: "接受风险" },
  { value: "not_applicable", label: "标为不适用" },
  { value: "needs_human_review", label: "需人工核实" },
];

function Pipeline({ status }: { status: IssueStatus }) {
  const currentIndex = PIPELINE.indexOf(status);
  return (
    <ol className="flex flex-wrap gap-1" aria-label="状态机">
      {PIPELINE.map((step, index) => {
        const current = step === status;
        const reached = currentIndex >= 0 && index <= currentIndex;
        return (
          <li key={step}>
            <span
              aria-current={current ? "step" : undefined}
              className={cn(
                "inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold leading-4",
                current ? "bg-accent text-white" : reached ? "bg-accent-soft text-accent" : "bg-zinc-100 text-subtle",
              )}
            >
              {STATUS_LABEL[step]}
            </span>
          </li>
        );
      })}
      {currentIndex === -1 ? (
        <li>
          <span aria-current="step" className="inline-flex rounded bg-attention-soft px-1.5 py-0.5 text-[11px] font-semibold leading-4 text-attention">
            {STATUS_LABEL[status]}
          </span>
        </li>
      ) : null}
    </ol>
  );
}

export function IssueCard({
  issue,
  selected,
  canAsk,
  onSelect,
  onLocate,
  onAsk,
  onDecide,
}: {
  issue: Issue;
  selected: boolean;
  canAsk: boolean;
  onSelect: () => void;
  onLocate: (messageId: string, quote: string) => void;
  onAsk: () => string | null;
  onDecide: (decision: DecisionKind, reason: string) => string | null;
}) {
  const [decision, setDecision] = useState<DecisionKind | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const closed = issue.status === "confirmed" || issue.status === "accepted_risk" || issue.status === "not_applicable";

  return (
    <article
      className={cn("rounded-md border bg-surface p-3", selected ? "border-accent ring-1 ring-accent" : "border-line")}
      aria-current={selected ? "true" : undefined}
    >
      <h3 className="text-sm font-semibold leading-5">
        <button
          type="button"
          data-issue-select="true"
          className="w-full rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onClick={onSelect}
        >
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge tone={issue.kind === "conflict" ? "danger" : "attention"}>{KIND_LABEL[issue.kind]}</Badge>
            <Badge tone={issue.priority === "high" ? "attention" : "neutral"}>{PRIORITY_LABEL[issue.priority]}</Badge>
            <Badge tone={statusTone(issue.status)}>{STATUS_LABEL[issue.status]}</Badge>
            <span className="text-[12px] font-normal text-subtle">{WAITING_LABEL[issue.waiting_for]}</span>
          </span>
          <span className="mt-1.5 block text-ink">{issue.title}</span>
          {issue.value ? <span className="mt-1 block text-[13px] font-normal leading-5 text-accent">{issue.value}</span> : null}
          <span className="mt-1 block text-[12px] font-normal text-subtle">
            更新于 <time className="tabular-nums" dateTime={issue.updated_at}>{formatStamp(issue.updated_at)} UTC</time>
          </span>
        </button>
      </h3>

      {selected ? (
        <div className="mt-3 space-y-3">
          <Pipeline status={issue.status} />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">原文</p>
            <ul className="mt-1 space-y-1.5">
              {issue.evidence.map((evidence) => (
                <li key={`${evidence.message_id}-${evidence.quote}`}>
                  <button
                    type="button"
                    className="w-full rounded-md border border-line bg-zinc-50 px-2.5 py-1.5 text-left text-[13px] leading-5 hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    onClick={() => onLocate(evidence.message_id, evidence.quote)}
                  >
                    <span className="mr-2 font-mono text-[11px] font-semibold text-accent">{evidence.message_id}</span>
                    <span>“{evidence.quote}”</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">缺口</p>
            <p className="mt-1 text-[13px] leading-5 text-ink">{issue.impact}</p>
          </div>
          {issue.status !== "confirmed" && issue.status !== "not_applicable" ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">建议补问</p>
              <p className="mt-1 text-[13px] leading-5 text-ink">{issue.question}</p>
            </div>
          ) : null}
          {issue.resolution_evidence.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">确认依据</p>
              <ul className="mt-1 space-y-1.5">
                {issue.resolution_evidence.map((evidence) => (
                  <li key={`res-${evidence.message_id}-${evidence.quote}`}>
                    <button
                      type="button"
                      className="w-full rounded-md border border-emerald-200 bg-ok-soft px-2.5 py-1.5 text-left text-[13px] leading-5 hover:border-ok focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      onClick={() => onLocate(evidence.message_id, evidence.quote)}
                    >
                      <span className="mr-2 font-mono text-[11px] font-semibold text-ok">{evidence.message_id}</span>
                      <span>“{evidence.quote}”</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {issue.decision_reason ? (
            <p className="text-[13px] leading-5 text-attention">
              {issue.decision_actor}：{issue.decision_reason}
            </p>
          ) : null}
          {issue.history.length > 0 ? (
            <details className="rounded-md border border-line px-2.5 py-1.5">
              <summary className="cursor-pointer text-[12px] font-semibold text-subtle">状态记录 · {issue.history.length}</summary>
              <ol className="mt-2 space-y-1.5">
                {issue.history.map((event, index) => (
                  <li key={`${event.at}-${index}`} className="text-[12px] leading-5 text-subtle">
                    <span className="font-semibold text-ink">{event.actor}</span>
                    {event.from ? ` ${STATUS_LABEL[event.from]} → ${STATUS_LABEL[event.to]}` : ` → ${STATUS_LABEL[event.to]}`}
                    <span className="mt-0.5 block">{event.reason}</span>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
          {!closed ? (
            <div className="space-y-2 border-t border-line pt-3">
              <p className="text-[12px] font-semibold text-subtle">处理 · 人工决定不会写成双方已经同意</p>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  aria-disabled={!canAsk || undefined}
                  onClick={() => {
                    if (!canAsk) {
                      setError("该事项已关闭，不必再问。");
                      return;
                    }
                    setError(onAsk());
                  }}
                >
                  提问
                </Button>
                {DECISIONS.map((item) => (
                  <Button
                    key={item.value}
                    size="sm"
                    variant={decision === item.value ? "default" : "outline"}
                    aria-pressed={decision === item.value}
                    onClick={() => {
                      setDecision(item.value);
                      setError(null);
                    }}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
              {decision ? (
                <form
                  className="space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const message = onDecide(decision, reason);
                    setError(message);
                    if (!message) {
                      setReason("");
                      setDecision(null);
                    }
                  }}
                >
                  <Textarea
                    aria-label={`${issue.title}的处理理由`}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="写明理由。空理由不会改变状态。"
                    className="min-h-16"
                  />
                  {error ? (
                    <p role="alert" className="text-[13px] text-danger">
                      {error}
                    </p>
                  ) : null}
                  <Button type="submit" size="sm">
                    记录这个决定
                  </Button>
                </form>
              ) : error ? (
                <p role="alert" className="text-[13px] text-danger">
                  {error}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
