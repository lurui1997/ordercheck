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
        "inline-flex items-center justify-center rounded-[6px] font-medium transition-colors duration-150 motion-reduce:transition-none",
        focusRing,
        size === "sm" ? "h-9 px-3.5 text-[12px]" : "h-10 px-4 text-[13px]",
        tone === "primary"
          ? "border border-accent bg-accent text-white shadow-[0_3px_7px_#275ee91a] hover:bg-accent-hover"
          : "border border-[#dce3ed] bg-white text-[#415571] hover:border-[#bfcfee] hover:bg-[#f1f5fd]",
      )}
    >
      {children}
    </Link>
  );
}
