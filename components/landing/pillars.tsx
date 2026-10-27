import {
  Activity,
  BadgeCheck,
  Ban,
  ClipboardCheck,
  Columns2,
  Database,
  FileSearch,
  GitCompare,
  ListChecks,
  MailPlus,
  MessageSquareQuote,
  MessagesSquare,
  Scale,
  Send,
  Server,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import type { CardIcon } from "@/components/landing/content";
import { pillars } from "@/components/landing/content";
import { SectionIntro } from "@/components/landing/section-intro";
import { cn } from "@/lib/utils";

const ICONS: Record<CardIcon, LucideIcon> = {
  threads: MessagesSquare,
  evidence: FileSearch,
  state: ListChecks,
  compare: GitCompare,
  ask: MessageSquareQuote,
  risk: ShieldAlert,
  na: Ban,
  send: Send,
  engines: Scale,
  mail: MailPlus,
  storage: Database,
  aws: Server,
  badges: BadgeCheck,
  health: Activity,
  honest: Columns2,
  eval: ClipboardCheck,
};

export function Pillars() {
  return (
    <>
      {pillars.map((pillar, index) => (
        <section
          key={pillar.id}
          id={pillar.id}
          className={cn("scroll-mt-24 border-b border-line", index % 2 === 1 ? "bg-canvas" : "bg-white")}
        >
          <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
            <SectionIntro index={pillar.index} kicker={pillar.kicker} title={pillar.title} lede={pillar.lede} />
            <ul className="mt-12 grid gap-4 md:grid-cols-2">
              {pillar.cards.map((card) => {
                const Icon = ICONS[card.icon];
                return (
                  <li key={card.title} className="rounded-xl border border-line bg-surface p-6">
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent-soft text-accent">
                      <Icon className="h-5 w-5" aria-hidden />
                    </div>
                    <h3 className="mt-5 text-lg font-semibold tracking-tight text-ink">{card.title}</h3>
                    <p className="mt-2 text-[15px] leading-7 text-muted">{card.body}</p>
                  </li>
                );
              })}
            </ul>
            <ul className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
              {pillar.metrics.map((metric) => (
                <li key={metric.label} className="bg-surface px-5 py-4">
                  <p className="text-[12px] font-semibold tracking-wide text-subtle">{metric.kicker}</p>
                  <p className="mt-1 text-[15px] font-semibold tracking-tight text-ink">{metric.label}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </>
  );
}
