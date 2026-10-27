import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { focusRing } from "@/components/landing/classes";
import { hero, nav } from "@/components/landing/content";
import { cn } from "@/lib/utils";

const navLinkClass = cn(
  "rounded-md px-2.5 py-2 text-sm font-semibold text-muted hover:bg-zinc-100 hover:text-ink",
  focusRing,
);

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-6">
        <Link href="/" className={cn("flex min-w-0 items-center gap-2.5", focusRing)}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent text-[11px] font-semibold tracking-wide text-white">
            OC
          </span>
          <span className="truncate text-[15px] font-semibold tracking-tight text-ink">OrderCheck</span>
          <span className="hidden text-sm text-subtle sm:inline">订单确认</span>
        </Link>

        <nav aria-label="页面区块" className="ml-auto hidden items-center md:flex">
          {nav.map((item) => (
            <a key={item.href} href={item.href} className={navLinkClass}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-4">
          <details className="relative md:hidden">
            <summary
              className={cn(
                "flex cursor-pointer list-none items-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-semibold text-ink hover:bg-zinc-100 [&::-webkit-details-marker]:hidden",
                focusRing,
              )}
            >
              <Menu className="h-4 w-4" aria-hidden />
              目录
            </summary>
            <nav
              aria-label="页面区块"
              className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-48 rounded-lg border border-line bg-white p-1.5 shadow-lg"
            >
              {nav.map((item) => (
                <a key={item.href} href={item.href} className={cn(navLinkClass, "block")}>
                  {item.label}
                </a>
              ))}
            </nav>
          </details>
          <Button asChild size="sm" className="md:hidden">
            <Link href={hero.primary.href}>工作台</Link>
          </Button>
          <Button asChild className="hidden md:inline-flex">
            <Link href={hero.primary.href}>{hero.primary.label}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
