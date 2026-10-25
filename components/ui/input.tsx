import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-md border border-[#ddcfb8] bg-white px-3 text-sm text-[#1c2430] outline-none placeholder:text-[#8a8174] focus-visible:ring-2 focus-visible:ring-[#c4452d]",
        className,
      )}
      {...props}
    />
  );
}
