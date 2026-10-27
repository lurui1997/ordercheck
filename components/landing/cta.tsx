import Link from "next/link";
import type { ReactNode } from "react";
import { focusRing } from "@/components/landing/classes";
import { cn } from "@/lib/utils";

export function CtaLink({
  href,
  children,
  tone = "primary",
  size = "md",
}: {
  href: string;
  children: ReactNode;
  tone?: "primary" | "quiet";
  size?: "md" | "sm";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-semibold transition-colors duration-200 motion-reduce:transition-none",
        focusRing,
        size === "sm" ? "h-9 px-3.5 text-[13px]" : "h-11 px-5 text-sm",
        tone === "primary"
          ? "bg-accent text-white hover:bg-accent-hover"
          : "border border-white/15 bg-transparent text-zinc-100 hover:bg-white/10",
      )}
    >
      {children}
    </Link>
  );
}
