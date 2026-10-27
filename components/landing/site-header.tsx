import Link from "next/link";
import { CtaLink } from "@/components/landing/cta";
import { focusRing } from "@/components/landing/classes";
import { hero } from "@/components/landing/content";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-zinc-950/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-6">
        <Link href="/" className={cn("flex min-w-0 items-center gap-2.5 rounded-md", focusRing)}>
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent text-[11px] font-semibold tracking-wide text-white">
            OC
          </span>
          <span className="truncate text-[15px] font-semibold tracking-tight text-white">OrderCheck</span>
        </Link>
        <CtaLink href={hero.primary.href} size="sm">
          {hero.primary.label}
        </CtaLink>
      </div>
    </header>
  );
}
