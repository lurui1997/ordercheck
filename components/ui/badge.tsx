import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { BadgeTone } from "@/lib/ui/workspace-model";

const TONE: Record<BadgeTone, string> = {
  neutral: "bg-[#f3f5f9] text-[#8996a8]",
  accent: "bg-accent-soft text-[#738eb7]",
  attention: "bg-[#fff3e6] text-[#b78138]",
  ok: "bg-[#eaf7f0] text-[#33876a]",
  danger: "bg-[#f9eded] text-[#af6e6e]",
};

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn("inline-flex items-center rounded-[3px] px-1.5 py-0.5 text-[11px] font-medium leading-4", TONE[tone], className)}>
      {children}
    </span>
  );
}
