import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-9 w-full rounded-md border border-line-strong bg-white px-2.5 text-sm text-ink outline-none transition-colors duration-150 placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none",
        className,
      )}
      {...props}
    />
  );
}
