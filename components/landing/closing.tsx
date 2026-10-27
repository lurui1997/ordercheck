import { CtaLink } from "@/components/landing/cta";
import { closing, footer } from "@/components/landing/content";

export function Closing() {
  return (
    <>
      <section aria-labelledby="closing-title" className="mx-auto max-w-6xl px-6 py-20 text-center sm:py-24">
        <h2 id="closing-title" className="text-3xl font-semibold tracking-[-0.04em] text-navy sm:text-4xl">
          {closing.line}
        </h2>
        <div className="mt-8">
          <CtaLink href={closing.primary.href}>{closing.primary.label}</CtaLink>
        </div>
      </section>
      <footer className="border-t border-line bg-white">
        <p className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-6 py-6 text-[13px] text-muted">
          <span className="font-semibold text-navy">OrderCheck</span>
          <span>{footer.note}</span>
        </p>
      </footer>
    </>
  );
}
