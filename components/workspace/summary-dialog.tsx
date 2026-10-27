import { AGREEMENT_LABEL, STATUS_LABEL, WAITING_LABEL } from "@/lib/labels";
import { Modal } from "@/components/ui/dialog";
import type { AgreementSummary } from "@/lib/types";

export function SummaryDialog({
  open,
  summary,
  onOpenChange,
}: {
  open: boolean;
  summary: AgreementSummary | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="约定摘要" description="只写双方明确同意的内容。已确认不等于已经生产、付款或交货。">
      {summary ? <SummaryView summary={summary} /> : <p className="text-sm text-subtle">还没有摘要。</p>}
    </Modal>
  );
}

function SummaryView({ summary }: { summary: AgreementSummary }) {
  const ready = summary.agreement_status === "key_terms_confirmed";
  return (
    <div className="space-y-4 text-sm leading-6">
      <div className={`rounded-md border px-3 py-2 ${ready ? "border-emerald-200 bg-ok-soft text-ok" : "border-red-200 bg-danger-soft text-danger"}`}>
        <p className="font-semibold">{AGREEMENT_LABEL[summary.agreement_status]}</p>
        <p>{summary.next_action}</p>
        <p className="text-[12px]">履约状态：尚未开始或未知。付款、生产和交货都还没有记录。</p>
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
              <div key={key} className="rounded-md border border-line px-3 py-2">
                <dt className="text-[12px] text-subtle">{key}</dt>
                <dd className="font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      <ul className="list-disc space-y-1 pl-5 text-[13px] text-subtle">
        {summary.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}

function SummaryGroup({ title, empty, lines }: { title: string; empty: string; lines: AgreementSummary["confirmed"] }) {
  return (
    <section>
      <h3 className="font-semibold">{title}</h3>
      {lines.length === 0 ? <p className="text-subtle">{empty}</p> : null}
      <ul className="mt-2 space-y-2">
        {lines.map((line) => (
          <li key={line.issue_id} className="rounded-md border border-line px-3 py-2">
            <p className="font-semibold">
              {line.title}
              <span className="ml-2 text-[12px] font-normal text-subtle">
                {STATUS_LABEL[line.status]} · {WAITING_LABEL[line.waiting_for]}
              </span>
            </p>
            {line.value ? <p className="tabular-nums">{line.value}</p> : null}
            <p className="text-ink">{line.detail}</p>
            {line.reason ? <p className="text-attention">理由：{line.reason}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
