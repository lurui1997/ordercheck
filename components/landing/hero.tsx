import { CtaLink } from "@/components/landing/cta";
import { hero } from "@/components/landing/content";
import { WorkspaceMock } from "@/components/landing/workspace-mock";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[46%] h-[520px] w-[920px] -translate-x-1/2 rounded-full bg-indigo-500/25 blur-3xl"
      />
      <div className="relative mx-auto max-w-6xl px-6 pb-8 pt-16 sm:pt-24">
        <div className="oc-rise mx-auto max-w-3xl text-center">
          <h1 className="text-balance text-[2.6rem] font-semibold leading-[1.08] tracking-[-0.035em] text-white sm:text-6xl sm:leading-[1.05]">
            {hero.title}
          </h1>
          <p className="mt-5 text-lg text-zinc-300">{hero.line}</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <CtaLink href={hero.primary.href}>{hero.primary.label}</CtaLink>
            <CtaLink href={hero.secondary.href} tone="quiet">
              {hero.secondary.label}
            </CtaLink>
          </div>
        </div>
        <div className="oc-rise oc-rise-late relative mx-auto mt-14 max-w-6xl sm:mt-16">
          <WorkspaceMock />
        </div>
      </div>
    </section>
  );
}
