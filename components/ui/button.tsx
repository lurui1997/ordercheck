"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] text-[12px] font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45 aria-disabled:opacity-45",
  {
    variants: {
      variant: {
        default: "border border-accent bg-accent text-white shadow-[0_3px_7px_#275ee91a] hover:bg-accent-hover",
        outline: "border border-[#dce3ed] bg-white text-[#415571] hover:border-[#bfcfee] hover:bg-[#f1f5fd]",
        ghost: "border border-transparent bg-transparent text-accent hover:bg-accent-soft",
        destructive: "border border-danger bg-danger text-white hover:bg-red-900",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 px-2.5 text-[11px]",
        lg: "h-10 px-4 text-[13px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, type = "button", ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} type={asChild ? undefined : type} {...props} />;
}
