"use client";

import { STATUS_LABEL } from "@/lib/labels";
import { Modal } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { enginePresentation } from "@/lib/ui/workspace-model";
import type { CompareSide, ReviewCompareResult } from "@/lib/types";

export function CompareDialog({
  open,
  busy,
  result,
  error,
  onOpenChange,
}: {
  open: boolean;
  busy: boolean;
  result: ReviewCompareResult | null;
  error: { code?: string; message: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const deterministic = enginePresentation("deterministic");
  const liveEngine = result?.live.engine ? enginePresentation(result.live.engine) : null;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="双引擎对照"
      description="左栏是确定性规则引擎。右栏来自 POST /api/orders/:id/review-compare 的 live 侧。对照不会替换当前工作台订单。"
      className="w-[min(1080px,calc(100%-1.5rem))]"
    >
      {busy && !result ? (
        <p className="mb-3 flex items-center gap-2 text-sm text-subtle" role="status">
          <Spinner />
          正在对照。工作台订单不会被替换。
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mb-3 rounded-md border border-red-200 bg-danger-soft px-3 py-2 text-[13px] leading-5 text-danger">
          {error.code ? <span className="mr-2 font-mono">{error.code}</span> : null}
          {error.message}
        </p>
      ) : null}
      {result ? (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            <CompareColumn title={deterministic.label} code={deterministic.code} side={result.deterministic} />
            <CompareColumn
              title={liveEngine ? liveEngine.label : "对照 · 无"}
              code={liveEngine ? liveEngine.code : "none"}
              side={result.live}
              unnamed={!liveEngine}
            />
          </div>
          <AgreementSection result={result} />
        </>
      ) : null}
    </Modal>
  );
}

function CompareColumn({
  title,
  code,
  side,
  unnamed,
}: {
  title: string;
  code: string;
  side: CompareSide;
  unnamed?: boolean;
}) {
  const missing = side.missing?.filter((item) => item.length > 0) ?? [];
  return (
    <section className="rounded-md border border-line p-3">
      <h3 className="text-[13px] font-semibold text-ink">
        {title}
        <span className="ml-2 font-mono text-[11px] font-normal text-subtle">{code}</span>
      </h3>
      {unnamed ? (
        <p className="mt-2 text-[12px] leading-5 text-subtle">live.engine 为空。这里不另写一个模型名称。</p>
      ) : null}
      {side.notice ? <p className="mt-2 text-[12px] leading-5 text-subtle">{side.notice}</p> : null}
      {!side.ok ? (
        <p role="alert" className="mt-2 text-[13px] leading-5 text-danger">
          {side.code ? <span className="mr-2 font-mono">{side.code}</span> : null}
          {side.error ?? "这一侧没有成功结果。"}
          {missing.length > 0 ? ` 缺少 ${missing.join("、")}。` : ""}
        </p>
      ) : null}
      {side.ok && side.issues.length === 0 ? <p className="mt-2 text-[13px] leading-5 text-subtle">这一侧没有事项。</p> : null}
      {side.issues.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {side.issues.map((issue) => (
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

function AgreementSection({ result }: { result: ReviewCompareResult }) {
  const agreement = result.agreement;
  if (!agreement.comparable) {
    return <p className="mt-3 text-[13px] leading-5 text-subtle">两边没有同时成功，不算成分歧。</p>;
  }
  const jaccard = agreement.jaccard == null ? "—" : agreement.jaccard.toFixed(2);
  return (
    <div className="mt-3">
      <h3 className="text-[13px] font-semibold text-ink">
        可对照
        <span className="ml-2 font-normal text-subtle tabular-nums">Jaccard {jaccard}</span>
      </h3>
      <p className="mt-1 text-[12px] leading-5 text-subtle">
        共有 {agreement.shared.length} · 仅规则引擎 {agreement.onlyDeterministic.length} · 仅 live {agreement.onlyLive.length} · 状态不一致{" "}
        {agreement.statusMismatches.length}
      </p>
      {agreement.statusMismatches.length > 0 ? (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-line text-subtle">
                <th className="py-1 pr-2 font-semibold">事项</th>
                <th className="py-1 pr-2 font-semibold">规则引擎</th>
                <th className="py-1 pr-2 font-semibold">live</th>
              </tr>
            </thead>
            <tbody>
              {agreement.statusMismatches.map((row) => (
                <tr key={row.issue_id} className="border-b border-line">
                  <td className="py-1.5 pr-2 font-mono text-ink">{row.issue_id}</td>
                  <td className="py-1.5 pr-2">{STATUS_LABEL[row.deterministic]}</td>
                  <td className="py-1.5 pr-2">{STATUS_LABEL[row.live]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-2 text-[13px] text-ok">共有事项的状态一致。</p>
      )}
    </div>
  );
}
