import { CtaLink } from "@/components/landing/cta";
import { closing, footer } from "@/components/landing/content";

export function Closing() {
  return (
    <>
      <section aria-labelledby="closing-title" className="mx-auto max-w-6xl px-6 py-24 text-center sm:py-32">
        <h2 id="closing-title" className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          {closing.line}
        </h2>
        <div className="mt-8">
          <CtaLink href={closing.primary.href}>{closing.primary.label}</CtaLink>
        </div>
      </section>
      <footer className="border-t border-white/10">
        <p className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-6 py-6 text-[13px] text-zinc-400">
          <span className="font-semibold text-zinc-200">OrderCheck</span>
          <span>{footer.note}</span>
        </p>
      </footer>
    </>
  );
}
