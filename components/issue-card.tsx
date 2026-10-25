"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { KIND_LABEL, PRIORITY_LABEL, STATUS_LABEL, WAITING_LABEL } from "@/lib/labels";
import type { DecisionKind, Issue } from "@/lib/types";
import { formatStamp } from "@/lib/utils";

function useInitiallyOpen(open: boolean) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.open = open;
  }, [open]);
  return ref;
}

const DECISIONS: Array<{ value: DecisionKind; label: string }> = [
  { value: "accepted_risk", label: "接受风险" },
  { value: "needs_human_review", label: "需要人工核实" },
  { value: "not_applicable", label: "本次不适用" },
];

export function IssueCard({
  issue,
  onLocate,
  onDecide,
}: {
  issue: Issue;
  onLocate: (messageId: string, quote: string) => void;
  onDecide: (decision: DecisionKind, reason: string) => string | null;
}) {
  const [decision, setDecision] = useState<DecisionKind>("accepted_risk");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const closed = issue.status === "confirmed" || issue.status === "accepted_risk" || issue.status === "not_applicable";
  const detailsRef = useInitiallyOpen(issue.priority === "high" && !closed);
  const tone =
    issue.status === "confirmed"
      ? "bg-[#e5f2eb] text-[#1f6b4a]"
      : issue.status === "proposed" || issue.status === "accepted_risk"
        ? "bg-[#f8efd8] text-[#8a5a12]"
        : issue.status === "question_sent" || issue.status === "needs_human_review"
          ? "bg-[#e5eef4] text-[#1e4d6b]"
          : "bg-[#fde8e4] text-[#c4452d]";

  return (
    <article className="rounded-lg border border-[#eadfcd] bg-[#fffdf8] p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-[#1c2430] px-1.5 py-0.5 font-semibold text-[#f6f1e6]">{KIND_LABEL[issue.kind]}</span>
        <span className="rounded bg-[#f3ecdf] px-1.5 py-0.5 font-semibold text-[#5c6775]">{PRIORITY_LABEL[issue.priority]}</span>
        <span className={`rounded px-1.5 py-0.5 font-semibold ${tone}`}>{STATUS_LABEL[issue.status]}</span>
        <span className="text-[#5c6775]">{WAITING_LABEL[issue.waiting_for]}</span>
      </div>
      <h3 className="mt-2 text-base font-semibold text-[#1c2430]">{issue.title}</h3>
      {issue.value ? <p className="mt-1 text-sm text-[#1e4d6b]">{issue.value}</p> : null}
      <p className="mt-2 text-xs text-[#5c6775]">更新于 {formatStamp(issue.updated_at)} UTC</p>

      <details ref={detailsRef} className="mt-3">
        <summary className="cursor-pointer text-sm font-semibold text-[#1c2430]">原文、缺口、建议问句</summary>
        <div className="mt-3 space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#8a8174]">原文</p>
            <ul className="mt-1 space-y-2">
              {issue.evidence.map((evidence) => (
                <li key={`${evidence.message_id}-${evidence.quote}`}>
                  <button
                    type="button"
                    className="w-full rounded-md border border-[#eadfcd] bg-[#fbf7f0] px-3 py-2 text-left text-sm leading-6 hover:border-[#c4452d]"
                    onClick={() => onLocate(evidence.message_id, evidence.quote)}
                  >
                    <span className="mr-2 font-semibold text-[#c4452d]">{evidence.message_id}</span>
                    <span>“{evidence.quote}”</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#8a8174]">缺口</p>
            <p className="mt-1 text-sm leading-6 text-[#1c2430]">{issue.impact}</p>
          </div>
          {issue.status !== "confirmed" && issue.status !== "not_applicable" ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#8a8174]">建议补问</p>
              <p className="mt-1 text-sm leading-6 text-[#1c2430]">{issue.question}</p>
            </div>
          ) : null}
          {issue.resolution_evidence.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#8a8174]">确认依据</p>
              <ul className="mt-1 space-y-2">
                {issue.resolution_evidence.map((evidence) => (
                  <li key={`res-${evidence.message_id}-${evidence.quote}`}>
                    <button
                      type="button"
                      className="w-full rounded-md border border-[#c9e4d6] bg-[#f3faf6] px-3 py-2 text-left text-sm leading-6 hover:border-[#1f6b4a]"
                      onClick={() => onLocate(evidence.message_id, evidence.quote)}
                    >
                      <span className="mr-2 font-semibold text-[#1f6b4a]">{evidence.message_id}</span>
                      <span>“{evidence.quote}”</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {issue.decision_reason ? (
            <p className="text-sm leading-6 text-[#8a5a12]">
              {issue.decision_actor}：{issue.decision_reason}
            </p>
          ) : null}
        </div>
      </details>

      {issue.history.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-[#5c6775]">状态记录 · {issue.history.length}</summary>
          <ol className="mt-2 space-y-2">
            {issue.history.map((event, index) => (
              <li key={`${event.at}-${index}`} className="text-xs leading-5 text-[#5c6775]">
                <span className="font-semibold text-[#1c2430]">{event.actor}</span> {event.reason}
              </li>
            ))}
          </ol>
        </details>
      ) : null}

      {issue.status !== "confirmed" && issue.status !== "not_applicable" && issue.status !== "accepted_risk" ? (
        <form
          className="mt-3 space-y-2 border-t border-[#eadfcd] pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            const message = onDecide(decision, reason);
            setError(message);
            if (!message) setReason("");
          }}
        >
          <p className="text-xs font-semibold text-[#5c6775]">人工处理 · 不会自动当成双方已经同意</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              aria-label={`${issue.title}的人工处理`}
              className="h-9 rounded-md border border-[#ddcfb8] bg-white px-2 text-sm"
              value={decision}
              onChange={(event) => setDecision(event.target.value as DecisionKind)}
            >
              {DECISIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <Textarea
              aria-label={`${issue.title}的处理理由`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="写明理由。空理由不会改变状态。"
              className="min-h-16 sm:flex-1"
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-[#c4452d]">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="sm" variant="outline">
            记录这个决定
          </Button>
        </form>
      ) : null}
    </article>
  );
}
