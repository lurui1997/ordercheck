import { Badge } from "@/components/ui/badge";

const messages = [
  {
    who: "Emma · 买方",
    quote: "delivered to our London warehouse by 20 November 2026",
    rest: "based on sample v2, including the protective inserts",
  },
  {
    who: "Lin · 卖方",
    quote: "ready for collection in Shanghai on 20 November 2026",
    rest: "quantity 1,000 is confirmed. The boxes are USD 2.40 each.",
  },
];

const issues = [
  { tone: "attention" as const, label: "重要 · 未确认", title: "到货与提货里程碑未对齐", detail: "同日。伦敦到货，不是上海提货。" },
  { tone: "attention" as const, label: "重要 · 未确认", title: "样品版本不一致", detail: "买方 sample v2，报价 sample v1。" },
  { tone: "attention" as const, label: "重要 · 未确认", title: "内托是否包含及费用未确认", detail: "买方要内托，报价只写了盒子。" },
  { tone: "ok" as const, label: "已确认", title: "数量 1,000 套", detail: "双方已写明，不再追问。" },
];

export function WorkspaceMock() {
  return (
    <figure className="min-w-0">
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_24px_70px_-36px_rgba(24,24,27,0.45)]">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-zinc-50 px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-ink">
              <span className="font-mono">DEMO-001</span>
              <span className="mx-1.5 text-subtle">/</span>
              1,000 custom gift packaging sets
            </p>
            <p className="truncate text-[12px] text-subtle">Lin → Emma · 确认订单前</p>
          </div>
          <ul className="hidden shrink-0 gap-1 sm:flex" aria-label="示意中的运行徽章">
            <li>
              <Badge>DEMO_MODE</Badge>
            </li>
            <li>
              <Badge tone="accent">核对 · 规则引擎</Badge>
            </li>
            <li>
              <Badge tone="attention">未发送</Badge>
            </li>
          </ul>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)_minmax(180px,0.72fr)]">
          <div className="border-b border-line p-3 lg:border-b-0 lg:border-r">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-ink">往来</h3>
              <span className="text-[12px] tabular-nums text-subtle">3 封里的 2 封</span>
            </div>
            <ul className="space-y-2">
              {messages.map((message) => (
                <li key={message.who} className="rounded-lg border border-line bg-white px-3 py-2.5">
                  <p className="text-[12px] font-semibold text-subtle">{message.who}</p>
                  <p className="mt-1 text-[13px] leading-5 text-ink">
                    <mark>{message.quote}</mark>
                  </p>
                  <p className="mt-1 text-[12px] leading-5 text-subtle">{message.rest}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-b border-line bg-zinc-50/80 p-3 lg:border-b-0 xl:border-r">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-ink">事项</h3>
              <span className="text-[12px] text-subtle">核对后</span>
            </div>
            <ul className="space-y-2">
              {issues.map((issue) => (
                <li key={issue.title} className="rounded-lg border border-line bg-white px-3 py-2">
                  <Badge tone={issue.tone}>{issue.label}</Badge>
                  <p className="mt-1.5 text-[13px] font-semibold leading-5 text-ink">{issue.title}</p>
                  <p className="text-[12px] leading-5 text-subtle">{issue.detail}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-3">
            <h3 className="mb-2 text-[13px] font-semibold text-ink">事实</h3>
            <ul className="space-y-2 text-[13px] leading-5">
              <li className="rounded-lg border border-emerald-200 bg-ok-soft px-3 py-2 text-ok">数量 1,000 · 双方确认</li>
              <li className="rounded-lg border border-line bg-white px-3 py-2 text-ink">盒子 USD 2.40 · 单方陈述，不是整套价</li>
              <li className="rounded-lg border border-amber-200 bg-attention-soft px-3 py-2 text-attention">运费、付款、验收仍可见</li>
            </ul>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-[12px] leading-5 text-subtle">
        界面示意，使用 DEMO-001 的样例句子。打开工作台并加载订单后，才是可操作的核对。
      </figcaption>
    </figure>
  );
}
