import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { focusRing } from "@/components/landing/classes";
import { closing, footer } from "@/components/landing/content";
import { cn } from "@/lib/utils";

export function Closing() {
  return (
    <>
      <section className="bg-white" aria-labelledby="closing-title">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
          <div className="rounded-2xl border border-line bg-canvas px-6 py-12 sm:px-12 sm:py-16">
            <h2 id="closing-title" className="max-w-3xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl sm:leading-tight">
              {closing.title}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted">{closing.lede}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-11 px-5">
                <Link href={closing.primary.href} className="w-full sm:w-auto">
                  {closing.primary.label}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-11 bg-white px-5">
                <a href={closing.secondary.href} className="w-full sm:w-auto">
                  {closing.secondary.label}
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>
      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-md">
            <p className="text-[15px] font-semibold text-ink">OrderCheck</p>
            <p className="mt-2 text-sm leading-6 text-subtle">{footer.note}</p>
          </div>
          <nav aria-label="页脚">
            <ul className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-1">
              {footer.links.map((item) => (
                <li key={item.href}>
                  {item.href.startsWith("#") ? (
                    <a href={item.href} className={cn("font-semibold text-ink hover:text-accent", focusRing)}>
                      {item.label}
                    </a>
                  ) : (
                    <Link href={item.href} className={cn("font-semibold text-ink hover:text-accent", focusRing)}>
                      {item.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="border-t border-line">
          <p className="mx-auto max-w-6xl px-6 py-4 text-xs text-subtle">© 2026 OrderCheck · 样例数据仅用于演示</p>
        </div>
      </footer>
    </>
  );
}
