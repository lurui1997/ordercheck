import { scenarios } from "@/components/landing/content";
import { SectionIntro } from "@/components/landing/section-intro";

export function Scenarios() {
  return (
    <section id={scenarios.id} className="scroll-mt-24 border-b border-line bg-white">
      <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
        <SectionIntro kicker={scenarios.kicker} title={scenarios.title} lede={scenarios.lede} />
        <ul className="mt-12 grid gap-4 lg:grid-cols-3">
          {scenarios.items.map((item) => (
            <li key={item.index} className="flex flex-col rounded-xl border border-line bg-canvas p-6">
              <p className="text-[12px] font-semibold tracking-wide text-accent">{item.index}</p>
              <h3 className="mt-3 text-xl font-semibold tracking-tight text-ink">{item.title}</h3>
              <p className="mt-3 text-[15px] leading-7 text-muted">{item.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
