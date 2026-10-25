"use client";

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
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[#1c2633]/70" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 max-h-[min(880px,calc(100vh-2rem))] w-[min(760px,calc(100%-1.5rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-[#eadfcd] bg-[#fffdf8] p-5 shadow-2xl focus:outline-none sm:p-6",
            className,
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-serif text-2xl leading-tight text-[#1c2430]">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-1 text-sm leading-6 text-[#5c6775]">{description}</Dialog.Description> : null}
            </div>
            <Dialog.Close className="rounded-md p-1 text-[#5c6775] hover:bg-black/5" aria-label="关闭">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
