"use client";

import { AGREEMENT_LABEL, STATUS_LABEL } from "@/lib/labels";
import { Modal } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { compareOrders, enginePresentation, type EngineComparison } from "@/lib/ui/workspace-model";
import type { AgreementSummary, Order, ReviewEngine } from "@/lib/types";
import { buildSummary } from "@/lib/review/summary";

export interface CompareView {
  left: Order | null;
  leftError?: string;
  right: Order | null;
  rightEngine: ReviewEngine | null;
  rightError?: { code?: string; message: string };
  singleEngine: boolean;
}

export function CompareDialog({
  open,
  busy,
  view,
  onOpenChange,
}: {
  open: boolean;
  busy: boolean;
  view: CompareView | null;
  onOpenChange: (open: boolean) => void;
}) {
  const comparison = view?.left && view.right ? compareOrders(view.left, view.right) : null;
  const leftOrder = view?.left ?? null;
  const rightOrder = view?.right ?? null;
  const leftSummary = leftOrder?.reviewed ? buildSummary(leftOrder) : null;
  const rightSummary = rightOrder?.reviewed ? buildSummary(rightOrder) : null;
  const rightLabel = view?.rightEngine ? enginePresentation(view.rightEngine) : null;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="双引擎对照"
      description="左栏是确定性规则引擎。右栏只有在配置了另一个核对引擎时才会调用。对照不会替换当前工作台订单。"
      className="w-[min(1080px,calc(100%-1.5rem))]"
    >
      {busy && !view ? (
        <p className="flex items-center gap-2 text-sm text-subtle" role="status">
          <Spinner />
          正在对照。工作台订单不会被替换。
        </p>
      ) : null}
      {view?.singleEngine ? (
        <p className="mb-3 rounded-md border border-line bg-zinc-50 px-3 py-2 text-[13px] leading-5 text-ink">
          当前配置的核对引擎就是确定性规则引擎。没有第二引擎，因此不会调用 Amazon Bedrock 或 AI Gateway，也不会把同一结果标成模型输出。
        </p>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        <CompareColumn title="确定性规则引擎" code="deterministic" order={leftOrder} error={view?.leftError} summary={leftSummary} />
        <CompareColumn
          title={rightLabel?.label ?? "第二引擎"}
          code={view?.rightEngine ?? "未配置"}
          order={rightOrder}
          error={view?.rightError ? [view.rightError.code, view.rightError.message].filter(Boolean).join(" · ") : undefined}
          summary={rightSummary}
          empty={view?.singleEngine ? "未配置第二引擎。" : busy ? "正在请求配置中的核对引擎…" : "没有第二引擎结果。"}
        />
      </div>
      {comparison ? <AgreementTable comparison={comparison} /> : null}
      {view?.singleEngine && leftSummary ? (
        <p className="mt-3 text-[13px] leading-5 text-subtle">
          规则引擎摘要：{AGREEMENT_LABEL[leftSummary.agreement_status]}。{leftSummary.next_action}
        </p>
      ) : null}
    </Modal>
  );
}

function CompareColumn({
  title,
  code,
  order,
  error,
  summary,
  empty,
}: {
  title: string;
  code: string;
  order: Order | null;
  error?: string;
  summary: AgreementSummary | null;
  empty?: string;
}) {
  return (
    <section className="rounded-md border border-line p-3">
      <h3 className="text-[13px] font-semibold text-ink">
        {title}
        <span className="ml-2 font-mono text-[11px] font-normal text-subtle">{code}</span>
      </h3>
      {error ? (
        <p role="alert" className="mt-2 text-[13px] leading-5 text-danger">
          {error}
        </p>
      ) : null}
      {!order && !error ? <p className="mt-2 text-[13px] leading-5 text-subtle">{empty ?? "没有结果。"}</p> : null}
      {summary ? (
        <p className={`mt-2 rounded-md px-2 py-1.5 text-[12px] leading-5 ${summary.agreement_status === "key_terms_confirmed" ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}>
          {AGREEMENT_LABEL[summary.agreement_status]}。{summary.next_action}
        </p>
      ) : null}
      {order ? (
        <ul className="mt-2 space-y-1">
          {order.issues.map((issue) => (
            <li key={issue.issue_id} className="flex items-start justify-between gap-2 text-[12px] leading-5">
              <span className="text-ink">{issue.title}</span>
              <span className="shrink-0 text-subtle">{STATUS_LABEL[issue.status]}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function AgreementTable({ comparison }: { comparison: EngineComparison }) {
  return (
    <div className="mt-3">
      <h3 className="text-[13px] font-semibold text-ink">
        事项状态 {comparison.disagreed === 0 ? "一致" : `不一致 ${comparison.disagreed}`}
        <span className="ml-2 font-normal text-subtle tabular-nums">
          {comparison.agreed}/{comparison.rows.length}
        </span>
      </h3>
      <p className="mt-1 text-[12px] text-subtle">
        摘要{comparison.summariesAgree ? "一致" : "不一致"}
        {comparison.leftAgreement ? ` · 左 ${AGREEMENT_LABEL[comparison.leftAgreement]}` : ""}
        {comparison.rightAgreement ? ` · 右 ${AGREEMENT_LABEL[comparison.rightAgreement]}` : ""}
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-left text-[12px]">
          <thead>
            <tr className="border-b border-line text-subtle">
              <th className="py-1 pr-2 font-semibold">事项</th>
              <th className="py-1 pr-2 font-semibold">规则引擎</th>
              <th className="py-1 pr-2 font-semibold">第二引擎</th>
              <th className="py-1 font-semibold">对照</th>
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((row) => (
              <tr key={row.issue_id} className="border-b border-line">
                <td className="py-1.5 pr-2 text-ink">{row.title}</td>
                <td className="py-1.5 pr-2">{row.leftStatus ? STATUS_LABEL[row.leftStatus] : "—"}</td>
                <td className="py-1.5 pr-2">{row.rightStatus ? STATUS_LABEL[row.rightStatus] : "—"}</td>
                <td className={`py-1.5 font-semibold ${row.agree ? "text-ok" : "text-danger"}`}>{row.agree ? "一致" : "不一致"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
