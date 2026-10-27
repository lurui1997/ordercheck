import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hero } from "@/components/landing/content";
import { WorkspaceMock } from "@/components/landing/workspace-mock";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(24,24,27,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(24,24,27,0.045)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
      />
      <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-16 sm:pb-20 sm:pt-24">
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-16">
          <div className="max-w-xl">
            <p className="text-sm font-semibold text-accent">{hero.kicker}</p>
            <h1 className="mt-4 text-[2.6rem] font-semibold leading-[1.12] tracking-[-0.03em] text-ink sm:text-6xl sm:leading-[1.08]">
              {hero.titleLead}
              <br />
              <span className="text-accent">{hero.titleAccent}</span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-muted">{hero.lede}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-11 px-5 sm:w-auto">
                <Link href={hero.primary.href} className="w-full sm:w-auto">
                  {hero.primary.label}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-11 px-5">
                <a href={hero.secondary.href} className="w-full sm:w-auto">
                  {hero.secondary.label}
                </a>
              </Button>
            </div>
            <ul className="mt-8 flex flex-col gap-2 text-sm text-subtle sm:flex-row sm:flex-wrap sm:gap-x-5">
              {hero.points.map((point) => (
                <li key={point} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <WorkspaceMock />
        </div>

        <ol className="mt-16 grid gap-8 border-t border-line pt-8 sm:grid-cols-3">
          {hero.steps.map((step) => (
            <li key={step.index}>
              <p className="font-mono text-xs font-semibold text-accent">{step.index}</p>
              <p className="mt-2 text-base font-semibold text-ink">{step.title}</p>
              <p className="mt-1 text-sm leading-6 text-subtle">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
