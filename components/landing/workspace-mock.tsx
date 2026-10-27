import { BrandMark } from "@/components/brand-mark";
import { mockCaption } from "@/components/landing/content";

export function WorkspaceMock() {
  return (
    <figure className="min-w-0">
      <div
        aria-hidden
        className="overflow-hidden rounded-xl border border-line bg-canvas text-ink shadow-[0_24px_60px_-28px_rgba(20,44,73,0.45)]"
      >
        <div className="grid min-h-[420px] md:grid-cols-[168px_minmax(0,1.15fr)_minmax(0,0.9fr)]">
          <aside className="hidden flex-col bg-navy px-4 py-6 text-[#d2deed] md:flex">
            <div className="flex items-center gap-2 text-white">
              <BrandMark size="sm" />
              <span className="text-[15px] font-bold tracking-[-0.04em]">OrderCheck</span>
            </div>
            <p className="mt-2 px-0.5 text-[10px] tracking-[0.14em] text-[#8298b3]">当前订单</p>
            <div className="mt-3 rounded-r-md border-l-2 border-[#7396ff] bg-[#1c3552] px-3 py-3">
              <p className="text-[10px] text-[#86a0bd]">DEMO-001</p>
              <p className="mt-1 text-[12px] leading-5 text-white">1,000 套礼品包装</p>
              <p className="mt-1 text-[10px] text-[#f0d7a2]">等待首次核对</p>
            </div>
            <p className="mt-auto pt-8 text-[10px] leading-5 text-[#8298b3]">样例订单，不是邮箱同步。</p>
          </aside>

          <div className="border-b border-line bg-white md:border-b-0 md:border-r">
            <div className="border-b border-line px-4 py-3">
              <p className="text-[13px] font-semibold text-[#2e3d52]">订单邮件</p>
              <p className="mt-1 text-[11px] text-[#748db1]">Lin ↔ Emma · 2 封已展开示意</p>
            </div>
            <div className="px-4">
              <div className="border-b border-[#edf0f5] py-3">
                <p className="text-[12px] font-semibold text-[#3b4e68]">Emma · 买方</p>
                <p className="mt-1 truncate text-[12px] text-[#56729a]">delivered to our London warehouse…</p>
              </div>
              <div className="py-3">
                <p className="text-[12px] font-semibold text-[#3b4e68]">Lin · 卖方</p>
                <p className="mt-2 text-[12px] leading-6 text-[#415673]">
                  <mark>ready for collection in Shanghai</mark>
                  <br />
                  <mark>on 20 November 2026</mark>
                </p>
                <p className="mt-1 text-[12px] leading-5 text-muted">The boxes are USD 2.40 each.</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4">
            <p className="text-[13px] font-semibold text-[#33445c]">确认前，帮你多看一步</p>
            <div className="mt-3 rounded-[11px] border border-[#d1def3] bg-[#eaf1fb] p-3">
              <p className="text-[10px] tracking-wide text-[#6480a8]">下一步 · 订单确认前</p>
              <p className="mt-1.5 text-[14px] font-medium leading-6 tracking-tight text-[#294c76]">把没说清的地方找出来</p>
              <span className="mt-3 inline-flex h-8 items-center rounded-[6px] bg-accent px-3 text-[11px] font-medium text-white">开始核对</span>
            </div>
            <ul className="mt-3 space-y-2">
              <li className="rounded-lg border border-[#a2b3cb] bg-[#f9fbfd] px-3 py-2">
                <p className="text-[12px] font-medium leading-5 text-[#33445c]">到货和提货不是一回事</p>
                <p className="mt-1 truncate text-[11px] text-[#6984aa]">delivered to our London warehouse</p>
              </li>
              <li className="rounded-lg border border-[#d7dfe9] px-3 py-2">
                <p className="text-[12px] font-medium leading-5 text-[#33445c]">样品 v2 和 v1 对不上</p>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <figcaption className="mt-4 text-center text-[12px] text-muted">{mockCaption}</figcaption>
    </figure>
  );
}
