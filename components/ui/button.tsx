"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c4452d] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default: "bg-[#1c2430] text-[#f6f1e6] hover:bg-[#2c3a4d]",
        vermilion: "bg-[#c4452d] text-white hover:bg-[#a73824]",
        outline: "border border-[#ddcfb8] bg-[#fffdf8] text-[#1c2430] hover:bg-[#f3ecdf]",
        ghost: "text-[#1c2430] hover:bg-black/5",
      },
      size: {
        default: "h-10 px-3.5",
        sm: "h-8 px-2.5 text-xs",
        lg: "h-11 px-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, type = "button", ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} type={asChild ? undefined : type} {...props} />;
}
