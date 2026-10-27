import { Badge } from "@/components/ui/badge";
import { mockCaption } from "@/components/landing/content";

const messages = [
  {
    who: "Emma · 买方",
    quote: ["delivered to our London warehouse", "by 20 November 2026"],
    rest: "based on sample v2, including the protective inserts",
  },
  {
    who: "Lin · 卖方",
    quote: ["ready for collection in Shanghai", "on 20 November 2026"],
    rest: "The boxes are USD 2.40 each.",
  },
];

const issues = [
  { label: "重要 · 还没对齐", title: "到货和提货不是一回事", detail: "都写了 11 月 20 日", selected: true },
  { label: "重要 · 还没对齐", title: "样品 v2 和 v1 对不上", detail: "买方要 v2，报价写 v1", selected: false },
  { label: "重要 · 还没对齐", title: "内托没有报价", detail: "买方要内托，报价只写了盒子", selected: false },
];

export function WorkspaceMock() {
  return (
    <figure className="min-w-0">
      <div
        aria-hidden
        className="overflow-hidden rounded-2xl border border-white/15 bg-white text-ink shadow-[0_50px_120px_-36px_rgba(99,102,241,0.7)] ring-1 ring-inset ring-white/60"
      >
        <div className="flex items-center gap-3 border-b border-line bg-zinc-50 px-4 py-3">
          <span className="flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />
          </span>
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">
            <span className="font-mono">DEMO-001</span>
            <span className="mx-1.5 text-subtle">/</span>
            1,000 套礼品包装
          </p>
          <Badge>DEMO</Badge>
          <Badge tone="attention">未发送</Badge>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.95fr)_minmax(190px,0.7fr)]">
          <div className="border-b border-line p-4 lg:border-b-0 lg:border-r">
            <h3 className="px-1 text-[12px] font-semibold text-subtle">往来</h3>
            <ul className="mt-2 space-y-2">
              {messages.map((message) => (
                <li key={message.who} className="rounded-lg border border-line px-3 py-2.5">
                  <p className="text-[12px] font-semibold text-subtle">{message.who}</p>
                  <p className="mt-1 text-[13px] leading-5">
                    <mark>
                      {message.quote[0]}
                      <br />
                      {message.quote[1]}
                    </mark>
                  </p>
                  <p className="mt-1 text-[12px] leading-5 text-subtle">{message.rest}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-b border-line bg-zinc-50/80 p-4 lg:border-b-0 lg:border-r">
            <h3 className="px-1 text-[12px] font-semibold text-subtle">事项</h3>
            <ul className="mt-2 space-y-2">
              {issues.map((issue) => (
                <li
                  key={issue.title}
                  className={
                    issue.selected
                      ? "rounded-lg border border-indigo-200 bg-accent-soft px-3 py-2"
                      : "rounded-lg border border-line bg-white px-3 py-2"
                  }
                >
                  <Badge tone="attention">{issue.label}</Badge>
                  <p className="mt-1.5 text-[13px] font-semibold leading-5">{issue.title}</p>
                  <p className="text-[12px] leading-5 text-subtle">{issue.detail}</p>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-4">
            <h3 className="px-1 text-[12px] font-semibold text-subtle">事实</h3>
            <ul className="mt-2 space-y-2 text-[13px] leading-5">
              <li className="rounded-lg border border-emerald-200 bg-ok-soft px-3 py-2 text-ok">数量 1,000，两边都写了</li>
              <li className="rounded-lg border border-line bg-white px-3 py-2">盒子 USD 2.40，不是整套价</li>
              <li className="rounded-lg border border-amber-200 bg-attention-soft px-3 py-2 text-attention">运费还没写</li>
            </ul>
          </div>
        </div>
      </div>
      <figcaption className="mt-4 text-center text-[12px] text-zinc-400">{mockCaption}</figcaption>
    </figure>
  );
}
