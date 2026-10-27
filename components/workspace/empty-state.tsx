import { Button } from "@/components/ui/button";

export function EmptyState({ onLoad }: { onLoad: () => void }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col px-6 py-10">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-subtle">工作台空闲</p>
      <h1 className="mt-2 text-xl font-semibold leading-7 text-ink">未加载订单</h1>
      <p className="mt-2 text-sm leading-6 text-subtle">
        加载 DEMO-001 后可核对往来、处理缺口并起草确认邮件。样例是 1,000 套发往英国的礼品包装，材料是三封英文邮件。核对前不给出结论。
      </p>
      <ul className="mt-4 space-y-1.5 text-[13px] leading-5 text-ink">
        <li>相同日期的伦敦到货和上海提货不会被当成同一承诺。</li>
        <li>数量若双方已写明，不再追问。</li>
        <li>样例里的发送只记录外发，不调用 SES，也不显示已投递。</li>
      </ul>
      <div className="mt-5">
        <Button size="lg" onClick={onLoad}>
          加载 DEMO-001
        </Button>
      </div>
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="px-6 py-10" aria-busy="true" aria-live="polite">
      <p className="text-sm text-subtle">正在打开工作台…</p>
      <div className="mt-4 space-y-2">
        <div className="h-8 w-48 rounded bg-zinc-200" />
        <div className="h-24 rounded border border-line bg-surface" />
        <div className="h-24 rounded border border-line bg-surface" />
      </div>
    </div>
  );
}
