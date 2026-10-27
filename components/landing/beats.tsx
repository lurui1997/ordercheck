import { beats } from "@/components/landing/content";

export function Beats() {
  return (
    <section aria-labelledby="beats-title" className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <h2 id="beats-title" className="sr-only">
        能做的三件事
      </h2>
      <ol className="grid gap-14 sm:grid-cols-3 sm:gap-10">
        {beats.map((beat, index) => (
          <li key={beat.title}>
            <p className="font-mono text-xs font-semibold text-indigo-300">{`0${index + 1}`}</p>
            <h3 className="mt-3 text-xl font-semibold tracking-tight text-white">{beat.title}</h3>
            <p className="mt-2 text-base text-zinc-400">{beat.line}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
