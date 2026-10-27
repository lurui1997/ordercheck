import { Badge } from "@/components/ui/badge";
import { DELIVERY_LABEL, FACT_STATUS_LABEL } from "@/lib/labels";
import type { BadgeTone } from "@/lib/ui/workspace-model";
import type { ChecklistRow, KnownFact, Order } from "@/lib/types";

const CHECK_TONE: Record<ChecklistRow["tone"], string> = {
  confirmed: "border-emerald-200 bg-ok-soft",
  proposed: "border-amber-200 bg-attention-soft",
  open: "border-red-200 bg-danger-soft",
  risk: "border-amber-200 bg-attention-soft",
  na: "border-line bg-zinc-50",
};

export function FactsPanel({
  order,
  checklist,
  onLocate,
}: {
  order: Order;
  checklist: ChecklistRow[];
  onLocate: (messageId: string, quote: string) => void;
}) {
  return (
    <section aria-label="订单事实" className="space-y-4 p-3">
      <div>
        <h2 className="text-[13px] font-semibold text-ink">订单事实</h2>
        <p className="mt-1 text-[12px] leading-5 text-subtle">
          {order.buyer.country} 采购 {order.buyer.email}
          <span className="mx-1">·</span>
          {order.seller.country} 供应 {order.seller.email}
        </p>
      </div>

      {order.reviewed && checklist.length > 0 ? (
        <div>
          <h3 className="text-[12px] font-semibold text-subtle">核对清单</h3>
          <ul className="mt-1.5 space-y-1.5">
            {checklist.map((item) => (
              <li key={item.id} className={`rounded-md border px-2 py-1.5 ${CHECK_TONE[item.tone]}`}>
                <p className="text-[12px] font-semibold text-ink">{item.label}</p>
                <p className="text-[12px] leading-5 text-subtle tabular-nums">{item.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-line px-2.5 py-3 text-[13px] leading-5 text-subtle">核对完成前，这里没有已抽取的字段。</p>
      )}

      {order.facts.length > 0 ? (
        <div>
          <h3 className="text-[12px] font-semibold text-subtle">字段</h3>
          <ul className="mt-1.5 space-y-2">
            {order.facts.map((fact) => (
              <FactRow key={fact.id} fact={fact} onLocate={onLocate} />
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        <h3 className="text-[12px] font-semibold text-subtle">外发记录</h3>
        {order.outbound.length === 0 ? (
          <p className="mt-1.5 text-[12px] leading-5 text-subtle">还没有外发。记录发送后，投递状态会出现在这里。</p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {order.outbound.map((item) => (
              <li key={item.id} className="rounded-md border border-line px-2 py-1.5">
                <p className="text-[12px] font-semibold text-ink">{item.subject}</p>
                <p className="text-[12px] leading-5 text-subtle">
                  <span className="tabular-nums">{item.to}</span>
                  <span className="mx-1">·</span>
                  {DELIVERY_LABEL[item.delivery_status]}
                </p>
                <p className="text-[12px] leading-5 text-subtle">{item.note}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function FactRow({ fact, onLocate }: { fact: KnownFact; onLocate: (messageId: string, quote: string) => void }) {
  const tone: BadgeTone =
    fact.status === "confirmed" ? "ok" : fact.status === "historical" ? "neutral" : "attention";
  const evidence = fact.evidence[0];
  return (
    <li className="rounded-md border border-line px-2 py-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-semibold text-ink">{fact.label}</p>
        <Badge tone={tone}>{FACT_STATUS_LABEL[fact.status]}</Badge>
      </div>
      <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-ink">{fact.value}</p>
      <p className="text-[12px] leading-5 text-subtle">{fact.scope_note}</p>
      {evidence ? (
        <button
          type="button"
          className="mt-1 text-left text-[12px] font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onClick={() => onLocate(evidence.message_id, evidence.quote)}
        >
          定位原文
        </button>
      ) : null}
    </li>
  );
}
