import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { BadgeTone } from "@/lib/ui/workspace-model";

const TONE: Record<BadgeTone, string> = {
  neutral: "border-line bg-zinc-50 text-subtle",
  accent: "border-indigo-200 bg-accent-soft text-accent",
  attention: "border-amber-200 bg-attention-soft text-attention",
  ok: "border-emerald-200 bg-ok-soft text-ok",
  danger: "border-red-200 bg-danger-soft text-danger",
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
    <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold leading-4", TONE[tone], className)}>
      {children}
    </span>
  );
}
