import * as React from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-28 w-full rounded-md border border-[#ddcfb8] bg-white px-3 py-2 text-sm leading-6 text-[#1c2430] outline-none placeholder:text-[#8a8174] focus-visible:ring-2 focus-visible:ring-[#c4452d]",
        className,
      )}
      {...props}
    />
  );
}
