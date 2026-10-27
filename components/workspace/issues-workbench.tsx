"use client";

import type { KeyboardEvent } from "react";
import { IssueCard } from "@/components/issue-card";
import { Select } from "@/components/ui/select";
import { STATUS_LABEL } from "@/lib/labels";
import { OPEN_FOR_MAIL, enginePresentation } from "@/lib/ui/workspace-model";
import type { IssueFilterPriority, IssueFilterStatus } from "@/lib/ui/workspace-model";
import type { DecisionKind, Issue, IssueStatus, Order } from "@/lib/types";

const STATUS_OPTIONS: Array<{ value: IssueFilterStatus; label: string }> = [
  { value: "all", label: "全部状态" },
  { value: "open", label: "未关闭" },
  { value: "closed", label: "已关闭" },
  ...(Object.keys(STATUS_LABEL) as IssueStatus[]).map((status) => ({ value: status, label: STATUS_LABEL[status] })),
];

const PRIORITY_OPTIONS: Array<{ value: IssueFilterPriority; label: string }> = [
  { value: "all", label: "全部优先级" },
  { value: "high", label: "重要" },
  { value: "low", label: "次要" },
];

export function IssuesWorkbench({
  order,
  issues,
  total,
  openCount,
  highOpen,
  selectedIssueId,
  statusFilter,
  priorityFilter,
  hiddenSelection,
  onStatusFilter,
  onPriorityFilter,
  onClearFilters,
  onSelect,
  onLocate,
  onAsk,
  onDecide,
}: {
  order: Order;
  issues: Issue[];
  total: number;
  openCount: number;
  highOpen: number;
  selectedIssueId: string | null;
  statusFilter: IssueFilterStatus;
  priorityFilter: IssueFilterPriority;
  hiddenSelection: boolean;
  onStatusFilter: (value: IssueFilterStatus) => void;
  onPriorityFilter: (value: IssueFilterPriority) => void;
  onClearFilters: () => void;
  onSelect: (issueId: string) => void;
  onLocate: (messageId: string, quote: string) => void;
  onAsk: (issueId: string) => string | null;
  onDecide: (issueId: string, decision: DecisionKind, reason: string) => string | null;
}) {
  const meta = order.review_meta;
  const engine = meta ? enginePresentation(meta.engine) : null;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-issue-select]")];
    const index = buttons.findIndex((button) => button === document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next = buttons[index + (event.key === "ArrowDown" ? 1 : -1)];
    next?.focus();
    next?.click();
  }

  return (
    <section aria-label="事项工作台" className="p-3" onKeyDown={onKeyDown}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-[#3f536f]">{order.reviewed ? "需要对齐的细节" : "本次核对范围"}</h2>
        <p className="text-[12px] tabular-nums text-subtle">
          {order.reviewed ? `未关闭 ${openCount} · 重要 ${highOpen}` : "尚未核对"}
        </p>
      </div>
      {engine ? (
        <p className="mt-1 text-[11px] leading-4 text-subtle">
          引擎 {engine.label}
          <span className="ml-1 font-mono">{engine.code}</span>
          {meta?.bedrockRequestId ? ` · request id ${meta.bedrockRequestId}` : ""}
          {meta?.modelRequestId ? ` · request id ${meta.modelRequestId}` : ""}
          {meta?.gatewayUsage?.totalTokens != null ? ` · gateway tokens ${meta.gatewayUsage.totalTokens}` : ""}
          {meta?.deepseekUsage?.totalTokens != null ? ` · deepseek tokens ${meta.deepseekUsage.totalTokens}` : ""}
          {meta?.ollamaUsage?.totalTokens != null ? ` · ollama tokens ${meta.ollamaUsage.totalTokens}` : ""}
          {meta?.agentRetries ? ` · agent retry ${meta.agentRetries}` : ""}
        </p>
      ) : null}
      {order.reviewed ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <div className="flex rounded-md border border-line bg-white p-0.5" role="group" aria-label="按优先级筛选">
            {PRIORITY_OPTIONS.map((option) => {
              const pressed = priorityFilter === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={pressed}
                  className={`rounded px-2 py-1 text-[12px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    pressed ? "bg-accent text-white" : "text-subtle hover:bg-zinc-50"
                  }`}
                  onClick={() => onPriorityFilter(option.value)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <Select
            aria-label="按状态筛选"
            className="h-8 text-[12px]"
            value={statusFilter}
            onChange={(event) => onStatusFilter(event.target.value as IssueFilterStatus)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <span className="text-[12px] tabular-nums text-subtle">
            显示 {issues.length} / {total}
          </span>
        </div>
      ) : (
        <p className="mt-3 rounded-md border border-dashed border-line bg-zinc-50 px-3 py-3 text-[13px] leading-5 text-subtle">
          往来已在左侧。开始核对后，这里只列出能在原文定位的缺口。相同日期的提货和到货不会被当成已经一致。
        </p>
      )}
      {hiddenSelection ? (
        <p className="mt-2 text-[12px] leading-5 text-subtle">
          当前选中事项不在筛选结果中。
          <button type="button" className="ml-1 font-semibold text-accent underline-offset-2 hover:underline" onClick={onClearFilters}>
            清除筛选
          </button>
        </p>
      ) : null}
      {order.reviewed && issues.length === 0 ? <p className="mt-3 text-[13px] text-subtle">没有符合筛选的事项。</p> : null}
      {order.reviewed ? (
        <div className="mt-3 space-y-2">
          {issues.map((issue) => (
            <IssueCard
              key={issue.issue_id}
              issue={issue}
              selected={issue.issue_id === selectedIssueId}
              canAsk={OPEN_FOR_MAIL.includes(issue.status)}
              onSelect={() => onSelect(issue.issue_id)}
              onLocate={onLocate}
              onAsk={() => onAsk(issue.issue_id)}
              onDecide={(decision, reason) => onDecide(issue.issue_id, decision, reason)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
