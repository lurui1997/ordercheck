import { honesty } from "@/components/landing/content";

export function Honesty() {
  return (
    <section aria-label="运行时" className="border-y border-line bg-white">
      <ul className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-2 px-6 py-5">
        {honesty.chips.map((chip) => (
          <li key={chip} className="rounded-full border border-[#dde7fc] bg-accent-soft px-3 py-1 text-[12px] font-medium text-[#49658f]">
            {chip}
          </li>
        ))}
      </ul>
    </section>
  );
}
