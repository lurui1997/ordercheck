import { Beats } from "@/components/landing/beats";
import { focusRing } from "@/components/landing/classes";
import { Closing } from "@/components/landing/closing";
import { Hero } from "@/components/landing/hero";
import { Honesty } from "@/components/landing/honesty";
import { SiteHeader } from "@/components/landing/site-header";
import { cn } from "@/lib/utils";

export function LandingPage() {
  return (
    <>
      <a
        href="#content"
        className={cn(
          "sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:bg-zinc-950 focus:px-3 focus:py-2 focus:text-sm focus:text-white",
          focusRing,
        )}
      >
        跳到正文
      </a>
      <SiteHeader />
      <main id="content">
        <Hero />
        <Beats />
        <Honesty />
        <Closing />
      </main>
    </>
  );
}
