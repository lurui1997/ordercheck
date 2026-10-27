import { engineChain, explicitEngine, platform } from "@/components/landing/content";
import { SectionIntro } from "@/components/landing/section-intro";

export function Platform() {
  return (
    <section id={platform.id} className="scroll-mt-24 bg-zinc-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <SectionIntro kicker={platform.kicker} title={platform.title} lede={platform.lede} light />

        <div className="mt-10 overflow-x-auto">
          <ol className="flex min-w-max items-center gap-2" aria-label="自动选择顺序">
            {engineChain.map((engine, index) => (
              <li key={engine.code} className="flex items-center gap-2">
                {index > 0 ? (
                  <span className="px-1 text-zinc-500" aria-hidden>
                    →
                  </span>
                ) : null}
                <span className="rounded-lg border border-white/15 bg-white/5 px-3 py-2">
                  <span className="block text-sm font-semibold text-white">{engine.label}</span>
                  <span className="font-mono text-[11px] text-indigo-200">{engine.code}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-zinc-300">
            自动链到此为止。
            <span className="ml-2 font-semibold text-white">{explicitEngine.label}</span>
            <span className="ml-2 font-mono text-[11px] text-amber-200">{explicitEngine.code}</span>
            <span className="ml-2">{explicitEngine.note}。</span>
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {platform.groups.map((group, index) => (
            <section key={group.title} className="rounded-xl border border-white/10 bg-white/[0.04] p-5" aria-labelledby={`platform-group-${index}`}>
              <h3 id={`platform-group-${index}`} className="text-sm font-semibold tracking-wide text-indigo-200">
                {group.title}
              </h3>
              <ul className="mt-4 space-y-3">
                {group.items.map((item) => (
                  <li key={item.code} className="grid grid-cols-1 gap-1 border-t border-white/10 pt-3 first:border-t-0 first:pt-0 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-4">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.name}</p>
                      <p className="font-mono text-[11px] text-zinc-400">{item.code}</p>
                    </div>
                    <p className="text-sm leading-6 text-zinc-300">{item.note}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <ul className="mt-8 grid gap-4 lg:grid-cols-3">
          {platform.refusals.map((item) => (
            <li key={item.title} className="rounded-xl border border-amber-200/30 bg-amber-200/10 px-5 py-4">
              <p className="text-sm font-semibold text-amber-100">{item.title}</p>
              <p className="mt-1 text-sm leading-6 text-amber-50">{item.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
