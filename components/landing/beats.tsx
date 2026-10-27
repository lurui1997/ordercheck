import { beats } from "@/components/landing/content";

export function Beats() {
  return (
    <section aria-labelledby="beats-title" className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
      <h2 id="beats-title" className="sr-only">
        能做的三件事
      </h2>
      <ol className="grid gap-10 sm:grid-cols-3 sm:gap-8">
        {beats.map((beat, index) => (
          <li key={beat.title} className="rounded-xl border border-line bg-white px-5 py-6">
            <p className="text-[11px] font-semibold tracking-[0.12em] text-accent">{`0${index + 1}`}</p>
            <h3 className="mt-3 text-lg font-semibold tracking-tight text-navy">{beat.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{beat.line}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
