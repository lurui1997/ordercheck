import { cn } from "@/lib/utils";

export function BrandMark({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  const box = size === "sm" ? "size-7 rounded-[8px]" : "h-[33px] w-[30px] rounded-[9px]";
  const icon = size === "sm" ? 16 : 20;
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center bg-[#497aff] text-white -rotate-[5deg]", box, className)} aria-hidden>
      <svg className="rotate-[5deg]" viewBox="0 0 24 24" width={icon} height={icon} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5 10 17.5 19 7.5" />
      </svg>
    </span>
  );
}
