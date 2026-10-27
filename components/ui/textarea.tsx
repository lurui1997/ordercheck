import * as React from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-24 w-full rounded-md border border-line-strong bg-white px-2.5 py-2 text-sm leading-6 text-ink outline-none transition-colors duration-150 placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none",
        className,
      )}
      {...props}
    />
  );
}
