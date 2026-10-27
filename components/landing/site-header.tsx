import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { CtaLink } from "@/components/landing/cta";
import { focusRing } from "@/components/landing/classes";
import { hero } from "@/components/landing/content";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
        <Link href="/" className={cn("flex min-w-0 items-center gap-2.5 rounded-md", focusRing)}>
          <BrandMark size="sm" />
          <span className="truncate text-[18px] font-bold tracking-[-0.04em] text-navy">OrderCheck</span>
        </Link>
        <CtaLink href={hero.primary.href} size="sm">
          {hero.primary.label}
        </CtaLink>
      </div>
    </header>
  );
}
