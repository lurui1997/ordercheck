import { focusRing } from "@/components/landing/classes";
import { Closing } from "@/components/landing/closing";
import { Hero } from "@/components/landing/hero";
import { Pillars } from "@/components/landing/pillars";
import { Platform } from "@/components/landing/platform";
import { Scenarios } from "@/components/landing/scenarios";
import { SiteHeader } from "@/components/landing/site-header";
import { cn } from "@/lib/utils";

export function LandingPage() {
  return (
    <>
      <a
        href="#content"
        className={cn(
          "sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:bg-white focus:px-3 focus:py-2 focus:text-sm",
          focusRing,
        )}
      >
        跳到正文
      </a>
      <SiteHeader />
      <main id="content">
        <Hero />
        <Pillars />
        <Platform />
        <Scenarios />
        <Closing />
      </main>
    </>
  );
}
