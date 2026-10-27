import { CtaLink } from "@/components/landing/cta";
import { hero } from "@/components/landing/content";
import { WorkspaceMock } from "@/components/landing/workspace-mock";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[linear-gradient(180deg,#eaf1fb_0%,rgba(244,246,250,0)_100%)]" />
      <div className="relative mx-auto max-w-6xl px-6 pb-8 pt-14 sm:pt-20">
        <div className="oc-rise mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[#607da5]">订单确认前</p>
          <h1 className="mt-3 text-balance text-[2.15rem] font-semibold leading-[1.2] tracking-[-0.04em] text-navy sm:text-5xl sm:leading-[1.15]">
            {hero.title}
          </h1>
          <p className="mt-4 text-base text-muted">{hero.line}</p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <CtaLink href={hero.primary.href}>{hero.primary.label}</CtaLink>
            <CtaLink href={hero.secondary.href} tone="quiet">
              {hero.secondary.label}
            </CtaLink>
          </div>
        </div>
        <div className="oc-rise oc-rise-late relative mx-auto mt-12 max-w-6xl sm:mt-14">
          <WorkspaceMock />
        </div>
      </div>
    </section>
  );
}
