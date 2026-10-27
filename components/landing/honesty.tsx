import { honesty } from "@/components/landing/content";

export function Honesty() {
  return (
    <section aria-label="运行时" className="border-y border-white/10">
      <ul className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-2 px-6 py-5">
        {honesty.chips.map((chip) => (
          <li
            key={chip}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[12px] font-semibold tracking-wide text-zinc-300"
          >
            {chip}
          </li>
        ))}
      </ul>
    </section>
  );
}
