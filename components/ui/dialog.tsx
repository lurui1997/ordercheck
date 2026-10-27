"use client";

import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[#0e213c]/40 backdrop-blur-[3px]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 max-h-[min(880px,calc(100vh-2rem))] w-[min(760px,calc(100%-1.5rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-[#e0e7f2] bg-white p-4 shadow-[0_15px_80px_#06142a33] focus:outline-none sm:p-5",
            className,
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-base font-semibold leading-6 text-ink">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-1 text-[13px] leading-5 text-subtle">{description}</Dialog.Description> : null}
            </div>
            <Dialog.Close className="rounded-md p-1 text-subtle hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" aria-label="关闭">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
